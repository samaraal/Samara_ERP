-- Samara Care ERP V6 trial: patient master, admission routes, documents and enquiries
alter table public.profiles add column if not exists blood_group text;
alter table public.profiles add column if not exists father_guardian_name text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists date_of_joining date;
alter table public.profiles add column if not exists emergency_contact text;
alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists id_card_type text;
alter table public.profiles add column if not exists id_card_number text;
alter table public.profiles add column if not exists qualification text;
alter table public.profiles add column if not exists previous_workplace text;
alter table public.profiles add column if not exists reference_type text;
alter table public.profiles add column if not exists reference_name text;
alter table public.profiles add column if not exists reference_contact text;
alter table public.profiles add column if not exists photo_storage_path text;

alter table public.patients add column if not exists admission_type text default 'Hospital Discharge';
alter table public.patients add column if not exists patient_category text default 'Short Stay';
alter table public.patients add column if not exists mobile text;
alter table public.patients add column if not exists address text;
alter table public.patients add column if not exists referring_doctor text;
alter table public.patients add column if not exists referring_source text;
alter table public.patients add column if not exists family_doctor text;
alter table public.patients add column if not exists photo_storage_path text;

alter table public.patient_documents add column if not exists storage_path text;
alter table public.patient_documents add column if not exists mime_type text;
alter table public.patient_documents add column if not exists file_size bigint;
alter table public.patient_documents add column if not exists report_date date;
alter table public.patient_documents add column if not exists hospital_laboratory text;
alter table public.patient_documents add column if not exists doctor_name text;
alter table public.patient_documents add column if not exists remarks text;
alter table public.patient_documents add column if not exists is_verified boolean default false;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('patient-documents','patient-documents',false,15728640,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=15728640;

create table if not exists public.pre_admission_enquiries (
 id uuid primary key default gen_random_uuid(),
 patient_name text not null,
 family_contact_name text not null,
 family_contact_phone text not null,
 current_location text,
 reason_for_enquiry text,
 expected_admission_date date,
 bed_preference text,
 special_requirements text,
 source text,
 status text default 'New',
 handled_by uuid references public.profiles(id),
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);
alter table public.pre_admission_enquiries enable row level security;
drop policy if exists "staff manage enquiries" on public.pre_admission_enquiries;
create policy "staff manage enquiries" on public.pre_admission_enquiries for all to authenticated using (true) with check (true);

drop policy if exists "staff upload patient documents" on storage.objects;
create policy "staff upload patient documents" on storage.objects for insert to authenticated with check (bucket_id='patient-documents');
drop policy if exists "staff read patient documents" on storage.objects;
create policy "staff read patient documents" on storage.objects for select to authenticated using (bucket_id='patient-documents');
drop policy if exists "staff update patient documents" on storage.objects;
create policy "staff update patient documents" on storage.objects for update to authenticated using (bucket_id='patient-documents') with check (bucket_id='patient-documents');

notify pgrst, 'reload schema';
