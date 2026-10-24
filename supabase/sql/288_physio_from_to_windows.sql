-- 288 — Physiotherapy session windows entered as From–To (e.g. 07:00-09:00), stored in session_times as "HH:MM-HH:MM".
-- Older plain times ("08:00") still mean that time ±1 hour. Reminders for plan sessions start at each window's END.
-- Rescheduled sessions keep their exact time. Run once in Supabase SQL Editor after 287. Safe to re-run.
begin;
-- Session keys (window start, or the plain time for older plans), sorted.
create or replace function public.physio_plan_times(p_session_times text[], p_preferred text)
returns time[] language sql immutable set search_path=public,pg_temp as $$
  select coalesce(
    (select array_agg(distinct split_part(btrim(t),'-',1)::time order by split_part(btrim(t),'-',1)::time) from unnest(coalesce(p_session_times,'{}'::text[])) t
      where split_part(btrim(t),'-',1) ~ '^\s*\d{1,2}:\d{2}(:\d{2})?\s*$'),
    array[case when btrim(coalesce(p_preferred,'')) ~* '^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$' then btrim(p_preferred)::time else time '10:00' end])
$$;
-- Window END for each key above, in the same order (plain times: +1 hour).
create or replace function public.physio_plan_window_ends(p_session_times text[], p_preferred text)
returns time[] language sql immutable set search_path=public,pg_temp as $$
  select array_agg(e order by k) from (
    select distinct on (k) k, e from (
      select split_part(btrim(t),'-',1)::time as k,
        case when strpos(t,'-')>0 and split_part(btrim(t),'-',2) ~ '^\s*\d{1,2}:\d{2}' then btrim(split_part(btrim(t),'-',2))::time
             else split_part(btrim(t),'-',1)::time + interval '1 hour' end as e
      from unnest(coalesce(p_session_times,'{}'::text[])) t where split_part(btrim(t),'-',1) ~ '^\s*\d{1,2}:\d{2}(:\d{2})?\s*$'
      union all
      select k, k+interval '1 hour' from unnest(public.physio_plan_times(p_session_times,p_preferred)) k
    ) z order by k, (e is null)
  ) y
$$;
create or replace function public.physio_due_slots()
returns table(plan_id uuid,patient_id uuid,due_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 with clock as(select (now() at time zone 'Asia/Kolkata')::date as today)
 select pp.id,pp.patient_id,(((slot.day+slot.at_time) at time zone 'Asia/Kolkata')+make_interval(mins=>slot.win))::timestamptz
 from public.physiotherapy_plans pp join public.patients p on p.id=pp.patient_id cross join clock c
 cross join lateral(select public.physio_plan_times(pp.session_times, pp.preferred_time::text) as times, public.physio_plan_window_ends(pp.session_times, pp.preferred_time::text) as ends) tt
 cross join lateral(
   -- Pending sessions already on record (any date up to today)
   select x.session_date as day,coalesce(x.scheduled_time,tt.times[1]) as at_time,0 as win from public.physiotherapy_sessions x
   where (x.plan_id=pp.id or x.order_id=pp.id) and x.status='Pending' and x.session_date<=c.today
   union all
   -- today's session(s) with no record yet: one plan time = old rule (any session today counts);
   -- several plan times = each time needs its own session (2.18.94)
   select c.today, t.at_time, greatest(0,(extract(epoch from (t.end_time-t.at_time))/60)::int) from unnest(tt.times,tt.ends) with ordinality as t(at_time,end_time,n)
   -- SQL 286: sessions count in order — the Nth plan time is due only while fewer than N sessions exist today,
   -- so a morning session recorded late (e.g. 11:50) covers 8:00 AM and the 5:00 PM one is not due before 5 PM.
   where (select count(*) from public.physiotherapy_sessions x where (x.plan_id=pp.id or x.order_id=pp.id) and x.session_date=c.today)<t.n
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
select public.sync_physio_escalations(null);
commit;
notify pgrst,'reload schema';
select to_char(due_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as reminder_due,(select full_name from public.patients where id=s.patient_id) as guest from public.physio_due_slots() s order by due_at;
