-- Samara Care ERP 1.3.7
-- Physiotherapy Plan compatibility and access setup
-- Safe additive migration. Existing data is preserved.

create table if not exists public.physiotherapy_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  advised_by text,
  therapy_type text,
  frequency text,
  preferred_time text,
  precautions text,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  entered_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.physiotherapy_plans add column if not exists advised_by text;
alter table public.physiotherapy_plans add column if not exists therapy_type text;
alter table public.physiotherapy_plans add column if not exists frequency text;
alter table public.physiotherapy_plans add column if not exists preferred_time text;
alter table public.physiotherapy_plans add column if not exists precautions text;
alter table public.physiotherapy_plans add column if not exists start_date date;
alter table public.physiotherapy_plans add column if not exists end_date date;
alter table public.physiotherapy_plans add column if not exists is_active boolean default true;
alter table public.physiotherapy_plans add column if not exists entered_by uuid;
alter table public.physiotherapy_plans add column if not exists created_at timestamptz default now();
alter table public.physiotherapy_plans add column if not exists updated_at timestamptz default now();

update public.physiotherapy_plans
set is_active=true
where is_active is null;

-- Copy records from the earlier compatibility table if it exists.
do $$
begin
  if to_regclass('public.physiotherapy_orders') is not null then
    execute $copy$
      insert into public.physiotherapy_plans
        (patient_id,advised_by,therapy_type,frequency,preferred_time,precautions,start_date,end_date,is_active,entered_by,created_at)
      select
        patient_id,advised_by,therapy_type,frequency,preferred_time,precautions,start_date,end_date,
        coalesce(is_active,true),entered_by,coalesce(created_at,now())
      from public.physiotherapy_orders old
      where not exists (
        select 1 from public.physiotherapy_plans p
        where p.patient_id=old.patient_id
          and coalesce(p.therapy_type,'')=coalesce(old.therapy_type,'')
          and coalesce(p.start_date,date '1900-01-01')=coalesce(old.start_date,date '1900-01-01')
      )
    $copy$;
  end if;
exception when undefined_column then
  raise notice 'Older physiotherapy_orders table has a different structure; no automatic copy was made.';
end $$;

-- Add the patient relationship when not already present.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.physiotherapy_plans'::regclass
      and contype='f'
      and conname='physiotherapy_plans_patient_id_fkey'
  ) then
    alter table public.physiotherapy_plans
      add constraint physiotherapy_plans_patient_id_fkey
      foreign key(patient_id) references public.patients(id)
      on delete cascade;
  end if;
exception when others then
  raise notice 'Patient foreign key was not added: %',sqlerrm;
end $$;

create index if not exists physiotherapy_plans_patient_idx
  on public.physiotherapy_plans(patient_id,created_at desc);

alter table public.physiotherapy_plans enable row level security;

drop policy if exists physiotherapy_plans_authenticated_select on public.physiotherapy_plans;
create policy physiotherapy_plans_authenticated_select
on public.physiotherapy_plans for select
to authenticated
using (true);

drop policy if exists physiotherapy_plans_admin_manager_insert on public.physiotherapy_plans;
create policy physiotherapy_plans_admin_manager_insert
on public.physiotherapy_plans for insert
to authenticated
with check (public.current_user_has_role(array['Admin','Manager']));

drop policy if exists physiotherapy_plans_admin_manager_update on public.physiotherapy_plans;
create policy physiotherapy_plans_admin_manager_update
on public.physiotherapy_plans for update
to authenticated
using (public.current_user_has_role(array['Admin','Manager']))
with check (public.current_user_has_role(array['Admin','Manager']));

notify pgrst, 'reload schema';

select
  to_regclass('public.physiotherapy_plans') is not null as physiotherapy_plans_ready,
  count(*) as available_plans
from public.physiotherapy_plans;
