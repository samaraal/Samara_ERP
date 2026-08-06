-- Samara Care ERP 1.2.9
-- Manual Intelligent Report WhatsApp communication history

create table if not exists public.patient_communications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  communication_type text not null,
  method text not null default 'WhatsApp',
  recipient_type text,
  recipient_name text,
  recipient_number text,
  report_date date,
  status text default 'WhatsApp Opened',
  message_preview text,
  sent_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists patient_communications_patient_idx
  on public.patient_communications(patient_id, created_at desc);

alter table public.patient_communications enable row level security;

drop policy if exists patient_communications_authenticated_select on public.patient_communications;
create policy patient_communications_authenticated_select
on public.patient_communications for select
to authenticated
using (true);

drop policy if exists patient_communications_authenticated_insert on public.patient_communications;
create policy patient_communications_authenticated_insert
on public.patient_communications for insert
to authenticated
with check (true);

notify pgrst, 'reload schema';

select to_regclass('public.patient_communications') is not null as patient_communications_ready;
