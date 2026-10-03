-- Samara Care ERP 2.15.54 — Bills & Charges WhatsApp: repeat every 30 minutes
-- Run once in Supabase > SQL Editor (file 189), AFTER file 188. Safe to run again.
--
-- While any charge request is still Pending with Accounts beyond 30 minutes, each Admin /
-- Director gets the summary WhatsApp again every 30 minutes ("20 Bills/Charges ... pending
-- since 12:30 PM"). It stops by itself once Accounts has attended to all of them.

begin;

alter table public.bill_charge_alert_settings
  add column if not exists repeat_minutes integer not null default 30 check (repeat_minutes between 10 and 1440);

-- One row per summary WhatsApp sent to one Admin / Director.
create table if not exists public.bill_charge_whatsapp_summaries(
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid,
  recipient_name text,
  recipient_number text not null,
  pending_count integer not null,
  pending_since timestamptz,
  status text not null default 'Sending' check (status in ('Sending','Sent','Failed')),
  meta_message_id text,
  error_text text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bill_charge_wa_summaries_recent on public.bill_charge_whatsapp_summaries(recipient_number, created_at desc);
alter table public.bill_charge_whatsapp_summaries enable row level security;
revoke all on public.bill_charge_whatsapp_summaries from anon, authenticated;
grant select on public.bill_charge_whatsapp_summaries to authenticated;
grant all on public.bill_charge_whatsapp_summaries to service_role;
drop policy if exists bill_charge_wa_summaries_admin_read on public.bill_charge_whatsapp_summaries;
create policy bill_charge_wa_summaries_admin_read on public.bill_charge_whatsapp_summaries for select to authenticated
  using (exists (select 1 from public.profiles p
                 where (p.id = auth.uid() or p.auth_user_id = auth.uid())
                   and lower(trim(p.role)) in ('admin','administrator','director')));

notify pgrst, 'reload schema';
commit;

select minutes, repeat_minutes, whatsapp_from from public.bill_charge_alert_settings;
