alter table public.patients drop constraint if exists patients_admission_status_check;
alter table public.patients add constraint patients_admission_status_check
  check (admission_status in ('Draft','Admission Pending','Active','Temporarily Hospitalised','Discharged'));
