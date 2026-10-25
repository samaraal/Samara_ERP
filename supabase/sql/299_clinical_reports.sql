-- 299 — Daily & Weekly Clinical Reports (ERP 2.18.142)
-- Run once in Supabase → SQL Editor. Safe to run again. Additive only: no existing table, row or report is changed.
--
--  1. clinical_report_settings  one row: daily cutoff (India time), weekly run time, switches.
--                               daily_auto_send is OFF — automatic WhatsApp to doctors stays off until Admin
--                               switches it on after the recipient and delivery checks have passed.
--  2. clinical_reports          immutable register of every generated PDF (Daily / Weekly, period, version).
--                               A correction is a NEW version; earlier PDFs are never overwritten or deleted.
--  3. clinical_report_sends     every WhatsApp send of a clinical report (automatic daily / manual), one
--                               successful send per report + recipient.
--  4. Doctor recipient verification on patient_family_communication_preferences (cleared automatically when
--     the doctor's number or name is changed) + optional Guest-specific glucose targets.
--  5. Access: staff read through the ERP (Admin, Manager, Nurse); all writes only through the
--     daily-patient-report Edge Function (service role), which checks the user's role.
--  PDFs stay in the existing private "patient-reports" storage bucket; staff open them via short-lived links.

-- 1. Settings ---------------------------------------------------------------------------------------
create table if not exists public.clinical_report_settings(
  id text primary key default 'global' check (id='global'),
  daily_enabled boolean not null default true,
  daily_cutoff time not null default '20:00',
  daily_auto_send boolean not null default false,
  weekly_enabled boolean not null default true,
  weekly_run_time time not null default '07:30',
  final_report_delay_minutes int not null default 120 check (final_report_delay_minutes between 0 and 1440),
  thresholds jsonb not null default '{}'::jsonb,
  activated_at timestamptz not null default now(),
  function_version text,              -- set by the daily-patient-report function; the ERP screen waits for it
  updated_by uuid, updated_by_name text,
  updated_at timestamptz not null default now()
);
alter table public.clinical_report_settings add column if not exists function_version text;
insert into public.clinical_report_settings(id) values('global') on conflict (id) do nothing;
comment on table public.clinical_report_settings is 'Daily/Weekly Clinical Reports. Times are India time (Asia/Kolkata). daily_auto_send OFF until delivery checks pass.';

-- 2. Report register ----------------------------------------------------------------------------------
create table if not exists public.clinical_reports(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,  -- cascade only for Trial Guest erasing
  kind text not null check (kind in ('daily','weekly')),
  period_from timestamptz not null,
  period_to timestamptz not null,
  week_no int,
  is_final boolean not null default false,
  version int not null default 1 check (version >= 1),
  supersedes uuid references public.clinical_reports(id),
  trigger text not null default 'scheduled' check (trigger in ('scheduled','manual','discharge')),
  storage_bucket text not null default 'patient-reports',
  storage_path text not null,
  file_name text not null,
  pages int,
  status text not null default 'saved' check (status in ('saved','held','sending','sent','failed')),
  hold_reasons jsonb not null default '[]'::jsonb,
  ai_model text,
  summary jsonb not null default '{}'::jsonb,
  doctor_name text,
  generated_at timestamptz not null default now(),
  generated_by uuid,
  generated_by_name text,
  constraint clinical_reports_period_check check (period_to > period_from),
  constraint clinical_reports_unique_version unique (patient_id, kind, period_from, period_to, version)
);
create index if not exists clinical_reports_patient_idx on public.clinical_reports(patient_id, kind, period_to desc);

-- A saved report is a historical snapshot: only its delivery status / hold reasons may change.
create or replace function public.clinical_reports_keep_snapshot() returns trigger language plpgsql as $$
begin
  if new.patient_id<>old.patient_id or new.kind<>old.kind or new.period_from<>old.period_from or new.period_to<>old.period_to
     or new.version<>old.version or new.storage_path<>old.storage_path or new.file_name<>old.file_name or new.generated_at<>old.generated_at then
    raise exception 'A saved clinical report cannot be changed. Generate a new version instead.';
  end if;
  return new;
end $$;
drop trigger if exists clinical_reports_keep_snapshot on public.clinical_reports;
create trigger clinical_reports_keep_snapshot before update on public.clinical_reports for each row execute function public.clinical_reports_keep_snapshot();

-- 3. Sends --------------------------------------------------------------------------------------------
create table if not exists public.clinical_report_sends(
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.clinical_reports(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  recipient_name text,
  recipient_number text not null,
  mode text not null check (mode in ('automatic','manual')),
  status text not null default 'sending' check (status in ('sending','accepted','failed','unknown')),
  provider_message_id text,
  error text,
  sent_by uuid,
  sent_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- never two live sends of the same report to the same number (a failed send may be retried)
create unique index if not exists clinical_report_sends_once on public.clinical_report_sends(report_id, recipient_number)
  where status in ('sending','accepted','unknown');
create index if not exists clinical_report_sends_report_idx on public.clinical_report_sends(report_id, created_at desc);

-- 4. Doctor recipient verification + Guest glucose targets ----------------------------------------------
alter table public.patient_family_communication_preferences
  add column if not exists doctor_recipient_verified_at timestamptz,
  add column if not exists doctor_recipient_verified_by uuid,
  add column if not exists doctor_recipient_verified_by_name text,
  add column if not exists doctor_recipient_verified_mobile text,
  add column if not exists glucose_fasting_min numeric,
  add column if not exists glucose_fasting_max numeric,
  add column if not exists glucose_post_max numeric,
  add column if not exists glucose_low numeric;

create or replace function public.clinical_doctor_recipient_reverify() returns trigger language plpgsql as $$
begin
  if coalesce(new.doctor_recipient_mobile,'') is distinct from coalesce(old.doctor_recipient_mobile,'')
     or coalesce(new.doctor_recipient_name,'') is distinct from coalesce(old.doctor_recipient_name,'') then
    new.doctor_recipient_verified_at := null; new.doctor_recipient_verified_by := null;
    new.doctor_recipient_verified_by_name := null; new.doctor_recipient_verified_mobile := null;
  end if;
  return new;
end $$;
drop trigger if exists clinical_doctor_recipient_reverify on public.patient_family_communication_preferences;
create trigger clinical_doctor_recipient_reverify before update on public.patient_family_communication_preferences
  for each row execute function public.clinical_doctor_recipient_reverify();

-- 5. Access ---------------------------------------------------------------------------------------------
alter table public.clinical_report_settings enable row level security;
alter table public.clinical_reports enable row level security;
alter table public.clinical_report_sends enable row level security;
drop policy if exists "clinical report settings read" on public.clinical_report_settings;
create policy "clinical report settings read" on public.clinical_report_settings for select to authenticated
  using (public.current_user_has_role(array['Admin','Manager','Nurse']));
drop policy if exists "clinical reports read" on public.clinical_reports;
create policy "clinical reports read" on public.clinical_reports for select to authenticated
  using (public.current_user_has_role(array['Admin','Manager','Nurse']));
drop policy if exists "clinical report sends read" on public.clinical_report_sends;
create policy "clinical report sends read" on public.clinical_report_sends for select to authenticated
  using (public.current_user_has_role(array['Admin','Manager','Nurse']));
revoke insert, update, delete on public.clinical_report_settings, public.clinical_reports, public.clinical_report_sends from anon, authenticated;
revoke all on public.clinical_report_settings, public.clinical_reports, public.clinical_report_sends from anon;
grant select on public.clinical_report_settings, public.clinical_reports, public.clinical_report_sends to authenticated;
grant all on public.clinical_report_settings, public.clinical_reports, public.clinical_report_sends to service_role;

-- Result
select (select row_to_json(s) from public.clinical_report_settings s) as settings,
       (select count(*) from public.clinical_reports) as reports_saved;

-- ROLLBACK (only if ever needed; removes nothing else):
--   update public.clinical_report_settings set daily_enabled=false, weekly_enabled=false, daily_auto_send=false;
--   (the tables can stay; they are not used by any other part of the ERP)
