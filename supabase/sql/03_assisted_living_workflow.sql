-- SAMARA CARE v2: POST-DISCHARGE ADMISSION, PRESCRIPTION AND SHIFT TASKS
alter table public.patients add column if not exists hospital_name text;
alter table public.patients add column if not exists discharge_date date;
alter table public.patients add column if not exists diagnosis text;
alter table public.patients add column if not exists treating_doctor text;
alter table public.patients add column if not exists doctor_phone text;
alter table public.patients add column if not exists attendant_name text;
alter table public.patients add column if not exists attendant_phone text;
alter table public.patients add column if not exists allergies text;
alter table public.patients add column if not exists special_instructions text;
alter table public.patients add column if not exists prescription_verified boolean not null default false;
alter table public.patients add column if not exists prescription_verified_by uuid references public.profiles(id);
alter table public.patients add column if not exists prescription_verified_at timestamptz;

create table if not exists public.medication_orders (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  medicine_name text not null, strength text, dose text not null, route text not null default 'Oral',
  food_instruction text, scheduled_times time[] not null, start_date date not null, end_date date,
  special_instruction text, is_prn boolean not null default false, is_active boolean not null default true,
  entered_by uuid not null references public.profiles(id), verified_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.medication_administrations (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.medication_orders(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade, scheduled_date date not null,
  scheduled_time time not null, status text not null check(status in ('Given','Refused','Withheld','Unavailable','Missed')),
  administered_at timestamptz, administered_by uuid references public.profiles(id), remarks text,
  created_at timestamptz not null default now(), unique(order_id,scheduled_date,scheduled_time)
);
create table if not exists public.care_orders (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  care_type text not null, shift text not null check(shift in ('Morning','Afternoon','Night','All shifts')),
  frequency text not null default 'Daily', instruction text, is_active boolean not null default true,
  entered_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.care_logs (
  id uuid primary key default gen_random_uuid(), care_order_id uuid not null references public.care_orders(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade, care_date date not null,
  shift text not null, status text not null check(status in ('Completed','Refused','Not required','Pending')),
  completed_at timestamptz, completed_by uuid references public.profiles(id), remarks text,
  created_at timestamptz not null default now(), unique(care_order_id,care_date,shift)
);
create table if not exists public.physiotherapy_orders (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
  advised_by text, therapy_type text not null, frequency text not null, preferred_time time,
  precautions text, start_date date not null, end_date date, is_active boolean not null default true,
  entered_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.physiotherapy_sessions (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.physiotherapy_orders(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade, session_date date not null,
  status text not null check(status in ('Completed','Refused','Postponed','Pending')), session_at timestamptz,
  performed_by uuid references public.profiles(id), notes text, created_at timestamptz not null default now()
);

alter table public.medication_orders enable row level security; alter table public.medication_administrations enable row level security;
alter table public.care_orders enable row level security; alter table public.care_logs enable row level security;
alter table public.physiotherapy_orders enable row level security; alter table public.physiotherapy_sessions enable row level security;

-- all authenticated care staff may read; clinical staff may create/update
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['medication_orders','medication_administrations','care_orders','care_logs','physiotherapy_orders','physiotherapy_sessions'] LOOP
  EXECUTE format('drop policy if exists "staff read %1$s" on public.%1$I',t);
  EXECUTE format('create policy "staff read %1$s" on public.%1$I for select to authenticated using (public.current_user_has_role(array[''Admin'',''Manager'',''Nurse'',''Caregiver'']))',t);
END LOOP; END $$;

drop policy if exists "clinical manage med orders" on public.medication_orders;
create policy "clinical manage med orders" on public.medication_orders for all to authenticated using(public.current_user_has_role(array['Admin','Manager','Nurse'])) with check(public.current_user_has_role(array['Admin','Manager','Nurse']));
drop policy if exists "nurses administer medicines" on public.medication_administrations;
create policy "nurses administer medicines" on public.medication_administrations for all to authenticated using(public.current_user_has_role(array['Admin','Manager','Nurse'])) with check(public.current_user_has_role(array['Admin','Manager','Nurse']));
drop policy if exists "clinical manage care orders" on public.care_orders;
create policy "clinical manage care orders" on public.care_orders for all to authenticated using(public.current_user_has_role(array['Admin','Manager','Nurse'])) with check(public.current_user_has_role(array['Admin','Manager','Nurse']));
drop policy if exists "care staff log care" on public.care_logs;
create policy "care staff log care" on public.care_logs for all to authenticated using(public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver'])) with check(public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));
drop policy if exists "clinical manage physio orders" on public.physiotherapy_orders;
create policy "clinical manage physio orders" on public.physiotherapy_orders for all to authenticated using(public.current_user_has_role(array['Admin','Manager','Nurse'])) with check(public.current_user_has_role(array['Admin','Manager','Nurse']));
drop policy if exists "staff log physio" on public.physiotherapy_sessions;
create policy "staff log physio" on public.physiotherapy_sessions for all to authenticated using(public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver'])) with check(public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['medication_orders','medication_administrations','care_orders','care_logs','physiotherapy_orders','physiotherapy_sessions'] LOOP
  BEGIN EXECUTE format('alter publication supabase_realtime add table public.%I',t); EXCEPTION WHEN duplicate_object THEN NULL; END;
END LOOP; END $$;
