-- ERP 2.19.88 — DAILY REPORT, Care services: physiotherapy one row per Guest (08-11-2026). Run AFTER 359. Safe to run again.
-- The physiotherapy table listed each session as its own row with one Planned / Done at pair, so Mr. Swaminathan's
-- two sessions (morning and evening) read like one. Now: one row per Guest — Done (e.g. "2 of 2") · Session 1 ·
-- Session 2 · Session 3, each cell "Plan 07:00–09:00 · Done 09:30 ✓", a rescheduled session shown as
-- "Plan 17:00–18:00 → moved to 19:30 · Done 19:10 ✓". Numbers on the slide unchanged.
-- After running: Daily Report → pick the day → "↻ Prepare again".
begin;

create or replace function public.mdr_care_services(p_day date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare d date := p_day; k jsonb := '[]'; t jsonb := '[]';
  ntrial constant text := $q$not coalesce(p.is_trial,false)$q$;
  -- every planned physiotherapy slot of the day, matched in time order with the sessions recorded ($1 = the day)
  physio constant text := $q$
    with pl as (
      select pp.id as plan_id, pp.patient_id, gd.guest, gd.adm_at,
             public.physio_plan_times(pp.session_times, pp.preferred_time::text) as times,
             public.physio_plan_window_ends(pp.session_times, pp.preferred_time::text) as ends,
             greatest(coalesce(cardinality(pp.session_times),0),
               case when lower(coalesce(pp.frequency,'')) ~ '(four|4\s*times|qid)' then 4
                    when lower(coalesce(pp.frequency,'')) ~ '(thrice|three|3\s*times|tds|tid)' then 3
                    when lower(coalesce(pp.frequency,'')) ~ '(twice|two|2\s*times|\mbd\M|\mbid\M)' then 2 else 1 end) as n
        from public.physiotherapy_plans pp
        join public.mis_guest_days($1,$2) gd on gd.patient_id = pp.patient_id and gd.d = $1
       where coalesce(pp.is_active,true)
         and (pp.start_date is null or pp.start_date <= $1) and (pp.end_date is null or pp.end_date >= $1)
    ), slot as (
      select pl.plan_id, pl.patient_id, pl.guest, k as rn, pl.times[k] as at_time, pl.ends[k] as end_time
        from pl cross join lateral generate_series(1, pl.n) k
       -- a slot before the admission moment is not due (admitted at 12:30 → the 08:00 session does not count)
       where pl.times[k] is null or (($1 + pl.times[k]) at time zone 'Asia/Kolkata') >= pl.adm_at
    ), ses as (
      select s.*, coalesce(s.plan_id, s.order_id) as pid, concat_ws(' ', nullif(p.title,''), p.full_name) as guest,
             row_number() over (partition by coalesce(s.plan_id, s.order_id, s.id) order by coalesce(s.scheduled_time, s.actual_time), s.created_at) as rn
        from public.physiotherapy_sessions s join public.patients p on p.id = s.patient_id
       where not coalesce(p.is_trial,false) and s.session_date = $1
    )
    select coalesce(ses.guest, slot.guest) as guest,
           coalesce(ses.physiotherapist_name, (select x.physiotherapist_name from public.physiotherapy_sessions x
              where coalesce(x.plan_id,x.order_id) = slot.plan_id and x.physiotherapist_name is not null
              order by x.session_date desc, x.created_at desc limit 1)) as physio,
           coalesce(slot.at_time, ses.scheduled_time) as planned,
           ses.actual_time as done_at,
           coalesce(slot.rn, ses.rn)::int as rn, slot.end_time as plan_end, ses.scheduled_time as sched,
           case when ses.id is not null then ses.status || coalesce(' · ' || nullif(ses.reason,''), '')
                when slot.at_time is not null and (($1 + slot.at_time) at time zone 'Asia/Kolkata') + interval '2 hours' > now() then 'Due later'
                else 'Not recorded' end as status
      from slot full join ses on ses.pid = slot.plan_id and ses.rn = slot.rn
    union all
    -- a physio note written for a Guest on the day, but no session recorded for that Guest (e.g. no physio plan) —
    -- the physiotherapist saw the Guest, yet nothing is recorded as a session, so nothing is charged
    select concat_ws(' ', nullif(p.title,''), p.full_name), max(n.recorded_by_name), null::time,
           (min(n.observed_at) at time zone 'Asia/Kolkata')::time, 1, null::time, null::time,
           'Note only — no session recorded' || case when not exists (select 1 from public.physiotherapy_plans pp where pp.patient_id = p.id and coalesce(pp.is_active,true)) then ' (no physio plan)' else '' end
      from public.physiotherapy_notes n join public.patients p on p.id = n.patient_id
     where not coalesce(p.is_trial,false) and (n.observed_at at time zone 'Asia/Kolkata')::date = $1
       and not exists (select 1 from public.physiotherapy_sessions x where x.patient_id = n.patient_id and x.session_date = $1)
     group by p.id, p.title, p.full_name $q$;
  -- nursing procedures done, per procedure per Guest, with their charges ($1 = the day)
  npc constant text := $q$
    with npa as (   -- the day ($1) and the day before, for the Yesterday | Today columns
      select r.id, r.patient_id, r.procedure_name, concat_ws(' ', nullif(p.title,''), p.full_name) as guest, r.charge_request_id,
             (r.started_at at time zone 'Asia/Kolkata')::date = $1 as is_today
        from public.nursing_procedure_requests r join public.patients p on p.id = r.patient_id
       where not coalesce(p.is_trial,false) and r.status = 'Started'
         and coalesce(r.category,'Nursing Procedures') <> 'Biomedical Equipment'
         and (r.started_at at time zone 'Asia/Kolkata')::date between $1 - 1 and $1
    ), npr as (select * from npa where is_today
    ), lnk as (   -- charges linked to the procedure (raised automatically on Start)
      select n.patient_id, n.procedure_name, b.approval_status, b.billing_transaction_id, b.approved_amount, b.final_amount
        from npr n join public.bill_charge_requests b on b.id = n.charge_request_id
       where coalesce(b.status,'') <> 'Cancelled'
    ), hand as (  -- same item, same Guest, same day, raised by hand (not linked to any procedure)
      select b.patient_id, b.service_name as procedure_name, b.approval_status, b.billing_transaction_id, b.approved_amount, b.final_amount
        from public.bill_charge_requests b
       where coalesce(b.status,'') <> 'Cancelled'
         and coalesce(b.charge_date, (coalesce(b.service_datetime, b.raised_at, b.created_at) at time zone 'Asia/Kolkata')::date) = $1
         and b.patient_id in (select patient_id from npr)
         and not exists (select 1 from public.nursing_procedure_requests x where x.charge_request_id = b.id)
    ), ch as (
      select patient_id, procedure_name,
             count(*) as raised,
             count(*) filter (where approval_status in ('Approved','Partially Approved')) as approved,
             count(*) filter (where billing_transaction_id is not null) as posted,
             count(*) filter (where approval_status = 'Rejected') as returned,
             coalesce(sum(coalesce(approved_amount, final_amount, 0)) filter (where billing_transaction_id is not null),0) as value
        from (select patient_id, lower(btrim(procedure_name)) as procedure_name, approval_status, billing_transaction_id, approved_amount, final_amount from lnk
              union all
              select patient_id, lower(btrim(procedure_name)), approval_status, billing_transaction_id, approved_amount, final_amount from hand) z
       group by 1, 2
    ), dn as (
      select patient_id, procedure_name, max(guest) as guest, count(*) filter (where is_today) as done,
             count(*) filter (where not is_today) as yday
        from npa group by 1, 2
    )
    select dn.procedure_name, dn.guest, dn.done, dn.yday,
           least(coalesce(ch.raised,0), dn.done) as raised,
           least(coalesce(ch.approved,0), dn.done) as approved,
           least(coalesce(ch.posted,0), dn.done) as posted,
           coalesce(ch.returned,0) as returned,
           greatest(dn.done - coalesce(ch.raised,0), 0) as not_charged,
           coalesce(ch.value,0) as value
      from dn left join ch on ch.patient_id = dn.patient_id and ch.procedure_name = lower(btrim(dn.procedure_name)) $q$;
begin
  -- numbers
  k := k || public.mdr_series('Nursing procedures done','', $q$select count(*) from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id where not coalesce(p.is_trial,false) and r.status='Started' and coalesce(r.category,'Nursing Procedures')<>'Biomedical Equipment' and (r.started_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  k := k || public.mdr_series('Blood glucose checks','', $q$select count(*) from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id where not coalesce(p.is_trial,false) and r.status='Started' and r.procedure_name ~* '(glucose|sugar|grbs|cbg)' and (r.started_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  k := k || public.mdr_series('Nebulizations','', $q$select count(*) from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id where not coalesce(p.is_trial,false) and r.status='Started' and r.procedure_name ~* 'nebuli' and (r.started_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  k := k || public.mdr_series('Procedures not charged','', format('select coalesce(sum(not_charged),0) from (%s) z', npc), d, 'down', false, 'done, no charge raised');
  k := k || public.mdr_series('Charges not yet in Guest account','', format('select coalesce(sum(raised - posted),0) from (%s) z', npc), d, 'down', false, 'raised, not posted to the ledger');
  k := k || public.mdr_series('Procedure charges posted','₹', format('select coalesce(sum(value),0) from (%s) z', npc), d, 'up', true, 'in Guest accounts');
  k := k || public.mdr_series('Physiotherapy sessions planned','', format('select count(*) from (%s) z where status <> %L and status not like %L and planned is not null', physio, 'Due later', 'Note only%'), d, null, false, 'as per Guests'' plans');
  k := k || public.mdr_series('Physiotherapy sessions done','', $q$select count(*) from public.physiotherapy_sessions s join public.patients p on p.id=s.patient_id where not coalesce(p.is_trial,false) and s.status='Completed' and s.session_date = $1$q$, d, 'up');
  k := k || public.mdr_series('Physiotherapy not done','', format('select count(*) from (%s) z where status = %L or status like %L or status like %L or status like %L', physio, 'Not recorded', 'Not Done%', 'Pending%', 'Note only%'), d, 'down', false, 'not done or not recorded');
  k := k || public.mdr_k('Doctor consultations','', $q$select count(*) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and b.category ilike '%doctor%' and coalesce(b.status,'') not in ('Cancelled') and coalesce(b.approval_status,'') <> 'Rejected' and coalesce(b.charge_date,(coalesce(b.raised_at,b.created_at) at time zone 'Asia/Kolkata')::date) = $1$q$, d, 'raised as Doctor Services');
  k := k || public.mdr_k('Lab / scans ordered','', $q$select count(*) from public.diagnostic_services x join public.patients p on p.id=x.patient_id where not coalesce(p.is_trial,false) and (x.ordered_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  k := k || public.mdr_k('Reports received','', $q$select count(*) from public.diagnostic_services x join public.patients p on p.id=x.patient_id where not coalesce(p.is_trial,false) and (x.report_received_at at time zone 'Asia/Kolkata')::date = $1$q$, d);

  -- tables
  t := t || public.mdr_table('Nursing procedures — done and charged',
      '["Procedure","Guest","Yesterday","Today","Change","Charge raised","Approved","In Guest account","Not charged"]'::jsonb, format($q$
      select jsonb_build_array(z.procedure_name, z.guest, z.yday, z.done,
               case when z.done > z.yday then '▲ ' || (z.done - z.yday) when z.done < z.yday then '▼ ' || (z.yday - z.done) else '=' end,
               z.raised,
               z.approved::text || case when z.returned > 0 then ' (' || z.returned || ' returned)' else '' end,
               z.posted, case when z.not_charged > 0 then '⚠ ' || z.not_charged else '0' end) as r
        from (%s) z order by z.not_charged desc, z.done - z.posted desc, z.done desc, z.procedure_name, z.guest$q$, npc), d, 20, false,
      'Yesterday | Today = times done the day before and on this day (▲ more, ▼ fewer). Charges are for this day. Charge raised = linked to the procedure, or raised by hand for the same item, Guest and day. In Guest account = approved by Accounts and posted to the Guest''s ledger.');
  t := t || public.mdr_table('Physiotherapy — sessions per Guest','["Guest","Physiotherapist","Done","Session 1","Session 2","Session 3"]'::jsonb, format($q$
      with c as (
        select z.guest, z.physio, z.rn, z.status,
               case when left(z.status, 9) = 'Note only' then '⚠ ' || z.status
               else concat_ws(' · ',
                 'Plan ' || coalesce(to_char(z.planned,'HH24:MI') || coalesce('–' || to_char(z.plan_end,'HH24:MI'),''), '—')
                   || case when z.sched is not null and z.planned is not null and z.sched <> z.planned then ' → moved to ' || to_char(z.sched,'HH24:MI') else '' end,
                 case when z.status = 'Completed' then 'Done ' || coalesce(to_char(z.done_at,'HH24:MI'),'') || ' ✓'
                      when z.status = 'Not recorded' then 'Not recorded'
                      else z.status end)
               end as cell
          from (%s) z
      )
      select jsonb_build_array(c.guest, coalesce(max(c.physio),'—'),
               case when count(*) filter (where left(c.status,9) <> 'Note only') = 0 then '—' else (count(*) filter (where c.status = 'Completed'))::text || ' of ' || (count(*) filter (where left(c.status,9) <> 'Note only'))::text end,
               coalesce(case when bool_or(c.status = 'Not recorded' and c.rn = 1) then '⚠ ' else '' end || max(c.cell) filter (where c.rn = 1), '—'),
               coalesce(case when bool_or(c.status = 'Not recorded' and c.rn = 2) then '⚠ ' else '' end || max(c.cell) filter (where c.rn = 2), '—'),
               coalesce(case when bool_or(c.status = 'Not recorded' and c.rn = 3) then '⚠ ' else '' end || max(c.cell) filter (where c.rn = 3), '—')) as r
        from c group by c.guest order by c.guest$q$, physio), d, 30, false,
      'One row per Guest; one column per session of the plan (Twice daily = Session 1 and 2). Plan = the session window in the Guest''s plan; "moved to" = rescheduled time. "Not recorded" = planned, but no session entered. "Note only" = a physio note was written but no session recorded, so nothing is charged.');
  t := t || public.mdr_table('Lab / scans','["Guest","Test","Lab","Status"]'::jsonb, format($q$
      select jsonb_build_array(concat_ws(' ', nullif(p.title,''), p.full_name), concat_ws(' · ', x.service_type, x.test_name), coalesce(x.laboratory_name,'—'), coalesce(x.report_status,'Ordered')) as r
        from public.diagnostic_services x join public.patients p on p.id=x.patient_id
       where %1$s and ((x.ordered_at at time zone 'Asia/Kolkata')::date = $1 or (x.report_received_at at time zone 'Asia/Kolkata')::date = $1)
       order by x.ordered_at$q$, ntrial), d);

  return jsonb_build_object('key','services','title','Care services',
    'subtitle','Nursing procedures (done and charged), physiotherapy (planned and recorded), doctor consultations, lab and scans',
    'money',false,'kpis',k,'tables',t);
end $f$;
revoke all on function public.mdr_care_services(date) from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';

-- Check: Mr. Swaminathan on 07-11-2026 — one row with Session 1 and Session 2
select jsonb_pretty(public.mdr_care_services(date '2026-11-07')->'tables'->1) as physiotherapy_07_11;
