-- ERP 2.15.42: dated room tariffs and auditable ledger adjustments.
-- Requires the departure/package billing safeguards in migrations 131 and 132.
-- Installation snapshots current tariffs but does not change any ledger balances.
begin;

create table if not exists public.room_tariff_changes (
 id uuid primary key default gen_random_uuid(),
 revision bigint generated always as identity unique,
 room_bed_id uuid not null references public.room_beds(id),
 effective_from date not null,
 room_daily_rate numeric(12,2) not null check(room_daily_rate>=0),
 nursing_daily_rate numeric(12,2) not null check(nursing_daily_rate>=0),
 special_nurse_daily_rate numeric(12,2) not null check(special_nurse_daily_rate>=0),
 baseline boolean not null default false,
 reason text not null,
 changed_by uuid,
 recorded_at timestamptz not null default now(),
 previous_room jsonb,
 request_payload jsonb,
 result jsonb
);
create index if not exists room_tariff_effective_idx on public.room_tariff_changes(room_bed_id,effective_from desc,revision desc);
create unique index if not exists room_tariff_baseline_idx on public.room_tariff_changes(room_bed_id) where baseline;
alter table public.room_tariff_changes enable row level security;
revoke all on public.room_tariff_changes from public,anon,authenticated;
grant select on public.room_tariff_changes to authenticated;
drop policy if exists room_tariff_finance_read on public.room_tariff_changes;
create policy room_tariff_finance_read on public.room_tariff_changes for select to authenticated
 using(public.current_user_has_role(array['Admin','Manager','Accounts']));

insert into public.room_tariff_changes(room_bed_id,effective_from,room_daily_rate,nursing_daily_rate,special_nurse_daily_rate,baseline,reason,previous_room)
select id,'0001-01-01',coalesce(room_daily_rate,daily_rate,0),coalesce(nursing_daily_rate,0),coalesce(special_nurse_daily_rate,0),true,
 'Opening tariff snapshot; earlier tariff changes were not recorded',to_jsonb(b)
from public.room_beds b on conflict(room_bed_id) where baseline do nothing;

alter table public.room_beds add column if not exists tariff_effective_from date;
alter table public.billing_transactions add column if not exists tariff_change_id uuid references public.room_tariff_changes(id);
alter table public.billing_transactions add column if not exists tariff_original_source_key text;
create index if not exists billing_tariff_original_idx on public.billing_transactions(tariff_original_source_key) where tariff_original_source_key is not null;

-- The last transfer on a local calendar date determines that day's bed, matching
-- the existing full-day room-shift billing convention. Before the first transfer,
-- use its source bed (or the initial allotment), never today's bed after a move.
create or replace function public.room_bed_on_date(p_patient_id uuid,p_day date) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare h public.room_transfer_history%rowtype; bed uuid;
begin
 select * into h from public.room_transfer_history where patient_id=p_patient_id
 and (effective_at at time zone 'Asia/Kolkata')::date<=p_day
 order by effective_at desc,created_at desc,id desc limit 1;
 if found then return h.to_room_bed_id;end if;
 select * into h from public.room_transfer_history where patient_id=p_patient_id
 order by effective_at,created_at,id limit 1;
 if found then return coalesce(h.from_room_bed_id,h.to_room_bed_id);end if;
 select b.id into bed from public.patients p join public.room_beds b
 on b.patient_id=p.id or (b.room_no=p.room_no and upper(coalesce(b.bed_no,''))=upper(coalesce(p.bed_no,'')))
 where p.id=p_patient_id order by (b.patient_id=p.id) desc nulls last,b.updated_at desc nulls last,b.id limit 1;
 return bed;
end $$;

create or replace function public.room_tariff_on_date(p_patient_id uuid,p_day date)
returns table(room_bed_id uuid,room_rate numeric,nursing_rate numeric,special_rate numeric,room_no text,bed_no text,room_type text,effective_from date)
language sql stable security definer set search_path=public,pg_temp as $$
 select b.id,coalesce(t.room_daily_rate,b.room_daily_rate,b.daily_rate,0),
 coalesce(t.nursing_daily_rate,b.nursing_daily_rate,0),coalesce(t.special_nurse_daily_rate,b.special_nurse_daily_rate,0),
 b.room_no::text,b.bed_no::text,b.room_type::text,case when t.baseline then null else t.effective_from end
 from public.room_beds b left join lateral (
 select c.* from public.room_tariff_changes c where c.room_bed_id=b.id and c.effective_from<=p_day
 order by c.effective_from desc,c.revision desc limit 1) t on true
 where b.id=public.room_bed_on_date(p_patient_id,p_day)
$$;
revoke all on function public.room_bed_on_date(uuid,date),public.room_tariff_on_date(uuid,date) from public,anon,authenticated;

-- Every existing generator continues to write the same canonical source keys.
-- Only NEW automatic rows use this guard; original posted amounts are immutable
-- with respect to tariff edits and corrected using separate ledger entries.
create or replace function public.apply_dated_room_tariff() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare t record; kind text;
begin
 if new.auto_generated and new.transaction_type='Charge' and new.source_date is not null
 and new.source_type in ('Daily Room Charge','Daily Nursing Charge','Daily Special Nurse Charge') then
   if public.patient_package_covers_date(new.patient_id,new.source_date) then return null;end if;
   select * into t from public.room_tariff_on_date(new.patient_id,new.source_date);
   if not found then raise exception 'Room history is missing for this accommodation charge.';end if;
   new.amount:=case new.source_type when 'Daily Room Charge' then t.room_rate when 'Daily Nursing Charge' then t.nursing_rate else t.special_rate end;
   kind:=case new.source_type when 'Daily Room Charge' then 'room rent' when 'Daily Nursing Charge' then 'nursing charge' else 'special nurse charge' end;
   new.description:=format('Automatic %s for %s · Room %s-%s · %s',kind,to_char(new.source_date,'DD-MM-YYYY'),t.room_no,t.bed_no,coalesce(t.room_type,'Room'));
 end if;
 return new;
end $$;
revoke all on function public.apply_dated_room_tariff() from public,anon,authenticated;
drop trigger if exists dated_room_tariff_insert on public.billing_transactions;
create trigger dated_room_tariff_insert before insert on public.billing_transactions for each row execute function public.apply_dated_room_tariff();

create or replace function public.guard_room_tariff_changes() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if (new.room_daily_rate,new.nursing_daily_rate,new.special_nurse_daily_rate,new.daily_rate,new.tariff_effective_from)
 is distinct from (old.room_daily_rate,old.nursing_daily_rate,old.special_nurse_daily_rate,old.daily_rate,old.tariff_effective_from)
 and coalesce(current_setting('samara.room_tariff_edit',true),'')<>old.id::text then
   raise exception 'Use Edit Room / Bed & Tariff with an Effective from date to change tariffs.';
 end if;
 return new;
end $$;
revoke all on function public.guard_room_tariff_changes() from public,anon,authenticated;
drop trigger if exists room_tariff_edit_guard on public.room_beds;
create trigger room_tariff_edit_guard before update on public.room_beds for each row execute function public.guard_room_tariff_changes();

-- An unused master bed can still be deleted. A used bed retains the identity
-- needed to resolve historical charges and should be marked Maintenance instead.
create or replace function public.guard_room_tariff_bed_delete() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.room_transfer_history where from_room_bed_id=old.id or to_room_bed_id=old.id)
 or exists(select 1 from public.room_tariff_changes where room_bed_id=old.id and not baseline)
 or old.patient_id is not null then raise exception 'This bed has occupancy or tariff history. Keep it for the audit trail and use Maintenance status instead.';end if;
 delete from public.room_tariff_changes where room_bed_id=old.id and baseline;
 return old;
end $$;
revoke all on function public.guard_room_tariff_bed_delete() from public,anon,authenticated;
drop trigger if exists room_tariff_bed_delete_guard on public.room_beds;
create trigger room_tariff_bed_delete_guard before delete on public.room_beds for each row execute function public.guard_room_tariff_bed_delete();

create or replace function public.guard_tariff_adjustment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
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
 -- Older room-shift functions delete/recreate today's automatic rows. Preserve
 -- an original once an adjustment references it; the transfer trigger below
 -- reconciles the net amount, and the existing source key prevents duplication.
 if tg_op='DELETE' and old.auto_generated and exists(select 1 from public.billing_transactions a where a.tariff_original_source_key=old.source_key) then return null;end if;
 if tg_op='UPDATE' and old.auto_generated and (new.amount,new.source_key,new.patient_id,new.source_date) is distinct from (old.amount,old.source_key,old.patient_id,old.source_date)
 and exists(select 1 from public.billing_transactions a where a.tariff_original_source_key=old.source_key) then
   raise exception 'This original charge has tariff adjustments. Correct it using a new dated tariff.';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.guard_tariff_adjustment() from public,anon,authenticated;
drop trigger if exists tariff_adjustment_guard on public.billing_transactions;
create trigger tariff_adjustment_guard before insert or update or delete on public.billing_transactions for each row execute function public.guard_tariff_adjustment();

create or replace function public.save_room_tariff(p_room_bed_id uuid,p_effective_from date,p_reason text,p_room jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 old_room public.room_beds%rowtype; prior public.room_tariff_changes%rowtype;
 actor record; latest record; person record; charge record; rate record;
 target numeric; net numeric; delta numeric; key text; category_name text; source_name text; prefix text;
 first_day date; last_day date; day date; change_count integer:=0; affected integer:=0; before_count integer;
 debit numeric:=0; credit numeric:=0; assignments text; request jsonb; v_result jsonb;
begin
 select role,designation into actor from public.duty_profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
 if auth.uid() is null or actor.role is null or actor.role not in ('Admin','Manager')
 or (actor.role='Manager' and coalesce(public.current_user_is_nurse_manager(),false)) then
   raise exception 'Only Admin or a non-nursing Manager can change room tariffs.';
 end if;
 if p_request_id is null or p_effective_from is null or not isfinite(p_effective_from) or p_effective_from<'0001-01-02'::date
 or p_effective_from>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Choose a valid Effective from date, today or earlier.';end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Enter a reason for the tariff change.';end if;
 if jsonb_typeof(p_room)<>'object' then raise exception 'Room details are required.';end if;
 if exists(select 1 from jsonb_object_keys(p_room) k where k not in
 ('room_no','bed_no','room_type','room_daily_rate','nursing_daily_rate','special_nurse_daily_rate','daily_rate','status','floor','wing','notes',
 'reserved_for_name','reserved_for_contact','reserved_by_name','reserved_by_contact','expected_admission_date','expected_admission_time','reservation_notes','reserved_at')) then
   raise exception 'Unsupported room detail.';
 end if;
 if nullif(trim(p_room->>'room_no'),'') is null or nullif(trim(p_room->>'bed_no'),'') is null then raise exception 'Room number and bed code are required.';end if;
 foreach key in array array['room_daily_rate','nursing_daily_rate','special_nurse_daily_rate'] loop
   if coalesce(p_room->>key,'')!~'^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Tariffs must be non-negative amounts with at most two decimal places.';end if;
 end loop;
 request:=jsonb_build_object('room',p_room,'effective_from',p_effective_from,'reason',trim(p_reason),'room_bed_id',p_room_bed_id);
 select * into old_room from public.room_beds where id=p_room_bed_id for update;
 if not found then raise exception 'Room / bed not found.';end if;
 select * into prior from public.room_tariff_changes where id=p_request_id;
 if found then
   if prior.request_payload is distinct from request then raise exception 'This save request was already used. Reopen Edit Tariff.';end if;
   return prior.result;
 end if;
 if old_room.patient_id is not null and (p_room->>'status') is distinct from 'Occupied' then raise exception 'An occupied bed must remain occupied.';end if;
 -- Snapshot newly-created beds too, before changing their first tariff.
 insert into public.room_tariff_changes(room_bed_id,effective_from,room_daily_rate,nursing_daily_rate,special_nurse_daily_rate,baseline,reason,previous_room)
 values(old_room.id,'0001-01-01',coalesce(old_room.room_daily_rate,old_room.daily_rate,0),coalesce(old_room.nursing_daily_rate,0),coalesce(old_room.special_nurse_daily_rate,0),true,'Opening tariff snapshot',to_jsonb(old_room))
 on conflict(room_bed_id) where baseline do nothing;
 insert into public.room_tariff_changes(id,room_bed_id,effective_from,room_daily_rate,nursing_daily_rate,special_nurse_daily_rate,reason,changed_by,previous_room,request_payload)
 values(p_request_id,old_room.id,p_effective_from,(p_room->>'room_daily_rate')::numeric,(p_room->>'nursing_daily_rate')::numeric,
 (p_room->>'special_nurse_daily_rate')::numeric,trim(p_reason),auth.uid(),to_jsonb(old_room),request);
 select * into latest from public.room_tariff_changes where room_bed_id=old_room.id
 order by effective_from desc,revision desc limit 1;
 -- A backdated insertion before a later tariff must not replace today's tariff.
 p_room:=p_room||jsonb_build_object('room_daily_rate',latest.room_daily_rate,'daily_rate',latest.room_daily_rate,
 'nursing_daily_rate',latest.nursing_daily_rate,'special_nurse_daily_rate',latest.special_nurse_daily_rate,
 'tariff_effective_from',latest.effective_from,'updated_at',now());
 select string_agg(format('%I=(jsonb_populate_record(null::public.room_beds,$1)).%I',k,k),',') into assignments from jsonb_object_keys(p_room) k;
 perform set_config('samara.room_tariff_edit',old_room.id::text,true);
 execute format('update public.room_beds set %s where id=$2',assignments) using p_room,old_room.id;
 perform set_config('samara.room_tariff_edit','',true);
 select coalesce(min(effective_from)-1,(now() at time zone 'Asia/Kolkata')::date) into last_day
 from public.room_tariff_changes where room_bed_id=old_room.id and effective_from>p_effective_from;
 perform set_config('samara.tariff_adjustment',p_request_id::text,true);
 -- Reconcile dates evidenced by actual automatic ledger charges, including former
 -- occupants. Missing days remain the responsibility of normal billing catch-up.
 for person in select distinct b.patient_id from public.billing_transactions b
 where b.auto_generated and b.transaction_type='Charge' and b.source_date between p_effective_from and last_day
 and b.source_type in ('Daily Room Charge','Daily Nursing Charge','Daily Special Nurse Charge') order by b.patient_id loop
   perform pg_advisory_xact_lock(hashtextextended(person.patient_id::text,105));
   before_count:=change_count;
   for day in select distinct b.source_date from public.billing_transactions b where b.patient_id=person.patient_id
   and b.auto_generated and b.transaction_type='Charge' and b.source_date between p_effective_from and last_day
   and b.source_type in ('Daily Room Charge','Daily Nursing Charge','Daily Special Nurse Charge') order by b.source_date loop
     if public.room_bed_on_date(person.patient_id,day) is distinct from old_room.id then continue;end if;
     if public.patient_package_covers_date(person.patient_id,day) or day>public.discharge_billing_cutoff(person.patient_id) then continue;end if;
     if not exists(select 1 from public.patients p where p.id=person.patient_id and day>=p.admission_date::date
       and (coalesce(p.is_active,true) or p.discharge_date is null or day<=p.discharge_date::date)) then continue;end if;
     select * into rate from public.room_tariff_on_date(person.patient_id,day);
     foreach prefix in array array['ROOM','NURSING','SPECIAL_NURSE'] loop
       key:=format('%s:%s:%s',prefix,person.patient_id,day);
       category_name:=case prefix when 'ROOM' then 'Room Charges' when 'NURSING' then 'Nursing Charges' else 'Special Nurse' end;
       source_name:=case prefix when 'ROOM' then 'Daily Room Charge' when 'NURSING' then 'Daily Nursing Charge' else 'Daily Special Nurse Charge' end;
       target:=case prefix when 'ROOM' then rate.room_rate when 'NURSING' then rate.nursing_rate else rate.special_rate end;
       select * into charge from public.billing_transactions where source_key=key and patient_id=person.patient_id and transaction_type='Charge' and auto_generated;
       if not found then
         -- Do not infer historical Special Nurse eligibility from today's flag.
         if prefix='SPECIAL_NURSE' or target=0 then continue;end if;
         if exists(select 1 from public.billing_transactions where source_key=key) then raise exception 'Conflicting accommodation source key %',key;end if;
         insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by,auto_generated,source_date,source_type,source_key)
         values(person.patient_id,'Charge',category_name,target,'Not applicable','Dated tariff accommodation charge',day::timestamptz,auth.uid(),true,day,source_name,key)
         returning * into charge;
         change_count:=change_count+1;debit:=debit+target;
       end if;
       if exists(select 1 from public.billing_transactions where source_key='DEPARTURE_REVERSAL:'||charge.id::text) then continue;end if;
       select charge.amount+coalesce(sum(case when transaction_type='Charge' then amount when transaction_type='Discount' then -amount else 0 end),0)
       into net from public.billing_transactions where tariff_original_source_key=key;
       delta:=round(target-net,2);
       if delta<>0 then
         insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by,auto_generated,source_date,source_type,source_key,tariff_change_id,tariff_original_source_key)
         values(person.patient_id,case when delta>0 then 'Charge' else 'Discount' end,category_name,abs(delta),'Not applicable',
         format('Tariff adjustment for %s · Room %s-%s · effective %s · %s → %s · %s',to_char(day,'DD-MM-YYYY'),old_room.room_no,old_room.bed_no,to_char(p_effective_from,'DD-MM-YYYY'),net,target,trim(p_reason)),
         charge.transaction_date,auth.uid(),false,day,'Room Tariff Adjustment','TARIFF:'||p_request_id::text||':'||key,p_request_id,key);
         change_count:=change_count+1;
         if delta>0 then debit:=debit+delta;else credit:=credit-delta;end if;
       end if;
     end loop;
   end loop;
   if change_count>before_count then affected:=affected+1;end if;
 end loop;
 perform set_config('samara.tariff_adjustment','',true);
 v_result:=jsonb_build_object('success',true,'change_id',p_request_id,'effective_from',p_effective_from,'effective_until',last_day,
 'entries_posted',change_count,'patients_affected',affected,'additional_charges',debit,'credits',credit,'current_effective_from',latest.effective_from);
 update public.room_tariff_changes set result=v_result where id=p_request_id;
 return v_result;
end $$;
revoke all on function public.save_room_tariff(uuid,date,text,jsonb,uuid) from public,anon;
grant execute on function public.save_room_tariff(uuid,date,text,jsonb,uuid) to authenticated;

create or replace function public.patient_room_tariff_context(p_patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare room_day date; nursing_day date;
begin
 if auth.uid() is null or not coalesce(public.current_user_has_role(array['Admin','Manager','Accounts']),false) then raise exception 'Accounts access required.';end if;
 select source_date into room_day from public.billing_transactions where patient_id=p_patient_id and auto_generated
 and source_type='Daily Room Charge' order by transaction_date desc,id desc limit 1;
 select source_date into nursing_day from public.billing_transactions where patient_id=p_patient_id and auto_generated
 and source_type='Daily Nursing Charge' order by transaction_date desc,id desc limit 1;
 return jsonb_build_object('room',(select to_jsonb(t) from public.room_tariff_on_date(p_patient_id,room_day) t),
 'nursing',(select to_jsonb(t) from public.room_tariff_on_date(p_patient_id,nursing_day) t));
end $$;
revoke all on function public.patient_room_tariff_context(uuid) from public,anon;
grant execute on function public.patient_room_tariff_context(uuid) to authenticated;

-- Room moves after a tariff adjustment must also preserve its original charge.
-- Reconcile existing accommodation entries for this resident from the move day.
create or replace function public.reconcile_tariffs_after_room_move() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare b record;t record; tariff_id uuid; net numeric; target numeric; delta numeric; previous_setting text;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.patient_id::text,105));
 previous_setting:=coalesce(current_setting('samara.tariff_adjustment',true),'');
 for b in select * from public.billing_transactions where patient_id=new.patient_id and auto_generated and transaction_type='Charge'
 and source_date between (new.effective_at at time zone 'Asia/Kolkata')::date and (now() at time zone 'Asia/Kolkata')::date
 and source_type in ('Daily Room Charge','Daily Nursing Charge','Daily Special Nurse Charge') order by source_date,id loop
   if public.patient_package_covers_date(b.patient_id,b.source_date) or b.source_date>public.discharge_billing_cutoff(b.patient_id)
   or exists(select 1 from public.billing_transactions where source_key='DEPARTURE_REVERSAL:'||b.id::text) then continue;end if;
   select * into t from public.room_tariff_on_date(b.patient_id,b.source_date);
   if not found then raise exception 'Missing tariff history for room move.';end if;
   select id into tariff_id from public.room_tariff_changes where room_bed_id=t.room_bed_id and effective_from<=b.source_date order by effective_from desc,revision desc limit 1;
   if tariff_id is null then
     insert into public.room_tariff_changes(room_bed_id,effective_from,room_daily_rate,nursing_daily_rate,special_nurse_daily_rate,baseline,reason)
     values(t.room_bed_id,'0001-01-01',t.room_rate,t.nursing_rate,t.special_rate,true,'Opening tariff snapshot at room move')
     on conflict(room_bed_id) where baseline do nothing;
     select id into tariff_id from public.room_tariff_changes where room_bed_id=t.room_bed_id and baseline;
   end if;
   target:=case b.source_type when 'Daily Room Charge' then t.room_rate when 'Daily Nursing Charge' then t.nursing_rate else t.special_rate end;
   select b.amount+coalesce(sum(case when transaction_type='Charge' then amount when transaction_type='Discount' then -amount else 0 end),0)
   into net from public.billing_transactions where tariff_original_source_key=b.source_key;
   delta:=round(target-net,2);
   if delta<>0 then
     perform set_config('samara.tariff_adjustment',tariff_id::text,true);
     insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by,auto_generated,source_date,source_type,source_key,tariff_change_id,tariff_original_source_key)
     values(b.patient_id,case when delta>0 then 'Charge' else 'Discount' end,b.category,abs(delta),'Not applicable',
     format('Room move tariff adjustment for %s · Room %s-%s · %s → %s',to_char(b.source_date,'DD-MM-YYYY'),t.room_no,t.bed_no,net,target),
     b.transaction_date,auth.uid(),false,b.source_date,'Room Tariff Adjustment','ROOM_MOVE:'||new.id::text||':'||b.source_key,tariff_id,b.source_key);
   end if;
 end loop;
 perform set_config('samara.tariff_adjustment',previous_setting,true);
 return new;
end $$;
revoke all on function public.reconcile_tariffs_after_room_move() from public,anon,authenticated;
drop trigger if exists room_move_tariff_reconciliation on public.room_transfer_history;
create trigger room_move_tariff_reconciliation after insert on public.room_transfer_history for each row execute function public.reconcile_tariffs_after_room_move();

-- Preserve the installed billing function's departure, package and error handling.
-- Fail closed on an unexpected definition; never silently install a partial patch.
do $patch$
declare s text; anchor text; replacement text;
begin
 s:=pg_get_functiondef('public.run_daily_billing_automation(date,boolean)'::regprocedure);
 if position('-- DATED_ROOM_TARIFF_V1' in s)>0 then return;end if;
 if position('-- ZERO_NURSING_TARIFF_V1' in s)=0 or position('discharge_billing_cutoff' in s)=0 then raise exception 'Apply billing migrations 131 and 132 before migration 182.';end if;
 anchor:='-- ROOM: isolated block.';
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected daily room billing block; review migration 182.';end if;
 replacement:=E'-- DATED_ROOM_TARIFF_V1\n select t.room_rate,t.nursing_rate,t.special_rate into v_room_rate,v_nursing_rate,v_special_rate from public.room_tariff_on_date(rec.patient_id,v_day) t;\n if not found then raise exception ''Room history missing for patient % on %'',rec.patient_id,v_day;end if;\n '||anchor;
 s:=replace(s,anchor,replacement);
 anchor:='-- Special Nurse: only today''s charge;';
 if position(anchor in s)=0 then raise exception 'Unexpected special nurse billing block; review migration 182.';end if;
 s:=replace(s,anchor,E'select t.special_rate into v_special_rate from public.room_tariff_on_date(rec.patient_id,p_charge_date) t;\n '||anchor);
 anchor:='count(*) filter(where n.id is null and e.nursing_required)';
 if position(anchor in s)=0 then raise exception 'Unexpected nursing verification block; review migration 182.';end if;
 s:=replace(s,anchor,'count(*) filter(where n.id is null and coalesce((select t.nursing_rate from public.room_tariff_on_date(e.patient_id,e.charge_date) t),0)>0)');
 execute s;
end $patch$;
notify pgrst,'reload schema';
commit;
