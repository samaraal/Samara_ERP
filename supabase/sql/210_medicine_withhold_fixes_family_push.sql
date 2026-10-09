-- Samara Care ERP 2.16.10 · Family Portal 1.0.33 — Medicines WITHHOLD: fixes + family-friendly line + phone alert
-- Run once in Supabase > SQL Editor (file 210). Safe to run again. Needs SQL 167 (withhold columns) first.
--
-- 1. Doctor's instruction "Give at a later time": a time earlier than the dose time now means the NEXT day
--    (e.g. 10 PM dose withheld, doctor says "give at 6 AM" -> 6 AM tomorrow). Before, it was silently changed to
--    10:01 PM the same night. A time that has already passed is refused with a clear message.
-- 2. Family: a withheld dose is shown to the family ONLY after the doctor's instruction is recorded, in simple words,
--    e.g. "Held because the blood pressure was low (BP 90/58 mmHg). Dr. Kumar was informed and advised to give it
--    at 12:00 PM." No staff names, no internal remarks, nothing while the doctor's instruction is pending.
--    family_portal_medicine_notes(session) gives these lines to the Family Portal (same session check as the
--    dashboard, like family_portal_beverages / family_portal_bill_units).
-- 3. Phone notification (Edge Function withheld-dose-alert-dispatch, every minute) to Nurses, Nursing Manager,
--    Managers and Admin / Directors as soon as a dose is withheld, repeated every 30 minutes until the doctor's
--    instruction is recorded. Doses withheld before this file is run get no phone notification (no flood).
-- 4. Re-checks that the clinical alert engine treats "give later" after withholding as Re-medication Due (SQL 167).

begin;

-- ---------------------------------------------------------------------------------------------------------
-- 1. Doctor's instruction — correct day for the re-dose
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.record_withheld_dose_instruction(
  p_id uuid,
  p_instruction text,
  p_notes text,
  p_give_at time default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.medication_administrations%rowtype;
  v_name text;
  v_now_ist timestamp := (now() at time zone 'Asia/Kolkata');
  v_give time;
  v_sched time;
  v_redo timestamp;
begin
  if not public.current_user_has_role(array['Admin','Manager','Nurse','Director']) then
    raise exception 'Only a Nurse, Manager or Admin can record the doctor''s instruction.';
  end if;
  if p_instruction not in ('Give now','Give at a later time','Skip this dose','Change prescription (Doctor Review)') then
    raise exception 'Choose a valid doctor''s instruction.';
  end if;
  if coalesce(btrim(p_notes),'') = '' then
    raise exception 'Enter the doctor''s instruction (what the doctor said).';
  end if;

  select * into v_row from public.medication_administrations where id = p_id for update;
  if not found then raise exception 'Withheld dose not found.'; end if;
  if v_row.status <> 'Withheld' then raise exception 'This dose is not recorded as withheld.'; end if;
  if v_row.doctor_instruction is not null then
    raise exception 'The doctor''s instruction for this dose was already recorded (%).', v_row.doctor_instruction;
  end if;

  select coalesce(nullif(full_name,''),'Staff') into v_name
    from public.profiles where id = auth.uid() or auth_user_id = auth.uid() limit 1;

  if p_instruction in ('Give now','Give at a later time') then
    v_sched := v_row.scheduled_time::time;
    v_give := case when p_instruction = 'Give now' then date_trunc('minute', v_now_ist)::time else p_give_at end;
    if v_give is null then raise exception 'Choose the time to give the dose.'; end if;
    -- "Give now" recorded at (or before) the dose time on the same day: one minute after the dose time.
    if p_instruction = 'Give now' and v_give <= v_sched and v_row.scheduled_date = v_now_ist::date then
      v_give := (v_sched + interval '1 minute')::time;
    end if;
    -- Same rule as Today's MAR, Shift Tasks and the alert engine: a time after the dose time is the same day,
    -- an earlier (or equal) time is the next day.
    v_redo := (case when v_give > v_sched then v_row.scheduled_date else v_row.scheduled_date + 1 end) + v_give;
    if v_redo < v_now_ist - interval '10 minutes' then
      raise exception 'The time % on % has already passed for this dose (dose of % %). Choose a later time, or "Skip this dose" if the doctor advised waiting for the next dose.',
        to_char(v_give,'HH12:MI AM'), to_char(v_redo,'DD-MM-YYYY'), to_char(v_row.scheduled_date,'DD-MM-YYYY'), to_char(v_sched,'HH12:MI AM');
    end if;
  end if;

  update public.medication_administrations set
    doctor_instruction = p_instruction,
    doctor_instruction_notes = btrim(p_notes),
    doctor_instruction_at = now(),
    doctor_instruction_by = auth.uid(),
    doctor_instruction_by_name = coalesce(v_name,'Staff'),
    rescheduled_time = coalesce(v_give, rescheduled_time),
    reschedule_reason = case when v_give is not null
                             then 'Doctor''s instruction after withholding: ' || btrim(p_notes)
                             else reschedule_reason end
  where id = p_id;

  return jsonb_build_object('success', true, 'instruction', p_instruction,
                            'give_at', case when v_give is null then null else to_char(v_give,'HH24:MI') end,
                            'give_on', case when v_redo is null then null else to_char(v_redo,'YYYY-MM-DD') end);
end $$;

revoke all on function public.record_withheld_dose_instruction(uuid,text,text,time) from public, anon;
grant execute on function public.record_withheld_dose_instruction(uuid,text,text,time) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Family-friendly line (same wording as the Daily Intelligent Report)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.medication_withhold_family_text(
  p_reason text, p_reading text, p_doctor text, p_instruction text, p_give time)
returns text language sql immutable set search_path = public, pg_temp as $$
  select
    case coalesce(p_reason,'')
      when 'Low blood pressure'        then 'Held because the blood pressure was low'
      when 'Low blood sugar'           then 'Held because the blood sugar was low'
      when 'Low pulse / heart rate'    then 'Held because the pulse was low'
      when 'Drowsy / unwell'           then 'Held because the Guest was drowsy / unwell'
      when 'Nil by mouth (NPO)'        then 'Held because nothing was to be given by mouth at that time'
      when 'Vomiting / cannot swallow' then 'Held because of vomiting / difficulty in swallowing'
      else 'Held for a clinical reason'
    end
    || case when p_reason in ('Low blood pressure','Low blood sugar','Low pulse / heart rate')
                 and nullif(btrim(coalesce(p_reading,'')),'') is not null
            then ' (' || btrim(p_reading) || ')' else '' end
    || '. '
    || case when nullif(btrim(coalesce(p_doctor,'')),'') is null then 'The treating doctor'
            when btrim(p_doctor) ~* '^dr(\.|\s)' then btrim(p_doctor)
            else 'Dr. ' || btrim(p_doctor) end
    || case p_instruction
         when 'Give now'             then ' was informed and advised to give it' || coalesce(' at ' || ltrim(to_char(p_give,'HH12:MI AM'),'0'),' then')
         when 'Give at a later time' then ' was informed and advised to give it' || coalesce(' at ' || ltrim(to_char(p_give,'HH12:MI AM'),'0'),' later')
         when 'Skip this dose'       then ' was informed and advised to skip this dose'
         else ' was informed and reviewed the prescription'
       end
    || '.'
$$;
grant execute on function public.medication_withhold_family_text(text,text,text,text,time) to anon, authenticated, service_role;

-- Family Portal: withheld doses of the family's own Guest, ONLY after the doctor's instruction is recorded.
create or replace function public.family_portal_medicine_notes(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; pid uuid; argtype text; pt jsonb;
begin
 if coalesce(trim(p_session_token),'')='' then return '[]'::jsonb;end if;
 select format_type(p.proargtypes[0],null) into argtype from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='family_portal_dashboard' and p.pronargs=1 limit 1;
 if argtype is null then return '[]'::jsonb;end if;
 -- Same session check as the dashboard; an expired / invalid session gives nothing.
 begin
  execute format('select to_jsonb(public.family_portal_dashboard($1::%s))',argtype) into d using p_session_token;
 exception when others then return '[]'::jsonb;
 end;
 if d is null or jsonb_typeof(d)<>'object' then return '[]'::jsonb;end if;
 pt:=coalesce(d->'patient',d->'resident',d->'guest','{}'::jsonb);
 select p.id into pid from public.patients p
  where p.id::text in (pt->>'id',pt->>'patient_uuid',pt->>'patient_db_id',pt->>'uuid',pt->>'patient_id') limit 1;
 if pid is null then
  select p.id into pid from public.patients p
   where p.patient_id in (pt->>'patient_id',pt->>'resident_id',pt->>'patient_code',pt->>'id') limit 1;
 end if;
 if pid is null then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
    'id',ma.id,
    'order_id',ma.order_id,
    'scheduled_date',ma.scheduled_date,
    'scheduled_time',to_char(ma.scheduled_time::time,'HH24:MI'),
    'medicine_name',mo.medicine_name,
    'strength',coalesce(nullif(mo.strength,''),mo.dose),
    'held_at',coalesce(ma.administered_at,ma.entry_recorded_at),
    'family_text',public.medication_withhold_family_text(ma.withhold_reason,ma.withhold_reading,ma.doctor_informed_name,ma.doctor_instruction,ma.rescheduled_time))
    order by ma.scheduled_date desc, ma.scheduled_time desc)
   from public.medication_administrations ma
   left join public.medication_orders mo on mo.id=ma.order_id
  where ma.patient_id=pid and ma.status='Withheld' and ma.doctor_instruction is not null),'[]'::jsonb);
end $$;
revoke all on function public.family_portal_medicine_notes(text) from public;
grant execute on function public.family_portal_medicine_notes(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Phone notification while the doctor's instruction is pending
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.withheld_dose_alert_settings(
  id integer primary key default 1 check (id = 1),
  repeat_minutes integer not null default 30 check (repeat_minutes between 0 and 240),
  push_from timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.withheld_dose_alert_settings(id) values (1) on conflict (id) do nothing;
alter table public.withheld_dose_alert_settings enable row level security;
revoke all on public.withheld_dose_alert_settings from anon, authenticated;
grant select on public.withheld_dose_alert_settings to authenticated;
grant all on public.withheld_dose_alert_settings to service_role;
drop policy if exists withheld_dose_alert_settings_read on public.withheld_dose_alert_settings;
create policy withheld_dose_alert_settings_read on public.withheld_dose_alert_settings for select to authenticated using (true);

-- Open withheld doses (doctor's instruction not yet recorded) of current Guests, last 3 days.
-- round_no = 0 at once, 1 after 30 min, 2 after 60 min … (one phone notification per round).
create or replace function public.withheld_dose_open_rows(p_now timestamptz default now())
returns table(dose_id uuid, patient_id uuid, guest_name text, room_label text, medicine text,
              scheduled_date date, scheduled_time text, withhold_reason text, withhold_reading text,
              doctor_name text, withheld_at timestamptz, minutes integer, round_no integer, push_due boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  with s as (select repeat_minutes, push_from from public.withheld_dose_alert_settings where id = 1)
  select ma.id, ma.patient_id,
         nullif(trim(concat_ws(' ', p.title, p.full_name)), ''),
         case when nullif(trim(coalesce(p.room_no::text,'')),'') is not null
              then 'Room '||p.room_no||coalesce('-'||nullif(trim(p.bed_no::text),''),'') end,
         nullif(trim(concat_ws(' ', mo.medicine_name, coalesce(nullif(mo.strength,''),mo.dose))), ''),
         ma.scheduled_date, to_char(ma.scheduled_time::time,'HH24:MI'),
         ma.withhold_reason, ma.withhold_reading, ma.doctor_informed_name,
         coalesce(ma.entry_recorded_at, ma.administered_at),
         greatest(0, floor(extract(epoch from (p_now - coalesce(ma.entry_recorded_at, ma.administered_at)))/60))::int,
         case when s.repeat_minutes > 0
              then greatest(0, floor(extract(epoch from (p_now - coalesce(ma.entry_recorded_at, ma.administered_at)))/60 / s.repeat_minutes))::int
              else 0 end,
         coalesce(ma.entry_recorded_at, ma.administered_at) >= s.push_from
  from public.medication_administrations ma
  cross join s
  join public.patients p on p.id = ma.patient_id
  left join public.medication_orders mo on mo.id = ma.order_id
  where ma.status = 'Withheld'
    and ma.doctor_instruction is null
    and coalesce(p.is_active, true)
    and coalesce(p.admission_status,'') <> 'Discharged'
    and coalesce(ma.entry_recorded_at, ma.administered_at) is not null
    and coalesce(ma.entry_recorded_at, ma.administered_at) > p_now - interval '3 days'
$$;
revoke all on function public.withheld_dose_open_rows(timestamptz) from public, anon, authenticated;
grant execute on function public.withheld_dose_open_rows(timestamptz) to service_role;

create table if not exists public.withheld_dose_push_receipts(
  alert_key text not null,
  subscription_id uuid not null references public.push_subscriptions(id),
  state text not null check (state in ('claimed','sent','retry','failed')),
  claimed_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  retry_after timestamptz,
  tries integer not null default 1,
  detail text,
  primary key (alert_key, subscription_id)
);
alter table public.withheld_dose_push_receipts enable row level security;
revoke all on public.withheld_dose_push_receipts from anon, authenticated;
grant all on public.withheld_dose_push_receipts to service_role;

-- Who receives it: phones of active Nurses, Managers (incl. Nursing Manager) and Admin / Directors.
create or replace function public.withheld_dose_claim_push(p_alert_key text, p_subscription uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if not exists (
    select 1
    from public.push_subscriptions s
    join public.profiles p on (p.id = coalesce(s.profile_id, s.user_id) or (s.profile_id is null and p.auth_user_id = s.user_id))
    where s.id = p_subscription and s.is_active
      and coalesce(p.active,true) and coalesce(p.is_active,true)
      and lower(trim(coalesce(p.role,''))) in ('nurse','manager','admin','administrator','director')
  ) then return false; end if;
  insert into public.withheld_dose_push_receipts(alert_key, subscription_id, state)
  values (p_alert_key, p_subscription, 'claimed')
  on conflict (alert_key, subscription_id) do update set state='claimed', claimed_at=clock_timestamp(), retry_after=null, tries=withheld_dose_push_receipts.tries+1
  where withheld_dose_push_receipts.state='retry' and withheld_dose_push_receipts.retry_after<=clock_timestamp() and withheld_dose_push_receipts.tries<3;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.withheld_dose_claim_push(text,uuid) from public, anon, authenticated;
grant execute on function public.withheld_dose_claim_push(text,uuid) to service_role;

-- Run the dispatch every minute (copies the URL + secret header of the existing clinical push job, as 205 did).
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; withheld dose push job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/withheld-dose-alert-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-withheld-dose-alert-dispatch';
  perform cron.schedule('samara-withheld-dose-alert-dispatch', '* * * * *', new_cmd);
end $$;

commit;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Alert engine: "give later" after withholding = Re-medication Due (re-applies the SQL 167 step if it was skipped)
-- ---------------------------------------------------------------------------------------------------------
do $eng$
declare d text; d2 text; f oid;
begin
  select p.oid into f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_current_clinical_alerts' limit 1;
  if f is null then raise notice 'get_current_clinical_alerts not found, skipped'; return; end if;
  d := pg_get_functiondef(f);
  if position('''Withheld'',''Refused'',''Missed'',''Delayed''' in d) > 0 then
    raise notice 'alert engine already covers withheld re-medication'; return;
  end if;
  d2 := regexp_replace(d,
    'rescheduled_time\s+is\s+not\s+null\s+and\s+ma\.status\s+in\s*\(\s*''Refused''\s*,\s*''Missed''\s*,\s*''Delayed''\s*\)',
    'rescheduled_time is not null and ma.status in(''Withheld'',''Refused'',''Missed'',''Delayed'')', 'i');
  if d2 = d then raise notice 'alert engine text not matched, skipped (withheld re-medication still shows in Today''s MAR and Shift Tasks)'; return; end if;
  execute d2;
  raise notice 'alert engine now covers withheld re-medication';
end
$eng$;

notify pgrst, 'reload schema';

-- Check: all four should be true; the cron job should be listed.
select
  exists(select 1 from pg_proc where proname='family_portal_medicine_notes') as family_notes_ready,
  exists(select 1 from pg_proc where proname='withheld_dose_open_rows') as push_rows_ready,
  (select pg_get_functiondef(p.oid) like '%v_redo%' from pg_proc p where p.proname='record_withheld_dose_instruction' limit 1) as instruction_fix_ready,
  (select pg_get_functiondef(p.oid) like '%''Withheld'',''Refused'',''Missed'',''Delayed''%' from pg_proc p where p.proname='get_current_clinical_alerts' limit 1) as withheld_redose_alert_ready;
select jobname, schedule from cron.job where jobname = 'samara-withheld-dose-alert-dispatch';
select public.medication_withhold_family_text('Low blood pressure','BP 90/58 mmHg','Kumar','Give at a later time','12:00') as sample_family_line;
