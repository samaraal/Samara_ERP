-- SAMARA CARE ERP V6.5
-- MASTER INSTALL / REPAIR SCRIPT
-- Safe to run more than once. Run this single file in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Core profile compatibility required by all released screens.
alter table public.profiles add column if not exists employee_id text;
alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists father_guardian_name text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists residential_address text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists date_of_joining date;
alter table public.profiles add column if not exists blood_group text;
alter table public.profiles add column if not exists emergency_contact text;
alter table public.profiles add column if not exists employee_email text;
alter table public.profiles add column if not exists id_card_type text;
alter table public.profiles add column if not exists id_card_number text;
alter table public.profiles add column if not exists qualification text;
alter table public.profiles add column if not exists previous_workplace text;
alter table public.profiles add column if not exists reference_type text default 'Direct';
alter table public.profiles add column if not exists joining_source text;
alter table public.profiles add column if not exists reference_name text;
alter table public.profiles add column if not exists reference_contact text;
alter table public.profiles add column if not exists photo_storage_path text;
alter table public.profiles add column if not exists employee_photo_path text;
alter table public.profiles add column if not exists auth_user_id uuid;
alter table public.profiles add column if not exists auth_email text;
alter table public.profiles add column if not exists active boolean default true;
alter table public.profiles add column if not exists is_active boolean default true;
alter table public.profiles add column if not exists last_sign_in_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz default now();

update public.profiles
set active = coalesce(active,true),
    is_active = coalesce(is_active,active,true),
    reference_type = coalesce(nullif(reference_type,''),'Direct'),
    employee_email = coalesce(employee_email,auth_email),
    residential_address = coalesce(residential_address,address),
    address = coalesce(address,residential_address),
    role = case lower(trim(coalesce(role,'')))
      when 'administrator' then 'Admin'
      when 'admin' then 'Admin'
      when 'manager' then 'Manager'
      when 'nurse' then 'Nurse'
      when 'caregiver' then 'Caregiver'
      when 'accounts' then 'Accounts'
      when 'accountant' then 'Accounts'
      when 'kitchen' then 'Kitchen'
      else 'Caregiver' end;

create unique index if not exists profiles_auth_user_id_unique
on public.profiles(auth_user_id) where auth_user_id is not null;

-- Link existing profiles to Authentication accounts without creating duplicates.
update public.profiles p set auth_user_id=u.id, auth_email=lower(u.email)
from auth.users u where p.id=u.id and p.auth_user_id is null;
update public.profiles p set auth_user_id=u.id, auth_email=lower(u.email)
from auth.users u where p.auth_user_id is null and p.auth_email is not null and lower(p.auth_email)=lower(u.email);
update public.profiles p set auth_user_id=u.id, auth_email=lower(u.email)
from auth.users u where p.auth_user_id is null
and lower(trim(p.login_id))=lower(coalesce(u.raw_user_meta_data->>'login_id',split_part(u.email,'@',1)));

-- Remove obsolete auth triggers that caused duplicate profile insertion.
do $$ declare r record; begin
 for r in select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='auth' and c.relname='users' and not t.tgisinternal loop
  execute format('drop trigger if exists %I on auth.users',r.tgname);
 end loop;
end $$;

create or replace function public.resolve_employee_login(p_login_id text)
returns text language plpgsql security definer set search_path=public,auth as $$
declare v_email text; begin
 select lower(u.email) into v_email
 from public.profiles p join auth.users u on u.id=coalesce(p.auth_user_id,p.id)
 where lower(trim(p.login_id))=lower(trim(p_login_id))
 and coalesce(p.active,true) and coalesce(p.is_active,true) limit 1;
 return v_email;
end $$;
revoke all on function public.resolve_employee_login(text) from public;
grant execute on function public.resolve_employee_login(text) to anon,authenticated;

-- Employee documents table.
create table if not exists public.employee_documents(
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.profiles(id) on delete cascade,
 document_type text not null,
 file_name text not null,
 storage_path text not null unique,
 mime_type text,
 file_size bigint,
 uploaded_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.employee_documents enable row level security;

-- Required private storage buckets.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('employee-documents','employee-documents',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('patient-documents','patient-documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Employee document policies.
drop policy if exists "employee docs read" on public.employee_documents;
create policy "employee docs read" on public.employee_documents for select to authenticated using(
 exists(select 1 from public.profiles p where coalesce(p.auth_user_id,p.id)=auth.uid() and coalesce(p.is_active,p.active,true) and lower(p.role) in('admin','manager')));
drop policy if exists "employee docs insert" on public.employee_documents;
create policy "employee docs insert" on public.employee_documents for insert to authenticated with check(
 exists(select 1 from public.profiles p where coalesce(p.auth_user_id,p.id)=auth.uid() and coalesce(p.is_active,p.active,true) and lower(p.role) in('admin','manager')));
drop policy if exists "employee docs update" on public.employee_documents;
create policy "employee docs update" on public.employee_documents for update to authenticated using(
 exists(select 1 from public.profiles p where coalesce(p.auth_user_id,p.id)=auth.uid() and lower(p.role) in('admin','manager'))) with check(
 exists(select 1 from public.profiles p where coalesce(p.auth_user_id,p.id)=auth.uid() and lower(p.role) in('admin','manager')));
drop policy if exists "employee docs delete" on public.employee_documents;
create policy "employee docs delete" on public.employee_documents for delete to authenticated using(
 exists(select 1 from public.profiles p where coalesce(p.auth_user_id,p.id)=auth.uid() and lower(p.role)='admin'));

-- Storage policies, using unique names and both auth linking styles.
drop policy if exists "samara employee storage read" on storage.objects;
create policy "samara employee storage read" on storage.objects for select to authenticated using(bucket_id='employee-documents' and exists(
 select 1 from public.profiles p where coalesce(p.auth_user_id,p.id)=auth.uid() and lower(p.role) in('admin','manager')));
drop policy if exists "samara employee storage insert" on storage.objects;
create policy "samara employee storage insert" on storage.objects for insert to authenticated with check(bucket_id='employee-documents' and exists(
 select 1 from public.profiles p where coalesce(p.auth_user_id,p.id)=auth.uid() and lower(p.role) in('admin','manager')));
drop policy if exists "samara employee storage update" on storage.objects;
create policy "samara employee storage update" on storage.objects for update to authenticated using(bucket_id='employee-documents' and exists(
 select 1 from public.profiles p where coalesce(p.auth_user_id,p.id)=auth.uid() and lower(p.role) in('admin','manager'))) with check(bucket_id='employee-documents');
drop policy if exists "samara employee storage delete" on storage.objects;
create policy "samara employee storage delete" on storage.objects for delete to authenticated using(bucket_id='employee-documents' and exists(
 select 1 from public.profiles p where coalesce(p.auth_user_id,p.id)=auth.uid() and lower(p.role)='admin'));

-- Patient storage access for operational staff.
drop policy if exists "samara patient storage read" on storage.objects;
create policy "samara patient storage read" on storage.objects for select to authenticated using(bucket_id='patient-documents');
drop policy if exists "samara patient storage insert" on storage.objects;
create policy "samara patient storage insert" on storage.objects for insert to authenticated with check(bucket_id='patient-documents');
drop policy if exists "samara patient storage update" on storage.objects;
create policy "samara patient storage update" on storage.objects for update to authenticated using(bucket_id='patient-documents') with check(bucket_id='patient-documents');

create or replace view public.employee_auth_diagnostics as
select p.id profile_id,p.auth_user_id,p.full_name,p.login_id,p.role,p.active,p.is_active,p.auth_email,u.email actual_auth_email,u.last_sign_in_at,
case when p.auth_user_id is null then 'AUTH USER MISSING' when u.id is null then 'AUTH LINK BROKEN'
when not coalesce(p.active,true) or not coalesce(p.is_active,true) then 'DISABLED' else 'READY' end authentication_status
from public.profiles p left join auth.users u on u.id=p.auth_user_id;

notify pgrst,'reload schema';

-- FINAL VERIFICATION RESULTS
select id,name,public,file_size_limit from storage.buckets where id in('employee-documents','patient-documents') order by id;
select * from public.employee_auth_diagnostics order by full_name;
