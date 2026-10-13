-- SAMARA CARE ERP 2.16.47 — Erase Trial Guest: nothing left behind
-- Run this whole file once in Supabase > SQL Editor (after 171, 176, 191). Safe to run again.
-- It only INSTALLS the fix and then shows a PREVIEW (changes no data).
-- To remove what earlier erases left behind, then run onetime_221_trial_leftovers_STEP2_erase.sql.
--
-- Problem: after "Erase Trial Guest", some Trial Guest names still showed (e.g. Admin → Rooms →
-- Room Shift History). Those rows point to a Guest record that no longer exists (for example a
-- duplicate record of the same Trial Guest removed earlier), so the erase — which looks for the
-- Guest's own id — did not see them. The audit log also kept every Trial Guest's name.
--
-- From now on, erasing a Trial Guest (single or "erase all") also removes:
--   * rows in any table that still carry this Guest's NAME but point to a Guest record that no
--     longer exists (leftovers like the Room Shift History rows);
--   * every audit-log entry about this Guest (its internal id or Resident ID).
-- The one "TRIAL_GUEST_PURGED" audit entry stays (Resident ID, what was removed, receipt voucher
-- numbers and PAID Razorpay IDs, for the accounts) — but WITHOUT the Guest's name.
-- Real Guests are never touched: a row is removed only when its Guest record no longer exists AND
-- it belongs to an erased Trial Guest (by id / Resident ID, or by name).

begin;

-- ---------------------------------------------------------------------------------------------
-- 0. Tariff-adjustment guard (from 191): inside a Trial erase, also let go of ledger rows whose
--    Guest record no longer exists (leftovers). Real Guests: unchanged — their adjustments stay.
create or replace function public.guard_tariff_adjustment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare purge_id text:=coalesce(current_setting('samara.trial_purge',true),'');
begin
 if tg_op='DELETE' and purge_id<>'' and old.patient_id::text=purge_id
    and exists(select 1 from public.patients p where p.id::text=purge_id and p.is_trial) then
   return old;
 end if;
 -- 2.16.47: leftover row of an erased Trial Guest (its Guest record no longer exists)
 if tg_op='DELETE' and purge_id<>'' and old.patient_id is not null
    and not exists(select 1 from public.patients p where p.id::text=old.patient_id::text) then
   return old;
 end if;
 if tg_op<>'DELETE' and (new.tariff_original_source_key is not null or new.source_type='Room Tariff Adjustment') and new.tariff_change_id is null then
   raise exception 'A tariff adjustment must reference its tariff audit record.';
 end if;
 if tg_op<>'INSERT' and old.tariff_change_id is not null then
   raise exception 'Tariff adjustments are permanent audit entries. Save a new dated tariff to correct them.';
 end if;
 if tg_op<>'DELETE' and new.tariff_change_id is not null and
 coalesce(current_setting('samara.tariff_adjustment',true),'')<>new.tariff_change_id::text then
   raise exception 'Tariff adjustments must be posted by the dated tariff workflow.';
 end if;
 if tg_op='DELETE' and old.auto_generated and exists(select 1 from public.billing_transactions a where a.tariff_original_source_key=old.source_key) then return null;end if;
 if tg_op='UPDATE' and old.auto_generated and (new.amount,new.source_key,new.patient_id,new.source_date) is distinct from (old.amount,old.source_key,old.patient_id,old.source_date)
 and exists(select 1 from public.billing_transactions a where a.tariff_original_source_key=old.source_key) then
   raise exception 'This original charge has tariff adjustments. Correct it using a new dated tariff.';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.guard_tariff_adjustment() from public,anon,authenticated;

-- ---------------------------------------------------------------------------------------------
-- 1. Rows that point to NO existing Guest and belong to the given Trial ids / codes / names.
--    Returns the report; p_dry_run=false actually removes (protected stock tables: unlinked).
create or replace function public.samara_trial_leftovers(p_ids text[],p_names text[],p_report jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t record; cond text; orphan text; mode text; n bigint; has_name boolean; found text[]; ids text[]:=coalesce(p_ids,'{}');
begin
  -- pass 1: rows that carry the Guest's NAME but point to no Guest record → learn those record ids
  --         (e.g. a duplicate record of the same Trial Guest), so their rows without a name go too
  if coalesce(array_length(p_names,1),0)>0 then
    for t in
      select c.oid::regclass as tbl
      from pg_class c join pg_namespace s on s.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attname='patient_id' and not a.attisdropped
      join pg_attribute b on b.attrelid=c.oid and b.attname='patient_name' and not b.attisdropped
      where s.nspname='public' and c.relkind in ('r','p') and c.relname not in ('patients','room_beds')
    loop
      execute format('select array_agg(distinct patient_id::text) from %1$s where patient_id is not null'
        ||' and not exists (select 1 from public.patients x where x.id::text=%1$s.patient_id::text or x.patient_id=%1$s.patient_id::text)'
        ||' and exists (select 1 from unnest(%2$L::text[]) nm where length(nm)>=3 and (lower(trim(%1$s.patient_name))=nm or lower(%1$s.patient_name) like ''%%'' || nm))',t.tbl,p_names)
        into found;
      ids:=ids||coalesce(found,'{}');
    end loop;
  end if;
  ids:=array(select distinct x from unnest(ids) x where x is not null and x<>'');
  if coalesce(array_length(ids,1),0)=0 then return p_report; end if;
  -- pass 2: remove (or, in stock-history tables, unlink) every row of those ids that points to no Guest record
  for t in
    select c.oid::regclass as tbl, c.relname, a.attnotnull as notnull
    from pg_class c join pg_namespace s on s.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='patient_id' and not a.attisdropped
    where s.nspname='public' and c.relkind in ('r','p') and c.relname not in ('patients','room_beds')
    order by c.relname
  loop
    mode:=public.samara_trial_purge_protected(t.tbl);
    if mode='keep' then continue; end if;
    has_name:=exists(select 1 from pg_attribute where attrelid=t.tbl and attname='patient_name' and not attisdropped);
    orphan:=format('not exists (select 1 from public.patients x where x.id::text=%1$s.patient_id::text or x.patient_id=%1$s.patient_id::text)',t.tbl);
    cond:=format('patient_id is not null and patient_id::text = any(%L::text[]) and %s',ids,orphan);
    if mode is not null then
      execute format('update %s set %s where %s',t.tbl,
        concat_ws(',',case when not t.notnull then 'patient_id=null' end,case when has_name then 'patient_name=null' end),cond);
      get diagnostics n=row_count;
      p_report:=public.samara_trial_purge_add(p_report,'leftover unlinked: '||t.tbl::text,n);
    else
      p_report:=public.samara_trial_purge_rows(t.tbl,cond,0,p_report);
    end if;
  end loop;
  return p_report;
end $$;
revoke all on function public.samara_trial_leftovers(text[],text[],jsonb) from public,anon,authenticated;

-- Audit entries about given Guests (except the TRIAL_GUEST(S)_PURGED records themselves).
create or replace function public.samara_trial_audit_cleanup(p_ids text[],p_codes text[],p_report jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n bigint;
begin
  delete from public.audit_log a
  where a.action not in ('TRIAL_GUEST_PURGED','TRIAL_GUESTS_BULK_PURGED')
    and (a.entity_id = any(coalesce(p_ids,'{}')) or a.entity_id = any(coalesce(p_codes,'{}'))
         or exists (select 1 from unnest(coalesce(p_ids,'{}')||coalesce(p_codes,'{}')) k
                    where length(k)>=8 and (a.details::text ilike '%'||k||'%' or coalesce(a.new_data::text,'') ilike '%'||k||'%' or coalesce(a.old_data::text,'') ilike '%'||k||'%')));
  get diagnostics n=row_count;
  return public.samara_trial_purge_add(p_report,'audit entries removed: audit_log',n);
end $$;
revoke all on function public.samara_trial_audit_cleanup(text[],text[],jsonb) from public,anon,authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. The shared erase step for ONE Trial Guest (from 176) + leftovers by name + audit entries.
create or replace function public.samara_trial_purge_core(p_patient uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p public.patients%rowtype;
  report jsonb:='{}'::jsonb;
  t record; n bigint; w text; mode text;
begin
  select * into p from public.patients where id=p_patient for update;
  if p.id is null then raise exception 'Guest not found.'; end if;
  if coalesce(p.is_trial,false) is not true then raise exception 'Guest % is a REAL Guest — never erased.',p.patient_id; end if;
  perform set_config('samara.trial_purge',p.id::text,true);

  -- bed
  update public.room_beds set patient_id=null,
    status=case when status='Occupied' then 'Available' else status end,updated_at=now()
    where patient_id=p.id;
  get diagnostics n=row_count;
  report:=public.samara_trial_purge_add(report,'bed released: room_beds',n);

  -- every base table with a patient_id column
  w:=format('patient_id::text in (%L,%L)',p.id::text,coalesce(nullif(trim(p.patient_id),''),p.id::text));
  for t in
    select c.oid::regclass as tbl, a.attnotnull as notnull
    from pg_class c join pg_namespace s on s.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='patient_id' and not a.attisdropped
    where s.nspname='public' and c.relkind in ('r','p') and c.relname not in ('patients','room_beds')
    order by c.relname
  loop
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

  -- admission drafts
  if to_regclass('public.admission_draft_forms') is not null then
    report:=public.samara_trial_purge_rows('public.admission_draft_forms'::regclass,format('linked_patient_id::text=%L',p.id::text),0,report);
  end if;

  -- the Guest record
  report:=public.samara_trial_purge_rows('public.patients'::regclass,format('id=%L::uuid',p.id),0,report);

  -- 2.16.47: leftovers carrying this Guest's name / ids that point to no Guest record, and audit entries
  report:=public.samara_trial_leftovers(array[p.id::text,coalesce(nullif(trim(p.patient_id),''),p.id::text)],
            array_remove(array[lower(trim(coalesce(p.full_name,'')))],''),report);
  report:=public.samara_trial_audit_cleanup(array[p.id::text],array_remove(array[trim(coalesce(p.patient_id,''))],''),report);
  return report;
end $$;
revoke all on function public.samara_trial_purge_core(uuid) from public,anon,authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. The TRIAL_GUEST_PURGED audit records never keep the Guest's name (Resident ID only).
create or replace function public.samara_trial_audit_no_name() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.action='TRIAL_GUEST_PURGED' then
    new.details:=coalesce(new.details,'{}'::jsonb)-'name';
  elsif new.action='TRIAL_GUESTS_BULK_PURGED' and jsonb_typeof(new.details->'guests')='array' then
    new.details:=jsonb_set(new.details,'{guests}',(select coalesce(jsonb_agg(x-'name'),'[]'::jsonb) from jsonb_array_elements(new.details->'guests') x));
  end if;
  return new;
end $$;
drop trigger if exists samara_trial_audit_no_name on public.audit_log;
create trigger samara_trial_audit_no_name before insert or update on public.audit_log
  for each row execute function public.samara_trial_audit_no_name();

-- ---------------------------------------------------------------------------------------------
-- 4. One-time clean-up of what EARLIER erases left (Admin only; dry run by default).
create or replace function public.purge_trial_leftovers(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  ids text[]; codes text[]; names text[];
  report jsonb:='{}'::jsonb; err text:=null; guard_off boolean:=false; n bigint;
begin
  if auth.uid() is not null and not public.current_user_has_role(array['Admin']) then
    raise exception 'Only Admin can remove Trial Guest leftovers.'; end if;
  -- erased Trial Guests (no longer in patients)
  select coalesce(array_agg(distinct a.entity_id) filter (where a.entity_id is not null),'{}'),
         coalesce(array_agg(distinct a.details->>'resident_id') filter (where coalesce(a.details->>'resident_id','')<>''),'{}'),
         coalesce(array_agg(distinct lower(trim(a.details->>'name'))) filter (where coalesce(trim(a.details->>'name'),'')<>''),'{}')
    into ids,codes,names
  from public.audit_log a
  where a.action='TRIAL_GUEST_PURGED'
    and not exists (select 1 from public.patients x where x.id::text=a.entity_id);
  -- names also from bulk records
  select names||coalesce(array_agg(distinct lower(trim(g->>'name'))) filter (where coalesce(trim(g->>'name'),'')<>''),'{}')
    into names
  from public.audit_log a, jsonb_array_elements(case when jsonb_typeof(a.details->'guests')='array' then a.details->'guests' else '[]'::jsonb end) g
  where a.action='TRIAL_GUESTS_BULK_PURGED';
  -- never a name that a current Guest (real or trial) also has
  names:=array(select nm from unnest(names) nm where not exists (select 1 from public.patients x where lower(trim(x.full_name))=nm));
  report:=jsonb_build_object('erased_trial_guests_found',coalesce(array_length(ids,1),0));

  begin
    perform set_config('samara.trial_purge','leftovers',true);
    if exists(select 1 from pg_trigger where tgname='discharge_billing_cutoff_guard' and tgrelid='public.billing_transactions'::regclass) then
      alter table public.billing_transactions disable trigger discharge_billing_cutoff_guard; guard_off:=true;
    end if;
    report:=public.samara_trial_leftovers(ids||codes,names,report);
    report:=public.samara_trial_audit_cleanup(ids,codes,report);
    -- remove names kept in earlier TRIAL_GUEST(S)_PURGED records (the trigger strips them on update)
    update public.audit_log set details=details where action in ('TRIAL_GUEST_PURGED','TRIAL_GUESTS_BULK_PURGED')
      and (details ? 'name' or details::text ilike '%"name"%');
    get diagnostics n=row_count;
    report:=public.samara_trial_purge_add(report,'names removed from erase records: audit_log',n);
    if guard_off then alter table public.billing_transactions enable trigger discharge_billing_cutoff_guard; guard_off:=false; end if;
    if p_dry_run then raise exception using errcode='P0001',message='__samara_trial_dry_run__'; end if;
  exception when others then
    if sqlerrm<>'__samara_trial_dry_run__' then err:=sqlerrm; if not p_dry_run then raise; end if; end if;
  end;
  if not p_dry_run then
    insert into public.audit_log(user_id,action,entity,entity_id,details)
    values(auth.uid(),'TRIAL_LEFTOVERS_REMOVED','patients',null,jsonb_build_object('removed',report,'at',now()));
  end if;
  return jsonb_build_object('dry_run',p_dry_run,'ok',err is null,'error',err,'removed',report);
end $$;
revoke all on function public.purge_trial_leftovers(boolean) from public,anon;
grant execute on function public.purge_trial_leftovers(boolean) to authenticated;

notify pgrst,'reload schema';
commit;

-- PREVIEW (changes nothing): what the one-time clean-up WOULD remove.
select public.purge_trial_leftovers(true) as preview;
