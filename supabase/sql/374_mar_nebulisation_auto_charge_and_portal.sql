-- 374 — Nebulisation from the MAR only + automatic posting of nursing / physio charges — ERP 2.20.27
-- Run once in Supabase > SQL Editor (whole file). Safe to run more than once.
--
-- Owner's rules (11-11-2026), after the Family Portal complaint for Mr. S. SWAMINATHAN (portal showed 88 nebulisations,
-- 103 were given in the MAR and billed):
--  1. NEBULISATION IS RECORDED ONLY IN THE MAR. A nebulisation medicine (route Inhalation / name "NEB…", not an inhaler /
--     rotacap / MDI) marked "Given" = one nebulisation session (two medicines at the same dose time = one session).
--     Each session raises ONE charge automatically: "Nebulization - Samara Nebulizer" (NUR-0001) or
--     "Nebulization - Own Nebulizer" (NUR-0006), as chosen by the nurse (remembered per Guest). Rates from Charge Master.
--     Nebulisation can no longer be requested / started from Approval Requests (open ones are cancelled — not charged).
--  2. NO ACCOUNTS APPROVAL for Nursing Procedures (incl. Nebulisation, Blood Glucose Monitoring) and Physiotherapy
--     sessions: once the nurse records it done / completed, the charge is posted to the Guest's account at the
--     Charge Master rate (physio: the Guest's agreed rate). Charges with no rate fixed, "Others", bill-based or
--     outside charges still wait for Accounts as before. Charges already waiting with Accounts in these groups are
--     posted now (owner's instruction).
--  3. FAMILY PORTAL: nebulisation is shown from the MAR (every session at the real given time, all past days), never
--     from Approval Requests, so the portal always matches the bill. The ERP's "Family Portal preview" uses the same
--     database function, so it shows exactly what the family sees (it used to double-count).
-- Nothing is deleted. Errors in the automatic charge never stop the nurse saving a dose — they are logged in
-- public.samara_auto_charge_issues (see the checks at the end).

begin;

-- 0. Columns + issue log --------------------------------------------------------------------------------------------
alter table public.patients add column if not exists nebulizer_type text;
alter table public.medication_administrations add column if not exists nebulizer_type text;
alter table public.bill_charge_requests add column if not exists mar_neb_date date;
alter table public.bill_charge_requests add column if not exists mar_neb_time time;
alter table public.bill_charge_requests add column if not exists auto_posted boolean not null default false;
create index if not exists bill_charge_requests_mar_neb_idx on public.bill_charge_requests(patient_id, mar_neb_date, mar_neb_time) where mar_neb_date is not null;

do $c$ begin
  if not exists (select 1 from pg_constraint where conname='patients_nebulizer_type_chk') then
    alter table public.patients add constraint patients_nebulizer_type_chk check (nebulizer_type is null or nebulizer_type in ('Samara Nebulizer','Own Nebulizer'));
  end if;
  if not exists (select 1 from pg_constraint where conname='mar_nebulizer_type_chk') then
    alter table public.medication_administrations add constraint mar_nebulizer_type_chk check (nebulizer_type is null or nebulizer_type in ('Samara Nebulizer','Own Nebulizer'));
  end if;
end $c$;

create table if not exists public.samara_auto_charge_issues(
  id bigserial primary key, at timestamptz not null default now(), source text, ref text, patient_id uuid, message text);
alter table public.samara_auto_charge_issues enable row level security;
revoke all on public.samara_auto_charge_issues from anon, authenticated;

-- Each current Guest's nebulizer, from the last nebulisation charge (Own nebulizer → Own, otherwise Samara)
update public.patients p set nebulizer_type = x.t
  from (select distinct on (b.patient_id) b.patient_id,
               case when coalesce(b.charge_item_code,'')='NUR-0006' or coalesce(b.service_name,'') ilike '%own nebul%' then 'Own Nebulizer' else 'Samara Nebulizer' end t
          from public.bill_charge_requests b
         where coalesce(b.service_name,'') ilike '%nebul%' and coalesce(b.status,'') not in ('Cancelled','Removed')
         order by b.patient_id, coalesce(b.service_datetime,b.raised_at,b.created_at) desc) x
 where x.patient_id=p.id and p.nebulizer_type is null;

-- 1. Helpers ----------------------------------------------------------------------------------------------------------
create or replace function public.samara_is_nebulisation(p_route text, p_name text)
returns boolean language sql immutable as $$
  select (coalesce(p_route,'') ~* '(inhal|nebul)' or coalesce(p_name,'') ~* '^\s*neb')
     and coalesce(p_name,'') !~* '(inhaler|rotacap|rotahaler|turbuhaler|\mmdi\M|\mdpi\M|puff|spray|\mpatch\M)'
$$;

create or replace function public.samara_neb_tariff(p_type text)
returns public.charge_tariff_master language sql stable security definer set search_path=public,pg_temp as $$
  select t.* from public.charge_tariff_master t
   where t.is_active
     and (t.charge_code = case when p_type='Own Nebulizer' then 'NUR-0006' else 'NUR-0001' end
          or t.service_name ilike case when p_type='Own Nebulizer' then 'Nebuli%Own Nebuli%' else 'Nebuli%Samara Nebuli%' end)
   order by (t.charge_code = case when p_type='Own Nebulizer' then 'NUR-0006' else 'NUR-0001' end) desc, t.updated_at desc nulls last
   limit 1
$$;
revoke all on function public.samara_neb_tariff(text) from public, anon, authenticated;

-- 2. One nebulisation session (Guest + date + dose time) ↔ one charge ---------------------------------------------------
create or replace function public.samara_mar_neb_session_sync(p_patient uuid, p_date date, p_time time, p_actor uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_n int; v_given_at timestamptz; v_type text; v_meds text; v_by uuid; v_name text;
        ch public.bill_charge_requests%rowtype; t public.charge_tariff_master%rowtype; v_id uuid; v_bt jsonb;
begin
  if p_patient is null or p_date is null or p_time is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_patient::text||p_date::text||p_time::text, 374));

  select count(*), min(a.administered_at), min(a.nebulizer_type),
         string_agg(distinct o.medicine_name, ', '),
         (array_agg(a.administered_by order by a.administered_at))[1]
    into v_n, v_given_at, v_type, v_meds, v_by
    from public.medication_administrations a join public.medication_orders o on o.id=a.order_id
   where o.patient_id=p_patient and a.scheduled_date=p_date and a.scheduled_time::time=p_time and a.status='Given'
     and public.samara_is_nebulisation(o.route,o.medicine_name);

  select * into ch from public.bill_charge_requests
   where patient_id=p_patient and mar_neb_date=p_date and mar_neb_time=p_time
     and coalesce(status,'') not in ('Cancelled','Removed','Rejected') and coalesce(approval_status,'') <> 'Rejected'
   order by created_at limit 1;

  -- no nebulisation given any more at this time (dose corrected / removed) → withdraw its charge
  if coalesce(v_n,0)=0 then
    if ch.id is null then return null; end if;
    select to_jsonb(x) into v_bt from public.billing_transactions x where x.id=ch.billing_transaction_id;
    perform set_config('samara.nursing_procedure_charge','on',true);
    update public.bill_charge_requests
       set status='Cancelled', approved_amount=0, final_amount=0, billing_transaction_id=null,
           approval_remarks=concat_ws(' · ', approval_remarks, 'Withdrawn '||to_char(now() at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI')||': the nebulisation at this time is no longer recorded as Given in the MAR'),
           updated_at=now()
     where id=ch.id;
    -- a still-pending one must also leave the Accounts queue (if the database allows the value)
    begin
      update public.bill_charge_requests set approval_status='Cancelled' where id=ch.id and coalesce(approval_status,'Pending')='Pending';
    exception when others then null; end;
    if ch.billing_transaction_id is not null then delete from public.billing_transactions where id=ch.billing_transaction_id; end if;
    perform set_config('samara.nursing_procedure_charge','',true);
    begin perform public.record_audit_event('Charge Withdrawn','Bills & Charges',ch.id::text,
      jsonb_build_object('reason','MAR nebulisation no longer Given','charge',to_jsonb(ch),'ledger_entry_removed',v_bt),'Success');
    exception when others then null; end;
    return ch.id;
  end if;

  if ch.id is not null then return ch.id; end if;   -- already charged

  -- a charge raised the old way (Approval Requests) for this session → link it instead of charging twice
  select * into ch from public.bill_charge_requests b
   where b.patient_id=p_patient and b.mar_neb_date is null
     and coalesce(b.service_name,'') ilike '%nebul%'
     and coalesce(b.status,'') not in ('Cancelled','Removed','Rejected') and coalesce(b.approval_status,'') <> 'Rejected'
     and coalesce(b.service_datetime,b.raised_at) between v_given_at - interval '90 minutes' and v_given_at + interval '90 minutes'
   order by abs(extract(epoch from (coalesce(b.service_datetime,b.raised_at) - v_given_at))) limit 1;
  if ch.id is not null then
    perform set_config('samara.nursing_procedure_charge','on',true);
    update public.bill_charge_requests set mar_neb_date=p_date, mar_neb_time=p_time, updated_at=now() where id=ch.id;
    perform set_config('samara.nursing_procedure_charge','',true);
    return ch.id;
  end if;

  -- new charge
  select coalesce(v_type, p.nebulizer_type, 'Samara Nebulizer') into v_type from public.patients p where p.id=p_patient;
  t := public.samara_neb_tariff(v_type);
  v_by := coalesce(p_actor, v_by);
  select coalesce(nullif(full_name,''),'Nurse') into v_name from public.profiles where id=v_by or auth_user_id=v_by limit 1;
  perform set_config('samara.nursing_procedure_charge','on',true);
  insert into public.bill_charge_requests(
    patient_id, charge_date, service_datetime, category, service_code, charge_item_code, service_name, description,
    service_provider, quantity, unit, unit_cost, estimated_amount, requested_amount, billable, bill_available, urgency,
    status, approval_status, remarks, raised_by, raised_by_name, raised_at, updated_at, mar_neb_date, mar_neb_time)
  values (
    p_patient, p_date, v_given_at, 'Nursing Procedures',
    upper(regexp_replace(coalesce(t.service_name,'Nebulization - '||v_type),'[^A-Za-z0-9]+','_','g')),
    coalesce(t.charge_code, case when v_type='Own Nebulizer' then 'NUR-0006' else 'NUR-0001' end),
    coalesce(t.service_name,'Nebulization - '||v_type),
    concat('Nursing Procedures ', coalesce(t.charge_code||' — ',''), coalesce(t.service_name,'Nebulization - '||v_type),
           ' · given in MAR at ', to_char(v_given_at at time zone 'Asia/Kolkata','HH24:MI'), ' (dose time ', to_char(p_time,'HH24:MI'), ')',
           ' by ', coalesce(v_name,'Nurse'), ' · ', coalesce(v_meds,'')),
    'Samara', 1, 'Service', t.amount, t.amount, t.amount, true, false, 'Routine',
    'Raised', 'Pending', 'Nebulisation from MAR (SQL 374)', v_by, coalesce(v_name,'Nurse'), now(), now(), p_date, p_time)
  returning id into v_id;
  perform set_config('samara.nursing_procedure_charge','',true);

  -- mark a planned "Nebulization" procedure done (screensaver / alerts / Shift Tasks)
  begin
    perform public.samara_link_procedure_done(p_patient, v_given_at, t.id, t.charge_code, t.service_name, false, v_by, 'given in MAR (nebulisation)');
  exception when others then null; end;
  return v_id;
end $$;
revoke all on function public.samara_mar_neb_session_sync(uuid,date,time,uuid) from public, anon, authenticated;

create or replace function public.samara_trg_mar_neb()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare o record; v_pid uuid;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status and new.nebulizer_type is not distinct from old.nebulizer_type
     and new.scheduled_time is not distinct from old.scheduled_time and new.scheduled_date is not distinct from old.scheduled_date then
    return new;
  end if;
  begin
    select mo.patient_id, mo.route, mo.medicine_name into o from public.medication_orders mo where mo.id=coalesce(new.order_id, old.order_id);
    if not found or not public.samara_is_nebulisation(o.route, o.medicine_name) then return coalesce(new, old); end if;
    v_pid := o.patient_id;
    -- remember the nurse's choice for this Guest
    if tg_op<>'DELETE' and new.nebulizer_type is not null then
      update public.patients set nebulizer_type=new.nebulizer_type where id=o.patient_id and nebulizer_type is distinct from new.nebulizer_type;
    end if;
    if tg_op in ('UPDATE','DELETE') then
      perform public.samara_mar_neb_session_sync(o.patient_id, old.scheduled_date, old.scheduled_time::time, auth.uid());
    end if;
    if tg_op in ('INSERT','UPDATE') then
      perform public.samara_mar_neb_session_sync(o.patient_id, new.scheduled_date, new.scheduled_time::time, auth.uid());
    end if;
  exception when others then
    insert into public.samara_auto_charge_issues(source, ref, patient_id, message)
    values ('MAR nebulisation', coalesce(new.id, old.id)::text, v_pid, sqlerrm);
  end;
  return coalesce(new, old);
end $$;
revoke all on function public.samara_trg_mar_neb() from public, anon, authenticated;
drop trigger if exists samara_mar_neb_charge on public.medication_administrations;
create trigger samara_mar_neb_charge after insert or update or delete on public.medication_administrations
  for each row execute function public.samara_trg_mar_neb();

-- 3. Nebulisation no longer goes through Approval Requests ---------------------------------------------------------------
create or replace function public.samara_block_neb_requests()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if coalesce(new.category,'Nursing Procedures')='Nursing Procedures' and coalesce(new.procedure_name,'') ~* 'nebul'
     and (tg_op='INSERT' or (new.status='Started' and old.status is distinct from 'Started')) then
    raise exception 'Nebulisation is now recorded only in Medication Administration (MAR): give the nebulisation medicine there and choose Samara / Own nebulizer — the charge is raised automatically.';
  end if;
  return new;
end $$;
drop trigger if exists samara_block_neb_requests on public.nursing_procedure_requests;
create trigger samara_block_neb_requests before insert or update of status on public.nursing_procedure_requests
  for each row execute function public.samara_block_neb_requests();

update public.nursing_procedure_requests
   set status='Cancelled',
       decision_remarks=concat_ws(' · ', decision_remarks, 'Cancelled 11-11-2026: nebulisation is now recorded in the MAR (charged from there)'),
       updated_at=now()
 where status in ('Requested','Approved') and coalesce(category,'Nursing Procedures')='Nursing Procedures' and coalesce(procedure_name,'') ~* 'nebul';

-- 4. Automatic posting — no Accounts approval for Nursing Procedures and Physiotherapy sessions ----------------------------
create or replace function public.samara_auto_post_charge(p_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.bill_charge_requests%rowtype; v_amount numeric; v_tid uuid; v_note text; v_cat text;
begin
  select * into r from public.bill_charge_requests where id=p_id for update;
  if not found or coalesce(r.approval_status,'Pending')<>'Pending' or r.billing_transaction_id is not null
     or coalesce(r.status,'') in ('Cancelled','Removed','Rejected','Posted') then return null; end if;
  if coalesce(r.bill_available,false) or r.outside_paid_by is not null
     or upper(coalesce(r.service_code,''))='OTHER' or lower(trim(coalesce(r.service_name,''))) in ('others','other') then return null; end if;

  if r.physiotherapy_session_id is not null then
    if coalesce(r.unit_cost,0)<=0 then return null; end if;   -- no agreed rate yet → Accounts / Admin as before
    if not exists (select 1 from public.physiotherapy_sessions s where s.id=r.physiotherapy_session_id and s.status='Completed'
                    and s.patient_id=r.patient_id and s.charge_request_id=r.id) then return null; end if;
    v_amount := r.unit_cost; v_cat := 'Physiotherapy'; v_note := 'Guest agreed rate';
  elsif r.category='Nursing Procedures' then
    select amount into v_amount from public.charge_tariff_master
     where is_active and ((nullif(r.charge_item_code,'') is not null and charge_code=r.charge_item_code)
                          or (category=r.category and service_name=r.service_name))
     order by (charge_code is not distinct from r.charge_item_code) desc limit 1;
    if coalesce(v_amount,0)<=0 then return null; end if;   -- no Admin-fixed tariff → Accounts as before
    v_amount := v_amount * greatest(coalesce(r.quantity,1),1); v_cat := r.category; v_note := 'Admin-fixed tariff';
  else
    return null;
  end if;

  insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by)
  values (r.patient_id,'Charge',v_cat,v_amount,'Not applicable',
          concat(r.description,' · Auto-posted when recorded done (no Accounts approval needed) · ',v_note),
          now(), coalesce(r.raised_by, auth.uid()))
  returning id into v_tid;
  update public.bill_charge_requests
     set unit_cost=coalesce(unit_cost, v_amount/greatest(coalesce(quantity,1),1)), estimated_amount=coalesce(estimated_amount,v_amount),
         requested_amount=coalesce(requested_amount,v_amount), final_amount=v_amount, approved_amount=v_amount,
         approval_status='Approved', status='Posted', approved_at=now(), decision_date=now(),
         decision_by_name='Auto-posted (no Accounts approval)', decision_by_role='System',
         approval_remarks=concat_ws(' · ', nullif(approval_remarks,''), 'Auto-posted on completion — rule 11-11-2026'),
         billing_transaction_id=v_tid, auto_posted=true, updated_at=now()
   where id=r.id;
  return v_tid;
exception when others then
  insert into public.samara_auto_charge_issues(source, ref, patient_id, message) values ('Auto-post charge', p_id::text, r.patient_id, sqlerrm);
  return null;
end $$;
revoke all on function public.samara_auto_post_charge(uuid) from public, anon, authenticated;

create or replace function public.samara_trg_auto_post_charge()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.samara_auto_post_charge(new.id);
  return null;
end $$;
revoke all on function public.samara_trg_auto_post_charge() from public, anon, authenticated;
-- deferred to the end of the save, so the physiotherapy session link (set after the charge) is in place
drop trigger if exists samara_auto_post_charge on public.bill_charge_requests;
create constraint trigger samara_auto_post_charge after insert or update of unit_cost, physiotherapy_session_id on public.bill_charge_requests
  deferrable initially deferred for each row execute function public.samara_trg_auto_post_charge();

-- 5. Family Portal: one payload for the portal AND the ERP preview --------------------------------------------------------
create or replace function public.samara_family_procedures_payload(pid uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_ids jsonb; v_plan jsonb; v_logs jsonb; v_req jsonb; v_mar jsonb; v_neb_name text;
begin
  if pid is null then return '{}'::jsonb; end if;
  select coalesce(jsonb_agg(c.id),'[]'::jsonb) into v_ids
    from public.care_orders c where c.patient_id=pid and c.order_kind='Nursing Procedure';
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'procedure_name',c.care_type,'shift',c.shift,'frequency',c.frequency,
      'scheduled_times',to_jsonb(c.scheduled_times),'instruction',c.instruction,'start_date',c.start_date) order by c.created_at),'[]'::jsonb)
    into v_plan
    from public.care_orders c where c.patient_id=pid and c.order_kind='Nursing Procedure' and coalesce(c.is_active,true);
  -- the name the family sees for nebulisation = the planned procedure's name (so "done today x of y" counts), else "Nebulization"
  select c.care_type into v_neb_name from public.care_orders c
   where c.patient_id=pid and c.order_kind='Nursing Procedure' and coalesce(c.is_active,true) and c.care_type ~* 'nebul'
   order by c.created_at limit 1;

  -- planned-procedure records, except nebulisation (comes from the MAR below)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id','log-'||l.id,'procedure_name',c.care_type,'status',coalesce(l.status,'Recorded'),
      'completed_at',coalesce(l.completed_at,l.created_at),'care_date',l.care_date,'shift',l.shift,
      'scheduled_time',to_char(l.scheduled_time,'HH24:MI'),
      'details',nullif(btrim(case when c.care_type is not null and lower(left(coalesce(l.remarks,''),length(c.care_type)))=lower(c.care_type)
                   then regexp_replace(substr(l.remarks,length(c.care_type)+1),'^\s*:\s*','') else coalesce(l.remarks,'') end),''))
     order by coalesce(l.completed_at,l.created_at) desc),'[]'::jsonb) into v_logs
    from (select * from public.care_logs where patient_id=pid and care_date>=current_date-120 order by coalesce(completed_at,created_at) desc limit 400) l
    join public.care_orders c on c.id=l.care_order_id and c.order_kind='Nursing Procedure'
   where coalesce(c.care_type,'') !~* 'nebul';

  -- procedures started through Approval Requests, except nebulisation and those already shown through their plan record
  select coalesce(jsonb_agg(jsonb_build_object(
      'id','req-'||r.id,'procedure_name',r.procedure_name,'status','Done',
      'completed_at',coalesce(r.started_at,r.scheduled_at,r.requested_at),'details',null)
     order by coalesce(r.started_at,r.requested_at) desc),'[]'::jsonb) into v_req
    from public.nursing_procedure_requests r
   where r.patient_id=pid and r.status='Started' and coalesce(r.category,'Nursing Procedures')='Nursing Procedures'
     and coalesce(r.procedure_name,'') !~* 'nebul'
     and coalesce(r.started_at,r.requested_at)>=now()-interval '120 days'
     and not exists (select 1 from public.care_logs l2 join public.care_orders c2 on c2.id=l2.care_order_id
                      where l2.patient_id=pid and c2.order_kind='Nursing Procedure' and l2.completed_at=r.started_at);

  -- nebulisation: one record per MAR session (dose time), at the real given time
  select coalesce(jsonb_agg(jsonb_build_object(
      'id','mar-'||s.d||'-'||to_char(s.t,'HH24MI'),'procedure_name',coalesce(v_neb_name,'Nebulization'),'status','Done',
      'completed_at',s.given_at,'care_date',s.d,'scheduled_time',to_char(s.t,'HH24:MI'),'details','With '||s.meds)
     order by s.given_at desc),'[]'::jsonb) into v_mar
    from (select a.scheduled_date d, a.scheduled_time::time t, min(a.administered_at) given_at, string_agg(distinct o.medicine_name, ', ') meds
            from public.medication_administrations a join public.medication_orders o on o.id=a.order_id
           where o.patient_id=pid and a.status='Given' and a.scheduled_date>=current_date-120
             and public.samara_is_nebulisation(o.route,o.medicine_name)
           group by 1,2) s;

  return jsonb_build_object('proc_order_ids',v_ids,'plan',v_plan,'records',v_logs||v_req||v_mar);
end $$;
revoke all on function public.samara_family_procedures_payload(uuid) from public, anon, authenticated;

create or replace function public.family_portal_nursing_procedures(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; pid uuid; argtype text; pt jsonb;
begin
 if coalesce(trim(p_session_token),'')='' then return '{}'::jsonb;end if;
 select format_type(p.proargtypes[0],null) into argtype from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='family_portal_dashboard' and p.pronargs=1 limit 1;
 if argtype is null then return '{}'::jsonb;end if;
 begin
  execute format('select to_jsonb(public.family_portal_dashboard($1::%s))',argtype) into d using p_session_token;
 exception when others then return '{}'::jsonb;
 end;
 if d is null or jsonb_typeof(d)<>'object' then return '{}'::jsonb;end if;
 pt:=coalesce(d->'patient',d->'resident',d->'guest','{}'::jsonb);
 select p.id into pid from public.patients p
  where p.id::text in (pt->>'id',pt->>'patient_uuid',pt->>'patient_db_id',pt->>'uuid',pt->>'patient_id') limit 1;
 if pid is null then
  select p.id into pid from public.patients p
   where p.patient_id in (pt->>'patient_id',pt->>'resident_id',pt->>'patient_code',pt->>'id') limit 1;
 end if;
 if pid is null then return '{}'::jsonb;end if;
 return public.samara_family_procedures_payload(pid);
end $$;
revoke all on function public.family_portal_nursing_procedures(text) from public;
grant execute on function public.family_portal_nursing_procedures(text) to anon, authenticated;

create or replace function public.erp_family_preview_nursing_procedures(p_patient uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']) then
    raise exception 'Not allowed';
  end if;
  return public.samara_family_procedures_payload(p_patient);
end $$;
revoke all on function public.erp_family_preview_nursing_procedures(uuid) from public, anon;
grant execute on function public.erp_family_preview_nursing_procedures(uuid) to authenticated;

commit;

-- 6. One-time catch-up (separate, so a problem here never undoes the above) ---------------------------------------------
-- a) today's nebulisation sessions already given in the MAR: link the charges raised the old way, charge the rest
do $catchup$
declare s record;
begin
  for s in select o.patient_id, a.scheduled_date d, a.scheduled_time::time t, min(a.administered_at) as given_at, (array_agg(a.administered_by order by a.administered_at))[1] as by_
             from public.medication_administrations a join public.medication_orders o on o.id=a.order_id
            where a.status='Given' and a.scheduled_date >= date '2026-11-11'
              and public.samara_is_nebulisation(o.route,o.medicine_name)
            group by 1,2,3 order by 4 loop
    perform public.samara_mar_neb_session_sync(s.patient_id, s.d, s.t, s.by_);
  end loop;
end $catchup$;

-- b) charges waiting with Accounts in Nursing Procedures / Physiotherapy sessions → posted now (owner's instruction 11-11-2026)
do $post$
declare r record; n int := 0;
begin
  for r in select id from public.bill_charge_requests
            where coalesce(approval_status,'Pending')='Pending' and coalesce(status,'') not in ('Cancelled','Removed','Rejected','Posted')
              and (category='Nursing Procedures' or physiotherapy_session_id is not null)
            order by coalesce(service_datetime,raised_at) loop
    if public.samara_auto_post_charge(r.id) is not null then n := n+1; end if;
  end loop;
  raise notice 'Posted % waiting charge(s).', n;
end $post$;

notify pgrst, 'reload schema';

-- Checks -------------------------------------------------------------------------------------------------------------
-- 1) installed
select tgname from pg_trigger where tgname in ('samara_mar_neb_charge','samara_block_neb_requests','samara_auto_post_charge') order by 1;
-- 2) what was posted / linked today, and anything left waiting in these groups (with the reason it could not be posted)
select b.charge_date, p.full_name guest, b.service_name, b.quantity, b.final_amount, b.status, b.approval_status,
       b.auto_posted, b.mar_neb_time,
       case when b.approval_status='Pending' and b.physiotherapy_session_id is not null and coalesce(b.unit_cost,0)<=0 then 'no agreed physio rate'
            when b.approval_status='Pending' then 'no Charge Master rate / Others / bill-based' end as still_waiting_because
  from public.bill_charge_requests b join public.patients p on p.id=b.patient_id
 where (b.category='Nursing Procedures' or b.physiotherapy_session_id is not null)
   and (b.updated_at > now() - interval '15 minutes' or b.approval_status='Pending')
 order by b.charge_date desc, b.service_datetime desc;
-- 3) problems (should be empty)
select * from public.samara_auto_charge_issues order by at desc limit 20;
