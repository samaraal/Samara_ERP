-- Samara Care ERP 1.3.10
-- Physiotherapy session completion / pending / not-done workflow

create table if not exists public.physiotherapy_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  patient_id uuid not null,
  session_date date not null,
  scheduled_time time,
  status text not null default 'Pending',
  session_at timestamptz,
  performed_by uuid,
  physiotherapist_name text,
  reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.physiotherapy_sessions add column if not exists scheduled_time time;
alter table public.physiotherapy_sessions add column if not exists status text default 'Pending';
alter table public.physiotherapy_sessions add column if not exists session_at timestamptz;
alter table public.physiotherapy_sessions add column if not exists performed_by uuid;
alter table public.physiotherapy_sessions add column if not exists physiotherapist_name text;
alter table public.physiotherapy_sessions add column if not exists reason text;
alter table public.physiotherapy_sessions add column if not exists notes text;
alter table public.physiotherapy_sessions add column if not exists created_at timestamptz default now();
alter table public.physiotherapy_sessions add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.physiotherapy_sessions'::regclass
      and conname='physiotherapy_sessions_order_date_key'
  ) then
    alter table public.physiotherapy_sessions
      add constraint physiotherapy_sessions_order_date_key
      unique(order_id,session_date);
  end if;
exception when unique_violation then
  raise notice 'Duplicate historical physiotherapy sessions exist; unique constraint was not added.';
end $$;

create index if not exists physiotherapy_sessions_patient_idx
  on public.physiotherapy_sessions(patient_id,session_date desc);

alter table public.physiotherapy_sessions enable row level security;

drop policy if exists physiotherapy_sessions_authenticated_select on public.physiotherapy_sessions;
create policy physiotherapy_sessions_authenticated_select
on public.physiotherapy_sessions for select
to authenticated
using (true);

drop policy if exists physiotherapy_sessions_clinical_insert on public.physiotherapy_sessions;
create policy physiotherapy_sessions_clinical_insert
on public.physiotherapy_sessions for insert
to authenticated
with check (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));

drop policy if exists physiotherapy_sessions_clinical_update on public.physiotherapy_sessions;
create policy physiotherapy_sessions_clinical_update
on public.physiotherapy_sessions for update
to authenticated
using (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']))
with check (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));

notify pgrst, 'reload schema';

select
  to_regclass('public.physiotherapy_sessions') is not null as sessions_ready,
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='physiotherapy_sessions'
      and column_name='reason'
  ) as reason_ready;
