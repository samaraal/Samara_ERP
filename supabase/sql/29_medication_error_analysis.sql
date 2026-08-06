-- Samara Care ERP 1.2.4
-- Medication Error reporting, review and management analysis

create extension if not exists pgcrypto;

create table if not exists public.medication_errors (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  order_id uuid references public.medication_orders(id) on delete set null,
  error_type text not null,
  severity text not null default 'Moderate',
  occurred_at timestamptz not null default now(),
  description text not null,
  immediate_action text,
  patient_effect text,
  doctor_informed boolean not null default false,
  family_informed boolean not null default false,
  status text not null default 'Open',
  reported_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.medication_errors add column if not exists patient_id uuid;
alter table public.medication_errors add column if not exists order_id uuid;
alter table public.medication_errors add column if not exists error_type text;
alter table public.medication_errors add column if not exists severity text default 'Moderate';
alter table public.medication_errors add column if not exists occurred_at timestamptz default now();
alter table public.medication_errors add column if not exists description text;
alter table public.medication_errors add column if not exists immediate_action text;
alter table public.medication_errors add column if not exists patient_effect text;
alter table public.medication_errors add column if not exists doctor_informed boolean default false;
alter table public.medication_errors add column if not exists family_informed boolean default false;
alter table public.medication_errors add column if not exists status text default 'Open';
alter table public.medication_errors add column if not exists reported_by uuid;
alter table public.medication_errors add column if not exists reviewed_by uuid;
alter table public.medication_errors add column if not exists reviewed_at timestamptz;
alter table public.medication_errors add column if not exists review_note text;
alter table public.medication_errors add column if not exists created_at timestamptz default now();
alter table public.medication_errors add column if not exists updated_at timestamptz default now();

create index if not exists medication_errors_patient_idx on public.medication_errors(patient_id);
create index if not exists medication_errors_order_idx on public.medication_errors(order_id);
create index if not exists medication_errors_occurred_idx on public.medication_errors(occurred_at desc);
create index if not exists medication_errors_status_idx on public.medication_errors(status);

alter table public.medication_errors enable row level security;

drop policy if exists medication_errors_select_management on public.medication_errors;
create policy medication_errors_select_management on public.medication_errors
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and p.role in ('Admin','Manager')
    and coalesce(p.is_active,true) = true
));

drop policy if exists medication_errors_insert_staff on public.medication_errors;
create policy medication_errors_insert_staff on public.medication_errors
for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and p.role in ('Admin','Manager','Nurse','Caregiver')
    and coalesce(p.is_active,true) = true
));

drop policy if exists medication_errors_update_management on public.medication_errors;
create policy medication_errors_update_management on public.medication_errors
for update to authenticated
using (exists (
  select 1 from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and p.role in ('Admin','Manager')
    and coalesce(p.is_active,true) = true
))
with check (exists (
  select 1 from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and p.role in ('Admin','Manager')
    and coalesce(p.is_active,true) = true
));

grant select, insert, update on public.medication_errors to authenticated;
notify pgrst, 'reload schema';

select
  to_regclass('public.medication_errors') is not null as medication_errors_ready,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_errors' and column_name='review_note') as review_workflow_ready;
