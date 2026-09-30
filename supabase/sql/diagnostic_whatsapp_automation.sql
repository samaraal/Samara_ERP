-- Diagnostic (read-only): are the automatic WhatsApp messages actually going out?
-- Run in Supabase SQL Editor and share the result table. Changes nothing.
-- One result table: section | item | detail

with
jobs as (
  select 'A. Scheduled jobs'::text section, j.jobname::text item,
    concat(case when j.active then 'ACTIVE' else 'PAUSED' end,' · ',j.schedule,' · ',
      coalesce(substring(j.command from '/functions/v1/([a-z0-9-]+)'),left(j.command,60)),
      ' · last run: ',coalesce(to_char(r.start_time at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI'),'never'),
      ' ',coalesce(r.status,''),' ',coalesce(left(r.return_message,80),'')) detail, 1 ord
  from cron.job j
  left join lateral (select * from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1) r on true
),
http_fail as (
  select 'B. Function calls from jobs that failed (last 24 h)'::text, concat('HTTP ',status_code)::text,
    concat(count(*),' times · latest ',to_char(max(created at time zone 'Asia/Kolkata'),'DD-MM-YYYY HH24:MI'),' · ',left(max(coalesce(content::text,error_msg)),160)), 2
  from net._http_response
  where created > now()-interval '24 hours' and (status_code is null or status_code>=300)
  group by status_code
),
wa as (
  select 'C. WhatsApp sent in last 7 days (by message type)'::text,
    coalesce(template_name,'(free-text reply)')::text,
    concat('Accepted/Delivered/Read: ',count(*) filter (where status in ('Accepted','Sent','Delivered','Read')),
      ' · Failed: ',count(*) filter (where status='Failed'),
      ' · Unknown/Sending: ',count(*) filter (where status in ('Unknown','Sending')),
      ' · last: ',to_char(max(created_at) at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI')), 3
  from hr_whatsapp_communications
  where direction='outbound' and created_at > now()-interval '7 days'
  group by template_name
),
wa_err as (
  select 'D. Latest WhatsApp failures'::text,
    concat(to_char(created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI'),' · ',coalesce(template_name,'reply'))::text,
    concat(coalesce(contact_name,''),' ',recipient_number,' · ',left(coalesce(error_message,''),160)), 4
  from (select * from hr_whatsapp_communications where direction='outbound' and status in ('Failed','Unknown')
        order by created_at desc limit 15) f
),
adm as (
  select 'E. Admissions in last 14 days without an Admission WhatsApp'::text,
    concat(coalesce(p.patient_id,'?'),' · ',p.full_name)::text,
    concat('admitted ',to_char(p.admission_date,'DD-MM-YYYY'),' · family mobiles: ',
      coalesce((select string_agg(f.mobile,', ') from family_portal_access f where f.patient_id=p.id and f.is_active),'NONE')), 5
  from patients p
  where p.admission_date >= current_date-14
    and not exists(select 1 from hr_whatsapp_communications h
      where h.template_name='samara_patient_admission' and h.status in ('Accepted','Sent','Delivered','Read')
        and (h.message_payload->>'patient_db_id'=p.id::text or h.message_payload->>'patient_id' in (p.id::text,p.patient_id)
             or h.recipient_number in (select wa_food_phone(f.mobile) from family_portal_access f where f.patient_id=p.id)))
),
dis as (
  select 'F. Discharges in last 14 days — family WhatsApp status'::text,
    concat(coalesce(p.patient_id,'?'),' · ',coalesce(p.full_name,''))::text,
    concat('status ',coalesce(d.status,''),' · WhatsApp: ',coalesce(d.discharge_whatsapp_status,'NOT SENT')), 6
  from patient_discharges d left join patients p on p.id=d.patient_id
  where d.updated_at > now()-interval '14 days' and lower(coalesce(d.status,''))='completed'
),
daily as (
  select 'G. Daily Intelligent Report settings'::text,
    concat(coalesce(p.patient_id,'?'),' · ',coalesce(p.full_name,''))::text,
    concat('time ',coalesce(left(c.daily_report_time::text,5),'NOT SET'),' · to ',coalesce(c.recipient_mobile,'NO MOBILE'),
      ' · last: ',coalesce(to_char(c.last_report_sent_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI'),'never'),' ',coalesce(c.last_report_status,''),
      case when c.last_report_sent_at is null or c.last_report_sent_at < now()-interval '26 hours' then '  <-- NOT SENT IN LAST 26 H' else '' end), 7
  from patient_family_communication_preferences c left join patients p on p.id=c.patient_id
  where c.daily_whatsapp_enabled and c.is_active and coalesce(p.is_active,true)
),
staff as (
  select 'H. Who can send (after SQL 169)'::text, concat(d.full_name,' · ',d.role)::text,
    case when coalesce(wa_food_is_nursing(to_jsonb(d)),false) then 'Nursing Manager: food vendors + admission, portal access, discharge'
         when d.role in ('Admin','Manager') then 'All messages'
         when d.role='Nurse' then 'Discharge confirmation, review reminder'
         when d.role='Accounts' then 'Payment receipt, bill reminder'
         else 'Admission only if Jaya/Saranya; otherwise none' end, 8
  from duty_profiles d where coalesce(d.is_active,d.active,false) and d.role in ('Admin','Manager','Nurse','Accounts')
)
select section,item,detail from (
  select * from jobs union all select * from http_fail union all select * from wa union all select * from wa_err
  union all select * from adm union all select * from dis union all select * from daily union all select * from staff
) x order by ord, section, item;
