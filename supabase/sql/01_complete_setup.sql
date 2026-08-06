-- SAMARA CARE REACT v1 - COMPLETE DATABASE SETUP
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  employee_id text unique,
  login_id text not null unique,
  employee_email text,
  mobile text,
  role text not null check (role in ('Admin','Manager','Nurse','Caregiver','Accounts','Kitchen')),
  is_active boolean not null default true,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  age integer,
  gender text,
  room_no text not null,
  bed_no text not null,
  admission_date date not null default current_date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists active_bed_unique
on public.patients(room_no,bed_no) where is_active=true;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id),
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.current_user_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true and role = any(allowed_roles)
  );
$$;
revoke all on function public.current_user_has_role(text[]) from public;
grant execute on function public.current_user_has_role(text[]) to authenticated;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles for select to authenticated using (id=auth.uid());
drop policy if exists "admins read profiles" on public.profiles;
create policy "admins read profiles" on public.profiles for select to authenticated using (public.current_user_has_role(array['Admin']));

drop policy if exists "authenticated read patients" on public.patients;
create policy "authenticated read patients" on public.patients for select to authenticated using (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver','Accounts','Kitchen']));
drop policy if exists "clinical create patients" on public.patients;
create policy "clinical create patients" on public.patients for insert to authenticated with check (public.current_user_has_role(array['Admin','Manager','Nurse']));
drop policy if exists "clinical update patients" on public.patients;
create policy "clinical update patients" on public.patients for update to authenticated using (public.current_user_has_role(array['Admin','Manager','Nurse'])) with check (public.current_user_has_role(array['Admin','Manager','Nurse']));

drop policy if exists "admins read audit" on public.audit_log;
create policy "admins read audit" on public.audit_log for select to authenticated using (public.current_user_has_role(array['Admin']));

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists patients_touch on public.patients;
create trigger patients_touch before update on public.patients for each row execute function public.touch_updated_at();

do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.patients;
exception when duplicate_object then null; end $$;
