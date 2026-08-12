-- Samara ERP - Daily Moments (short family video updates)
-- Run once in Supabase SQL Editor before uploading the ERP files.

create extension if not exists pgcrypto;

create table if not exists public.patient_daily_moments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  duration_seconds integer not null check (duration_seconds between 1 and 20),
  file_size_bytes bigint,
  mime_type text,
  family_visible boolean not null default true,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists idx_patient_daily_moments_patient_created
  on public.patient_daily_moments(patient_id, created_at desc);
create index if not exists idx_patient_daily_moments_expiry
  on public.patient_daily_moments(expires_at);

alter table public.patient_daily_moments enable row level security;

drop policy if exists "daily moments staff read" on public.patient_daily_moments;
create policy "daily moments staff read" on public.patient_daily_moments
for select to authenticated
using (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));

drop policy if exists "daily moments staff insert" on public.patient_daily_moments;
create policy "daily moments staff insert" on public.patient_daily_moments
for insert to authenticated
with check (
  public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver'])
  and (uploaded_by is null or uploaded_by = auth.uid())
);

drop policy if exists "daily moments owner manager delete" on public.patient_daily_moments;
create policy "daily moments owner manager delete" on public.patient_daily_moments
for delete to authenticated
using (uploaded_by = auth.uid() or public.current_user_has_role(array['Admin','Manager']));

-- Limit to 3 clips per resident per India calendar day.
create or replace function public.limit_daily_moments_per_patient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.patient_daily_moments
  where patient_id = new.patient_id
    and (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date;
  if v_count >= 3 then
    raise exception 'Maximum 3 Daily Moment clips per resident per day.';
  end if;
  if new.expires_at is null or new.expires_at > now() + interval '7 days 5 minutes' then
    new.expires_at := now() + interval '7 days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limit_daily_moments_per_patient on public.patient_daily_moments;
create trigger trg_limit_daily_moments_per_patient
before insert on public.patient_daily_moments
for each row execute function public.limit_daily_moments_per_patient();

-- Private storage bucket. 25 MB allows a short mobile clip without excessive storage.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('patient-daily-moments','patient-daily-moments',false,26214400,array['video/mp4','video/webm','video/quicktime','video/x-m4v'])
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Storage policies: staff only. Family Portal should receive short-lived signed URLs from a secure server function.
drop policy if exists "daily moments storage staff read" on storage.objects;
create policy "daily moments storage staff read" on storage.objects
for select to authenticated
using (bucket_id='patient-daily-moments' and public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));

drop policy if exists "daily moments storage staff upload" on storage.objects;
create policy "daily moments storage staff upload" on storage.objects
for insert to authenticated
with check (bucket_id='patient-daily-moments' and public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));

drop policy if exists "daily moments storage staff delete" on storage.objects;
create policy "daily moments storage staff delete" on storage.objects
for delete to authenticated
using (bucket_id='patient-daily-moments' and public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));

-- Helper view for Family Portal server-side integration.
create or replace view public.active_family_daily_moments as
select id,patient_id,storage_path,caption,duration_seconds,mime_type,created_at,expires_at
from public.patient_daily_moments
where family_visible=true and expires_at > now();
