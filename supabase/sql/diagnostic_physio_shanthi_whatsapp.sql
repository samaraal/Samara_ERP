-- READ-ONLY check (changes nothing). 08-11-2026: Mrs. Shanthi's physiotherapy records + WhatsApp failures per day.
with g as (select id, full_name, is_trial, is_active, admission_status from public.patients where full_name ilike '%shanthi%')
select 1 o, 'Guest' what, concat_ws(' | ', full_name, id::text, 'trial='||coalesce(is_trial,false), coalesce(admission_status,'')) detail from g
union all select 2, 'Physio plan', concat_ws(' | ', coalesce(pp.frequency,'(no frequency)'), coalesce(pp.session_times::text,'(no times)'), 'from '||coalesce(pp.start_date::text,'-'), 'to '||coalesce(pp.end_date::text,'-'), 'active='||coalesce(pp.is_active,true))
  from public.physiotherapy_plans pp where pp.patient_id in (select id from g)
union all select 3, 'Physio session', concat_ws(' | ', s.session_date::text, coalesce(s.scheduled_time::text,'-'), s.status, coalesce(s.physiotherapist_name,'-'))
  from public.physiotherapy_sessions s where s.patient_id in (select id from g) and s.session_date >= date '2026-11-01'
union all select 4, 'Physio note', concat_ws(' | ', (n.observed_at at time zone 'Asia/Kolkata')::date::text, count(*)::text||' notes')
  from public.physiotherapy_notes n where n.patient_id in (select id from g) and n.observed_at >= '2026-11-01' group by (n.observed_at at time zone 'Asia/Kolkata')::date
union all select 5, 'Physio charge', concat_ws(' | ', coalesce(b.charge_date::text,(b.created_at at time zone 'Asia/Kolkata')::date::text), b.category, b.service_name, coalesce(b.approval_status,'-'))
  from public.bill_charge_requests b where b.patient_id in (select id from g) and (b.category ilike '%physio%' or b.service_name ilike '%physio%') and b.created_at >= '2026-11-01'
union all select 6, 'Procedure (physio)', concat_ws(' | ', (r.started_at at time zone 'Asia/Kolkata')::date::text, r.procedure_name, r.status)
  from public.nursing_procedure_requests r where r.patient_id in (select id from g) and r.procedure_name ilike '%physio%'
union all select 7, 'WhatsApp per day', concat_ws(' | ', (w.created_at at time zone 'Asia/Kolkata')::date::text, coalesce(w.template_name,'-'), coalesce(w.status,'-'), count(*)::text, left(max(coalesce(to_jsonb(w)->>'error_message',to_jsonb(w)->>'error','')),160))
  from public.hr_whatsapp_communications w where w.direction='outbound' and w.created_at >= '2026-11-04' and w.template_name ilike '%billing_escalation%'
  group by (w.created_at at time zone 'Asia/Kolkata')::date, w.template_name, w.status
order by 1, 3;
