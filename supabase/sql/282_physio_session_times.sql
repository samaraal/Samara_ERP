-- Samara Care ERP 2.18.94 — Physiotherapy plan: one time per session (Twice daily = 2 times) (23-10-2026)
-- Run once in Supabase > SQL Editor AFTER 280 / 281. Safe to run again.
--
-- 1. physiotherapy_plans.session_times (e.g. {07:30,19:30}) — entered in the Admission form and Patients → Edit as
--    "Session 1 time", "Session 2 time" … (preferred_time keeps the first time for older screens).
-- 2. Physiotherapy alerts / escalations (physio_due_slots, file 225) now expect EACH session time of the day:
--    a Twice daily plan alerts for the 7:30 AM session and, separately, for the 7:30 PM session if not recorded.
--    Plans with one time keep exactly the old rule. Pending / rescheduled sessions are handled as before.

begin;

alter table public.physiotherapy_plans add column if not exists session_times text[];
comment on column public.physiotherapy_plans.session_times is 'Session times of the day (HH:MM), one per session: Twice daily = 2 times';

create or replace function public.physio_plan_times(p_session_times text[], p_preferred text)
returns time[] language sql immutable set search_path=public,pg_temp as $$
  select coalesce(
    (select array_agg(distinct btrim(t)::time order by btrim(t)::time) from unnest(coalesce(p_session_times,'{}'::text[])) t
      where btrim(t) ~ '^\d{1,2}:\d{2}(:\d{2})?$'),
    array[case when btrim(coalesce(p_preferred,'')) ~* '^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$' then btrim(p_preferred)::time else time '10:00' end])
$$;

create or replace function public.physio_due_slots()
returns table(plan_id uuid,patient_id uuid,due_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 with clock as(select (now() at time zone 'Asia/Kolkata')::date as today)
 select pp.id,pp.patient_id,((slot.day+slot.at_time) at time zone 'Asia/Kolkata')::timestamptz
 from public.physiotherapy_plans pp join public.patients p on p.id=pp.patient_id cross join clock c
 cross join lateral(select public.physio_plan_times(pp.session_times, pp.preferred_time::text) as times) tt
 cross join lateral(
   -- Pending sessions already on record (any date up to today)
   select x.session_date as day,coalesce(x.scheduled_time,tt.times[1]) as at_time from public.physiotherapy_sessions x
   where (x.plan_id=pp.id or x.order_id=pp.id) and x.status='Pending' and x.session_date<=c.today
   union all
   -- today's session(s) with no record yet: one plan time = old rule (any session today counts);
   -- several plan times = each time needs its own session (2.18.94)
   select c.today, t.at_time from unnest(tt.times) as t(at_time)
   where (case when cardinality(tt.times)<=1
            then not exists(select 1 from public.physiotherapy_sessions x where (x.plan_id=pp.id or x.order_id=pp.id) and x.session_date=c.today)
            else not exists(select 1 from public.physiotherapy_sessions x where (x.plan_id=pp.id or x.order_id=pp.id) and x.session_date=c.today
                              and x.scheduled_time=t.at_time) end)
   and not exists(select 1 from public.physiotherapy_corrections r join public.physiotherapy_sessions x on x.id=r.session_id
     where r.state in ('Applying','Approved') and r.action='Reschedule' and (r.original->>'session_date')::date=c.today
     and (x.plan_id=pp.id or x.order_id=pp.id) and x.session_date>c.today
     and (cardinality(tt.times)<=1 or (r.original->>'scheduled_time')::time is not distinct from t.at_time))
 ) slot
 where pp.is_active=true and p.is_active=true and coalesce(p.admission_status,'Active')<>'Discharged'
 and (pp.end_date is null or pp.end_date>=c.today) and (pp.start_date is null or pp.start_date<=c.today)
 and (p.admission_date<>c.today or p.admission_date is null or ((slot.day+slot.at_time) at time zone 'Asia/Kolkata')>=((p.admission_date+coalesce(p.admission_time,(p.created_at at time zone 'Asia/Kolkata')::time)) at time zone 'Asia/Kolkata'));
$$;
revoke all on function public.physio_due_slots() from public,authenticated;

commit;
notify pgrst, 'reload schema';

-- Check: session_times column ready, and the active plans with their session times.
select (select count(*) from information_schema.columns where table_schema='public' and table_name='physiotherapy_plans' and column_name='session_times')=1 as session_times_ready,
       pp.frequency, pp.preferred_time, pp.session_times, public.physio_plan_times(pp.session_times, pp.preferred_time::text) as times_used
from public.physiotherapy_plans pp where pp.is_active;
