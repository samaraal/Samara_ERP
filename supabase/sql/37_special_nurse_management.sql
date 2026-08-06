-- Samara Care ERP 1.3.12
-- Special Nurse Management

create table if not exists public.special_nurse_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  nurse_profile_id uuid,
  nurse_name text,
  assignment_type text not null default 'Dedicated Nurse',
  coverage_days text[] not null default array[]::text[],
  start_time time,
  end_time time,
  shift text,
  start_date date not null default current_date,
  end_date date,
  duration_type text,
  duration_value text,
  responsibilities text,
  special_instructions text,
  emergency_contact text,
  status text not null default 'Active',
  notes text,
  assigned_by uuid,
  last_status_updated_by uuid,
  last_status_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists special_nurse_patient_idx
  on public.special_nurse_assignments(patient_id,created_at desc);

create index if not exists special_nurse_staff_idx
  on public.special_nurse_assignments(nurse_profile_id,created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.special_nurse_assignments'::regclass
      and conname='special_nurse_assignments_patient_id_fkey'
  ) then
    alter table public.special_nurse_assignments
      add constraint special_nurse_assignments_patient_id_fkey
      foreign key(patient_id) references public.patients(id)
      on delete cascade;
  end if;
exception when others then
  raise notice 'Patient foreign key not added: %',sqlerrm;
end $$;

alter table public.special_nurse_assignments enable row level security;

drop policy if exists special_nurse_authenticated_select on public.special_nurse_assignments;
create policy special_nurse_authenticated_select
on public.special_nurse_assignments for select
to authenticated
using (true);

drop policy if exists special_nurse_admin_manager_insert on public.special_nurse_assignments;
create policy special_nurse_admin_manager_insert
on public.special_nurse_assignments for insert
to authenticated
with check (public.current_user_has_role(array['Admin','Manager']));

drop policy if exists special_nurse_admin_manager_update on public.special_nurse_assignments;
create policy special_nurse_admin_manager_update
on public.special_nurse_assignments for update
to authenticated
using (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']))
with check (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));

notify pgrst, 'reload schema';

select
  to_regclass('public.special_nurse_assignments') is not null as special_nurse_ready;
