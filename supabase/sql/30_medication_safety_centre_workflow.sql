-- Samara Care ERP 1.2.5
-- Medication Safety Centre workflow / RCA / CAPA compatibility
-- Safe additive migration: no existing medication error records are deleted.

create table if not exists public.medication_errors (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid,
  order_id uuid,
  error_type text,
  severity text,
  occurred_at timestamptz default now(),
  description text,
  immediate_action text,
  patient_effect text,
  doctor_informed boolean default false,
  family_informed boolean default false,
  reported_by uuid,
  status text default 'Open',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.medication_errors add column if not exists investigation text;
alter table public.medication_errors add column if not exists root_cause text;
alter table public.medication_errors add column if not exists corrective_action text;
alter table public.medication_errors add column if not exists preventive_action text;
alter table public.medication_errors add column if not exists manager_note text;
alter table public.medication_errors add column if not exists doctor_notification text;
alter table public.medication_errors add column if not exists resident_outcome text;
alter table public.medication_errors add column if not exists closed_by uuid;
alter table public.medication_errors add column if not exists closed_at timestamptz;
alter table public.medication_errors add column if not exists updated_at timestamptz default now();

update public.medication_errors
set status = 'Open'
where status is null or btrim(status) = '';

create index if not exists medication_errors_patient_idx on public.medication_errors(patient_id);
create index if not exists medication_errors_status_idx on public.medication_errors(status);
create index if not exists medication_errors_occurred_idx on public.medication_errors(occurred_at desc);

notify pgrst, 'reload schema';

select
  to_regclass('public.medication_errors') is not null as medication_errors_ready,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_errors' and column_name='root_cause') as root_cause_ready,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_errors' and column_name='corrective_action') as corrective_action_ready,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_errors' and column_name='preventive_action') as capa_ready;
