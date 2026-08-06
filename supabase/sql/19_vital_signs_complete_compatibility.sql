-- ================================================================
-- SAMARA CARE ERP 1.0.17
-- VITAL SIGNS COMPLETE COMPATIBILITY + BLOOD SUGAR TYPE
-- Safe to run repeatedly. Existing records are preserved.
-- ================================================================

create extension if not exists pgcrypto;

create table if not exists public.vital_signs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  temperature numeric,
  systolic integer,
  diastolic integer,
  pulse integer,
  respiration integer,
  spo2 integer,
  blood_sugar_type text not null default 'Not Taken',
  blood_sugar numeric,
  weight numeric,
  pain_score numeric,
  remarks text,
  alert_level text not null default 'Normal',
  recorded_by uuid references public.profiles(id),
  recorded_at timestamptz not null default now()
);

alter table public.vital_signs
  add column if not exists temperature numeric,
  add column if not exists systolic integer,
  add column if not exists diastolic integer,
  add column if not exists pulse integer,
  add column if not exists respiration integer,
  add column if not exists spo2 integer,
  add column if not exists blood_sugar_type text,
  add column if not exists blood_sugar numeric,
  add column if not exists weight numeric,
  add column if not exists pain_score numeric,
  add column if not exists remarks text,
  add column if not exists alert_level text,
  add column if not exists recorded_by uuid,
  add column if not exists recorded_at timestamptz;

update public.vital_signs
set blood_sugar_type = case
  when blood_sugar is null then 'Not Taken'
  when nullif(trim(blood_sugar_type), '') is null then 'RBS'
  else upper(trim(blood_sugar_type))
end;

update public.vital_signs
set alert_level = coalesce(nullif(trim(alert_level), ''), 'Normal'),
    recorded_at = coalesce(recorded_at, now());

alter table public.vital_signs
  alter column blood_sugar_type set default 'Not Taken',
  alter column blood_sugar_type set not null,
  alter column alert_level set default 'Normal',
  alter column alert_level set not null,
  alter column recorded_at set default now(),
  alter column recorded_at set not null;

alter table public.vital_signs drop constraint if exists vital_signs_blood_sugar_type_check;
alter table public.vital_signs add constraint vital_signs_blood_sugar_type_check
  check (blood_sugar_type in ('Not Taken','FBS','PPBS','RBS'));

alter table public.vital_signs drop constraint if exists vital_signs_pain_score_check;
alter table public.vital_signs add constraint vital_signs_pain_score_check
  check (pain_score is null or (pain_score >= 0 and pain_score <= 10));

alter table public.vital_signs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vital_signs' and policyname='authenticated_read') then
    create policy authenticated_read on public.vital_signs for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vital_signs' and policyname='authenticated_insert') then
    create policy authenticated_insert on public.vital_signs for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vital_signs' and policyname='authenticated_update') then
    create policy authenticated_update on public.vital_signs for update to authenticated using (true) with check (true);
  end if;
end $$;

-- Add to realtime when not already present.
do $$ begin
  alter publication supabase_realtime add table public.vital_signs;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='vital_signs'
order by ordinal_position;
