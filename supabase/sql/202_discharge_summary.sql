-- Samara Care ERP 2.15.83 — Discharge Summary (PDF) for completed discharges.
-- Run once in Supabase > SQL Editor. Safe to run again.
-- The PDF itself is created by the Edge Function "discharge-summary" and stored in the private
-- bucket "patient-reports" (<patient id>/discharge/...). These columns remember where it is and
-- whether the WhatsApp PDF reached Meta.

alter table public.patient_discharges
  add column if not exists discharge_summary_storage_path text,
  add column if not exists discharge_summary_generated_at timestamptz,
  add column if not exists discharge_summary_whatsapp_status text,
  add column if not exists discharge_summary_whatsapp_message_id text,
  add column if not exists discharge_summary_whatsapp_sent_at timestamptz,
  add column if not exists discharge_summary_whatsapp_error text;

comment on column public.patient_discharges.discharge_summary_storage_path is 'patient-reports bucket path of the latest Discharge Summary PDF (2.15.83)';
comment on column public.patient_discharges.discharge_summary_whatsapp_status is 'Accepted / Failed — Discharge Summary PDF sent by WhatsApp API (2.15.83)';

-- Check: should list the 6 new columns
select column_name from information_schema.columns
 where table_schema='public' and table_name='patient_discharges' and column_name like 'discharge_summary_%'
 order by column_name;
