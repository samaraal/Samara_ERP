-- SAMARA CARE v3.1: SAFE ADMISSION, DOCUMENTS, DIET AND CLINICAL RISKS
alter table public.patients add column if not exists discharge_summary_url text;
alter table public.patients add column if not exists prescription_document_url text;
alter table public.patients add column if not exists diet_plan text default 'Normal diet';
alter table public.patients add column if not exists feeding_instruction text;
alter table public.patients add column if not exists billing_package text default 'Standard Assisted Care';
alter table public.patients add column if not exists admission_status text not null default 'Active';
alter table public.patients add column if not exists fall_risk boolean not null default false;
alter table public.patients add column if not exists pressure_sore_risk boolean not null default false;
alter table public.patients add column if not exists aspiration_risk boolean not null default false;
alter table public.patients add column if not exists wandering_risk boolean not null default false;
alter table public.patients add column if not exists infection_risk boolean not null default false;
alter table public.patients add column if not exists seizure_history boolean not null default false;
alter table public.patients add column if not exists oxygen_required boolean not null default false;
alter table public.patients add column if not exists oxygen_instruction text;
alter table public.patients add column if not exists dressing_required boolean not null default false;
alter table public.patients add column if not exists dressing_instruction text;

alter table public.patients drop constraint if exists patients_admission_status_check;
alter table public.patients add constraint patients_admission_status_check
  check (admission_status in ('Draft','Active','Temporarily Hospitalised','Discharged'));
