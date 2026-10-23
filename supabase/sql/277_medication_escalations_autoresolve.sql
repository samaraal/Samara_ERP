-- Samara Care ERP 2.18.86 — Medicine escalations close by themselves once the dose is recorded (23-10-2026)
-- Run once in Supabase > SQL Editor. Safe to run again.
--
-- Problem: a "Medicine Due … overdue" escalation stayed OPEN in the Clinical Escalations register after the
-- nurse recorded the dose (Daily Care and Meals already closed by themselves, Medicines did not). Open
-- escalations keep counting as clinical alerts and keep reaching phones — e.g. Inj. Emrok / Inj. Piptaz
-- 10:00 AM on 23-10-2026, given and recorded, still open; some open ones were from September.
--
-- 1. Trigger: when a MAR entry is saved (any status — Given, Refused, Withheld, Missed, Delayed …) for a
--    medicine + date + time, the open "Medication" escalation for that same dose is closed automatically
--    ("Automatically resolved: dose recorded as Given at …"). A rescheduled dose closes its own escalation.
-- 2. One-time clean-up: open Medication escalations whose dose is already recorded in the MAR are closed now.
--    Escalations for doses that have NO MAR entry stay open for the Nursing Manager to review.
-- Nothing else is changed.

begin;

create or replace function public.samara_resolve_medication_escalations()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_due timestamptz;
  v_by uuid := (select p.id from public.profiles p where p.id=auth.uid() or p.auth_user_id=auth.uid() limit 1);
begin
  if new.order_id is null or new.scheduled_date is null or new.scheduled_time is null then return new; end if;
  if coalesce(btrim(new.status),'') in ('','Due','Pending') then return new; end if;
  v_due := ((new.scheduled_date + new.scheduled_time::time) at time zone 'Asia/Kolkata');
  update public.clinical_alert_escalations e
     set resolved_at=now(), resolved_by=v_by, resolution_action='Completed',
         resolution_remarks=concat('Automatically resolved: dose recorded as ',new.status,
           case when new.administered_at is not null
                then concat(' at ',to_char(new.administered_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM'),' IST') else '' end,'.'),
         updated_at=now()
   where e.resolved_at is null and e.alert_type='Medication'
     and e.source_id=new.order_id
     and e.due_at=v_due;
  return new;
end $$;
revoke all on function public.samara_resolve_medication_escalations() from public, anon, authenticated;

drop trigger if exists samara_resolve_medication_escalations on public.medication_administrations;
create trigger samara_resolve_medication_escalations
after insert or update of status, scheduled_date, scheduled_time on public.medication_administrations
for each row execute function public.samara_resolve_medication_escalations();

-- One-time clean-up of escalations whose dose is already recorded.
with m as (
  select distinct on (e.id) e.id, ma.status, ma.administered_at
  from public.clinical_alert_escalations e
  join public.medication_administrations ma
    on ma.order_id=e.source_id
   and ma.scheduled_date=(e.due_at at time zone 'Asia/Kolkata')::date
   and ma.scheduled_time::time=(e.due_at at time zone 'Asia/Kolkata')::time
  where e.resolved_at is null and e.alert_type='Medication'
    and coalesce(btrim(ma.status),'') not in ('','Due','Pending')
  order by e.id, ma.administered_at nulls last
)
update public.clinical_alert_escalations t
   set resolved_at=now(), resolution_action='Completed',
       resolution_remarks=concat('Automatically resolved (clean-up 2.18.86): dose recorded as ',m.status,
         case when m.administered_at is not null
              then concat(' at ',to_char(m.administered_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM'),' IST') else '' end,'.'),
       updated_at=now()
  from m
 where t.id=m.id;

commit;
notify pgrst,'reload schema';

-- Check: trigger ready = true; still_open_medication = escalations for doses with NO MAR entry (for review).
select
  exists(select 1 from pg_trigger where tgname='samara_resolve_medication_escalations') as medication_autoresolve_ready,
  (select count(*) from public.clinical_alert_escalations where resolved_at is null and alert_type='Medication') as still_open_medication;
