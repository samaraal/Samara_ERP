-- SAMARA CARE ERP 2.15.17
-- TRIAL (TEST) GUEST — admit as Trial, then erase permanently after discharge.
--
-- 1. patients.is_trial  — chosen at Admission (Real / Trial). Real Guests are never erasable.
-- 2. purge_trial_guest(patient, resident code, dry_run)
--      * Admin only. Guest must be Trial, the typed Resident ID must match, and a discharge
--        must have been initiated (or the Guest already discharged).
--      * Refuses while biomedical equipment / an oxygen cylinder is still issued to the Guest.
--      * Finds every table that holds this Guest (column patient_id, or a foreign key to
--        patients) — including tables created directly in Supabase — and removes the rows,
--        children first. Protected tables are never deleted from:
--          room_beds                          -> bed released (patient_id null, status Available)
--          payment_vouchers,
--          staff_payment_requests             -> detached (patient_id null) — Samara's own cash records
--      * ALL-OR-NOTHING: any error cancels the whole erase; nothing is half-deleted.
--      * dry_run = true (default) changes nothing and returns what WOULD be removed.
--      * audit_log is kept, plus one 'TRIAL_GUEST_PURGED' entry.
-- Files in storage (documents, daily-moment videos) are removed by the ERP after this succeeds.
--
-- Run this whole file once in Supabase > SQL Editor. Safe to run again.

alter table public.patients add column if not exists is_trial boolean not null default false;
comment on column public.patients.is_trial is 'Trial / test Guest chosen at Admission. Only Trial Guests can be erased (purge_trial_guest).';

-- Tables that must never lose rows because of a Guest erase.
create or replace function public.samara_trial_purge_protected(p_table regclass)
returns text language sql stable as $$
  select case p_table::text
    when 'room_beds' then 'release'
    when 'public.room_beds' then 'release'
    when 'payment_vouchers' then 'detach'
    when 'public.payment_vouchers' then 'detach'
    when 'staff_payment_requests' then 'detach'
    when 'public.staff_payment_requests' then 'detach'
    when 'profiles' then 'detach'
    when 'public.profiles' then 'detach'
    when 'employees' then 'detach'
    when 'public.employees' then 'detach'
    when 'audit_log' then 'keep'
    when 'public.audit_log' then 'keep'
    else null end
$$;

create or replace function public.samara_trial_purge_add(p_report jsonb,p_key text,p_n bigint)
returns jsonb language sql immutable as $$
  select case when coalesce(p_n,0)=0 then p_report
    else jsonb_set(p_report,array[p_key],to_jsonb(coalesce((p_report->>p_key)::bigint,0)+p_n)) end
$$;

-- Remove rows of p_table matching p_where, removing / detaching rows that point at them first.
create or replace function public.samara_trial_purge_rows(p_table regclass,p_where text,p_depth int,p_report jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  fk record; n bigint; child_where text; child_nullable boolean;
begin
  if p_depth>10 then raise exception 'Trial erase stopped: links nested too deeply at %',p_table; end if;
  if public.samara_trial_purge_protected(p_table) is not null then
    raise exception 'Trial erase stopped: would delete rows from protected table %',p_table;
  end if;
  for fk in
    select c.conrelid::regclass as child, a.attname as child_col, pa.attname as parent_col, c.confdeltype, a.attnotnull as notnull
    from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=c.confkey[1]
    where c.contype='f' and c.confrelid=p_table and array_length(c.conkey,1)=1
  loop
    continue when fk.confdeltype in ('c','n','d');           -- database already cascades / nulls these
    child_where:=format('%I in (select %I from %s where %s)',fk.child_col,fk.parent_col,p_table,p_where);
    if fk.child=p_table then                                  -- self reference (e.g. reply-to)
      if not fk.notnull then
        execute format('update %s set %I=null where %s',fk.child,fk.child_col,child_where);
      end if;
      continue;
    end if;
    child_nullable:=not fk.notnull;
    if public.samara_trial_purge_protected(fk.child) is not null or child_nullable then
      if fk.notnull then raise exception 'Trial erase stopped: % is referenced by protected %.%',p_table,fk.child,fk.child_col; end if;
      execute format('update %s set %I=null where %s',fk.child,fk.child_col,child_where);
      get diagnostics n=row_count;
      p_report:=public.samara_trial_purge_add(p_report,'detached: '||fk.child::text||'.'||fk.child_col,n);
    else
      p_report:=public.samara_trial_purge_rows(fk.child,child_where,p_depth+1,p_report);
    end if;
  end loop;
  execute format('delete from %s where %s',p_table,p_where);
  get diagnostics n=row_count;
  return public.samara_trial_purge_add(p_report,'deleted: '||p_table::text,n);
end $$;

create or replace function public.purge_trial_guest(p_patient uuid,p_resident_code text,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p public.patients%rowtype;
  report jsonb:='{}'::jsonb;
  err text:=null;
  t record; n bigint; w text; mode text;
  has_discharge boolean:=false;
  guard_off boolean:=false;
begin
  if not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin can erase a Trial Guest.'; end if;
  select * into p from public.patients where id=p_patient for update;
  if p.id is null then raise exception 'Guest not found.'; end if;
  if coalesce(p.is_trial,false) is not true then raise exception 'This Guest is a REAL Guest. Only Trial Guests can be erased.'; end if;
  if upper(trim(coalesce(p_resident_code,'')))<>upper(trim(coalesce(p.patient_id,''))) then
    raise exception 'Resident ID typed does not match this Guest (%).',p.patient_id; end if;

  if to_regclass('public.patient_discharges') is not null then
    execute 'select exists(select 1 from public.patient_discharges where patient_id=$1 and lower(coalesce(status,'''')) not in (''cancelled'',''canceled''))'
      into has_discharge using p.id;
  end if;
  if coalesce(p.is_active,true) and not has_discharge then
    raise exception 'Initiate the discharge first. A Trial Guest is erased after discharge.'; end if;
  if to_regclass('public.biomedical_equipment') is not null then
    execute 'select count(*) from public.biomedical_equipment where current_patient_id=$1' into n using p.id;
    if n>0 then raise exception 'Return the % biomedical equipment item(s) still issued to this Guest first.',n; end if;
  end if;
  if to_regclass('public.oxygen_cylinders') is not null then
    execute 'select count(*) from public.oxygen_cylinders where current_patient_id=$1' into n using p.id;
    if n>0 then raise exception 'Return the % oxygen cylinder(s) still issued to this Guest first.',n; end if;
  end if;

  begin
    perform set_config('samara.trial_purge',p.id::text,true);
    -- Reviewed-departure ledger rows are normally permanent; allow them only inside this erase.
    if exists(select 1 from pg_trigger where tgname='discharge_billing_cutoff_guard' and tgrelid='public.billing_transactions'::regclass) then
      alter table public.billing_transactions disable trigger discharge_billing_cutoff_guard; guard_off:=true;
    end if;

    -- 1. release the bed
    update public.room_beds set patient_id=null,
      status=case when status='Occupied' then 'Available' else status end,updated_at=now()
      where patient_id=p.id;
    get diagnostics n=row_count;
    report:=public.samara_trial_purge_add(report,'bed released: room_beds',n);

    -- 2. every base table with a patient_id column (Guest-owned data)
    for t in
      select c.oid::regclass as tbl, a.attnotnull as notnull
      from pg_class c join pg_namespace s on s.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attname='patient_id' and not a.attisdropped
      where s.nspname='public' and c.relkind in ('r','p') and c.relname not in ('patients','room_beds')
      order by c.relname
    loop
      w:=format('patient_id::text in (%L,%L)',p.id::text,coalesce(nullif(trim(p.patient_id),''),p.id::text));
      mode:=public.samara_trial_purge_protected(t.tbl);
      if mode='keep' then continue; end if;
      if mode is not null then
        if t.notnull then raise exception 'Trial erase stopped: protected % holds this Guest and cannot be detached.',t.tbl; end if;
        execute format('update %s set patient_id=null where %s',t.tbl,w);
        get diagnostics n=row_count;
        report:=public.samara_trial_purge_add(report,'detached: '||t.tbl::text||'.patient_id',n);
      else
        report:=public.samara_trial_purge_rows(t.tbl,w,0,report);
      end if;
    end loop;

    -- 3. admission drafts linked to this Guest
    if to_regclass('public.admission_draft_forms') is not null then
      report:=public.samara_trial_purge_rows('public.admission_draft_forms'::regclass,format('linked_patient_id::text=%L',p.id::text),0,report);
    end if;

    -- 4. the Guest record itself (other links to patients are handled inside)
    report:=public.samara_trial_purge_rows('public.patients'::regclass,format('id=%L::uuid',p.id),0,report);

    if guard_off then alter table public.billing_transactions enable trigger discharge_billing_cutoff_guard; guard_off:=false; end if;

    if p_dry_run then raise exception using errcode='P0001',message='__samara_trial_dry_run__'; end if;
  exception when others then
    -- DB changes inside this block are undone; report / err variables survive.
    if sqlerrm<>'__samara_trial_dry_run__' then
      err:=sqlerrm;
      if not p_dry_run then raise; end if;
    end if;
  end;

  if not p_dry_run then
    insert into public.audit_log(user_id,action,entity,entity_id,details)
    values(auth.uid(),'TRIAL_GUEST_PURGED','patients',p.id,
      jsonb_build_object('resident_id',p.patient_id,'name',p.full_name,'removed',report,'at',now()));
  end if;
  return jsonb_build_object('dry_run',p_dry_run,'resident_id',p.patient_id,'name',p.full_name,
    'ok',err is null,'error',err,'removed',report);
end $$;

revoke all on function public.samara_trial_purge_rows(regclass,text,int,jsonb) from public,anon,authenticated;
revoke all on function public.purge_trial_guest(uuid,text,boolean) from public,anon;
grant execute on function public.purge_trial_guest(uuid,text,boolean) to authenticated;

-- Check: should show is_trial_ready = true
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='patients' and column_name='is_trial') as is_trial_ready,
       to_regprocedure('public.purge_trial_guest(uuid,text,boolean)') is not null as purge_function_ready;
