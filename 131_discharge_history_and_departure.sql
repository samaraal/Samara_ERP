-- Preserve financial decisions; review late departures without deleting ledger entries.
begin;
alter table public.patient_discharges
 add column if not exists accounts_recheck_at timestamptz,
 add column if not exists accounts_recheck_reason text,
 add column if not exists departure_recorded_at timestamptz,
 add column if not exists departure_entry_reason text;

create table if not exists public.discharge_workflow_events(
 id uuid primary key default gen_random_uuid(),
 discharge_id uuid not null references public.patient_discharges(id),
 event_type text not null, occurred_at timestamptz not null default now(),
 actor_id uuid, actor_name text, details jsonb not null default '{}'::jsonb
);
create index if not exists discharge_workflow_events_case on public.discharge_workflow_events(discharge_id,occurred_at);
alter table public.discharge_workflow_events enable row level security;
revoke all on public.discharge_workflow_events from public,anon,authenticated;
drop policy if exists discharge_events_read on public.discharge_workflow_events;
create policy discharge_events_read on public.discharge_workflow_events for select to authenticated
 using(exists(select 1 from public.patient_discharges d where d.id=discharge_id));

create table if not exists public.discharge_departure_reviews(
 id uuid primary key default gen_random_uuid(), discharge_id uuid not null references public.patient_discharges(id),
 patient_id uuid not null references public.patients(id), admission_date date not null,
 actual_departure_at timestamptz not null, reason text not null,
 status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),
 reported_at timestamptz not null default now(),reported_by uuid not null,reported_name text not null,
 reviewed_at timestamptz,reviewed_by uuid,reviewed_name text,review_note text,
 correction_amount numeric not null default 0
);
create unique index if not exists discharge_one_departure_review on public.discharge_departure_reviews(discharge_id) where status in ('Pending','Approved');
alter table public.discharge_departure_reviews enable row level security;
revoke all on public.discharge_departure_reviews from public,anon,authenticated;

create or replace function public.discharge_workflow_authority() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles; nurse boolean; reviewer boolean; reader boolean; finance boolean;
begin
 select * into p from public.profiles where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(is_active,true) limit 1;
 if p.id is null then raise exception 'Active staff sign-in required';end if;
 reviewer:=public.stores_return_approval_allowed();
 select exists(select 1 from public.duty_permission_profiles x where x.id=p.id and x.role='Nurse') and
   not exists(select 1 from public.director_office_positions where position_key='director' and assigned_profile_id=p.id) into nurse;
 select exists(select 1 from public.duty_permission_profiles x where x.id=p.id and x.role in ('Admin','Manager','Nurse','Accounts')) into reader;
 if not coalesce(reader,false) and not coalesce(reviewer,false) then raise exception 'Discharge workspace access required';end if;
 select exists(select 1 from public.duty_permission_profiles x where x.id=p.id and x.role in ('Admin','Manager','Accounts')) or reviewer into finance;
 return jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),'Staff'),'nurse',coalesce(nurse,false),'review',coalesce(reviewer,false),'finance',coalesce(finance,false));
end $$;
revoke all on function public.discharge_workflow_authority() from public,anon,authenticated;

create or replace function public.discharge_workflow_history_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare reviewed_time timestamptz;
begin
 if new.accounts_status='Cleared' and old.accounts_status is distinct from 'Cleared' then
   new.accounts_recheck_at:=null;new.accounts_recheck_reason:=null;
   insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,actor_name,details)
   values(new.id,'Accounts cleared',new.accounts_cleared_by,new.accounts_cleared_by_name,
     jsonb_build_object('cleared_at',new.accounts_cleared_at,'remarks',new.accounts_remarks,'balance',new.final_outstanding,
       'ledger_totals',(select jsonb_object_agg(x.transaction_type,x.total) from
         (select transaction_type,sum(amount) total from public.billing_transactions where patient_id=new.patient_id group by transaction_type)x)));
 elsif old.accounts_status='Cleared' and new.accounts_status is distinct from 'Cleared' then
   -- The fields now describe the last clearance, not the current permission to depart.
   new.accounts_cleared_at:=old.accounts_cleared_at;new.accounts_cleared_by:=old.accounts_cleared_by;
   new.accounts_cleared_by_name:=old.accounts_cleared_by_name;
   new.accounts_recheck_at:=coalesce(new.accounts_recheck_at,now());
   new.accounts_recheck_reason:=coalesce(new.accounts_recheck_reason,'Account changed; review required.');
   insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,details)
   values(new.id,'Accounts recheck required',auth.uid(),jsonb_build_object('reason',new.accounts_recheck_reason,
     'previous_clearance_at',old.accounts_cleared_at,'previous_clearance_by',old.accounts_cleared_by_name));
 end if;
 if new.status='Completed' and old.status is distinct from 'Completed' then
   if new.actual_departure_at is null or new.actual_departure_at>now() then raise exception 'A valid actual departure time, not a future time, is required';end if;
   if new.actual_departure_at<coalesce(new.initiated_at,new.created_at) then raise exception 'Departure cannot precede the discharge request';end if;
   if new.actual_departure_at<now()-interval '1 hour' and nullif(trim(new.departure_entry_reason),'') is null then
     raise exception 'Explain the late departure entry before completing discharge';end if;
   select actual_departure_at into reviewed_time from public.discharge_departure_reviews where discharge_id=new.id and status='Approved';
   if reviewed_time is not null and new.actual_departure_at is distinct from reviewed_time then
     raise exception 'Use the reviewed actual departure time';end if;
   if exists(select 1 from public.discharge_departure_reviews where discharge_id=new.id and status='Pending') then
     raise exception 'Management must resolve the pending departure correction first';end if;
   if exists(select 1 from public.billing_transactions t where t.patient_id=new.patient_id and t.transaction_type='Charge'
     and t.auto_generated and t.source_type in ('Daily Room Charge','Daily Nursing Charge','Daily Special Nurse Charge')
     and t.source_date>(new.actual_departure_at at time zone 'Asia/Kolkata')::date
     and not exists(select 1 from public.billing_transactions c where c.source_key='DEPARTURE_REVERSAL:'||t.id::text)) then
     raise exception 'Post-departure accommodation charges exist. Submit a late departure report for management review first';end if;
   new.departure_recorded_at:=now();new.completed_at:=now();
   insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,details)
   values(new.id,'Nursing departure confirmed',auth.uid(),jsonb_build_object('actual_departure_at',new.actual_departure_at,
     'recorded_at',now(),'late_entry_reason',new.departure_entry_reason));
 end if;
 return new;
end $$;
revoke all on function public.discharge_workflow_history_guard() from public,anon,authenticated;
drop trigger if exists discharge_workflow_history on public.patient_discharges;
create trigger discharge_workflow_history before update on public.patient_discharges for each row execute function public.discharge_workflow_history_guard();

-- Import only verifiable values. Never invent a clearance timestamp that was erased.
insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,actor_name,details)
select d.id,'Existing clearance record',d.accounts_cleared_by,d.accounts_cleared_by_name,
 jsonb_build_object('cleared_at',d.accounts_cleared_at,'remarks',d.accounts_remarks,'current_status',d.accounts_status)
from public.patient_discharges d where d.accounts_cleared_at is not null and not exists
 (select 1 from public.discharge_workflow_events e where e.discharge_id=d.id);
insert into public.discharge_workflow_events(discharge_id,event_type,details)
select d.id,'Legacy clearance reset',jsonb_build_object('note','Earlier clearance was reset before history tracking. Original actor/time cannot be recovered from this record.','remarks',d.accounts_remarks)
from public.patient_discharges d where d.accounts_cleared_at is null and d.accounts_remarks like '%Financial activity changed after clearance%'
and not exists(select 1 from public.discharge_workflow_events e where e.discharge_id=d.id);

create or replace function public.samara_financial_activity_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid; item jsonb; explanation text;
begin
 if tg_op='UPDATE' then
   if new.patient_id is distinct from old.patient_id then raise exception 'A financial record cannot be moved to another patient.';end if;
   if new is not distinct from old then return new;end if;
 end if;
 if tg_op='DELETE' then pid:=old.patient_id;item:=to_jsonb(old);else pid:=new.patient_id;item:=to_jsonb(new);end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text,105));
 explanation:=concat_ws(' · ',case when tg_table_name='billing_transactions' then 'Ledger ' else 'Charge request ' end||lower(tg_op),
   item->>'category',item->>'description',case when item->>'amount' is not null then 'Amount: '||(item->>'amount') end,
   case when item->>'source_date' is not null then 'Charge date: '||(item->>'source_date') end);
 insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,details)
 select d.id,'Financial change after clearance',auth.uid(),jsonb_build_object('reason',explanation,'table',tg_table_name,
   'record_id',item->>'id','operation',tg_op,'amount',item->'amount','source_date',item->'source_date')
 from public.patient_discharges d where d.patient_id=pid and d.status not in ('Completed','Cancelled','Closed')
 and (d.accounts_status='Cleared' or d.accounts_recheck_at is not null or d.accounts_remarks like '%Financial activity changed after clearance%');
 update public.patient_discharges set accounts_status='Pending',billing_clearance_status='Pending',
   status='Management Approved',accounts_recheck_at=coalesce(accounts_recheck_at,now()),accounts_recheck_reason=explanation,updated_at=now()
 where patient_id=pid and accounts_status='Cleared' and status not in ('Completed','Cancelled','Closed');
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.samara_financial_activity_guard() from public,anon,authenticated;

create or replace function public.discharge_billing_cutoff(pid uuid) returns date
language sql stable security definer set search_path=public,pg_temp as $$
 select min((r.actual_departure_at at time zone 'Asia/Kolkata')::date)
 from public.discharge_departure_reviews r join public.patient_discharges d on d.id=r.discharge_id
 join public.patients p on p.id=r.patient_id
 where r.patient_id=pid and r.status='Approved' and r.admission_date=p.admission_date::date
 and d.status not in ('Cancelled','Closed')
$$;
revoke all on function public.discharge_billing_cutoff(uuid) from public,anon,authenticated;

create or replace function public.discharge_billing_write_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare cutoff date;
begin
 if tg_op in ('UPDATE','DELETE') then
   if old.source_type='Reviewed Departure Correction' or exists(select 1 from public.billing_transactions c where c.source_key='DEPARTURE_REVERSAL:'||old.id::text) then
     raise exception 'Reviewed departure charges and their reversal entries are permanent audit records';end if;
 end if;
 if tg_op='DELETE' then return old;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.patient_id::text,105));
 if new.source_type='Reviewed Departure Correction' or new.source_key like 'DEPARTURE_REVERSAL:%' then
   if nullif(current_setting('samara.departure_review_id',true),'') is null then raise exception 'Use the reviewed departure correction workflow';end if;
 end if;
 if new.transaction_type='Charge' and new.auto_generated and new.source_type in ('Daily Room Charge','Daily Nursing Charge','Daily Special Nurse Charge') then
   cutoff:=public.discharge_billing_cutoff(new.patient_id);
   if new.source_date>cutoff then
     if tg_op='INSERT' then return null;end if;
     raise exception 'Reviewed departure cutoff prevents accommodation charges after departure';
   end if;
 end if;
 return new;
end $$;
revoke all on function public.discharge_billing_write_guard() from public,anon,authenticated;
drop trigger if exists discharge_billing_cutoff_guard on public.billing_transactions;
create trigger discharge_billing_cutoff_guard before insert or update or delete on public.billing_transactions for each row execute function public.discharge_billing_write_guard();

create or replace function public.report_late_discharge_departure(p_discharge_id uuid,p_actual_departure_at timestamptz,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.discharge_workflow_authority();d public.patient_discharges;p public.patients;rid uuid;pid uuid;
begin
 if not (a->>'nurse')::boolean then raise exception 'Nursing staff must report the actual departure';end if;
 select patient_id into pid from public.patient_discharges where id=p_discharge_id;
 perform pg_advisory_xact_lock(hashtextextended(pid::text,105));
 select * into d from public.patient_discharges where id=p_discharge_id for update;
 if d.id is null or d.status in ('Completed','Cancelled','Closed') or d.management_status is distinct from 'Approved' then raise exception 'An open management-approved discharge is required';end if;
 select * into p from public.patients where id=d.patient_id;
 if p.admission_date is null or p.admission_date::date>(p_actual_departure_at at time zone 'Asia/Kolkata')::date then raise exception 'Departure must belong to the current admission';end if;
 if p_actual_departure_at is null or p_actual_departure_at>now() or p_actual_departure_at<coalesce(d.initiated_at,d.created_at) then raise exception 'Enter the actual departure between initiation and now';end if;
 if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Explain the late entry and how departure was verified';end if;
 insert into public.discharge_departure_reviews(discharge_id,patient_id,admission_date,actual_departure_at,reason,reported_by,reported_name)
 values(d.id,d.patient_id,p.admission_date,p_actual_departure_at,trim(p_reason),(a->>'id')::uuid,a->>'name') returning id into rid;
 insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,actor_name,details)
 values(d.id,'Late departure reported',(a->>'id')::uuid,a->>'name',jsonb_build_object('review_id',rid,'actual_departure_at',p_actual_departure_at,'reason',trim(p_reason)));
 return rid;
end $$;

create or replace function public.discharge_departure_review_snapshot(p_review_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.discharge_workflow_authority();r public.discharge_departure_reviews;ledger jsonb;charges jsonb;candidates jsonb;activity jsonb;payload jsonb;
begin
 if not (a->>'finance')::boolean then raise exception 'Management or Accounts access required to inspect financial corrections';end if;
 select * into r from public.discharge_departure_reviews where id=p_review_id;
 if r.id is null then raise exception 'Departure review not found';end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into ledger from public.billing_transactions t where patient_id=r.patient_id;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into charges from public.bill_charge_requests t where patient_id=r.patient_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'category',t.category,'amount',t.amount,'date',t.source_date) order by t.source_date,t.id),'[]') into candidates
 from public.billing_transactions t where t.patient_id=r.patient_id and t.transaction_type='Charge' and t.auto_generated
 and t.source_type in ('Daily Room Charge','Daily Nursing Charge','Daily Special Nurse Charge')
 and t.source_date>(r.actual_departure_at at time zone 'Asia/Kolkata')::date
 and not exists(select 1 from public.billing_transactions c where c.source_key='DEPARTURE_REVERSAL:'||t.id::text);
 select coalesce(jsonb_agg(jsonb_build_object('time',x.created_at,'action',x.action,'user',x.user_name) order by x.created_at),'[]') into activity
 from public.audit_log x where x.created_at>r.actual_departure_at and x.details->>'patient_id'=r.patient_id::text
 and x.entity in ('Daily Care','Medication','Vitals','Nursing');
 payload:=jsonb_build_object('report',to_jsonb(r),'charges',candidates,'activity_after_reported_departure',activity,
 'amount',coalesce((select sum((c->>'amount')::numeric) from jsonb_array_elements(candidates)c),0));
 return payload||jsonb_build_object('token',md5(payload::text||ledger::text||charges::text));
end $$;

create or replace function public.review_late_discharge_departure(p_review_id uuid,p_approve boolean,p_note text,p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.discharge_workflow_authority();r public.discharge_departure_reviews;d public.patient_discharges;snap jsonb;pid uuid;t record;total numeric:=0;
begin
 if not (a->>'review')::boolean then raise exception 'Admin/Director review required';end if;
 if p_approve is null or length(trim(coalesce(p_note,'')))<10 then raise exception 'A decision and verification note are required';end if;
 select patient_id into pid from public.discharge_departure_reviews where id=p_review_id;
 perform pg_advisory_xact_lock(hashtextextended(pid::text,105));
 select * into r from public.discharge_departure_reviews where id=p_review_id for update;
 if r.id is null or r.status<>'Pending' then raise exception 'This departure report is no longer pending';end if;
 if r.reported_by=(a->>'id')::uuid then raise exception 'Another authorised reviewer must verify the report';end if;
 select * into d from public.patient_discharges where id=r.discharge_id for update;
 if d.status in ('Completed','Cancelled','Closed') or d.management_status is distinct from 'Approved' then raise exception 'Discharge is no longer eligible for correction';end if;
 if not exists(select 1 from public.patients where id=r.patient_id and admission_date::date=r.admission_date and is_active is distinct from false) then raise exception 'Admission changed; review cannot be applied';end if;
 snap:=public.discharge_departure_review_snapshot(r.id);
 if p_token is distinct from snap->>'token' then raise exception 'The account or review changed. Refresh and review again';end if;
 if p_approve then
   update public.discharge_departure_reviews set status='Approved',reviewed_at=now(),reviewed_by=(a->>'id')::uuid,reviewed_name=a->>'name',review_note=trim(p_note),correction_amount=(snap->>'amount')::numeric where id=r.id;
   perform set_config('samara.departure_review_id',r.id::text,true);
   for t in select * from jsonb_to_recordset(snap->'charges') as x(id uuid,category text,amount numeric,date date) loop
     insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by,source_key,source_type,source_date,auto_generated)
     values(r.patient_id,'Discount','Post-departure Billing Correction',t.amount,'Not applicable',
       'Reversal of automatic '||t.category||' for '||t.date||'; original entry '||t.id||'; reviewed departure '||r.actual_departure_at||'; '||trim(p_note),now(),(a->>'id')::uuid,
       'DEPARTURE_REVERSAL:'||t.id::text,'Reviewed Departure Correction',t.date,false);
     total:=total+t.amount;
   end loop;
 else
   update public.discharge_departure_reviews set status='Rejected',reviewed_at=now(),reviewed_by=(a->>'id')::uuid,reviewed_name=a->>'name',review_note=trim(p_note) where id=r.id;
 end if;
 insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,actor_name,details)
 values(r.discharge_id,case when p_approve then 'Departure correction approved' else 'Departure correction rejected' end,(a->>'id')::uuid,a->>'name',
 jsonb_build_object('review_id',r.id,'actual_departure_at',r.actual_departure_at,'correction_amount',total,'note',trim(p_note),'reviewed_snapshot',snap));
 return jsonb_build_object('correction_amount',total,'next_action','Accounts must verify the resulting balance; Nursing completes final handover and departure.');
end $$;

create or replace function public.discharge_workflow_workspace() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.discharge_workflow_authority();result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'patient_id',d.patient_id,'patient_name',p.full_name,'patient_code',p.patient_id,
 'status',d.status,'management_status',d.management_status,'accounts_status',d.accounts_status,
 'initiated_at',d.initiated_at,'management_approved_at',d.management_approved_at,
 'accounts_cleared_at',d.accounts_cleared_at,'accounts_cleared_by_name',d.accounts_cleared_by_name,
 'accounts_recheck_at',d.accounts_recheck_at,'accounts_recheck_reason',case when (a->>'finance')::boolean then d.accounts_recheck_reason when d.accounts_recheck_at is not null then 'Financial activity after clearance requires Accounts review.' end,
 'legacy_reset',d.accounts_remarks like '%Financial activity changed after clearance%',
 'actual_departure_at',d.actual_departure_at,'departure_recorded_at',d.departure_recorded_at,
 'overdue',d.status<>'Completed' and d.accounts_status='Cleared' and d.accounts_cleared_at<now()-interval '2 hours',
 'events',(select coalesce(jsonb_agg(case when (a->>'finance')::boolean then to_jsonb(e) else
   to_jsonb(e)||jsonb_build_object('details',jsonb_strip_nulls(jsonb_build_object('cleared_at',e.details->'cleared_at','actual_departure_at',e.details->'actual_departure_at','recorded_at',e.details->'recorded_at'))) end order by e.occurred_at,e.id),'[]') from public.discharge_workflow_events e where e.discharge_id=d.id),
 'reviews',(select coalesce(jsonb_agg(case when (a->>'finance')::boolean then to_jsonb(r) else to_jsonb(r)-'correction_amount' end order by r.reported_at),'[]') from public.discharge_departure_reviews r where r.discharge_id=d.id)
 ) order by d.created_at desc),'[]') into result from public.patient_discharges d join public.patients p on p.id=d.patient_id
 where d.status not in ('Cancelled','Closed') and (d.status<>'Completed' or d.completed_at>now()-interval '30 days');
 return jsonb_build_object('authority',a,'cases',result,'server_time',now());
end $$;
revoke all on function public.report_late_discharge_departure(uuid,timestamptz,text),public.discharge_departure_review_snapshot(uuid),public.review_late_discharge_departure(uuid,boolean,text,text),public.discharge_workflow_workspace() from public,anon;
grant execute on function public.report_late_discharge_departure(uuid,timestamptz,text),public.discharge_departure_review_snapshot(uuid),public.review_late_discharge_departure(uuid,boolean,text,text),public.discharge_workflow_workspace() to authenticated;

CREATE OR REPLACE FUNCTION public.run_daily_billing_automation(p_charge_date date DEFAULT CURRENT_DATE, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 rec record;
 v_day date;
 v_start_date date;
 v_end_date date;
 v_package_end date;
 v_patient_package_end date;
 v_run_id uuid;
 v_run_type text := case when p_force then 'Admin Rerun' else 'Automatic' end;
 v_actor uuid := auth.uid();
 v_room_rate numeric;
 v_nursing_rate numeric;
 v_special_rate numeric;
 v_room_created integer := 0;
 v_nursing_created integer := 0;
 v_special_created integer := 0;
 v_package_days_skipped integer := 0;
 v_duplicate_skipped integer := 0;
 v_patient_skipped integer := 0;
 v_errors integer := 0;
 v_inserted integer := 0;
 v_patients_processed integer := 0;
 v_catchup_from date := null;
 v_error_details jsonb := '[]'::jsonb;
 v_missing_room integer := 0;
 v_missing_nursing integer := 0;
begin
 if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then
 raise exception 'Authentication is required.';
 end if;
 if p_charge_date > current_date then
 raise exception 'Future daily charges are not permitted.';
 end if;

 insert into public.daily_billing_runs(charge_date,run_type,triggered_by,status)
 values(p_charge_date,v_run_type,v_actor,'Started')
 returning id into v_run_id;

 for rec in
 select
 p.id patient_id,
 p.full_name,
 p.patient_id patient_code,
 p.admission_date::date admission_date,
 p.discharge_date::date discharge_date,
 p.room_no,
 p.bed_no,
 coalesce(p.special_nurse_required,false) special_nurse_required,
 case
 when coalesce(to_jsonb(p)->>'package_end_date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 then (to_jsonb(p)->>'package_end_date')::date
 else null
 end patient_package_end,
 rb.room_type,
 coalesce(
 nullif(rb.room_daily_rate,0),
 nullif(rb.daily_rate,0),
 case
 when lower(coalesce(rb.room_type,'')) similar to '%(private|single|separate|deluxe)%' then 3000
 when lower(coalesce(rb.room_type,'')) similar to '%(general|ward|dorm)%' then 1800
 else 2000
 end
 ) room_rate,
 coalesce(
 nullif(rb.nursing_daily_rate,0),
 case
 when lower(coalesce(rb.room_type,'')) similar to '%(private|single|separate|deluxe)%' then 1000
 when lower(coalesce(rb.room_type,'')) similar to '%(general|ward|dorm)%' then 750
 else 800
 end
 ) nursing_rate,
 coalesce(rb.special_nurse_daily_rate,0) special_rate
 from public.patients p
 left join lateral (
 select b.*
 from public.room_beds b
 where b.patient_id=p.id
 or (
 b.room_no=p.room_no
 and upper(coalesce(b.bed_no,''))=upper(coalesce(p.bed_no,''))
 )
 order by (b.patient_id=p.id) desc, b.updated_at desc nulls last
 limit 1
 ) rb on true
 where coalesce(p.is_active,true)=true
 and coalesce(p.admission_date::date,p_charge_date)<=p_charge_date
 and p.room_no is not null
 and p.bed_no is not null
 loop
 v_patients_processed := v_patients_processed + 1;
 v_room_rate := coalesce(rec.room_rate,2000);
 v_nursing_rate := coalesce(rec.nursing_rate,800);
 v_special_rate := coalesce(rec.special_rate,0);

 -- IMPORTANT: this loop contains ACTIVE residents only.
 -- Ignore stale patient discharge_date; honor independently reviewed actual departure.
 perform pg_advisory_xact_lock(hashtextextended(rec.patient_id::text,105));
 v_end_date := least(p_charge_date,coalesce(public.discharge_billing_cutoff(rec.patient_id),p_charge_date));
 v_start_date := coalesce(rec.admission_date,p_charge_date);
 v_patient_package_end := rec.patient_package_end;

 -- Latest package end recorded in an Assisted Living Package transaction.
 select max(
 to_date(
 substring(bt.description from 'to[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2})'),
 'YYYY-MM-DD'
 )
 )
 into v_package_end
 from public.billing_transactions bt
 where bt.patient_id=rec.patient_id
 and bt.transaction_type='Charge'
 and bt.category='Assisted Living Package'
 and substring(coalesce(bt.description,'') from 'to[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2})') is not null;

 if v_patient_package_end is not null
 and (v_package_end is null or v_patient_package_end>v_package_end) then
 v_package_end := v_patient_package_end;
 end if;

 -- For packaged residents, daily accommodation begins the day AFTER package expiry.
 if v_package_end is not null and v_package_end>=v_start_date then
 v_start_date := v_package_end + 1;
 end if;

 if v_start_date>v_end_date then
 v_patient_skipped := v_patient_skipped + 1;
 continue;
 end if;

 if v_catchup_from is null or v_start_date<v_catchup_from then
 v_catchup_from := v_start_date;
 end if;

 for v_day in
 select gs::date
 from generate_series(v_start_date::timestamp,v_end_date::timestamp,interval '1 day') gs
 loop
 if public.patient_package_covers_date(rec.patient_id,v_day) then
 v_package_days_skipped := v_package_days_skipped + 1;
 continue;
 end if;

 -- ROOM: isolated block. A later Nursing/Special Nurse problem cannot roll this row back.
 begin
 insert into public.billing_transactions(
 patient_id,transaction_type,category,amount,payment_mode,description,
 transaction_date,entered_by,auto_generated,source_date,source_type,source_key
 ) values(
 rec.patient_id,'Charge','Room Charges',v_room_rate,'Not applicable',
 format('Automatic room rent for %s · Room %s-%s · %s',
 to_char(v_day,'DD-MM-YYYY'),rec.room_no,rec.bed_no,coalesce(rec.room_type,'Room')),
 v_day::timestamptz,v_actor,true,v_day,'Daily Room Charge',
 format('ROOM:%s:%s',rec.patient_id,v_day)
 ) on conflict(source_key) where source_key is not null do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=1 then
 v_room_created := v_room_created + 1;
 else
 v_duplicate_skipped := v_duplicate_skipped + 1;
 end if;
 exception when others then
 v_errors := v_errors + 1;
 v_error_details := v_error_details || jsonb_build_array(jsonb_build_object(
 'patient_id',rec.patient_id,'patient',rec.full_name,'date',v_day,
 'charge','Room Charges','error',sqlerrm
 ));
 end;

 -- NURSING: separately isolated for true persisted-row accounting.
 begin
 insert into public.billing_transactions(
 patient_id,transaction_type,category,amount,payment_mode,description,
 transaction_date,entered_by,auto_generated,source_date,source_type,source_key
 ) values(
 rec.patient_id,'Charge','Nursing Charges',v_nursing_rate,'Not applicable',
 format('Automatic nursing charge for %s · Room %s-%s',
 to_char(v_day,'DD-MM-YYYY'),rec.room_no,rec.bed_no),
 v_day::timestamptz,v_actor,true,v_day,'Daily Nursing Charge',
 format('NURSING:%s:%s',rec.patient_id,v_day)
 ) on conflict(source_key) where source_key is not null do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=1 then
 v_nursing_created := v_nursing_created + 1;
 else
 v_duplicate_skipped := v_duplicate_skipped + 1;
 end if;
 exception when others then
 v_errors := v_errors + 1;
 v_error_details := v_error_details || jsonb_build_array(jsonb_build_object(
 'patient_id',rec.patient_id,'patient',rec.full_name,'date',v_day,
 'charge','Nursing Charges','error',sqlerrm
 ));
 end;
 end loop;

 -- Special Nurse: only today's charge; separately isolated so it can never roll back
 -- Room/Nursing catch-up rows for the same patient.
 if rec.special_nurse_required=true and v_special_rate>0
 and p_charge_date between coalesce(rec.admission_date,p_charge_date) and v_end_date
 and not public.patient_package_covers_date(rec.patient_id,p_charge_date) then
 begin
 insert into public.billing_transactions(
 patient_id,transaction_type,category,amount,payment_mode,description,
 transaction_date,entered_by,auto_generated,source_date,source_type,source_key
 ) values(
 rec.patient_id,'Charge','Special Nurse',v_special_rate,'Not applicable',
 format('Automatic special nurse charge for %s · Room %s-%s',
 to_char(p_charge_date,'DD-MM-YYYY'),rec.room_no,rec.bed_no),
 p_charge_date::timestamptz,v_actor,true,p_charge_date,'Daily Special Nurse Charge',
 format('SPECIAL_NURSE:%s:%s',rec.patient_id,p_charge_date)
 ) on conflict(source_key) where source_key is not null do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=1 then
 v_special_created := v_special_created + 1;
 else
 v_duplicate_skipped := v_duplicate_skipped + 1;
 end if;
 exception when others then
 v_errors := v_errors + 1;
 v_error_details := v_error_details || jsonb_build_array(jsonb_build_object(
 'patient_id',rec.patient_id,'patient',rec.full_name,'date',p_charge_date,
 'charge','Special Nurse','error',sqlerrm
 ));
 end;
 end if;
 end loop;

 -- Independent persisted-ledger verification for ALL expected uncovered dates through p_charge_date.
 -- These are actual missing source_key rows, not in-memory counters.
 -- IMPORTANT: verification must use the same rule as the billing loop:
 -- Match the reviewed departure cutoff used by the billing loop.
 with active_patients as (
 select
 p.id patient_id,
 coalesce(p.admission_date::date,p_charge_date) admission_date,
 least(p_charge_date,coalesce(public.discharge_billing_cutoff(p.id),p_charge_date)) end_date,
 greatest(
 coalesce(p.admission_date::date,p_charge_date),
 coalesce((
 select max(to_date(substring(bt.description from 'to[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2})'),'YYYY-MM-DD')) + 1
 from public.billing_transactions bt
 where bt.patient_id=p.id
 and bt.transaction_type='Charge'
 and bt.category='Assisted Living Package'
 and substring(coalesce(bt.description,'') from 'to[[:space:]]*([0-9]{4}-[0-9]{2}-[0-9]{2})') is not null
 ), coalesce(p.admission_date::date,p_charge_date))
 ) start_date
 from public.patients p
 where coalesce(p.is_active,true)=true
 and coalesce(p.admission_date::date,p_charge_date)<=p_charge_date
 and p.room_no is not null and p.bed_no is not null
 ), expected as (
 select ap.patient_id, gs::date charge_date
 from active_patients ap
 cross join lateral generate_series(ap.start_date::timestamp,ap.end_date::timestamp,interval '1 day') gs
 where ap.start_date<=ap.end_date
 and not public.patient_package_covers_date(ap.patient_id,gs::date)
 )
 select
 count(*) filter(where r.id is null),
 count(*) filter(where n.id is null)
 into v_missing_room,v_missing_nursing
 from expected e
 left join public.billing_transactions r
 on r.patient_id=e.patient_id
 and r.source_key=format('ROOM:%s:%s',e.patient_id,e.charge_date)
 left join public.billing_transactions n
 on n.patient_id=e.patient_id
 and n.source_key=format('NURSING:%s:%s',e.patient_id,e.charge_date);

 update public.daily_billing_runs
 set completed_at=now(),
 room_charges_created=v_room_created,
 nursing_charges_created=v_nursing_created,
 skipped_count=v_package_days_skipped+v_duplicate_skipped+v_patient_skipped,
 error_count=v_errors,
 status=case
 when v_errors>0 or v_missing_room>0 or v_missing_nursing>0 then 'Completed with Errors'
 else 'Completed'
 end,
 details=jsonb_build_object(
 'patients_processed',v_patients_processed,
 'catchup_from',v_catchup_from,
 'room_charges_created',v_room_created,
 'nursing_charges_created',v_nursing_created,
 'special_nurse_charges_created',v_special_created,
 'package_days_skipped',v_package_days_skipped,
 'duplicate_skipped',v_duplicate_skipped,
 'patient_skipped',v_patient_skipped,
 'error_count',v_errors,
 'missing_room_after_run',v_missing_room,
 'missing_nursing_after_run',v_missing_nursing,
 'errors',v_error_details
 )
 where id=v_run_id;

 return jsonb_build_object(
 'success',(v_errors=0 and v_missing_room=0 and v_missing_nursing=0),
 'run_id',v_run_id,
 'charge_date',p_charge_date,
 'patients_processed',v_patients_processed,
 'catchup_from',v_catchup_from,
 'room_charges_created',v_room_created,
 'nursing_charges_created',v_nursing_created,
 'special_nurse_charges_created',v_special_created,
 'package_days_skipped',v_package_days_skipped,
 'duplicate_skipped',v_duplicate_skipped,
 'patient_skipped',v_patient_skipped,
 'error_count',v_errors,
 'missing_room_after_run',v_missing_room,
 'missing_nursing_after_run',v_missing_nursing,
 'errors',v_error_details
 );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.confirm_patient_departure_v3(p_discharge_id uuid, p_received_by_name text, p_received_by_contact text, p_relationship text, p_actual_departure_at timestamp with time zone, p_transport_details text, p_departure_remarks text, p_discharge_summary_handed_over boolean, p_medicines_handed_over boolean, p_reports_handed_over boolean, p_belongings_handed_over boolean, p_valuables_handed_over boolean, p_final_instructions_explained boolean, p_patient_condition_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_role text;
 v_name text;
 v_d public.patient_discharges%rowtype;
 v_p public.patients%rowtype;
begin
 select
 role,
 coalesce(nullif(trim(full_name),''),'Nurse')
 into v_role,v_name
 from public.duty_profiles
 where id=auth.uid()
 or auth_user_id=auth.uid()
 limit 1;

 if coalesce(v_role,'') not in ('Nurse','Admin') then
 raise exception 'Only Nurse or Admin may complete final nursing discharge clearance.';
 end if;

 if not (
 coalesce(p_discharge_summary_handed_over,false)
 and coalesce(p_medicines_handed_over,false)
 and coalesce(p_reports_handed_over,false)
 and coalesce(p_belongings_handed_over,false)
 and coalesce(p_valuables_handed_over,false)
 and coalesce(p_final_instructions_explained,false)
 and coalesce(p_patient_condition_confirmed,false)
 ) then
 raise exception 'All final nursing discharge checklist items must be completed.';
 end if;

 if nullif(trim(coalesce(p_received_by_name,'')),'') is null then
 raise exception 'Receiving person name is mandatory.';
 end if;

 perform pg_advisory_xact_lock(hashtextextended((select patient_id from public.patient_discharges where id=p_discharge_id)::text,105));
 select * into v_d
 from public.patient_discharges
 where id=p_discharge_id
 for update;

 if not found then
 raise exception 'Discharge request not found.';
 end if;

 if v_d.accounts_status<>'Cleared' then
 raise exception 'Accounts clearance is required before final patient departure.';
 end if;

 if v_d.status='Completed' then
 raise exception 'This discharge is already completed.';
 end if;

 select * into v_p
 from public.patients
 where id=v_d.patient_id
 for update;

 update public.patient_discharges
 set
 status='Completed',
 completed_by=null,
 completed_at=coalesce(p_actual_departure_at,now()),
 final_departure_confirmed_by=null,
 final_departure_confirmed_by_name=v_name,
 final_departure_at=coalesce(p_actual_departure_at,now()),
 actual_departure_at=coalesce(p_actual_departure_at,now()),
 received_by_name=trim(p_received_by_name),
 received_by_contact=nullif(trim(coalesce(p_received_by_contact,'')),''),
 received_by_relationship=nullif(trim(coalesce(p_relationship,'')),''),
 transport_details=nullif(trim(coalesce(p_transport_details,'')),''),
 departure_remarks=nullif(trim(coalesce(p_departure_remarks,'')),''),
 discharge_summary_handed_over=true,
 medicines_handed_over=true,
 reports_handed_over=true,
 belongings_handed_over=true,
 valuables_handed_over=true,
 final_instructions_explained=true,
 patient_condition_confirmed=true,
 updated_at=now()
 where id=p_discharge_id;

 update public.patients
 set
 is_active=false,
 discharge_date=(coalesce(p_actual_departure_at,now()) at time zone 'Asia/Kolkata')::date,
 updated_at=now()
 where id=v_d.patient_id;

 update public.room_beds
 set
 status='Available',
 updated_at=now()
 where room_no=v_p.room_no
 and bed_no=v_p.bed_no;

 return jsonb_build_object(
 'discharge_id',p_discharge_id,
 'patient_id',v_d.patient_id,
 'confirmed_by',v_name,
 'departure_at',coalesce(p_actual_departure_at,now()),
 'room_no',v_p.room_no,
 'bed_no',v_p.bed_no,
 'room_released',true
 );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.confirm_patient_departure_v3(p_discharge_id uuid, p_received_by_name text, p_received_by_contact text, p_relationship text, p_actual_departure_at timestamp with time zone, p_transport_mode text, p_transport_details text, p_accompanied_by_name text, p_accompanied_by_relationship text, p_accompanied_by_contact text, p_review_appointment_date date, p_review_appointment_time time without time zone, p_review_doctor_name text, p_review_hospital_clinic text, p_review_instructions text, p_departure_remarks text, p_discharge_summary_handed_over boolean, p_medicines_handed_over boolean, p_reports_handed_over boolean, p_belongings_handed_over boolean, p_valuables_handed_over boolean, p_final_instructions_explained boolean, p_patient_condition_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_role text;
 v_name text;
 v_d public.patient_discharges%rowtype;
 v_p public.patients%rowtype;
begin
 select
 role,
 coalesce(nullif(trim(full_name),''),'Nurse')
 into v_role,v_name
 from public.duty_profiles
 where id=auth.uid()
 or auth_user_id=auth.uid()
 limit 1;

 if coalesce(v_role,'') not in ('Nurse','Admin') then
 raise exception 'Only Nurse or Admin may complete final nursing discharge clearance.';
 end if;

 if not (
 coalesce(p_discharge_summary_handed_over,false)
 and coalesce(p_medicines_handed_over,false)
 and coalesce(p_reports_handed_over,false)
 and coalesce(p_belongings_handed_over,false)
 and coalesce(p_valuables_handed_over,false)
 and coalesce(p_final_instructions_explained,false)
 and coalesce(p_patient_condition_confirmed,false)
 ) then
 raise exception 'All final nursing discharge checklist items must be completed.';
 end if;

 if nullif(trim(coalesce(p_received_by_name,'')),'') is null then
 raise exception 'Receiving person name is mandatory.';
 end if;

 if nullif(trim(coalesce(p_transport_mode,'')),'') is null then
 raise exception 'Transport mode is mandatory.';
 end if;

 if nullif(trim(coalesce(p_accompanied_by_name,'')),'') is null then
 raise exception 'Accompanying person name is mandatory.';
 end if;

 if nullif(trim(coalesce(p_accompanied_by_relationship,'')),'') is null then
 raise exception 'Accompanying person relationship is mandatory.';
 end if;

 if nullif(trim(coalesce(p_accompanied_by_contact,'')),'') is null then
 raise exception 'Accompanying person contact number is mandatory.';
 end if;

 perform pg_advisory_xact_lock(hashtextextended((select patient_id from public.patient_discharges where id=p_discharge_id)::text,105));
 select * into v_d
 from public.patient_discharges
 where id=p_discharge_id
 for update;

 if not found then
 raise exception 'Discharge request not found.';
 end if;

 if v_d.accounts_status<>'Cleared' then
 raise exception 'Accounts clearance is required before final patient departure.';
 end if;

 if v_d.status='Completed' then
 raise exception 'This discharge is already completed.';
 end if;

 select * into v_p
 from public.patients
 where id=v_d.patient_id
 for update;

 update public.patient_discharges
 set
 status='Completed',
 completed_by=null,
 completed_at=coalesce(p_actual_departure_at,now()),
 final_departure_confirmed_by=null,
 final_departure_confirmed_by_name=v_name,
 final_departure_at=coalesce(p_actual_departure_at,now()),
 actual_departure_at=coalesce(p_actual_departure_at,now()),
 received_by_name=trim(p_received_by_name),
 received_by_contact=nullif(trim(coalesce(p_received_by_contact,'')),''),
 received_by_relationship=nullif(trim(coalesce(p_relationship,'')),''),
 transport_mode=nullif(trim(coalesce(p_transport_mode,'')),''),
 transport_details=nullif(trim(coalesce(p_transport_details,'')),''),
 accompanied_by_name=trim(p_accompanied_by_name),
 accompanied_by_relationship=trim(p_accompanied_by_relationship),
 accompanied_by_contact=trim(p_accompanied_by_contact),
 review_appointment_date=p_review_appointment_date,
 review_appointment_time=p_review_appointment_time,
 review_doctor_name=nullif(trim(coalesce(p_review_doctor_name,'')),''),
 review_hospital_clinic=nullif(trim(coalesce(p_review_hospital_clinic,'')),''),
 review_instructions=nullif(trim(coalesce(p_review_instructions,'')),''),
 departure_remarks=nullif(trim(coalesce(p_departure_remarks,'')),''),
 discharge_summary_handed_over=true,
 medicines_handed_over=true,
 reports_handed_over=true,
 belongings_handed_over=true,
 valuables_handed_over=true,
 final_instructions_explained=true,
 patient_condition_confirmed=true,
 updated_at=now()
 where id=p_discharge_id;

 update public.patients
 set
 is_active=false,
 discharge_date=(coalesce(p_actual_departure_at,now()) at time zone 'Asia/Kolkata')::date,
 updated_at=now()
 where id=v_d.patient_id;

 update public.room_beds
 set
 status='Available',
 updated_at=now()
 where room_no=v_p.room_no
 and bed_no=v_p.bed_no;

 return jsonb_build_object(
 'discharge_id',p_discharge_id,
 'patient_id',v_d.patient_id,
 'confirmed_by',v_name,
 'departure_at',coalesce(p_actual_departure_at,now()),
 'room_no',v_p.room_no,
 'bed_no',v_p.bed_no,
 'transport_mode',p_transport_mode,
 'review_appointment_date',p_review_appointment_date,
 'room_released',true
 );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.confirm_patient_departure_v4(p_discharge_id uuid, p_received_by_name text, p_received_by_contact text, p_relationship text, p_actual_departure_at timestamp with time zone, p_transport_mode text, p_transport_details text, p_accompanied_by_name text, p_accompanied_by_relationship text, p_accompanied_by_contact text, p_review_appointment_date date, p_review_appointment_time time without time zone, p_review_doctor_name text, p_review_hospital_clinic text, p_review_instructions text, p_departure_remarks text, p_discharge_summary_handed_over boolean, p_medicines_handed_over boolean, p_reports_handed_over boolean, p_belongings_handed_over boolean, p_valuables_handed_over boolean, p_final_instructions_explained boolean, p_patient_condition_confirmed boolean, p_late_entry_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_role text;
 v_name text;
 v_d public.patient_discharges%rowtype;
 v_p public.patients%rowtype;
begin
 select
 role,
 coalesce(nullif(trim(full_name),''),'Nurse')
 into v_role,v_name
 from public.duty_profiles
 where id=auth.uid()
 or auth_user_id=auth.uid()
 limit 1;

 if coalesce(v_role,'') not in ('Nurse','Admin') then
 raise exception 'Only Nurse or Admin may complete final nursing discharge clearance.';
 end if;

 if not (
 coalesce(p_discharge_summary_handed_over,false)
 and coalesce(p_medicines_handed_over,false)
 and coalesce(p_reports_handed_over,false)
 and coalesce(p_belongings_handed_over,false)
 and coalesce(p_valuables_handed_over,false)
 and coalesce(p_final_instructions_explained,false)
 and coalesce(p_patient_condition_confirmed,false)
 ) then
 raise exception 'All final nursing discharge checklist items must be completed.';
 end if;

 if nullif(trim(coalesce(p_received_by_name,'')),'') is null then
 raise exception 'Receiving person name is mandatory.';
 end if;

 if nullif(trim(coalesce(p_transport_mode,'')),'') is null then
 raise exception 'Transport mode is mandatory.';
 end if;

 if nullif(trim(coalesce(p_accompanied_by_name,'')),'') is null then
 raise exception 'Accompanying person name is mandatory.';
 end if;

 if nullif(trim(coalesce(p_accompanied_by_relationship,'')),'') is null then
 raise exception 'Accompanying person relationship is mandatory.';
 end if;

 if nullif(trim(coalesce(p_accompanied_by_contact,'')),'') is null then
 raise exception 'Accompanying person contact number is mandatory.';
 end if;

 perform pg_advisory_xact_lock(hashtextextended((select patient_id from public.patient_discharges where id=p_discharge_id)::text,105));
 select * into v_d
 from public.patient_discharges
 where id=p_discharge_id
 for update;

 if not found then
 raise exception 'Discharge request not found.';
 end if;

 if v_d.accounts_status<>'Cleared' then
 raise exception 'Accounts clearance is required before final patient departure.';
 end if;

 if v_d.status='Completed' then
 raise exception 'This discharge is already completed.';
 end if;

 select * into v_p
 from public.patients
 where id=v_d.patient_id
 for update;

 update public.patient_discharges
 set
 departure_entry_reason=nullif(trim(p_late_entry_reason),''),
 status='Completed',
 completed_by=null,
 completed_at=coalesce(p_actual_departure_at,now()),
 final_departure_confirmed_by=null,
 final_departure_confirmed_by_name=v_name,
 final_departure_at=coalesce(p_actual_departure_at,now()),
 actual_departure_at=coalesce(p_actual_departure_at,now()),
 received_by_name=trim(p_received_by_name),
 received_by_contact=nullif(trim(coalesce(p_received_by_contact,'')),''),
 received_by_relationship=nullif(trim(coalesce(p_relationship,'')),''),
 transport_mode=nullif(trim(coalesce(p_transport_mode,'')),''),
 transport_details=nullif(trim(coalesce(p_transport_details,'')),''),
 accompanied_by_name=trim(p_accompanied_by_name),
 accompanied_by_relationship=trim(p_accompanied_by_relationship),
 accompanied_by_contact=trim(p_accompanied_by_contact),
 review_appointment_date=p_review_appointment_date,
 review_appointment_time=p_review_appointment_time,
 review_doctor_name=nullif(trim(coalesce(p_review_doctor_name,'')),''),
 review_hospital_clinic=nullif(trim(coalesce(p_review_hospital_clinic,'')),''),
 review_instructions=nullif(trim(coalesce(p_review_instructions,'')),''),
 departure_remarks=nullif(trim(coalesce(p_departure_remarks,'')),''),
 discharge_summary_handed_over=true,
 medicines_handed_over=true,
 reports_handed_over=true,
 belongings_handed_over=true,
 valuables_handed_over=true,
 final_instructions_explained=true,
 patient_condition_confirmed=true,
 updated_at=now()
 where id=p_discharge_id;

 update public.patients
 set
 is_active=false,
 discharge_date=(coalesce(p_actual_departure_at,now()) at time zone 'Asia/Kolkata')::date,
 updated_at=now()
 where id=v_d.patient_id;

 update public.room_beds
 set
 status='Available',
 updated_at=now()
 where room_no=v_p.room_no
 and bed_no=v_p.bed_no;

 return jsonb_build_object(
 'discharge_id',p_discharge_id,
 'patient_id',v_d.patient_id,
 'confirmed_by',v_name,
 'departure_at',coalesce(p_actual_departure_at,now()),
 'room_no',v_p.room_no,
 'bed_no',v_p.bed_no,
 'transport_mode',p_transport_mode,
 'review_appointment_date',p_review_appointment_date,
 'room_released',true
 );
end;
$function$
;
revoke all on function public.confirm_patient_departure_v4(uuid,text,text,text,timestamptz,text,text,text,text,text,date,time,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.confirm_patient_departure_v4(uuid,text,text,text,timestamptz,text,text,text,text,text,date,time,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
