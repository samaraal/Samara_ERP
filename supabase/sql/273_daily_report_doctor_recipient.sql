-- Optional doctor WhatsApp recipient for the scheduled daily Intelligent Patient Report.
-- Disabled for existing preferences until an authorized user enables it.
alter table public.patient_family_communication_preferences
  add column if not exists doctor_report_enabled boolean not null default false,
  add column if not exists doctor_recipient_name text,
  add column if not exists doctor_recipient_mobile text;
