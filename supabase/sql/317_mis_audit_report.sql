-- ERP 2.19.11 (updated 29-10-2026: Bills & Charges counts, Nursing Procedures, Discrepancies & Deviations analysis) — MIS & AUDIT REPORT (Admin / Directors) (29-10-2026). Run once in Supabase SQL Editor. Safe to run again.
--
-- What: one report that AUDITS ERP entries for a period (IST dates) across three areas and gives the key numbers:
--   • Clinical    — vitals slots not recorded, medicine doses not recorded / missed / withheld without the doctor's
--                   instruction / given late, open escalations, incidents & falls, medication errors, nursing notes
--                   short in a shift, verbal orders not confirmed, physiotherapy not done, diagnostics overdue.
--   • Financial   — charges waiting with Accounts, returned and not corrected, room / nursing charges missing on a day,
--                   physiotherapy not billed, Guest rate changes, approved ≠ requested, possible duplicate charges,
--                   items with no rate, non-cash receipts with no reference, receipts not sent, refunds pending,
--                   dues, daily billing errors, expenses without a bill.
--   • Operational — occupancy, admissions / discharges, consent pending, stock out / low / expired, indents stuck,
--                   equipment faults & service overdue, nursing shifts with no nurse rostered, staff not back after
--                   leave, leave requests waiting, discharges overdue, enquiry follow-ups overdue, food orders not
--                   received, WhatsApp failures, app errors.
-- How: every check / number runs on its own (mis_check / mis_kpi). If one cannot run (e.g. a table differs on the live
--   database) it shows "could not run" with the reason, and every other check still runs. Trial Guests are left out.
-- Read-only: nothing in the ERP is changed by this report.
--   mis_audit_report(p_from, p_to)       → Admin / Directors (the MIS & Audit page)
--   mis_audit_report_core(p_from, p_to)  → server only (the morning WhatsApp summary, SQL 318)
begin;

-- Who was a Guest on each day of the period (Trial Guests and drafts left out). The last day is the reviewed departure
-- day, or the discharge date for a discharged Guest; for a current Guest, today.
create or replace function public.mis_guest_days(p_from date, p_to date)
returns table(patient_id uuid, d date, guest text, room text, adm_at timestamptz, is_active boolean)
language sql stable security definer set search_path=public,pg_temp as $f$
  with g as (
    select p.id, concat_ws(' ', nullif(p.title,''), p.full_name) as guest,
           nullif(concat_ws('-', nullif(p.room_no,''), nullif(p.bed_no,'')),'') as room,
           p.admission_date::date as a_day,
           ((p.admission_date::date + coalesce(p.admission_time,(p.created_at at time zone 'Asia/Kolkata')::time)) at time zone 'Asia/Kolkata') as adm_at,
           coalesce(p.is_active,true) as act,
           case when coalesce(p.is_active,true) then null
                else coalesce(public.discharge_billing_cutoff(p.id), p.discharge_date::date) end as last_day
      from public.patients p
     where p.admission_date is not null and not coalesce(p.is_trial,false)
       and coalesce(p.admission_status,'Active') not in ('Draft','Admission Pending')
  )
  select g.id, gs::date, g.guest, g.room, g.adm_at, g.act
    from g, generate_series(greatest(p_from, g.a_day),
                            least(p_to, coalesce(g.last_day, (now() at time zone 'Asia/Kolkata')::date)), interval '1 day') gs
   where g.last_day is not null or g.act
$f$;
revoke all on function public.mis_guest_days(date,date) from public, anon, authenticated;

-- One audit check. p_sql must return: sort_at timestamptz, date text, who text, detail text, amount numeric
-- ($1 = from date, $2 = to date). Returns {key,title,severity,page,detail,count,amount,rows[≤25]} or {…,error}.
create or replace function public.mis_check(p_key text, p_title text, p_severity text, p_page text, p_detail text,
                                            p_sql text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare n int; amt numeric; rows jsonb;
begin
  execute format($q$
    with q as (%s)
    select count(*)::int, sum(amount),
           coalesce((select jsonb_agg(jsonb_build_object('date',z.date,'who',z.who,'detail',z.detail,'amount',z.amount))
                       from (select * from q order by sort_at desc nulls last limit 25) z), '[]'::jsonb)
      from q $q$, p_sql)
  into n, amt, rows using p_from, p_to;
  return jsonb_build_object('key',p_key,'title',p_title,'severity',p_severity,'page',p_page,'detail',p_detail,
                            'count',coalesce(n,0),'amount',amt,'rows',rows);
exception when others then
  return jsonb_build_object('key',p_key,'title',p_title,'severity',p_severity,'page',p_page,'detail',p_detail,
                            'count',0,'rows','[]'::jsonb,'error',left(sqlerrm,300));
end $f$;
revoke all on function public.mis_check(text,text,text,text,text,text,date,date) from public, anon, authenticated;

-- One key number. p_sql returns one numeric ($1 = from, $2 = to).
create or replace function public.mis_kpi(p_label text, p_unit text, p_sql text, p_from date, p_to date, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v numeric;
begin
  execute p_sql into v using p_from, p_to;
  return jsonb_build_object('label',p_label,'unit',p_unit,'value',v,'note',p_note);
exception when others then
  return jsonb_build_object('label',p_label,'unit',p_unit,'value',null,'note','Not available: '||left(sqlerrm,160));
end $f$;
revoke all on function public.mis_kpi(text,text,text,date,date,text) from public, anon, authenticated;

-- ═════════════════════════════════════════ CLINICAL ═════════════════════════════════════════
create or replace function public.mis_section_clinical(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare k jsonb := '[]'; c jsonb := '[]';
  -- expected vitals slots in the period whose recording window (due −90 min … due +4 h) has closed
  v_slots constant text := $q$
    select gd.patient_id, gd.guest, gd.room, ((gd.d + s.t) at time zone 'Asia/Kolkata') as due
      from public.mis_guest_days($1,$2) gd
      join public.patients p on p.id = gd.patient_id
      cross join lateral (select x::time as t from unnest(coalesce(p.vitals_schedule::text[], array['06:00','14:00','22:00'])) x) s
     where ((gd.d + s.t) at time zone 'Asia/Kolkata') >= gd.adm_at
       and ((gd.d + s.t) at time zone 'Asia/Kolkata') + interval '4 hours' < now()
       and coalesce(p.admission_status,'Active') <> 'Temporarily Hospitalised' $q$;
  -- medicine doses due in the period (same dose-day rules as the clinical alerts), at least 1 hour past due
  v_doses constant text := $q$
    select mo.id as order_id, gd.patient_id, gd.guest, gd.room, gd.d, t.x::time as slot,
           ((gd.d + t.x::time) at time zone 'Asia/Kolkata') as due, mo.medicine_name
      from public.mis_guest_days($1,$2) gd
      join public.medication_orders mo on mo.patient_id = gd.patient_id and mo.is_active = true
      cross join lateral unnest(mo.scheduled_times) t(x)
     where (mo.start_date is null or mo.start_date <= gd.d) and (mo.end_date is null or mo.end_date >= gd.d)
       and (mo.effective_from is null or ((gd.d + t.x::time) at time zone 'Asia/Kolkata') >= mo.effective_from)
       and (mo.stopped_at is null or ((gd.d + t.x::time) at time zone 'Asia/Kolkata') < mo.stopped_at)
       and public.samara_medication_due_on_order(mo.frequency, mo.dose_weekday, mo.dose_month_day,
             coalesce((mo.effective_from at time zone 'Asia/Kolkata')::date, mo.start_date), gd.d, mo.dose_anchor_date)
       and ((gd.d + t.x::time) at time zone 'Asia/Kolkata') >= gd.adm_at
       and ((gd.d + t.x::time) at time zone 'Asia/Kolkata') < now() - interval '1 hour' $q$;
begin
  -- Key numbers
  k := k || public.mis_kpi('Guests now','', $q$select count(*) from public.patients where coalesce(is_active,true) and not coalesce(is_trial,false) and admission_date is not null and coalesce(admission_status,'Active') not in ('Draft','Admission Pending','Discharged')$q$, p_from, p_to, 'current');
  k := k || public.mis_kpi('Guest-days','', $q$select count(*) from public.mis_guest_days($1,$2)$q$, p_from, p_to, 'in the period');
  k := k || public.mis_kpi('Vitals recorded on time','%', format($q$with s as (%s) select round(100.0*count(*) filter (where exists(select 1 from public.vital_signs v where v.patient_id=s.patient_id and v.recorded_at>=s.due-interval '90 minutes' and v.recorded_at<s.due+interval '4 hours'))/nullif(count(*),0),1) from s$q$, v_slots), p_from, p_to, 'scheduled slots recorded');
  k := k || public.mis_kpi('Medicine doses recorded','%', format($q$with s as (%s) select round(100.0*count(*) filter (where exists(select 1 from public.medication_administrations a where a.order_id=s.order_id and a.scheduled_date=s.d and a.scheduled_time::time=s.slot))/nullif(count(*),0),1) from s$q$, v_doses), p_from, p_to, 'doses with an entry');
  k := k || public.mis_kpi('Critical vitals readings','', $q$select count(*) from public.vital_signs v join public.patients p on p.id=v.patient_id where not coalesce(p.is_trial,false) and v.alert_level='Critical' and (v.recorded_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('Escalations raised','', $q$select count(*) from public.clinical_alert_escalations e where (e.created_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to, 'to Manager / Admin');
  k := k || public.mis_kpi('Incidents reported','', $q$select count(*) from public.incidents i where (i.incident_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('Falls','', $q$select count(*) from public.incidents i where i.incident_type='Fall' and (i.incident_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('Nursing procedures done','', $q$select count(*) from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id where not coalesce(p.is_trial,false) and r.status='Started' and coalesce(r.category,'Nursing Procedures')<>'Biomedical Equipment' and (r.started_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to, 'confirmed & started');
  k := k || public.mis_kpi('Physiotherapy sessions done','', $q$select count(*) from public.physiotherapy_sessions s join public.patients p on p.id=s.patient_id where not coalesce(p.is_trial,false) and s.status='Completed' and s.session_date between $1 and $2$q$, p_from, p_to);

  -- Audit checks
  c := c || public.mis_check('vitals_missed','Vitals not recorded for a scheduled slot','high','Vital Signs',
    'No vitals entry within the slot window (90 min before to 4 h after the scheduled time).',
    format($q$with s as (%s)
      select s.due as sort_at, to_char(s.due at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
             concat_ws(' · ', s.guest, s.room) as who, 'Scheduled vitals not recorded' as detail, null::numeric as amount
        from s where not exists(select 1 from public.vital_signs v where v.patient_id=s.patient_id
                                 and v.recorded_at>=s.due-interval '90 minutes' and v.recorded_at<s.due+interval '4 hours')$q$, v_slots),
    p_from, p_to);

  c := c || public.mis_check('doses_unrecorded','Medicine doses with no entry','high','Medicines',
    'A dose was due but nothing (Given / Refused / Withheld / Missed …) was recorded.',
    format($q$with s as (%s)
      select s.due as sort_at, to_char(s.due at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
             concat_ws(' · ', s.guest, s.room) as who, coalesce(s.medicine_name,'Medicine')||' — no entry' as detail, null::numeric as amount
        from s where not exists(select 1 from public.medication_administrations a
                                 where a.order_id=s.order_id and a.scheduled_date=s.d and a.scheduled_time::time=s.slot)$q$, v_doses),
    p_from, p_to);

  c := c || public.mis_check('doses_missed','Doses recorded as Missed or Refused','medium','Medication Errors',
    'Doses the nurse recorded as Missed or Refused — check the reason and whether the doctor was told.',
    $q$select ((a.scheduled_date + a.scheduled_time::time) at time zone 'Asia/Kolkata') as sort_at,
              to_char(a.scheduled_date + a.scheduled_time::time,'DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              a.status||' · '||coalesce(mo.medicine_name,'Medicine')||coalesce(' · '||nullif(a.remarks,''),'') as detail, null::numeric as amount
         from public.medication_administrations a join public.patients p on p.id=a.patient_id
         left join public.medication_orders mo on mo.id=a.order_id
        where not coalesce(p.is_trial,false) and a.status in ('Missed','Refused') and a.scheduled_date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('withheld_open','Withheld doses still waiting for the doctor''s instruction','high','Medicines',
    'Withheld doses with no doctor''s instruction recorded yet.',
    $q$select ((a.scheduled_date + a.scheduled_time::time) at time zone 'Asia/Kolkata') as sort_at,
              to_char(a.scheduled_date + a.scheduled_time::time,'DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              coalesce(mo.medicine_name,'Medicine')||' · '||coalesce(a.withhold_reason,'withheld') as detail, null::numeric as amount
         from public.medication_administrations a join public.patients p on p.id=a.patient_id
         left join public.medication_orders mo on mo.id=a.order_id
        where not coalesce(p.is_trial,false) and a.status='Withheld' and a.doctor_instruction is null and a.scheduled_date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('doses_late','Medicines given 30 minutes or more late','medium','Medicines',
    'Given, but 30+ minutes after the scheduled time.',
    $q$select a.administered_at as sort_at, to_char(a.scheduled_date + a.scheduled_time::time,'DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              coalesce(mo.medicine_name,'Medicine')||' · '||public.samara_med_given_late_minutes(a.scheduled_date, a.scheduled_time::time, a.administered_at)||' min late' as detail,
              null::numeric as amount
         from public.medication_administrations a join public.patients p on p.id=a.patient_id
         left join public.medication_orders mo on mo.id=a.order_id
        where not coalesce(p.is_trial,false) and a.status='Given' and a.scheduled_date between $1 and $2
          and public.samara_med_given_late_minutes(a.scheduled_date, a.scheduled_time::time, a.administered_at) >= 30$q$,
    p_from, p_to);

  c := c || public.mis_check('mar_late_entry','Medicine entries made late (after the round)','low','Medicines',
    'The dose was entered in the ERP well after it was given (documentation delay).',
    $q$select a.entry_recorded_at as sort_at, to_char(a.scheduled_date + a.scheduled_time::time,'DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              coalesce(mo.medicine_name,'Medicine')||' · entered '||coalesce(a.entry_delay_minutes::text,'?')||' min late'||coalesce(' · '||nullif(a.late_entry_reason,''),'') as detail,
              null::numeric as amount
         from public.medication_administrations a join public.patients p on p.id=a.patient_id
         left join public.medication_orders mo on mo.id=a.order_id
        where not coalesce(p.is_trial,false) and coalesce(a.late_entry,false) and a.scheduled_date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('escalations_open','Clinical escalations raised in the period and still open','high','Clinical Escalations',
    'Raised to Manager / Admin in this period and not yet attended. (Older escalations stay in the record for audit and training; they are not counted here.)',
    $q$select e.created_at as sort_at, to_char(e.created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(concat_ws(' ', nullif(p.title,''), p.full_name),'—') as who,
              concat_ws(' · ', e.alert_type, e.priority, 'to '||e.escalated_to_role, e.escalation_reason) as detail, null::numeric as amount
         from public.clinical_alert_escalations e left join public.patients p on p.id=e.patient_id
        where e.resolved_at is null and (e.created_at at time zone 'Asia/Kolkata')::date between $1 and $2
          and not coalesce(p.is_trial,false)$q$,
    p_from, p_to);

  c := c || public.mis_check('escalations_raised','Clinical escalations raised in the period (audit & training)','low','Clinical Escalations',
    'Every alert that reached Manager / Admin because it was not done in time — attended or not. Use for staff training.',
    $q$select e.created_at as sort_at, to_char(e.created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(concat_ws(' ', nullif(p.title,''), p.full_name),'—') as who,
              concat_ws(' · ', e.alert_type, e.priority, case when e.resolved_at is null then 'OPEN' else coalesce(e.resolution_action,'Resolved') end) as detail,
              null::numeric as amount
         from public.clinical_alert_escalations e left join public.patients p on p.id=e.patient_id
        where (e.created_at at time zone 'Asia/Kolkata')::date between $1 and $2 and not coalesce(p.is_trial,false)$q$,
    p_from, p_to);

  c := c || public.mis_check('incidents_open','Incidents not closed','high','Incidents',
    'Open or under review — needs closure note.',
    $q$select i.incident_at as sort_at, to_char(i.incident_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(concat_ws(' ', nullif(p.title,''), p.full_name),'—') as who,
              concat_ws(' · ', i.incident_no, i.incident_type, i.severity, i.status, left(i.description,80)) as detail, null::numeric as amount
         from public.incidents i left join public.patients p on p.id=i.patient_id
        where coalesce(i.status,'Open') <> 'Closed' and (i.incident_at at time zone 'Asia/Kolkata')::date <= $2$q$,
    p_from, p_to);

  c := c || public.mis_check('falls','Falls in the period','medium','Incidents',
    'Each fall recorded as an incident.',
    $q$select i.incident_at as sort_at, to_char(i.incident_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(concat_ws(' ', nullif(p.title,''), p.full_name),'—') as who,
              concat_ws(' · ', i.incident_no, i.severity, i.status, left(i.description,80)) as detail, null::numeric as amount
         from public.incidents i left join public.patients p on p.id=i.patient_id
        where i.incident_type='Fall' and (i.incident_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('med_errors_open','Medication errors not closed','medium','Medication Errors',
    'Reported medication errors still open / under review / corrective action.',
    $q$select m.occurred_at as sort_at, to_char(m.occurred_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(concat_ws(' ', nullif(p.title,''), p.full_name),'—') as who,
              concat_ws(' · ', m.error_type, m.severity, m.status) as detail, null::numeric as amount
         from public.medication_errors m left join public.patients p on p.id=m.patient_id
        where coalesce(m.status,'Open') <> 'Closed' and (m.occurred_at at time zone 'Asia/Kolkata')::date <= $2$q$,
    p_from, p_to);

  c := c || public.mis_check('notes_short','Nursing notes short in a shift','medium','Nursing Notes',
    'Each Guest needs 2 nursing notes per 12-hour shift (1 if admitted late in the shift).',
    $q$with sh as (
         select gd.patient_id, gd.guest, gd.room, ((gd.d + x.t) at time zone 'Asia/Kolkata') as ss
           from public.mis_guest_days($1,$2) gd cross join (values (time '07:00'),(time '19:00')) x(t)
       ), st as (select coalesce(nursing_notes_from, '-infinity'::timestamptz) as f from public.clinical_alert_settings limit 1)
       select sh.ss as sort_at, to_char(sh.ss at time zone 'Asia/Kolkata','DD-MM-YYYY')||case when extract(hour from sh.ss at time zone 'Asia/Kolkata')=7 then ' Day' else ' Night' end as date,
              concat_ws(' · ', sh.guest, sh.room) as who,
              n.cnt||' of '||public.nursing_notes_needed(sh.patient_id, sh.ss)||' notes written' as detail, null::numeric as amount
         from sh cross join st
         cross join lateral (select count(*) as cnt from public.nursing_notes nn where nn.patient_id=sh.patient_id and nn.shift_start=sh.ss) n
         join public.patients p on p.id=sh.patient_id
        where sh.ss >= st.f and sh.ss + interval '12 hours' < now()
          and sh.ss + interval '12 hours' > coalesce(((p.admission_date::date + coalesce(p.admission_time,(p.created_at at time zone 'Asia/Kolkata')::time)) at time zone 'Asia/Kolkata'), sh.ss)
          and coalesce(p.admission_status,'Active') <> 'Temporarily Hospitalised'
          and n.cnt < public.nursing_notes_needed(sh.patient_id, sh.ss)$q$,
    p_from, p_to);

  c := c || public.mis_check('np_waiting_approval','Nursing procedure requests waiting for approval over 1 hour','medium','Approval Requests',
    'Requested by the nurse, not yet approved or declined by the Nursing Manager / Admin.',
    $q$select r.requested_at as sort_at, to_char(r.requested_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', r.procedure_code, r.procedure_name, 'by '||r.requested_by_name) as detail, null::numeric as amount
         from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id
        where not coalesce(p.is_trial,false) and r.status='Requested' and r.requested_at < now() - interval '1 hour'$q$,
    p_from, p_to);

  c := c || public.mis_check('np_not_started','Approved nursing procedures not started after 24 hours','low','Approval Requests',
    'Approved, but the nurse has not confirmed it was done (Start). If done, it is also not billed.',
    $q$select r.decision_at as sort_at, to_char(r.decision_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', coalesce(r.category,'Nursing Procedures'), r.procedure_name, 'approved by '||r.decision_by_name) as detail, null::numeric as amount
         from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id
        where not coalesce(p.is_trial,false) and r.status='Approved' and r.decision_at < now() - interval '24 hours'$q$,
    p_from, p_to);

  c := c || public.mis_check('verbal_orders','Telephone / verbal doctor orders not confirmed','medium','Medicines',
    'Doctor''s verbal or telephone order still waiting for written confirmation past its due time.',
    $q$select r.reviewed_at as sort_at, to_char(r.reviewed_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', r.order_mode, r.doctor_name, 'due '||to_char(r.verbal_confirmation_due_at at time zone 'Asia/Kolkata','DD-MM HH12:MI AM')) as detail, null::numeric as amount
         from public.medication_reviews r join public.patients p on p.id=r.patient_id
        where r.verbal_confirmation_status='Pending' and r.verbal_confirmation_due_at < now()
          and not coalesce(p.is_trial,false)$q$,
    p_from, p_to);

  c := c || public.mis_check('physio_not_done','Physiotherapy sessions not done / still pending','low','Physiotherapy Dashboard',
    'Planned sessions marked Not Done, or past their day and still Pending.',
    $q$select (s.session_date + coalesce(s.scheduled_time, time '09:00'))::timestamp at time zone 'Asia/Kolkata' as sort_at,
              to_char(s.session_date,'DD-MM-YYYY')||coalesce(' '||to_char(s.scheduled_time,'HH12:MI AM'),'') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              s.status||coalesce(' · '||nullif(s.reason,''),'') as detail, null::numeric as amount
         from public.physiotherapy_sessions s join public.patients p on p.id=s.patient_id
        where not coalesce(p.is_trial,false) and s.session_date between $1 and $2
          and (s.status='Not Done' or (s.status='Pending' and s.session_date < (now() at time zone 'Asia/Kolkata')::date))$q$,
    p_from, p_to);

  c := c || public.mis_check('diagnostics_overdue','Lab / diagnostic reports not received after 3 days','low','Charge Approvals',
    'Ordered tests whose report is not marked received.',
    $q$select d.ordered_at as sort_at, to_char(d.ordered_at at time zone 'Asia/Kolkata','DD-MM-YYYY') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', d.service_type, d.test_name, d.report_status) as detail, null::numeric as amount
         from public.diagnostic_services d join public.patients p on p.id=d.patient_id
        where not coalesce(p.is_trial,false) and coalesce(d.report_status,'Ordered') not in ('Report Received','Cancelled')
          and d.ordered_at < now() - interval '3 days' and (d.ordered_at at time zone 'Asia/Kolkata')::date <= $2$q$,
    p_from, p_to);

  return jsonb_build_object('key','clinical','title','Clinical','subtitle','Care delivered and recorded — vitals, medicines, notes, escalations, incidents',
                            'kpis',k,'checks',c);
end $f$;
revoke all on function public.mis_section_clinical(date,date) from public, anon, authenticated;

-- ═════════════════════════════════════════ FINANCIAL ═════════════════════════════════════════
create or replace function public.mis_section_financial(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare k jsonb := '[]'; c jsonb := '[]'; pkg text := ''; v_room text; v_nurse text;
  -- signed ledger amount: Charge / Refund add to what the Guest owes; Payment / Advance / Discount reduce it
  bal constant text := $q$ case when t.transaction_type in ('Charge','Refund') then t.amount when t.transaction_type in ('Payment','Advance','Discount') then -t.amount else 0 end $q$;
begin
  -- days already covered by an Assisted Living Package are not expected to have a daily room charge
  if to_regprocedure('public.patient_package_covers_date(uuid,date)') is not null then
    pkg := ' and not public.patient_package_covers_date(gd.patient_id, gd.d)';
  end if;

  -- Key numbers
  k := k || public.mis_kpi('Charged to Guest bills','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type='Charge' and coalesce(t.source_date,(t.transaction_date at time zone 'Asia/Kolkata')::date) between $1 and $2$q$, p_from, p_to, 'posted to Guest bills');
  k := k || public.mis_kpi('Collected','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type in ('Payment','Advance') and (t.transaction_date at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to, 'payments + advances');
  k := k || public.mis_kpi('Discounts given','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type='Discount' and coalesce(t.source_date,(t.transaction_date at time zone 'Asia/Kolkata')::date) between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('Refunds paid','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type='Refund' and (t.transaction_date at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('Due from current Guests','₹', format($q$select coalesce(sum(greatest(b,0)),0) from (select t.patient_id, sum(%s) b from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and coalesce(p.is_active,true) group by 1) x$q$, bal), p_from, p_to, 'today, net of advances');
  k := k || public.mis_kpi('Advance held','₹', format($q$select coalesce(sum(greatest(-b,0)),0) from (select t.patient_id, sum(%s) b from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and coalesce(p.is_active,true) group by 1) x$q$, bal), p_from, p_to, 'today, current Guests');
  k := k || public.mis_kpi('Charge requests raised','', $q$select count(*) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and coalesce(b.status,'')<>'Cancelled' and (coalesce(b.raised_at,b.created_at) at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to, 'Bills & Charges requests');
  k := k || public.mis_kpi('Charge requests approved','', $q$select count(*) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and b.approval_status in ('Approved','Partially Approved') and (coalesce(b.decision_date,b.approved_at) at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to, 'decided in the period');
  k := k || public.mis_kpi('Approved value','₹', $q$select coalesce(sum(coalesce(b.approved_amount,b.final_amount,0)),0) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and b.approval_status in ('Approved','Partially Approved') and (coalesce(b.decision_date,b.approved_at) at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to, 'Bills & Charges approved');
  k := k || public.mis_kpi('Charge requests returned','', $q$select count(*) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and b.approval_status='Rejected' and (coalesce(b.decision_date,b.approved_at,b.updated_at) at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to, 'to Nursing for correction');
  k := k || public.mis_kpi('Nursing Procedures approved','₹', $q$select coalesce(sum(coalesce(b.approved_amount,b.final_amount,0)),0) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and b.category='Nursing Procedures' and b.approval_status in ('Approved','Partially Approved') and (coalesce(b.decision_date,b.approved_at) at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to, 'charged to Guests');
  k := k || public.mis_kpi('Waiting with Accounts','₹', $q$select coalesce(sum(coalesce(b.requested_amount,b.estimated_amount,0)),0) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and coalesce(b.approval_status,'Pending')='Pending' and coalesce(b.status,'Raised') not in ('Posted','Rejected','Cancelled','Recorded') and b.billing_transaction_id is null$q$, p_from, p_to, 'charges pending approval now');
  k := k || public.mis_kpi('Expenses recorded','₹', $q$select coalesce(sum(e.amount),0) from public.samara_monthly_expenses e where e.voided_at is null and e.expense_date between $1 and $2 and e.head !~* 'facility development'$q$, p_from, p_to, 'excl. Facility Development');

  -- Audit checks
  c := c || public.mis_check('charges_pending','Charges waiting with Accounts for over 30 minutes','high','Charge Approvals',
    'Raised by Nursing, not yet approved or returned by Accounts.',
    $q$select coalesce(b.raised_at,b.created_at) as sort_at, to_char(coalesce(b.raised_at,b.created_at) at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', b.category, coalesce(b.service_name,b.description), 'Qty '||coalesce(b.quantity,1), 'by '||b.raised_by_name) as detail,
              coalesce(b.requested_amount,b.estimated_amount) as amount
         from public.bill_charge_requests b join public.patients p on p.id=b.patient_id
        where not coalesce(p.is_trial,false) and coalesce(b.approval_status,'Pending')='Pending'
          and coalesce(b.status,'Raised') not in ('Posted','Rejected','Cancelled','Recorded') and b.billing_transaction_id is null
          and coalesce(b.raised_at,b.created_at) < now() - interval '30 minutes'$q$,
    p_from, p_to);

  c := c || public.mis_check('charges_returned','Charges returned by Accounts and not corrected','medium','Charge Approvals',
    'Returned to Nursing for correction and not resubmitted — the service is not billed until it is.',
    $q$select coalesce(b.decision_date,b.approved_at,b.updated_at) as sort_at, to_char(coalesce(b.decision_date,b.approved_at,b.updated_at) at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', coalesce(b.service_name,b.description), 'raised by '||b.raised_by_name, 'reason: '||coalesce(nullif(b.approval_remarks,''),'—')) as detail,
              coalesce(b.requested_amount,b.estimated_amount) as amount
         from public.bill_charge_requests b join public.patients p on p.id=b.patient_id
        where not coalesce(p.is_trial,false) and b.approval_status='Rejected' and b.resubmitted_as is null
          and coalesce(b.status,'') <> 'Cancelled' and b.charge_date between $1 and $2$q$,
    p_from, p_to);

  -- daily room / nursing charge missing on a day the Guest stayed (today is not checked — it posts after midnight)
  v_room := format($q$select (gd.d::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(gd.d,'DD-MM-YYYY') as date,
              concat_ws(' · ', gd.guest, gd.room) as who, 'No daily room charge for this day' as detail, null::numeric as amount
         from public.mis_guest_days($1,$2) gd join public.patients p on p.id=gd.patient_id
        where gd.d < (now() at time zone 'Asia/Kolkata')::date and nullif(p.room_no,'') is not null and nullif(p.bed_no,'') is not null %s
          and not exists(select 1 from public.billing_transactions t where t.source_key=format('ROOM:%%s:%%s', gd.patient_id, gd.d))$q$, pkg);
  c := c || public.mis_check('room_charge_missing','Daily room charge missing','high','Patient Ledger',
    'A Guest stayed on the day but no automatic room charge was posted (package days are not counted).', v_room, p_from, p_to);

  if to_regprocedure('public.room_tariff_on_date(uuid,date)') is not null then
    v_nurse := format($q$select (gd.d::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(gd.d,'DD-MM-YYYY') as date,
                concat_ws(' · ', gd.guest, gd.room) as who, 'No daily nursing charge (rate ₹'||r.nursing_rate||')' as detail, r.nursing_rate as amount
           from public.mis_guest_days($1,$2) gd join public.patients p on p.id=gd.patient_id
           cross join lateral (select * from public.room_tariff_on_date(gd.patient_id, gd.d) limit 1) r
          where gd.d < (now() at time zone 'Asia/Kolkata')::date and nullif(p.room_no,'') is not null and coalesce(r.nursing_rate,0) > 0 %s
            and not exists(select 1 from public.billing_transactions t where t.source_key=format('NURSING:%%s:%%s', gd.patient_id, gd.d))$q$, pkg);
    c := c || public.mis_check('nursing_charge_missing','Daily nursing charge missing','high','Patient Ledger',
      'The Guest''s room has a nursing rate but no automatic nursing charge was posted for the day.', v_nurse, p_from, p_to);
  end if;

  c := c || public.mis_check('billing_run_errors','Automatic daily billing ran with errors','high','Patient Ledger',
    'The midnight room / nursing charge run reported errors.',
    $q$select coalesce(r.completed_at,r.started_at) as sort_at, to_char(r.charge_date,'DD-MM-YYYY') as date, r.run_type as who,
              concat_ws(' · ', r.status, coalesce(r.error_count,0)||' error(s)') as detail, null::numeric as amount
         from public.daily_billing_runs r
        where r.charge_date between $1 and $2 and (coalesce(r.error_count,0) > 0 or r.status ilike '%fail%')$q$,
    p_from, p_to);

  c := c || public.mis_check('physio_unbilled','Physiotherapy sessions done but not billed','medium','Physiotherapist Accounts',
    'Completed over 24 hours ago with no charge — usually the Guest''s physiotherapy rate is not set.',
    $q$select (s.session_date::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(s.session_date,'DD-MM-YYYY') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              case when exists(select 1 from public.patient_physio_rates r where r.patient_id=s.patient_id and r.effective_from<=s.session_date)
                   then 'Completed session not billed' else 'No Guest physiotherapy rate set' end as detail, null::numeric as amount
         from public.physiotherapy_sessions s join public.patients p on p.id=s.patient_id
        where not coalesce(p.is_trial,false) and s.status='Completed' and s.charge_request_id is null
          and s.session_date between $1 and $2
          and coalesce(s.session_at, s.session_date::timestamp at time zone 'Asia/Kolkata') < now() - interval '24 hours'$q$,
    p_from, p_to);

  c := c || public.mis_check('np_started_not_charged','Nursing procedures done but no charge raised','high','Approval Requests',
    'The nurse confirmed and started the procedure, but no Bills & Charges request exists for it — not billed.',
    $q$select r.started_at as sort_at, to_char(r.started_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', r.procedure_code, r.procedure_name, 'started by '||r.started_by_name) as detail, null::numeric as amount
         from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id
        where not coalesce(p.is_trial,false) and r.status='Started' and r.charge_request_id is null
          and coalesce(r.category,'Nursing Procedures') <> 'Biomedical Equipment'
          and (r.started_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('physio_rate_changes','Guest physiotherapy rate set or changed','medium','Physiotherapist Accounts',
    'New Guest rates entered in the period — check each against what was agreed (e.g. ₹500 entered, then ₹800 the next day).',
    $q$select r.created_at as sort_at, to_char(r.created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              'From '||to_char(r.effective_from,'DD-MM-YYYY')||': ₹'||r.amount||coalesce(' (was ₹'||prev.amount||')','')||' · '||left(r.notes,60) as detail, null::numeric as amount
         from public.patient_physio_rates r join public.patients p on p.id=r.patient_id
         left join lateral (select x.amount from public.patient_physio_rates x where x.patient_id=r.patient_id and x.effective_from<r.effective_from order by x.effective_from desc limit 1) prev on true
        where (r.created_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('approved_differs','Charges approved at a different amount than requested','low','Charge Approvals',
    'Accounts approved more or less than the requested amount (partial approvals included).',
    $q$select coalesce(b.decision_date,b.approved_at) as sort_at, to_char(coalesce(b.decision_date,b.approved_at) at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', coalesce(b.service_name,b.description), 'requested ₹'||b.requested_amount, 'approved ₹'||coalesce(b.approved_amount,b.final_amount), 'by '||b.decision_by_name) as detail,
              coalesce(b.approved_amount,b.final_amount) - b.requested_amount as amount
         from public.bill_charge_requests b join public.patients p on p.id=b.patient_id
        where not coalesce(p.is_trial,false) and b.approval_status in ('Approved','Partially Approved')
          and b.requested_amount > 0 and coalesce(b.approved_amount,b.final_amount) is distinct from b.requested_amount
          and (coalesce(b.decision_date,b.approved_at) at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('possible_duplicates','Possible duplicate charges','medium','Charge Approvals',
    'Same Guest, same item, same date and time raised more than once (not returned).',
    $q$select max(b.created_at) as sort_at, to_char(b.charge_date,'DD-MM-YYYY')||coalesce(' '||to_char(b.service_datetime at time zone 'Asia/Kolkata','HH12:MI AM'),'') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              coalesce(b.service_name,b.description)||' × '||count(*)||' entries' as detail, sum(coalesce(b.approved_amount,b.final_amount,b.requested_amount,0)) as amount
         from public.bill_charge_requests b join public.patients p on p.id=b.patient_id
        where not coalesce(p.is_trial,false) and coalesce(b.approval_status,'Pending') <> 'Rejected' and coalesce(b.status,'') <> 'Cancelled'
          and b.charge_date between $1 and $2 and b.service_datetime is not null
        group by b.patient_id, p.title, p.full_name, coalesce(b.service_name,b.description), b.charge_date, b.service_datetime, b.quantity
       having count(*) > 1$q$,
    p_from, p_to);

  c := c || public.mis_check('rate_not_set','Service items with no rate in Charge Master','low','Charge Master',
    'Active items that cannot be approved until Admin fixes a rate.',
    $q$select c.updated_at as sort_at, c.charge_code as date, c.category as who, c.service_name as detail, null::numeric as amount
         from public.charge_tariff_master c where coalesce(c.is_active,true) and c.amount is null
           and c.category not in ('Consumables','Pharmacy','Pharmacy & Basic Supplies')$q$,
    p_from, p_to);

  c := c || public.mis_check('store_rate_not_set','Stores / Pharmacy items with no charge rate','low','Stores Master',
    'Active stock items given to Guests that have no charge rate — they cannot be billed.',
    $q$select null::timestamptz as sort_at, i.item_code as date, i.item_category as who, i.item_name as detail, null::numeric as amount
         from public.consumable_store_items i
        where coalesce(i.active,true) and i.item_category in ('Consumables','Pharmacy') and coalesce(i.charge_rate,0) <= 0$q$,
    p_from, p_to);

  c := c || public.mis_check('receipt_no_reference','Non-cash receipts with no transaction reference','medium','Payments',
    'UPI / bank / card receipts should carry the transaction reference for reconciliation.',
    $q$select t.transaction_date as sort_at, to_char(t.transaction_date at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', t.transaction_type, t.payment_mode) as detail, t.amount as amount
         from public.billing_transactions t join public.patients p on p.id=t.patient_id
        where not coalesce(p.is_trial,false) and t.transaction_type in ('Payment','Advance')
          and coalesce(t.payment_mode,'') not in ('Cash','Not applicable','') and nullif(trim(coalesce(t.payment_reference,'')),'') is null
          and coalesce(t.description,'') !~* '(reference|razorpay payment id|utr|txn)'
          and (t.transaction_date at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('receipts_not_sent','Payment receipts not sent to the family','medium','Payments',
    'The automatic WhatsApp receipt failed or its status is unknown.',
    $q$select r.created_at as sort_at, to_char(r.created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', r.source, r.receipt_status, left(r.receipt_error,80)) as detail, t.amount as amount
         from public.ledger_payment_receipts r join public.billing_transactions t on t.id=r.billing_transaction_id
         join public.patients p on p.id=t.patient_id
        where r.receipt_status in ('Failed','Unknown') and (r.created_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('online_recovered','Online payments recorded by the background check','low','Payments',
    'Paid on the Family Portal but the portal did not confirm — recorded later by the safety net. Check the receipt went.',
    $q$select t.transaction_date as sort_at, to_char(t.transaction_date at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who, 'Razorpay · recorded by background check' as detail, t.amount as amount
         from public.billing_transactions t join public.patients p on p.id=t.patient_id
        where t.description ilike '%background check%' and (t.transaction_date at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('refunds_pending','Refunds waiting for verification / approval','medium','Refunds',
    'Discharge refunds not yet paid.',
    $q$select coalesce(r.accounts_verified_at, d.completed_at, d.created_at) as sort_at, to_char(coalesce(d.completed_at,d.created_at) at time zone 'Asia/Kolkata','DD-MM-YYYY') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who, r.status as detail,
              coalesce(r.admin_confirm_amount, r.accounts_confirm_amount, r.accounts_amount, r.calculated_refund) as amount
         from public.discharge_refund_requests r join public.patient_discharges d on d.id=r.discharge_id
         join public.patients p on p.id=d.patient_id
        where r.status in ('Pending Accounts Verification','Pending Admin Approval')$q$,
    p_from, p_to);

  c := c || public.mis_check('discharged_dues','Discharged Guests who left with dues pending','medium','Discharge Clearance',
    'Departure allowed with dues by Admin / Director, not yet settled.',
    $q$select d.dues_approved_at as sort_at, to_char(coalesce(d.completed_at,d.dues_approved_at) at time zone 'Asia/Kolkata','DD-MM-YYYY') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', 'reminders sent: '||coalesce(d.dues_reminder_count,0), left(d.dues_reason,60)) as detail,
              public.samara_patient_balance(d.patient_id) as amount
         from public.patient_discharges d join public.patients p on p.id=d.patient_id
        where d.dues_status='Pending'$q$,
    p_from, p_to);

  c := c || public.mis_check('high_dues','Current Guests with a balance due','low','Patient Ledger',
    'Amount each current Guest owes today (after advances), largest first.',
    format($q$select to_timestamp(x.b::double precision) as sort_at, coalesce(p.patient_id,'') as date,
              concat_ws(' · ', concat_ws(' ', nullif(p.title,''), p.full_name), nullif(concat_ws('-',nullif(p.room_no,''),nullif(p.bed_no,'')),'')) as who,
              'Balance due' as detail, x.b as amount
         from (select t.patient_id, sum(%s) b from public.billing_transactions t group by 1) x
         join public.patients p on p.id=x.patient_id
        where coalesce(p.is_active,true) and not coalesce(p.is_trial,false) and x.b > 0$q$, bal),
    p_from, p_to);

  c := c || public.mis_check('expense_no_bill','Expenses recorded without a bill','low','Monthly Expenses',
    'No bill photo attached — a reason was given instead (or nothing).',
    $q$select e.created_at as sort_at, to_char(e.expense_date,'DD-MM-YYYY') as date, coalesce(e.paid_to, e.created_by_name) as who,
              concat_ws(' · ', e.head, left(e.description,50), 'reason: '||coalesce(nullif(e.no_bill_reason,''),'none given')) as detail, e.amount as amount
         from public.samara_monthly_expenses e
        where e.voided_at is null and e.expense_date between $1 and $2 and nullif(e.bill_path,'') is null$q$,
    p_from, p_to);

  return jsonb_build_object('key','financial','title','Financial','subtitle','Billing complete and correct, money collected, receipts, dues, expenses',
                            'kpis',k,'checks',c);
end $f$;
revoke all on function public.mis_section_financial(date,date) from public, anon, authenticated;

-- ═════════════════════════════════════════ OPERATIONAL ═════════════════════════════════════════
create or replace function public.mis_section_operational(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare k jsonb := '[]'; c jsonb := '[]';
  -- beds for Guests (Samara office / store rows are not beds)
  beds constant text := $q$ select b.* from public.room_beds b
     where lower(regexp_replace(concat_ws('|',b.status,b.room_type,b.room_no,b.bed_no),'[^a-z|]','','gi')) !~ '(^|\|)(samaraoffice|samarastore)(\||$)' $q$;
begin
  -- Key numbers
  k := k || public.mis_kpi('Beds','', format($q$select count(*) from (%s) b$q$, beds), p_from, p_to, 'Guest beds');
  k := k || public.mis_kpi('Occupancy now','%', format($q$select round(100.0*(select count(*) from public.patients p where coalesce(p.is_active,true) and not coalesce(p.is_trial,false) and nullif(p.room_no,'') is not null and coalesce(p.admission_status,'Active') not in ('Draft','Admission Pending','Discharged'))/nullif((select count(*) from (%s) b),0),1)$q$, beds), p_from, p_to);
  k := k || public.mis_kpi('Average occupancy','%', format($q$select round(100.0*(select count(*) from public.mis_guest_days($1,$2))/nullif((select count(*) from (%s) b)*((least($2,(now() at time zone 'Asia/Kolkata')::date)-$1)+1),0),1)$q$, beds), p_from, p_to, 'Guest-days ÷ bed-days');
  k := k || public.mis_kpi('Admissions','', $q$select count(*) from public.patients p where not coalesce(p.is_trial,false) and p.admission_date::date between $1 and $2 and coalesce(p.admission_status,'Active') not in ('Draft','Admission Pending')$q$, p_from, p_to);
  k := k || public.mis_kpi('Discharges','', $q$select count(*) from public.patient_discharges d join public.patients p on p.id=d.patient_id where not coalesce(p.is_trial,false) and d.status='Completed' and (coalesce(d.actual_departure_at,d.completed_at) at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('New enquiries','', $q$select count(*) from public.pre_admission_enquiries e where (e.created_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('Active staff','', $q$select count(*) from public.profiles where coalesce(active,true) and coalesce(is_active,true)$q$, p_from, p_to);
  k := k || public.mis_kpi('Stock items out of stock','', $q$select count(*) from public.consumable_store_stock s join public.consumable_store_items i on i.id=s.item_id where coalesce(s.active,true) and i.item_category in ('Consumables','Pharmacy') and s.balance_qty<=0 and s.total_in>0$q$, p_from, p_to, 'now');
  k := k || public.mis_kpi('App errors seen by staff','', $q$select count(*) from public.client_errors e where (e.created_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to);

  -- Audit checks
  c := c || public.mis_check('consent_pending','Signed admission consent not uploaded','medium','Patients',
    'Current Guests whose signed consent form is still awaited.',
    $q$select null::timestamptz as sort_at, to_char(p.admission_date,'DD-MM-YYYY') as date,
              concat_ws(' · ', concat_ws(' ', nullif(p.title,''), p.full_name), nullif(concat_ws('-',nullif(p.room_no,''),nullif(p.bed_no,'')),'')) as who,
              p.admission_consent_status||coalesce(' · '||nullif(p.admission_consent_exception_reason,''),'') as detail, null::numeric as amount
         from public.patients p
        where coalesce(p.is_active,true) and not coalesce(p.is_trial,false) and coalesce(p.admission_status,'Active') not in ('Draft','Discharged')
          and p.admission_consent_status in ('Awaiting Signed Consent','Upload Pending - Exception')$q$,
    p_from, p_to);

  c := c || public.mis_check('stock_out','Pharmacy / consumable items out of stock','medium','Stock Report',
    'Items used before (received at least once) whose balance is now nil.',
    $q$select s.last_movement_at as sort_at, coalesce(i.item_code,'') as date, i.item_category as who,
              s.item_name||' — nil stock' as detail, null::numeric as amount
         from public.consumable_store_stock s join public.consumable_store_items i on i.id=s.item_id
        where coalesce(s.active,true) and i.item_category in ('Consumables','Pharmacy') and s.balance_qty<=0 and s.total_in>0$q$,
    p_from, p_to);

  c := c || public.mis_check('stock_low','Items at or below re-order level','low','Stock Report',
    'Balance has reached the re-order level — order soon.',
    $q$select s.last_movement_at as sort_at, coalesce(i.item_code,'') as date, i.item_category as who,
              s.item_name||' — '||concat_ws(' ',s.balance_qty,nullif(s.unit,''))||' left (re-order at '||s.reorder_level||')' as detail, null::numeric as amount
         from public.consumable_store_stock s join public.consumable_store_items i on i.id=s.item_id
        where coalesce(s.active,true) and s.balance_qty>0 and coalesce(s.reorder_level,0)>0 and s.balance_qty<=s.reorder_level$q$,
    p_from, p_to);

  c := c || public.mis_check('stock_expired','Expired batches while the item is still in stock','high','Stock Report',
    'A received batch is past its expiry date and the item still has stock — check the shelf and remove it.',
    $q$select (r.expiry_date::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(r.expiry_date,'DD-MM-YYYY') as date,
              coalesce(i.item_category,'') as who,
              i.item_name||coalesce(' · batch '||nullif(r.batch_no,''),'')||' · stock '||s.balance_qty as detail, null::numeric as amount
         from public.consumable_store_receipts r join public.consumable_store_items i on i.id=r.item_id
         join public.consumable_store_stock s on s.item_id=r.item_id
        where r.voided_at is null and r.expiry_date < (now() at time zone 'Asia/Kolkata')::date and s.balance_qty>0 and coalesce(i.active,true)
          and r.received_at > now() - interval '18 months'$q$,
    p_from, p_to);

  c := c || public.mis_check('stock_expiring','Batches expiring within 30 days','low','Stock Report',
    'Use first or return to the vendor.',
    $q$select (r.expiry_date::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(r.expiry_date,'DD-MM-YYYY') as date,
              coalesce(i.item_category,'') as who,
              i.item_name||coalesce(' · batch '||nullif(r.batch_no,''),'')||' · stock '||s.balance_qty as detail, null::numeric as amount
         from public.consumable_store_receipts r join public.consumable_store_items i on i.id=r.item_id
         join public.consumable_store_stock s on s.item_id=r.item_id
        where r.voided_at is null and s.balance_qty>0 and coalesce(i.active,true)
          and r.expiry_date between (now() at time zone 'Asia/Kolkata')::date and (now() at time zone 'Asia/Kolkata')::date + 30$q$,
    p_from, p_to);

  c := c || public.mis_check('indent_not_received','Indents handed over but not marked Received (20+ min)','medium','Patient Consumables',
    'The store handed the items over; the nurse has not pressed Received.',
    $q$select n.handed_over_at as sort_at, to_char(n.handed_over_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(concat_ws(' ', nullif(p.title,''), p.full_name),'—') as who,
              concat_ws(' · ', 'CI-'||lpad(n.indent_no::text,5,'0'), n.item_name, coalesce(n.handed_over_qty,n.approved_qty)||' '||coalesce(n.unit,''), 'nurse '||n.initiated_by_name) as detail, null::numeric as amount
         from public.patient_consumable_indents n left join public.patients p on p.id=n.patient_id
        where n.status='Handed Over' and n.handed_over_at < now() - interval '20 minutes'$q$,
    p_from, p_to);

  c := c || public.mis_check('indent_waiting','Indents waiting for the store over 2 hours','medium','Patient Consumables',
    'Raised by Nursing, not yet approved / handed over.',
    $q$select n.initiated_at as sort_at, to_char(n.initiated_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(concat_ws(' ', nullif(p.title,''), p.full_name),'—') as who,
              concat_ws(' · ', 'CI-'||lpad(n.indent_no::text,5,'0'), n.item_name, n.requested_qty||' '||coalesce(n.unit,''), n.status) as detail, null::numeric as amount
         from public.patient_consumable_indents n left join public.patients p on p.id=n.patient_id
        where n.status in ('Initiated','Pending','Approved','Partially Approved') and n.initiated_at < now() - interval '2 hours'$q$,
    p_from, p_to);

  c := c || public.mis_check('equipment_faults','Equipment faults not resolved','high','Biomedical Equipment',
    'Faults reported by Nursing and still open.',
    $q$select r.requested_at as sort_at, to_char(r.requested_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(e.asset_no, r.item_name, 'Equipment') as who, concat_ws(' · ', e.equipment_name, left(r.details,80)) as detail, null::numeric as amount
         from public.bme_care_requests r left join public.biomedical_equipment e on e.id=r.equipment_id
        where r.kind='Fault' and r.status='Pending'$q$,
    p_from, p_to);

  c := c || public.mis_check('equipment_service','Equipment service overdue','medium','Biomedical Equipment',
    'Next service date has passed.',
    $q$select (e.next_service_due::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(e.next_service_due,'DD-MM-YYYY') as date,
              e.asset_no as who, concat_ws(' · ', e.equipment_name, e.status) as detail, null::numeric as amount
         from public.biomedical_equipment e
        where coalesce(e.active,true) and e.status <> 'Out of Service' and e.next_service_due < (now() at time zone 'Asia/Kolkata')::date$q$,
    p_from, p_to);

  c := c || public.mis_check('no_nurse_rostered','Nursing shifts with no nurse rostered','high','Duty Assignment',
    'Days in the duty roster where the Day or Night shift has no nurse assigned.',
    $q$with days as (select distinct a.duty_date as d from public.duty_assignments a where a.duty_date between $1 and $2),
       sh as (select d, x.s from days cross join (values ('Day'),('Night')) x(s)),
       cnt as (
         select sh.d, sh.s, count(distinct pr.id) as n
           from sh left join public.duty_assignments a on a.duty_date=sh.d and coalesce(a.status,'Assigned')='Assigned' and not coalesce(a.is_weekly_off,false)
                and ((sh.s='Night' and a.shift ilike 'Night%') or (sh.s='Day' and (a.shift ilike 'Day%' or a.shift ilike 'Morning%' or a.shift ilike 'General%')))
           left join public.profiles pr on (pr.id=a.employee_id or pr.auth_user_id=a.employee_id) and pr.role='Nurse'
          group by 1,2)
       select (cnt.d::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(cnt.d,'DD-MM-YYYY') as date, cnt.s||' shift' as who,
              'No nurse in the duty roster' as detail, null::numeric as amount
         from cnt where cnt.n = 0$q$,
    p_from, p_to);

  c := c || public.mis_check('staff_not_back','Staff not back on duty after leave','medium','Staff Leave Calendar',
    'Leave ended but return to duty is not recorded.',
    $q$select r.alert_at as sort_at, to_char(r.due_date,'DD-MM-YYYY') as date, r.employee_name as who,
              concat_ws(' · ', r.department, 'due back '||to_char(r.due_date,'DD-MM'), r.late_days||' day(s) late') as detail, null::numeric as amount
         from public.staff_return_rows($1, (now() at time zone 'Asia/Kolkata')::date, now()) r
        where r.return_status='Not back'$q$,
    p_from, p_to);

  c := c || public.mis_check('leave_waiting','Leave requests waiting for approval','low','Leave Approvals',
    'Pending leave requests starting within 3 days or already started.',
    $q$select (a.from_date::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(a.from_date,'DD-MM-YYYY')||' → '||to_char(a.to_date,'DD-MM-YYYY') as date,
              coalesce(pr.full_name,'Staff') as who, concat_ws(' · ', a.request_type, a.leave_type) as detail, null::numeric as amount
         from public.absence_requests a left join public.profiles pr on pr.id=a.employee_id or pr.auth_user_id=a.employee_id
        where lower(coalesce(a.status,'')) = 'pending' and a.from_date <= (now() at time zone 'Asia/Kolkata')::date + 3$q$,
    p_from, p_to);

  c := c || public.mis_check('discharge_overdue','Discharges past the proposed date and not completed','medium','Discharge',
    'Discharge started, proposed date passed, not completed.',
    $q$select (d.proposed_discharge_date::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(d.proposed_discharge_date,'DD-MM-YYYY') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ', d.status, 'Management '||coalesce(d.management_status,'Pending'), 'Accounts '||coalesce(d.accounts_status,'Pending')) as detail, null::numeric as amount
         from public.patient_discharges d join public.patients p on p.id=d.patient_id
        where not coalesce(p.is_trial,false) and d.status not in ('Completed','Cancelled','Closed')
          and d.proposed_discharge_date < (now() at time zone 'Asia/Kolkata')::date$q$,
    p_from, p_to);

  c := c || public.mis_check('enquiry_followup','Enquiry follow-ups overdue','medium','Enquiry Register',
    'Open enquiries whose next follow-up date has passed — possible lost admissions.',
    $q$select (e.next_follow_up::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(e.next_follow_up,'DD-MM-YYYY') as date,
              coalesce(e.patient_name,'Enquiry') as who, concat_ws(' · ', e.enquiry_no, e.status, e.source) as detail, null::numeric as amount
         from public.pre_admission_enquiries e
        where coalesce(e.status,'New') not in ('Admitted','Closed','Converted to Admission')
          and e.next_follow_up::date < (now() at time zone 'Asia/Kolkata')::date$q$,
    p_from, p_to);

  c := c || public.mis_check('food_not_received','Food orders not received','medium','Food & Diet',
    'Ordered for a past meal and still not marked received.',
    $q$select o.created_at as sort_at, coalesce(o.data->>'date','')||' '||coalesce(o.data->>'slot','') as date,
              coalesce(o.data->>'vendor_name','Vendor') as who, 'Status: '||o.status as detail, null::numeric as amount
         from public.fv_orders o
        where o.status in ('Ordered','Partial') and nullif(o.data->>'date','')::date < (now() at time zone 'Asia/Kolkata')::date
          and nullif(o.data->>'date','')::date >= $1 - 7$q$,
    p_from, p_to);

  c := c || public.mis_check('whatsapp_failed','Food-vendor WhatsApp messages that failed','medium','Food & Diet',
    'Order / modification messages Meta could not deliver.',
    $q$select m.updated_at as sort_at, to_char(m.updated_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(m.kind,'message') as who, coalesce(left(m.error,100),'Failed') as detail, null::numeric as amount
         from public.fv_messages m
        where m.status='Failed' and (m.updated_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  c := c || public.mis_check('app_errors','App errors seen by staff','low','System Health',
    'Errors the ERP recorded on staff screens — each line is one kind of error, with how many times it happened.',
    $q$select max(e.created_at) as sort_at, count(*)||'×' as date, coalesce(e.page,'—') as who, min(left(e.message,120)) as detail, null::numeric as amount
         from public.client_errors e
        where (e.created_at at time zone 'Asia/Kolkata')::date between $1 and $2
        group by e.page, left(regexp_replace(coalesce(e.message,''),'[0-9a-f]{8}-[0-9a-f-]{27}|[0-9]+','#','gi'),80)$q$,
    p_from, p_to);

  return jsonb_build_object('key','operational','title','Operational','subtitle','Beds, stores, equipment, staff roster, discharges, enquiries, food, system',
                            'kpis',k,'checks',c);
end $f$;
revoke all on function public.mis_section_operational(date,date) from public, anon, authenticated;

-- ═════════════════════════════════ DISCREPANCIES & DEVIATIONS (analysis) ═════════════════════════════════
-- Entries compared with each other and with what should be true: repeated charges close together, charges with no
-- matching clinical record, rates different from Charge Master, unusual quantities, charges outside the stay, readings
-- that are impossible or copied, entries made in a batch, doses given early or twice, receipts entered twice.
create or replace function public.mis_section_analysis(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare k jsonb := '[]'; c jsonb := '[]';
  -- every live charge request (not returned / cancelled) with one "service time" and one item key
  ch constant text := $q$
    select b.*, coalesce(b.service_datetime, b.raised_at, b.created_at) as svc_at,
           coalesce(nullif(b.charge_item_code,''), b.store_item_id::text, lower(trim(coalesce(b.service_name,b.description)))) as item_key,
           coalesce(b.service_name,b.description,'Charge') as item_name,
           concat_ws(' ', nullif(p.title,''), p.full_name) as guest
      from public.bill_charge_requests b join public.patients p on p.id=b.patient_id
     where not coalesce(p.is_trial,false) and coalesce(b.approval_status,'Pending') <> 'Rejected'
       and coalesce(b.status,'') not in ('Cancelled') $q$;
  -- blood-sugar type charges
  sugar constant text := $q$ (item_name ~* '(blood\s*sugar|glucose\s*monitor|grbs|cbg|rbs|glucometer)') $q$;
begin
  k := k || public.mis_kpi('Charges analysed','', format($q$with x as (%s) select count(*) from x where (x.svc_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, ch), p_from, p_to);
  k := k || public.mis_kpi('Vitals readings analysed','', $q$select count(*) from public.vital_signs v where (v.recorded_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('Medicine entries analysed','', $q$select count(*) from public.medication_administrations a where a.scheduled_date between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('Blood sugar readings','', $q$select count(*) from public.vital_signs v where v.blood_sugar is not null and v.blood_sugar::text not in ('','0') and (v.recorded_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, p_from, p_to);
  k := k || public.mis_kpi('Blood sugar charges','', format($q$with x as (%s) select coalesce(sum(coalesce(x.quantity,1)),0) from x where %s and (x.svc_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, ch, sugar), p_from, p_to);

  -- 1. the same item charged again for the same Guest within 2 hours (e.g. Blood Sugar Monitoring twice in 15 minutes)
  c := c || public.mis_check('repeat_charge_2h','Same item charged again for the same Guest within 2 hours','high','Charge Approvals',
    'Each line is a charge raised shortly after an earlier charge of the same item for the same Guest — check whether the service was really given twice.',
    format($q$with x as (%s), y as (
         select x.*, lag(x.svc_at) over w as prev_at, lag(x.raised_by_name) over w as prev_by, lag(x.id) over w as prev_id
           from x window w as (partition by x.patient_id, x.item_key order by x.svc_at, x.created_at))
       select y.svc_at as sort_at, to_char(y.svc_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date, y.guest as who,
              y.item_name||' — again '||greatest(0,round(extract(epoch from (y.svc_at-y.prev_at))/60))::int||' min after the previous charge'
                ||' (by '||coalesce(y.raised_by_name,'?')||coalesce(', earlier by '||y.prev_by,'')||') · '||coalesce(y.approval_status,'Pending') as detail,
              coalesce(y.approved_amount,y.final_amount,y.requested_amount,y.estimated_amount) as amount
         from y
        where y.prev_at is not null and y.svc_at - y.prev_at < interval '2 hours'
          and (y.svc_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, ch),
    p_from, p_to);

  -- 2. more blood-sugar charges than blood-sugar readings recorded for the Guest that day
  c := c || public.mis_check('sugar_charge_vs_reading','Blood sugar charged more times than it was recorded','high','Vital Signs',
    'Per Guest per day: blood-sugar charges compared with blood-sugar readings entered in Vital Signs.',
    format($q$with x as (%s), cg as (
         select x.patient_id, x.guest, (x.svc_at at time zone 'Asia/Kolkata')::date as d, sum(coalesce(x.quantity,1)) as n, sum(coalesce(x.approved_amount,x.final_amount,x.requested_amount,0)) as amt
           from x where %s and (x.svc_at at time zone 'Asia/Kolkata')::date between $1 and $2 group by 1,2,3),
       rd as (
         select v.patient_id, (v.recorded_at at time zone 'Asia/Kolkata')::date as d, count(*) as n
           from public.vital_signs v where v.blood_sugar is not null and v.blood_sugar::text not in ('','0')
            and (v.recorded_at at time zone 'Asia/Kolkata')::date between $1 and $2 group by 1,2)
       select (cg.d::timestamp at time zone 'Asia/Kolkata') as sort_at, to_char(cg.d,'DD-MM-YYYY') as date, cg.guest as who,
              cg.n||' charged · '||coalesce(rd.n,0)||' reading(s) recorded' as detail, cg.amt as amount
         from cg left join rd on rd.patient_id=cg.patient_id and rd.d=cg.d
        where cg.n > coalesce(rd.n,0)$q$, ch, sugar),
    p_from, p_to);

  -- 3. approved price per unit differs from the Charge Master rate (service items; stores, physio, outside bills excluded)
  c := c || public.mis_check('rate_deviation','Approved price different from the Charge Master rate','medium','Charge Approvals',
    'Approved amount ÷ quantity is not the fixed Charge Master rate for that item.',
    $q$select coalesce(b.decision_date,b.approved_at) as sort_at, to_char(coalesce(b.decision_date,b.approved_at) at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              coalesce(b.service_name,b.description)||' · rate ₹'||t.amount||' × '||coalesce(b.quantity,1)||' = ₹'||(t.amount*coalesce(b.quantity,1))
                ||', approved ₹'||coalesce(b.approved_amount,b.final_amount)||' by '||coalesce(b.decision_by_name,'?') as detail,
              coalesce(b.approved_amount,b.final_amount) - t.amount*coalesce(b.quantity,1) as amount
         from public.bill_charge_requests b join public.patients p on p.id=b.patient_id
         join public.charge_tariff_master t on t.charge_code=b.charge_item_code and t.amount is not null
        where not coalesce(p.is_trial,false) and b.approval_status in ('Approved','Partially Approved')
          and b.physiotherapy_session_id is null and b.outside_paid_by is null and not coalesce(b.bill_available,false)
          and b.category not in ('Consumables','Pharmacy','Pharmacy & Basic Supplies')
          and abs(coalesce(b.approved_amount,b.final_amount) - t.amount*coalesce(b.quantity,1)) >= 1
          and (coalesce(b.decision_date,b.approved_at) at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  -- 4. quantity far above what is normal for that item
  c := c || public.mis_check('unusual_quantity','Unusually large quantity charged','medium','Charge Approvals',
    'Quantity is more than 3 times the usual quantity for that item (last 90 days).',
    format($q$with x as (%s), norm as (
         select item_key, percentile_cont(0.5) within group (order by coalesce(quantity,1)) as med, count(*) as n
           from x where x.svc_at > now() - interval '90 days' group by 1)
       select x.svc_at as sort_at, to_char(x.svc_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date, x.guest as who,
              x.item_name||' · qty '||x.quantity||' (usual '||round(norm.med::numeric,1)||') · by '||coalesce(x.raised_by_name,'?') as detail,
              coalesce(x.approved_amount,x.final_amount,x.requested_amount) as amount
         from x join norm on norm.item_key=x.item_key
        where norm.n >= 5 and coalesce(x.quantity,1) > greatest(2, 3*norm.med)
          and (x.svc_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, ch),
    p_from, p_to);

  -- 5. charged for a day the Guest was not with Samara
  c := c || public.mis_check('charge_outside_stay','Charge dated before admission or after departure','high','Patient Ledger',
    'The service date is outside the Guest''s stay.',
    format($q$with x as (%s)
       select x.svc_at as sort_at, to_char(x.charge_date,'DD-MM-YYYY') as date, x.guest as who,
              x.item_name||' · admitted '||to_char(p.admission_date,'DD-MM-YYYY')||coalesce(' · left '||to_char(coalesce(public.discharge_billing_cutoff(p.id),p.discharge_date::date),'DD-MM-YYYY'),'') as detail,
              coalesce(x.approved_amount,x.final_amount,x.requested_amount) as amount
         from x join public.patients p on p.id=x.patient_id
        where x.charge_date between $1 and $2
          and (x.charge_date < p.admission_date::date
               or (not coalesce(p.is_active,true) and x.charge_date > coalesce(public.discharge_billing_cutoff(p.id),p.discharge_date::date)))$q$, ch),
    p_from, p_to);

  -- 6. charge raised long after, or before, the service
  c := c || public.mis_check('late_billing','Charges raised more than 48 hours after the service','low','Charge Approvals',
    'Late billing — risk of missed charges.',
    format($q$with x as (%s)
       select x.raised_at as sort_at, to_char(x.service_datetime at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date, x.guest as who,
              x.item_name||' · raised '||to_char(x.raised_at at time zone 'Asia/Kolkata','DD-MM HH12:MI AM')||' by '||coalesce(x.raised_by_name,'?') as detail,
              coalesce(x.approved_amount,x.final_amount,x.requested_amount) as amount
         from x where x.service_datetime is not null and x.raised_at - x.service_datetime > interval '48 hours'
          and (x.raised_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, ch),
    p_from, p_to);
  c := c || public.mis_check('charged_before_service','Charges raised before the service time','medium','Charge Approvals',
    'The service time is more than an hour after the charge was raised — charged before it was done.',
    format($q$with x as (%s)
       select x.raised_at as sort_at, to_char(x.service_datetime at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date, x.guest as who,
              x.item_name||' · raised at '||to_char(x.raised_at at time zone 'Asia/Kolkata','DD-MM HH12:MI AM')||' by '||coalesce(x.raised_by_name,'?') as detail,
              coalesce(x.approved_amount,x.final_amount,x.requested_amount) as amount
         from x where x.service_datetime is not null and x.service_datetime - x.raised_at > interval '1 hour'
          and (x.raised_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, ch),
    p_from, p_to);

  -- 7. vitals readings that cannot be right (typing errors)
  c := c || public.mis_check('vitals_implausible','Vitals readings that look like typing errors','medium','Vital Signs',
    'Outside what is humanly possible — e.g. temperature 9.8, SpO₂ above 100, BP 1200, sugar 9.',
    $q$select v.recorded_at as sort_at, to_char(v.recorded_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              concat_ws(' · ',
                case when t.c is not null and (t.c<33 or t.c>43) then 'Temp '||v.temperature end,
                case when nullif(v.spo2::text,'')::numeric not between 50 and 100 and nullif(v.spo2::text,'')::numeric<>0 then 'SpO₂ '||v.spo2 end,
                case when nullif(v.pulse::text,'')::numeric not between 25 and 220 and nullif(v.pulse::text,'')::numeric<>0 then 'Pulse '||v.pulse end,
                case when nullif(v.systolic::text,'')::numeric not between 50 and 260 and nullif(v.systolic::text,'')::numeric<>0 then 'Systolic '||v.systolic end,
                case when nullif(v.diastolic::text,'')::numeric not between 25 and 160 and nullif(v.diastolic::text,'')::numeric<>0 then 'Diastolic '||v.diastolic end,
                case when nullif(v.diastolic::text,'')::numeric >= nullif(v.systolic::text,'')::numeric then 'Diastolic ≥ systolic' end,
                case when nullif(v.respiration::text,'')::numeric not between 5 and 60 and nullif(v.respiration::text,'')::numeric<>0 then 'Resp '||v.respiration end,
                case when nullif(v.blood_sugar::text,'')::numeric not between 20 and 600 and nullif(v.blood_sugar::text,'')::numeric<>0 then 'Sugar '||v.blood_sugar end) as detail,
              null::numeric as amount
         from public.vital_signs v join public.patients p on p.id=v.patient_id
         cross join lateral (select case when nullif(v.temperature::text,'')::numeric between 70 and 115 then (nullif(v.temperature::text,'')::numeric-32)*5/9
                                         when nullif(v.temperature::text,'')::numeric = 0 then null
                                         else nullif(v.temperature::text,'')::numeric end as c) t
        where not coalesce(p.is_trial,false) and (v.recorded_at at time zone 'Asia/Kolkata')::date between $1 and $2
          and ((t.c is not null and (t.c<33 or t.c>43))
            or (nullif(v.spo2::text,'')::numeric not between 50 and 100 and nullif(v.spo2::text,'')::numeric<>0)
            or (nullif(v.pulse::text,'')::numeric not between 25 and 220 and nullif(v.pulse::text,'')::numeric<>0)
            or (nullif(v.systolic::text,'')::numeric not between 50 and 260 and nullif(v.systolic::text,'')::numeric<>0)
            or (nullif(v.diastolic::text,'')::numeric not between 25 and 160 and nullif(v.diastolic::text,'')::numeric<>0)
            or nullif(v.diastolic::text,'')::numeric >= nullif(v.systolic::text,'')::numeric
            or (nullif(v.respiration::text,'')::numeric not between 5 and 60 and nullif(v.respiration::text,'')::numeric<>0)
            or (nullif(v.blood_sugar::text,'')::numeric not between 20 and 600 and nullif(v.blood_sugar::text,'')::numeric<>0))$q$,
    p_from, p_to);

  -- 8. a vitals reading exactly the same as the Guest's previous one (copied, not measured?)
  c := c || public.mis_check('vitals_copied','Vitals exactly the same as the previous reading','medium','Vital Signs',
    'Temperature, BP, pulse and SpO₂ all identical to the Guest''s previous reading — check they were really measured.',
    $q$with v as (
         select v.*, lag(row(v.temperature,v.systolic,v.diastolic,v.pulse,v.spo2)::text) over (partition by v.patient_id order by v.recorded_at) as prev_set,
                row(v.temperature,v.systolic,v.diastolic,v.pulse,v.spo2)::text as this_set,
                lag(v.recorded_at) over (partition by v.patient_id order by v.recorded_at) as prev_at
           from public.vital_signs v where v.recorded_at >= ($1::timestamp at time zone 'Asia/Kolkata') - interval '2 days')
       select v.recorded_at as sort_at, to_char(v.recorded_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              'Same as reading at '||to_char(v.prev_at at time zone 'Asia/Kolkata','DD-MM HH12:MI AM')||' · T '||coalesce(v.temperature::text,'-')||' BP '||coalesce(v.systolic::text,'-')||'/'||coalesce(v.diastolic::text,'-')||' P '||coalesce(v.pulse::text,'-')||' SpO₂ '||coalesce(v.spo2::text,'-')||coalesce(' · by '||pr.full_name,'') as detail,
              null::numeric as amount
         from v join public.patients p on p.id=v.patient_id left join public.profiles pr on pr.id=v.recorded_by or pr.auth_user_id=v.recorded_by
        where not coalesce(p.is_trial,false) and v.prev_set = v.this_set
          and num_nonnulls(v.temperature,v.systolic,v.diastolic,v.pulse,v.spo2) >= 4
          and (v.recorded_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  -- 9. one staff member entering vitals for many Guests within 10 minutes (entered later from paper, not at the bedside?)
  c := c || public.mis_check('vitals_batch_entry','Vitals for many Guests entered within 10 minutes by one staff member','low','Vital Signs',
    '6 or more Guests'' vitals saved by the same person inside 10 minutes — usually entered later, not at the bedside.',
    $q$select min(v.recorded_at) as sort_at, to_char(min(v.recorded_at) at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              coalesce(pr.full_name,'Staff') as who, count(distinct v.patient_id)||' Guests in '||greatest(1,round(extract(epoch from max(v.recorded_at)-min(v.recorded_at))/60))::int||' min' as detail,
              null::numeric as amount
         from public.vital_signs v left join public.profiles pr on pr.id=v.recorded_by or pr.auth_user_id=v.recorded_by
        where (v.recorded_at at time zone 'Asia/Kolkata')::date between $1 and $2 and v.recorded_by is not null
        group by v.recorded_by, pr.full_name, floor(extract(epoch from v.recorded_at)/600)
       having count(distinct v.patient_id) >= 6$q$,
    p_from, p_to);

  -- 10. medicines: given far too early, or the same dose given twice
  c := c || public.mis_check('dose_given_early','Medicines given more than 1 hour before the scheduled time','medium','Medicines',
    'Given well before its time — check the timing or whether the right dose was recorded.',
    $q$select a.administered_at as sort_at, to_char(a.scheduled_date + a.scheduled_time::time,'DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              coalesce(mo.medicine_name,'Medicine')||' · given at '||to_char(a.administered_at at time zone 'Asia/Kolkata','HH12:MI AM') as detail, null::numeric as amount
         from public.medication_administrations a join public.patients p on p.id=a.patient_id
         left join public.medication_orders mo on mo.id=a.order_id
        where not coalesce(p.is_trial,false) and a.status='Given' and a.scheduled_date between $1 and $2
          and a.administered_at < ((a.scheduled_date + coalesce(a.rescheduled_time, a.scheduled_time::time)) at time zone 'Asia/Kolkata') - interval '60 minutes'$q$,
    p_from, p_to);
  c := c || public.mis_check('dose_given_twice','Same dose recorded as Given twice','high','Medicines',
    'Two Given entries for the same medicine, date and time — possible double dose or double entry.',
    $q$select max(a.administered_at) as sort_at, to_char(a.scheduled_date + a.scheduled_time::time,'DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              coalesce(max(mo.medicine_name),'Medicine')||' · '||count(*)||' Given entries' as detail, null::numeric as amount
         from public.medication_administrations a join public.patients p on p.id=a.patient_id
         left join public.medication_orders mo on mo.id=a.order_id
        where not coalesce(p.is_trial,false) and a.status='Given' and a.scheduled_date between $1 and $2
        group by a.order_id, a.scheduled_date, a.scheduled_time, p.title, p.full_name having count(*) > 1$q$,
    p_from, p_to);

  -- 11. the same payment entered twice
  c := c || public.mis_check('duplicate_receipts','Same payment amount entered twice for a Guest within 24 hours','high','Payments',
    'Two receipts of the same amount for the same Guest close together — possible double entry.',
    $q$with t as (
         select t.*, lag(t.transaction_date) over w as prev_at, lag(t.payment_mode) over w as prev_mode
           from public.billing_transactions t
          where t.transaction_type in ('Payment','Advance') and t.transaction_date > ($1::timestamp at time zone 'Asia/Kolkata') - interval '1 day'
         window w as (partition by t.patient_id, t.amount order by t.transaction_date))
       select t.transaction_date as sort_at, to_char(t.transaction_date at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as date,
              concat_ws(' ', nullif(p.title,''), p.full_name) as who,
              t.payment_mode||' · same amount '||round(extract(epoch from t.transaction_date-t.prev_at)/3600,1)||' h after a '||coalesce(t.prev_mode,'')||' receipt' as detail, t.amount as amount
         from t join public.patients p on p.id=t.patient_id
        where not coalesce(p.is_trial,false) and t.prev_at is not null and t.transaction_date - t.prev_at < interval '24 hours'
          and (t.transaction_date at time zone 'Asia/Kolkata')::date between $1 and $2$q$,
    p_from, p_to);

  return jsonb_build_object('key','analysis','title','Discrepancies & Deviations',
    'subtitle','Entries cross-checked against each other — repeated charges, charges without a matching record, wrong rates, impossible or copied readings, double doses, double receipts',
    'kpis',k,'checks',c);
end $f$;
revoke all on function public.mis_section_analysis(date,date) from public, anon, authenticated;

-- ═════════════════════════════════════════ REPORT ═════════════════════════════════════════
create or replace function public.mis_audit_report_core(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Choose a valid period'; end if;
  if p_to - p_from > 92 then raise exception 'Choose a period of up to 3 months'; end if;
  return jsonb_build_object('from',p_from,'to',p_to,'generated_at',now(),
    'sections', jsonb_build_array(public.mis_section_analysis(p_from,p_to),
                                  public.mis_section_clinical(p_from,p_to),
                                  public.mis_section_financial(p_from,p_to),
                                  public.mis_section_operational(p_from,p_to)));
end $f$;
revoke all on function public.mis_audit_report_core(date,date) from public, anon, authenticated;
grant execute on function public.mis_audit_report_core(date,date) to service_role;

-- The MIS & Audit page: Admin / Directors only
create or replace function public.mis_audit_report(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p
       where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true) and p.role='Admin') then
    raise exception 'MIS & Audit is available to Admin / Directors only';
  end if;
  perform set_config('statement_timeout','60s',true);
  return public.mis_audit_report_core(p_from, p_to);
end $f$;
revoke all on function public.mis_audit_report(date,date) from public, anon;
grant execute on function public.mis_audit_report(date,date) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check: yesterday's report — how many findings in each area, and any check that could not run
with r as (select public.mis_audit_report_core((now() at time zone 'Asia/Kolkata')::date - 1, (now() at time zone 'Asia/Kolkata')::date - 1) j)
select s->>'title' as area, c->>'title' as check_name,
       case when c ? 'error' then 'NOT RUN: '||(c->>'error') else (c->>'count') end as result
  from r, jsonb_array_elements(r.j->'sections') s, jsonb_array_elements(s->'checks') c
 order by 1, (c ? 'error') desc, 2;
