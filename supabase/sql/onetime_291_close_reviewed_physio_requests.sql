-- ONE-TIME 291 — Close physiotherapy correction requests that are still marked Pending / Applying but were already
-- handled. The sessions themselves are NOT changed. Each request is marked "Rejected" with the note below (kept in
-- the audit trail). Run once in Supabase SQL Editor.
-- 1) What will be closed:
select r.id, r.action, r.state, r.reason, (r.original->>'session_date') as session_date, p.full_name as guest,
       r.requested_at at time zone 'Asia/Kolkata' as requested_at
from public.physiotherapy_corrections r left join public.patients p on p.id=(r.original->>'patient_id')::uuid
where r.state in ('Pending','Applying') order by r.requested_at;
-- 2) Close them:
begin;
with closed as(
  update public.physiotherapy_corrections
     set state='Rejected', reviewed_at=now(),
         review_note='Closed by Admin — already reviewed; session left as it is (one-time 291)'
   where state in ('Pending','Applying')
  returning id, session_id, action)
select public.record_audit_event('Physiotherapy Correction Closed','Physiotherapy',c.session_id::text,
       jsonb_build_object('request_id',c.id,'action',c.action,'note','Closed by Admin — already reviewed (one-time 291)'),'Success')
from closed c;
commit;
select count(*) as still_pending from public.physiotherapy_corrections where state in ('Pending','Applying');
