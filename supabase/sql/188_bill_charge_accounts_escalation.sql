-- Samara Care ERP 2.15.53 — Bills & Charges not attended by Accounts within 30 minutes
-- Run once in Supabase > SQL Editor (file 188). Safe to run again.
--
-- A charge request raised in Bills & Charges stays "Pending" until Accounts approves,
-- partially approves or rejects it in Charge Approvals. If it is still Pending
-- 30 minutes after it was raised:
--   * Admin / Director see it in the ERP (pop-up + Notifications page)
--   * Admin / Director get ONE WhatsApp message per Guest per run (Edge Function
--     bill-charge-escalation-dispatch, every minute). WhatsApp stays silent until the
--     Meta template "samara_billing_escalation" is approved and the secret
--     BILLING_WHATSAPP_ENABLED=true is set.
-- Nothing in the charge workflow itself is changed. Requests already pending before this
-- file is run are shown in the ERP list but are NOT sent on WhatsApp (no flood at go-live).

begin;

-- Columns used below (already present on the live database; kept here for safety).
alter table public.bill_charge_requests
  add column if not exists approval_status text default 'Pending',
  add column if not exists raised_at timestamptz,
  add column if not exists raised_by_name text,
  add column if not exists service_name text;

-- 1. Settings (one row). minutes = how long Accounts has; whatsapp_from = go-live time.
create table if not exists public.bill_charge_alert_settings(
  id integer primary key default 1 check (id = 1),
  minutes integer not null default 30 check (minutes between 5 and 1440),
  whatsapp_from timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.bill_charge_alert_settings(id) values (1) on conflict (id) do nothing;
alter table public.bill_charge_alert_settings enable row level security;
revoke all on public.bill_charge_alert_settings from anon, authenticated;
grant select on public.bill_charge_alert_settings to authenticated;
grant all on public.bill_charge_alert_settings to service_role;
drop policy if exists bill_charge_alert_settings_read on public.bill_charge_alert_settings;
create policy bill_charge_alert_settings_read on public.bill_charge_alert_settings for select to authenticated using (true);

-- 2. Open overdue charge requests (Pending with Accounts for longer than the limit).
create or replace function public.bill_charge_overdue_rows(p_now timestamptz default now())
returns table(request_id uuid, patient_id uuid, guest_name text, room_label text, category text,
              item text, quantity numeric, raised_by_name text, raised_at timestamptz, minutes integer,
              whatsapp_due boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  with s as (select minutes, whatsapp_from from public.bill_charge_alert_settings where id = 1)
  select r.id, r.patient_id,
         nullif(trim(concat_ws(' ', p.title, p.full_name)), ''),
         case when nullif(trim(coalesce(p.room_no::text,'')),'') is not null
              then 'Room '||p.room_no||coalesce('-'||nullif(trim(p.bed_no::text),''),'') end,
         r.category,
         coalesce(nullif(trim(r.service_name),''), nullif(trim(r.description),''), r.category),
         r.quantity, r.raised_by_name,
         coalesce(r.raised_at, r.created_at),
         greatest(0, floor(extract(epoch from (p_now - coalesce(r.raised_at, r.created_at)))/60))::int,
         coalesce(r.raised_at, r.created_at) >= s.whatsapp_from
  from public.bill_charge_requests r
  cross join s
  left join public.patients p on p.id = r.patient_id
  where coalesce(nullif(trim(r.approval_status),''),'Pending') = 'Pending'
    and coalesce(r.status,'Raised') not in ('Posted','Rejected','Cancelled')
    and r.billing_transaction_id is null
    and coalesce(r.raised_at, r.created_at) <= p_now - make_interval(mins => s.minutes)
$$;
revoke all on function public.bill_charge_overdue_rows(timestamptz) from public, anon, authenticated;
grant execute on function public.bill_charge_overdue_rows(timestamptz) to service_role;

-- 3. For signed-in Admin / Director only (ERP pop-up and Notifications page).
create or replace function public.bill_charge_overdue_alerts()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists (select 1 from public.profiles p
                 where (p.id = auth.uid() or p.auth_user_id = auth.uid())
                   and coalesce(p.active,true) and coalesce(p.is_active,true)
                   and lower(trim(p.role)) in ('admin','administrator','director')) then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.raised_at)
                   from public.bill_charge_overdue_rows(now()) r), '[]'::jsonb);
end $$;
revoke all on function public.bill_charge_overdue_alerts() from public, anon;
grant execute on function public.bill_charge_overdue_alerts() to authenticated;

-- 4. WhatsApp delivery log: one row per charge request per Admin number, so it is never sent twice.
create table if not exists public.bill_charge_whatsapp_escalations(
  id uuid primary key default gen_random_uuid(),
  charge_request_id uuid not null,
  patient_id uuid,
  recipient_profile_id uuid,
  recipient_name text,
  recipient_number text not null,
  status text not null default 'Sending' check (status in ('Sending','Sent','Failed')),
  meta_message_id text,
  error_text text,
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (charge_request_id, recipient_number)
);
alter table public.bill_charge_whatsapp_escalations enable row level security;
revoke all on public.bill_charge_whatsapp_escalations from anon, authenticated;
grant select on public.bill_charge_whatsapp_escalations to authenticated;
grant all on public.bill_charge_whatsapp_escalations to service_role;
drop policy if exists bill_charge_wa_admin_read on public.bill_charge_whatsapp_escalations;
create policy bill_charge_wa_admin_read on public.bill_charge_whatsapp_escalations for select to authenticated
  using (exists (select 1 from public.profiles p
                 where (p.id = auth.uid() or p.auth_user_id = auth.uid())
                   and lower(trim(p.role)) in ('admin','administrator','director')));

-- 5. Run the WhatsApp dispatch every minute (copies the URL + secret header of the
--    existing clinical push job, exactly as file 139 did for clinical WhatsApp).
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; billing WhatsApp job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/bill-charge-escalation-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-bill-charge-whatsapp-dispatch';
  perform cron.schedule('samara-bill-charge-whatsapp-dispatch', '* * * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: settings row, the cron job, and what is overdue right now.
select minutes, whatsapp_from from public.bill_charge_alert_settings;
select jobname, schedule from cron.job where jobname = 'samara-bill-charge-whatsapp-dispatch';
select request_id, guest_name, item, minutes, whatsapp_due from public.bill_charge_overdue_rows() limit 20;
