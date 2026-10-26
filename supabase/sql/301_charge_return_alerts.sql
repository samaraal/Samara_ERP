-- 301 — Bills & Charges: alert the nurse when Accounts RETURN her charge request — ERP 2.18.148
-- Run once in Supabase > SQL Editor, AFTER file 300. Safe to run again.
--
-- When Accounts return a request (stored decision 'Rejected', shown as "Returned"):
--   * the nurse who raised it gets an ERP pop-up (repeated every hour while she is signed in, until the request
--     is corrected and resubmitted) and it is listed on her Notifications page;
--   * her phone gets ONE notification at the time of the return (Edge Function charge-return-alert-dispatch,
--     run every minute by pg_cron). repeat_minutes > 0 in the settings row would repeat the phone notification.
--   * the Nursing Manager and Admin / Director see the list on Notifications (no pop-up, no phone notification).
-- Alerts stop as soon as the request is resubmitted, and are not raised for returns older than 3 days.
-- Returns made before this file is run are listed but get no phone notification (no flood at go-live).

begin;

create table if not exists public.charge_return_alert_settings(
  id integer primary key default 1 check (id = 1),
  repeat_minutes integer not null default 0 check (repeat_minutes between 0 and 720),
  push_from timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.charge_return_alert_settings(id) values (1) on conflict (id) do nothing;
alter table public.charge_return_alert_settings enable row level security;
revoke all on public.charge_return_alert_settings from anon, authenticated;
grant select on public.charge_return_alert_settings to authenticated;
grant all on public.charge_return_alert_settings to service_role;
drop policy if exists charge_return_alert_settings_read on public.charge_return_alert_settings;
create policy charge_return_alert_settings_read on public.charge_return_alert_settings for select to authenticated using (true);

-- Returned, not yet resubmitted (last 3 days). nurse_id = profile id of the nurse who raised it.
create or replace function public.charge_return_rows(p_now timestamptz default now())
returns table(request_id uuid, patient_id uuid, guest_name text, room_label text, item text, category text,
              quantity numeric, unit text, nurse_id uuid, nurse_name text, returned_by_name text, reason text,
              returned_at timestamptz, minutes integer, round_no integer, push_due boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  with s as (select repeat_minutes, push_from from public.charge_return_alert_settings where id = 1)
  select r.id, r.patient_id,
         nullif(trim(concat_ws(' ', p.title, p.full_name)), ''),
         case when nullif(trim(coalesce(p.room_no::text,'')),'') is not null
              then 'Room '||p.room_no||coalesce('-'||nullif(trim(p.bed_no::text),''),'') end,
         concat_ws(' · ', nullif(r.charge_item_code,''), coalesce(nullif(r.service_name,''), nullif(r.description,''), 'Charge')),
         r.category, r.quantity, r.unit,
         n.id, coalesce(nullif(r.raised_by_name,''), n.full_name),
         r.decision_by_name, nullif(trim(coalesce(r.approval_remarks,'')),''),
         coalesce(r.approved_at, r.updated_at),
         greatest(0, floor(extract(epoch from (p_now - coalesce(r.approved_at, r.updated_at)))/60))::int,
         case when s.repeat_minutes > 0
              then floor(extract(epoch from (p_now - coalesce(r.approved_at, r.updated_at)))/60 / s.repeat_minutes)::int
              else 0 end,
         coalesce(r.approved_at, r.updated_at) >= s.push_from
  from public.bill_charge_requests r
  cross join s
  left join public.patients p on p.id = r.patient_id
  left join lateral (select pr.id, pr.full_name from public.profiles pr
                     where pr.id = r.raised_by or pr.auth_user_id = r.raised_by limit 1) n on true
  where r.approval_status = 'Rejected'
    and r.resubmitted_as is null
    and r.physiotherapy_session_id is null
    and coalesce(r.approved_at, r.updated_at) > p_now - interval '3 days'
$$;
revoke all on function public.charge_return_rows(timestamptz) from public, anon, authenticated;
grant execute on function public.charge_return_rows(timestamptz) to service_role;

-- For the signed-in user: the nurse sees her own returns (audience 'nurse');
-- Nursing Manager and Admin / Director see all (audience 'manager' / 'admin').
create or replace function public.charge_return_alerts()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid; is_nm boolean; is_admin boolean;
begin
  select p.id, lower(trim(p.role)) in ('admin','administrator','director')
    into me, is_admin
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and coalesce(p.active,true) and coalesce(p.is_active,true)
  limit 1;
  if me is null then return '[]'::jsonb; end if;
  is_nm := public.indent_is_nursing_manager(me);
  return coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('audience',
             case when x.nurse_id = me then 'nurse' when is_nm then 'manager' else 'admin' end)
           order by x.returned_at desc)
    from public.charge_return_rows(now()) x
    where x.nurse_id = me or is_nm or is_admin
  ), '[]'::jsonb);
end $$;
revoke all on function public.charge_return_alerts() from public, anon;
grant execute on function public.charge_return_alerts() to authenticated;

-- Phone notification: one per return (per round) per phone, claimed here so it is never sent twice.
create table if not exists public.charge_return_push_receipts(
  alert_key text not null,
  subscription_id uuid not null references public.push_subscriptions(id),
  state text not null check (state in ('claimed','sent','retry','failed')),
  claimed_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  retry_after timestamptz,
  tries integer not null default 1,
  detail text,
  primary key (alert_key, subscription_id)
);
alter table public.charge_return_push_receipts enable row level security;
revoke all on public.charge_return_push_receipts from anon, authenticated;
grant all on public.charge_return_push_receipts to service_role;

-- Only the phone(s) of the nurse who raised the request.
create or replace function public.charge_return_claim_push(p_alert_key text, p_subscription uuid, p_nurse_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if p_nurse_id is null or not exists (
    select 1
    from public.push_subscriptions s
    join public.profiles p on (p.id = coalesce(s.profile_id, s.user_id) or (s.profile_id is null and p.auth_user_id = s.user_id))
    where s.id = p_subscription and s.is_active
      and coalesce(p.active,true) and coalesce(p.is_active,true)
      and p.id = p_nurse_id
  ) then return false; end if;
  insert into public.charge_return_push_receipts(alert_key, subscription_id, state)
  values (p_alert_key, p_subscription, 'claimed')
  on conflict (alert_key, subscription_id) do update set state='claimed', claimed_at=clock_timestamp(), retry_after=null, tries=charge_return_push_receipts.tries+1
  where charge_return_push_receipts.state='retry' and charge_return_push_receipts.retry_after<=clock_timestamp() and charge_return_push_receipts.tries<3;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.charge_return_claim_push(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.charge_return_claim_push(text,uuid,uuid) to service_role;

-- Run the phone-notification dispatch every minute (copies the URL + secret header of the existing clinical push job).
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; charge return push job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/charge-return-alert-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-charge-return-alert-dispatch';
  perform cron.schedule('samara-charge-return-alert-dispatch', '* * * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: settings row, the cron job, and current returns.
select repeat_minutes, push_from from public.charge_return_alert_settings;
select jobname, schedule from cron.job where jobname = 'samara-charge-return-alert-dispatch';
select guest_name, item, nurse_name, returned_by_name, reason, minutes, push_due from public.charge_return_rows() limit 20;
