-- SAMARA CARE ERP 2.15.27
-- ERASE ALL TRIAL (TEST) GUESTS AT ONE TIME — Admin only.
-- Run AFTER 171_trial_guest_purge.sql and 175_mark_test_guests_trial.sql.
--
-- purge_all_trial_guests(p_confirm, p_dry_run)
--   * Erases EVERY Guest marked Trial (patients.is_trial = true) in ONE all-or-nothing step.
--     Real Guests are never touched.
--   * This one-time clean-up does NOT need a discharge first: Trial Guests still active are
--     erased too and their beds become Available.
--   * Refuses while biomedical equipment / an oxygen cylinder is still issued to any of them.
--   * dry_run = true (default) changes nothing and returns, per Guest, what WOULD be removed,
--     plus the stock items issued to them through indents (for a stock recount).
--   * To erase: p_dry_run = false and p_confirm = 'ERASE <number of Trial Guests>', e.g. 'ERASE 14'.
--   * Keeps: audit log (+ one TRIAL_GUEST_PURGED entry per Guest with receipt voucher numbers and
--     paid Razorpay IDs, + one TRIAL_GUESTS_BULK_PURGED entry), and stock history
--     (consumable store ledger, equipment / oxygen movements) — unlinked from the Guest.
--
-- Also (applies to the single "Erase Trial Guest" button too): stock-history tables are now
-- protected — their rows are unlinked from the Guest, never deleted.
-- purge_trial_guest() is rewritten on top of the same shared steps; its behaviour is unchanged.
--
-- Run this whole file once in Supabase > SQL Editor. Safe to run again.

-- 1. Protected tables (now also stock history).
create or replace function public.samara_trial_purge_protected(p_table regclass)
returns text language sql stable as $$
  select case regexp_replace(p_table::text,'^public\.','')
    when 'room_beds' then 'release'
    when 'profiles' then 'detach'
    when 'employees' then 'detach'
    when 'consumable_store_ledger' then 'detach'
    when 'consumable_store_receipts' then 'detach'
    when 'biomedical_equipment_movements' then 'detach'
    when 'oxygen_cylinder_movements' then 'detach'
    when 'audit_log' then 'keep'
    else null end
$$;

-- 2. Shared erase steps for ONE Guest (raises on any problem; caller handles the trigger).
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
  return public.samara_trial_purge_rows('public.patients'::regclass,format('id=%L::uuid',p.id),0,report);
end $$;

-- Receipt vouchers + PAID online payments of one Guest (kept in the audit log).
create or replace function public.samara_trial_money_trail(p_patient uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare trail jsonb:='{}'::jsonb; x jsonb;
begin
  if to_regclass('public.payment_vouchers') is not null then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''voucher_no'',voucher_no,''mode'',payment_mode,''type'',transaction_type,''amount'',amount,''at'',created_at) order by created_at),''[]''::jsonb) from public.payment_vouchers where patient_id=$1'
      into x using p_patient;
    trail:=trail||jsonb_build_object('receipt_vouchers',x);
  end if;
  if to_regclass('public.staff_payment_requests') is not null then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''request_code'',request_code,''amount'',amount,''razorpay_payment_id'',razorpay_payment_id,''paid_at'',paid_at)),''[]''::jsonb) from public.staff_payment_requests where patient_id=$1 and status=''Paid'''
      into x using p_patient;
    trail:=trail||jsonb_build_object('paid_online_payments',x);
  end if;
  return trail;
end $$;

-- Equipment / cylinders still issued to a Guest (text, or null when none).
create or replace function public.samara_trial_issued_blocker(p_patient uuid)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare n bigint; msg text:=null;
begin
  if to_regclass('public.biomedical_equipment') is not null then
    execute 'select count(*) from public.biomedical_equipment where current_patient_id=$1' into n using p_patient;
    if n>0 then msg:=format('%s biomedical equipment item(s) still issued',n); end if;
  end if;
  if to_regclass('public.oxygen_cylinders') is not null then
    execute 'select count(*) from public.oxygen_cylinders where current_patient_id=$1' into n using p_patient;
    if n>0 then msg:=concat_ws('; ',msg,format('%s oxygen cylinder(s) still issued',n)); end if;
  end if;
  return msg;
end $$;

-- 3. Single Guest erase (same rules as 2.15.18: Admin, Resident ID, discharge first).
create or replace function public.purge_trial_guest(p_patient uuid,p_resident_code text,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p public.patients%rowtype;
  report jsonb:='{}'::jsonb;
  money_trail jsonb;
  err text:=null; blocker text;
  has_discharge boolean:=false;
  guard_off boolean:=false;
  n_paid int;
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
  blocker:=public.samara_trial_issued_blocker(p.id);
  if blocker is not null then raise exception 'Return first: % to this Guest.',blocker; end if;

  money_trail:=public.samara_trial_money_trail(p.id);
  n_paid:=coalesce(jsonb_array_length(money_trail->'paid_online_payments'),0);
  if n_paid>0 then report:=public.samara_trial_purge_add(report,'NOTE: paid online (Razorpay) payments — IDs kept in audit log',n_paid); end if;

  begin
    if exists(select 1 from pg_trigger where tgname='discharge_billing_cutoff_guard' and tgrelid='public.billing_transactions'::regclass) then
      alter table public.billing_transactions disable trigger discharge_billing_cutoff_guard; guard_off:=true;
    end if;
    report:=report||public.samara_trial_purge_core(p.id);
    if guard_off then alter table public.billing_transactions enable trigger discharge_billing_cutoff_guard; guard_off:=false; end if;
    if p_dry_run then raise exception using errcode='P0001',message='__samara_trial_dry_run__'; end if;
  exception when others then
    if sqlerrm<>'__samara_trial_dry_run__' then
      err:=sqlerrm;
      if not p_dry_run then raise; end if;
    end if;
  end;

  if not p_dry_run then
    insert into public.audit_log(user_id,action,entity,entity_id,details)
    values(auth.uid(),'TRIAL_GUEST_PURGED','patients',p.id,
      jsonb_build_object('resident_id',p.patient_id,'name',p.full_name,'removed',report,'money_trail',money_trail,'at',now()));
  end if;
  return jsonb_build_object('dry_run',p_dry_run,'resident_id',p.patient_id,'name',p.full_name,
    'ok',err is null,'error',err,'removed',report);
end $$;

-- 4. ALL Trial Guests at one time.
create or replace function public.purge_all_trial_guests(p_confirm text default null,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g record;
  ids uuid[];
  n int;
  guests jsonb:='[]'::jsonb;
  blockers jsonb:='[]'::jsonb;
  trails jsonb:='{}'::jsonb;
  stock jsonb:='[]'::jsonb;
  err text:=null; blocker text; r jsonb;
  guard_off boolean:=false;
begin
  if not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin can erase Trial Guests.'; end if;

  select array_agg(id order by patient_id) into ids from public.patients where is_trial is true;
  n:=coalesce(array_length(ids,1),0);
  if n=0 then
    return jsonb_build_object('dry_run',p_dry_run,'ok',false,'count',0,'error','There are no Trial Guests to erase.');
  end if;
  perform 1 from public.patients where id=any(ids) for update;

  for g in select id,patient_id,full_name from public.patients where id=any(ids) order by patient_id loop
    blocker:=public.samara_trial_issued_blocker(g.id);
    if blocker is not null then
      blockers:=blockers||jsonb_build_object('resident_id',g.patient_id,'name',g.full_name,'reason',blocker);
    end if;
    trails:=trails||jsonb_build_object(g.id::text,public.samara_trial_money_trail(g.id));
  end loop;

  -- Stock issued to them through indents (for a stock recount; the ledger history itself is kept).
  if to_regclass('public.patient_consumable_indents') is not null then
    execute $q$
      select coalesce(jsonb_agg(x order by x->>'item'),'[]'::jsonb) from (
        select jsonb_build_object('item',coalesce(j->>'item_name','(item)'),
               'handed_over',sum(coalesce(nullif(j->>'handed_over_qty','')::numeric,0)),
               'received',sum(coalesce(nullif(j->>'received_qty','')::numeric,0))) as x
        from (select to_jsonb(i) as j from public.patient_consumable_indents i where i.patient_id::text = any($1)) s
        group by coalesce(j->>'item_name','(item)')
        having sum(coalesce(nullif(j->>'handed_over_qty','')::numeric,0))>0
            or sum(coalesce(nullif(j->>'received_qty','')::numeric,0))>0) t $q$
      into stock using (select array_agg(v) from (select id::text v from unnest(ids) id
                         union all select patient_id from public.patients where id=any(ids) and coalesce(patient_id,'')<>'') z);
  end if;

  if not p_dry_run then
    if jsonb_array_length(blockers)>0 then
      raise exception 'Return issued equipment / oxygen cylinders first (% Guest(s)). Nothing was erased.',jsonb_array_length(blockers);
    end if;
    if upper(regexp_replace(coalesce(p_confirm,''),'\s+',' ','g'))<>'ERASE '||n then
      raise exception 'Confirmation must be: ERASE %. Nothing was erased.',n;
    end if;
  end if;

  begin
    if exists(select 1 from pg_trigger where tgname='discharge_billing_cutoff_guard' and tgrelid='public.billing_transactions'::regclass) then
      alter table public.billing_transactions disable trigger discharge_billing_cutoff_guard; guard_off:=true;
    end if;
    for g in select id,patient_id,full_name,is_active from public.patients where id=any(ids) order by patient_id loop
      r:=public.samara_trial_purge_core(g.id);
      guests:=guests||jsonb_build_object('id',g.id,'resident_id',g.patient_id,'name',g.full_name,
        'was_active',coalesce(g.is_active,false),'removed',r);
      if not p_dry_run then
        insert into public.audit_log(user_id,action,entity,entity_id,details)
        values(auth.uid(),'TRIAL_GUEST_PURGED','patients',g.id,
          jsonb_build_object('resident_id',g.patient_id,'name',g.full_name,'removed',r,
            'money_trail',trails->(g.id::text),'bulk',true,'at',now()));
      end if;
    end loop;
    if guard_off then alter table public.billing_transactions enable trigger discharge_billing_cutoff_guard; guard_off:=false; end if;
    if p_dry_run then raise exception using errcode='P0001',message='__samara_trial_dry_run__'; end if;
  exception when others then
    if sqlerrm<>'__samara_trial_dry_run__' then
      err:=sqlerrm;
      if not p_dry_run then raise; end if;
    end if;
  end;

  if not p_dry_run then
    insert into public.audit_log(user_id,action,entity,entity_id,details)
    values(auth.uid(),'TRIAL_GUESTS_BULK_PURGED','patients',null,
      jsonb_build_object('count',n,'guests',(select jsonb_agg(jsonb_build_object('resident_id',x->>'resident_id','name',x->>'name')) from jsonb_array_elements(guests) x),
        'stock_issued',stock,'at',now()));
  end if;

  return jsonb_build_object('dry_run',p_dry_run,'ok',err is null and jsonb_array_length(blockers)=0,
    'error',coalesce(err,case when jsonb_array_length(blockers)>0 then 'Equipment / oxygen cylinders still issued.' end),
    'count',n,'guests',guests,'blockers',blockers,'stock_issued',stock,'confirm_text','ERASE '||n);
end $$;

revoke all on function public.samara_trial_purge_core(uuid) from public,anon,authenticated;
revoke all on function public.samara_trial_money_trail(uuid) from public,anon,authenticated;
revoke all on function public.samara_trial_issued_blocker(uuid) from public,anon,authenticated;
revoke all on function public.purge_trial_guest(uuid,text,boolean) from public,anon;
grant execute on function public.purge_trial_guest(uuid,text,boolean) to authenticated;
revoke all on function public.purge_all_trial_guests(text,boolean) from public,anon;
grant execute on function public.purge_all_trial_guests(text,boolean) to authenticated;

-- Check: should list the Trial Guests (nothing is changed by this line)
select patient_id as resident_id, full_name, is_active from public.patients where is_trial is true order by patient_id;
