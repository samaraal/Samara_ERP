-- 2.18.141 — A medicine stop that was NOT ordered by a doctor
-- Run once in Supabase SQL Editor. Safe to run again.
--
-- Mr. RANJITHKUMAR (MOG-2026-10-0012): on 25-10-2026 Inj. Clexane 60 mg was stopped through the
-- Doctor Review form, but no doctor reviewed the Guest. The family told the nurse that the doctor had
-- advised 3 days only, and the family had not supplied the medicine.
-- This re-marks that entry as "not a doctor review" and records the correct wording. Nothing is deleted:
-- the original entry (doctor name, times, who entered it) is kept unchanged for audit.
-- Effect: it no longer appears in Modification History, the Doctor Reviews list or the reports as a
-- doctor's decision. The medicine's status reads:
--   "Inj. Clexane 60 mg not given from 25-10: not supplied by family; family reported the doctor advised 3 days only"

-- 1. Columns
alter table public.medication_reviews add column if not exists not_doctor_review boolean not null default false;
alter table public.medication_reviews add column if not exists non_doctor_note text;
alter table public.medication_reviews add column if not exists non_doctor_marked_at timestamptz;
alter table public.medication_reviews add column if not exists non_doctor_marked_by text;

-- 2. Re-mark the 25-10-2026 Clexane entry for Mr. RANJITHKUMAR
do $$
declare pid uuid; n int; rid uuid; k int;
begin
  select count(*),min(id::text)::uuid into n,pid from public.patients
   where patient_id='MOG-2026-10-0012' and regexp_replace(lower(full_name),'[^a-z]','','g') like '%ranjithkumar%';
  if n<>1 then raise notice 'Mr. RANJITHKUMAR (MOG-2026-10-0012) not found exactly once — nothing changed.'; return; end if;

  select count(distinct r.id),min(r.id::text)::uuid into k,rid
    from public.medication_reviews r
    join public.medication_review_items i on i.review_id=r.id
   where r.patient_id=pid and not r.is_admission_correction
     and (r.reviewed_at at time zone 'Asia/Kolkata')::date='2026-10-25'
     and i.action='Stop' and lower(i.medicine_name) like '%clexane%';
  if k<>1 then raise notice 'Expected exactly 1 review that stopped Clexane on 25-10-2026, found % — nothing changed.',k; return; end if;

  update public.medication_reviews
     set not_doctor_review=true,
         non_doctor_note='Inj. Clexane 60 mg not given from 25-10: not supplied by family; family reported the doctor advised 3 days only',
         non_doctor_marked_at=coalesce(non_doctor_marked_at,now()),
         non_doctor_marked_by=coalesce(non_doctor_marked_by,'Owner correction, 25-10-2026')
   where id=rid;
  raise notice 'Re-marked review % as not a doctor review.',rid;
end $$;

-- 3. Result
select r.id,(r.reviewed_at at time zone 'Asia/Kolkata') as reviewed_ist,r.doctor_name as originally_entered_doctor,
       r.not_doctor_review,r.non_doctor_note
  from public.medication_reviews r join public.patients p on p.id=r.patient_id
 where p.patient_id='MOG-2026-10-0012' and r.not_doctor_review;
