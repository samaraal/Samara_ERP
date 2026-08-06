-- Samara Care ERP V5.6
-- Employee personnel information, authentication recovery compatibility,
-- document uploads and secure camera/photo storage.

alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists father_guardian_name text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists date_of_joining date;
alter table public.profiles add column if not exists blood_group text;
alter table public.profiles add column if not exists emergency_contact text;
alter table public.profiles add column if not exists id_card_type text;
alter table public.profiles add column if not exists id_card_number text;
alter table public.profiles add column if not exists qualification text;
alter table public.profiles add column if not exists previous_workplace text;
alter table public.profiles add column if not exists reference_type text default 'Direct';
alter table public.profiles add column if not exists reference_name text;
alter table public.profiles add column if not exists reference_contact text;
alter table public.profiles add column if not exists active boolean default true;
alter table public.profiles add column if not exists is_active boolean default true;

update public.profiles
set active = coalesce(active, true),
    is_active = coalesce(is_active, active, true),
    reference_type = coalesce(nullif(reference_type, ''), 'Direct');

create table if not exists public.employee_documents (
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

drop policy if exists "Admin manager read employee documents" on public.employee_documents;
create policy "Admin manager read employee documents"
on public.employee_documents for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, p.active, false) = true
      and lower(p.role) in ('admin','manager')
  )
);

drop policy if exists "Admin manager insert employee documents" on public.employee_documents;
create policy "Admin manager insert employee documents"
on public.employee_documents for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, p.active, false) = true
      and lower(p.role) in ('admin','manager')
  )
);

drop policy if exists "Admin manager update employee documents" on public.employee_documents;
create policy "Admin manager update employee documents"
on public.employee_documents for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, p.active, false) = true
      and lower(p.role) in ('admin','manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, p.active, false) = true
      and lower(p.role) in ('admin','manager')
  )
);

drop policy if exists "Admin delete employee documents" on public.employee_documents;
create policy "Admin delete employee documents"
on public.employee_documents for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, p.active, false) = true
      and lower(p.role) = 'admin'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin manager upload personnel files" on storage.objects;
create policy "Admin manager upload personnel files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-documents'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, p.active, false) = true
      and lower(p.role) in ('admin','manager')
  )
);

drop policy if exists "Admin manager read personnel files" on storage.objects;
create policy "Admin manager read personnel files"
on storage.objects for select to authenticated
using (
  bucket_id = 'employee-documents'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, p.active, false) = true
      and lower(p.role) in ('admin','manager')
  )
);

drop policy if exists "Admin manager update personnel files" on storage.objects;
create policy "Admin manager update personnel files"
on storage.objects for update to authenticated
using (
  bucket_id = 'employee-documents'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, p.active, false) = true
      and lower(p.role) in ('admin','manager')
  )
);

drop policy if exists "Admin delete personnel files" on storage.objects;
create policy "Admin delete personnel files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-documents'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, p.active, false) = true
      and lower(p.role) = 'admin'
  )
);

select full_name, login_id, role, active, is_active
from public.profiles
order by full_name;
