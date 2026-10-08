-- Samara Care ERP 2.15.89 — Nursing Indent: nurse has not confirmed receipt within 20 minutes
-- Run once in Supabase > SQL Editor (file 205). Safe to run again.
--
-- Indent flow: Nurse requests → Nursing Manager approves → Store hands over → Nurse confirms "Received".
-- If the indent is still "Handed Over" (nurse has not pressed Received) 20 minutes after the handover:
--   * the nurse who raised the indent and the Nursing Manager get a pop-up in the ERP
--     and the indent shows on their Notifications (Alerts) page;
--   * both get a phone notification (Edge Function indent-receipt-alert-dispatch, every minute),
--     repeated every 20 minutes while the indent is still not received.
-- Admin / Director can see the list on Notifications (no pop-up, no phone notification).
-- Nothing in the indent workflow itself is changed. Indents handed over before this file is run
-- are listed in the ERP but get no phone notification (no flood at go-live).

begin;

-- Columns used below (already present on the live database; kept here for safety).
alter table public.patient_consumable_indents
  add column if not exists handed_over_at timestamptz,
  add column if not exists received_at timestamptz;

-- 1. Settings (one row). minutes = time the nurse has; repeat_minutes = reminder gap (0 = only once);
--    push_from = go-live time for phone notifications.
create table if not exists public.indent_receipt_alert_settings(
  id integer primary key default 1 check (id = 1),
  minutes integer not null default 20 check (minutes between 5 and 240),
  repeat_minutes integer not null default 20 check (repeat_minutes between 0 and 240),
  push_from timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.indent_receipt_alert_settings(id) values (1) on conflict (id) do nothing;
alter table public.indent_receipt_alert_settings enable row level security;
revoke all on public.indent_receipt_alert_settings from anon, authenticated;
grant select on public.indent_receipt_alert_settings to authenticated;
grant all on public.indent_receipt_alert_settings to service_role;
drop policy if exists indent_receipt_alert_settings_read on public.indent_receipt_alert_settings;
create policy indent_receipt_alert_settings_read on public.indent_receipt_alert_settings for select to authenticated using (true);

-- 2. Is this profile the Nursing Manager? (same rule as the app: designation "Nurse Manager" /
--    "Nursing Manager"; if no designation, role Manager in the Nursing department)
create or replace function public.indent_is_nursing_manager(p_profile_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1
    from public.profiles p
    cross join lateral (select to_jsonb(p) as j) pj
    cross join lateral (select trim(regexp_replace(lower(coalesce(nullif(pj.j->>'designation',''),nullif(pj.j->>'employee_designation',''),nullif(pj.j->>'job_title',''),pj.j->>'position','')),'[._ -]+',' ','g')) as des) d
    where p.id = p_profile_id
      and coalesce(p.active,true) and coalesce(p.is_active,true)
      and (d.des in ('nurse manager','nursing manager')
           or (d.des = '' and lower(coalesce(pj.j->>'department','')) = 'nursing' and lower(trim(p.role)) = 'manager'))
  )
$$;
revoke all on function public.indent_is_nursing_manager(uuid) from public, anon, authenticated;
grant execute on function public.indent_is_nursing_manager(uuid) to service_role;

-- 3. Indents handed over but not received within the limit.
--    round_no = 0 at 20 min, 1 at 40 min, 2 at 60 min … (one phone notification per round).
create or replace function public.indent_receipt_overdue_rows(p_now timestamptz default now())
returns table(indent_id uuid, indent_ref text, patient_id uuid, guest_name text, room_label text,
              item_name text, quantity numeric, unit text, nurse_id uuid, nurse_name text,
              handed_over_by_name text, handed_over_at timestamptz, minutes integer,
              round_no integer, push_due boolean)
language sql stable security definer set search_path=public,pg_temp as $$
  with s as (select minutes, repeat_minutes, push_from from public.indent_receipt_alert_settings where id = 1)
  select i.id,
         'CI-'||lpad(coalesce(i.indent_no::text,''),5,'0'),
         i.patient_id,
         nullif(trim(concat_ws(' ', p.title, p.full_name)), ''),
         case when nullif(trim(coalesce(p.room_no::text,'')),'') is not null
              then 'Room '||p.room_no||coalesce('-'||nullif(trim(p.bed_no::text),''),'') end,
         i.item_name, coalesce(i.handed_over_qty, i.approved_qty, i.requested_qty), i.unit,
         i.initiated_by, i.initiated_by_name, i.handed_over_by_name, i.handed_over_at,
         greatest(0, floor(extract(epoch from (p_now - i.handed_over_at))/60))::int,
         case when s.repeat_minutes > 0
              then floor((extract(epoch from (p_now - i.handed_over_at))/60 - s.minutes) / s.repeat_minutes)::int
              else 0 end,
         i.handed_over_at >= s.push_from
  from public.patient_consumable_indents i
  cross join s
  left join public.patients p on p.id = i.patient_id
  where i.status = 'Handed Over'
    and i.received_at is null
    and i.handed_over_at is not null
    and i.handed_over_at <= p_now - make_interval(mins => s.minutes)
    and i.handed_over_at > p_now - interval '3 days'
$$;
revoke all on function public.indent_receipt_overdue_rows(timestamptz) from public, anon, authenticated;
grant execute on function public.indent_receipt_overdue_rows(timestamptz) to service_role;

-- 4. For the signed-in user: the nurse sees her own indents; Nursing Manager and Admin / Director see all.
--    Each row says why the caller sees it (audience = 'nurse' | 'manager' | 'admin').
create or replace function public.indent_receipt_overdue_alerts()
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
    select jsonb_agg(to_jsonb(r) || jsonb_build_object('audience',
             case when r.nurse_id = me then 'nurse' when is_nm then 'manager' else 'admin' end)
           order by r.handed_over_at)
    from public.indent_receipt_overdue_rows(now()) r
    where r.nurse_id = me or is_nm or is_admin
  ), '[]'::jsonb);
end $$;
revoke all on function public.indent_receipt_overdue_alerts() from public, anon;
grant execute on function public.indent_receipt_overdue_alerts() to authenticated;

-- 5. Phone notification: one per indent per round per phone, claimed here so it is never sent twice.
create table if not exists public.indent_receipt_push_receipts(
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
alter table public.indent_receipt_push_receipts enable row level security;
revoke all on public.indent_receipt_push_receipts from anon, authenticated;
grant all on public.indent_receipt_push_receipts to service_role;

-- Who receives it: the phone of the nurse who raised the indent, or of the Nursing Manager.
create or replace function public.indent_claim_receipt_push(p_alert_key text, p_subscription uuid, p_nurse_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if not exists (
    select 1
    from public.push_subscriptions s
    join public.profiles p on (p.id = coalesce(s.profile_id, s.user_id) or (s.profile_id is null and p.auth_user_id = s.user_id))
    where s.id = p_subscription and s.is_active
      and coalesce(p.active,true) and coalesce(p.is_active,true)
      and (p.id = p_nurse_id or public.indent_is_nursing_manager(p.id))
  ) then return false; end if;
  insert into public.indent_receipt_push_receipts(alert_key, subscription_id, state)
  values (p_alert_key, p_subscription, 'claimed')
  on conflict (alert_key, subscription_id) do update set state='claimed', claimed_at=clock_timestamp(), retry_after=null, tries=indent_receipt_push_receipts.tries+1
  where indent_receipt_push_receipts.state='retry' and indent_receipt_push_receipts.retry_after<=clock_timestamp() and indent_receipt_push_receipts.tries<3;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.indent_claim_receipt_push(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.indent_claim_receipt_push(text,uuid,uuid) to service_role;

-- 6. Run the phone-notification dispatch every minute (copies the URL + secret header of the
--    existing clinical push job, exactly as files 124 and 188 did).
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; indent receipt push job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/indent-receipt-alert-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-indent-receipt-alert-dispatch';
  perform cron.schedule('samara-indent-receipt-alert-dispatch', '* * * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: settings row, the cron job, and what is overdue right now.
select minutes, repeat_minutes, push_from from public.indent_receipt_alert_settings;
select jobname, schedule from cron.job where jobname = 'samara-indent-receipt-alert-dispatch';
select indent_ref, guest_name, item_name, nurse_name, minutes, round_no, push_due from public.indent_receipt_overdue_rows() limit 20;
