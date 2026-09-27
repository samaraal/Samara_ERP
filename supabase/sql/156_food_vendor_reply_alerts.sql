-- Samara Care ERP 2.14.77 — Food vendor reply alerts
-- Run once in Supabase > SQL Editor (file 156). Safe to run again.
--
-- The vendor's WhatsApp button reply (Acknowledged / Returned / Needs Modification) was only
-- written onto the message and shown in Food Vendor Management > Messages. Nobody was alerted.
-- This adds, without changing how orders are sent or how replies are recorded:
--   * Returned              -> alert to Nursing Manager + Admin / Director (pop-up, Notifications, phone push)
--   * Modification Requested -> alert to Nursing Manager (pop-up, Notifications, phone push)
--   * No reply 30 minutes after an order was sent by WhatsApp -> reminder to Nursing Manager
--   * "Mark handled" (with a note) clears an alert. A new vendor reply re-opens it.
-- Admin / Director also see every alert in Notifications.
-- fv_rpc, fv_access, fv_apply_vendor_button_reply and fv_set_vendor_reply are NOT changed.

begin;

-- 1. New columns on fv_messages
alter table public.fv_messages
  add column if not exists sent_at timestamptz,
  add column if not exists reply_handled_at timestamptz,
  add column if not exists reply_handled_by uuid,
  add column if not exists reply_handled_note text;

-- 2. Record when a message was first sent by WhatsApp, and re-open an alert when the reply changes.
create or replace function public.fv_messages_reply_tracking()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.provider_id is not null and old.provider_id is null and new.sent_at is null then
    new.sent_at := now();
  end if;
  if new.vendor_reply_status is distinct from old.vendor_reply_status then
    new.reply_handled_at := null;
    new.reply_handled_by := null;
    new.reply_handled_note := null;
  end if;
  return new;
end $$;
drop trigger if exists fv_messages_reply_tracking on public.fv_messages;
create trigger fv_messages_reply_tracking before update on public.fv_messages
  for each row execute function public.fv_messages_reply_tracking();

-- Existing sent messages: use the time the message was created.
update public.fv_messages m set sent_at = e.created_at
from public.fv_events e
where e.id = m.event_id and m.provider_id is not null and m.sent_at is null;

-- 3. The list of open alerts (used by the app and by the phone-push job).
create or replace function public.fv_vendor_reply_alert_rows(p_now timestamptz default now())
returns table(alert_key text, alert_type text, message_id uuid, order_id uuid, order_ref text,
              order_date text, meal text, delivery text, vendor_name text, event_at timestamptz,
              minutes integer, reply_note text)
language sql stable security definer set search_path=public,pg_temp as $$
  with msgs as (
    select m.*, o.status as order_status, o.data as od,
      coalesce(m.sent_at, e.created_at) as sent_time,
      case when coalesce(o.data->>'date','') ~ '^\d{4}-\d{2}-\d{2}$' and coalesce(o.data->>'delivery','') ~ '^\d{2}:\d{2}$'
           then (((o.data->>'date')||' '||(o.data->>'delivery'))::timestamp at time zone 'Asia/Kolkata') end as delivery_at
    from public.fv_messages m
    join public.fv_orders o on o.id = m.order_id
    join public.fv_events e on e.id = m.event_id
  ), replies as (
    select m.* from msgs m
    where m.vendor_reply_status in ('Returned','Modification Requested')
      and m.reply_handled_at is null
      and m.order_status in ('Ordered','Partial')
      and m.vendor_reply_at > p_now - interval '2 days'
      -- only the latest reply for the order counts (e.g. a later Acknowledged cancels an earlier alert)
      and not exists (select 1 from public.fv_messages x where x.order_id = m.order_id and x.vendor_reply_at > m.vendor_reply_at)
  ), silent as (
    select m.* from msgs m
    where m.kind = 'order'
      and m.provider_id is not null                       -- sent by the WhatsApp API (message has the reply buttons)
      and m.status not in ('Failed','Superseded')
      and m.vendor_reply_status is null
      and m.reply_handled_at is null
      and m.order_status = 'Ordered'
      and m.sent_time <= p_now - interval '30 minutes'
      and m.delivery_at is not null and p_now < m.delivery_at
      and not exists (select 1 from public.fv_messages x where x.order_id = m.order_id and x.vendor_reply_status is not null)
      and not exists (select 1 from public.fv_messages x where x.order_id = m.order_id and x.kind = 'modification')
  )
  select r.vendor_reply_status||':'||r.id||':'||r.vendor_reply_at, r.vendor_reply_status, r.id, r.order_id,
         'FOOD-'||upper(left(r.order_id::text,8)), r.od->>'date', case when r.od->>'slot'='Tiffin' then 'Breakfast' else r.od->>'slot' end,
         r.od->>'delivery', coalesce(r.snapshot->>'vendor_name','Vendor'), r.vendor_reply_at,
         greatest(0, floor(extract(epoch from (p_now - r.vendor_reply_at))/60))::int, r.vendor_reply_note
  from replies r
  union all
  select 'No reply:'||s.id||':'||s.sent_time, 'No reply', s.id, s.order_id,
         'FOOD-'||upper(left(s.order_id::text,8)), s.od->>'date', case when s.od->>'slot'='Tiffin' then 'Breakfast' else s.od->>'slot' end,
         s.od->>'delivery', coalesce(s.snapshot->>'vendor_name','Vendor'), s.sent_time + interval '30 minutes',
         greatest(0, floor(extract(epoch from (p_now - s.sent_time))/60))::int, null
  from silent s
$$;
revoke all on function public.fv_vendor_reply_alert_rows(timestamptz) from public, anon, authenticated;
grant execute on function public.fv_vendor_reply_alert_rows(timestamptz) to service_role;

-- 3b. For signed-in food-order staff (Nursing Manager, Admin / Director, delegated in-charge).
create or replace function public.fv_vendor_reply_alerts()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb := public.fv_access();
begin
  if not coalesce((a->>'read')::boolean,false) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.event_at desc) from public.fv_vendor_reply_alert_rows(now()) r), '[]'::jsonb);
end $$;
revoke all on function public.fv_vendor_reply_alerts() from public, anon;
grant execute on function public.fv_vendor_reply_alerts() to authenticated;

-- 4. Mark an alert handled (note required), e.g. "Called vendor, sent revised order".
create or replace function public.fv_mark_vendor_reply_handled(p_message_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb := public.fv_access(); rec public.fv_messages;
begin
  if not coalesce((a->>'control')::boolean,false) then raise exception 'Only the current food order in-charge or Admin/Director may mark this handled'; end if;
  if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'Enter what was done (for example: called vendor, arranged other food).'; end if;
  update public.fv_messages set reply_handled_at = now(), reply_handled_by = (a->>'actor')::uuid,
         reply_handled_note = trim(p_note), updated_at = now()
  where id = p_message_id returning * into rec;
  if not found then raise exception 'Message not found'; end if;
  return to_jsonb(rec);
end $$;
revoke all on function public.fv_mark_vendor_reply_handled(uuid,text) from public, anon;
grant execute on function public.fv_mark_vendor_reply_handled(uuid,text) to authenticated;

-- 5. Phone push: one push per alert per phone, claimed here so it is never sent twice.
create table if not exists public.fv_reply_push_receipts(
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
alter table public.fv_reply_push_receipts enable row level security;
revoke all on public.fv_reply_push_receipts from anon, authenticated;
grant all on public.fv_reply_push_receipts to service_role;

-- Who receives which push: Returned -> Nursing Manager + Admin/Director; others -> Nursing Manager.
create or replace function public.fv_claim_reply_push(p_alert_key text, p_subscription uuid, p_alert_type text, p_event_at timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if not exists (
    select 1
    from public.push_subscriptions s
    join public.profiles p on (p.id = coalesce(s.profile_id, s.user_id) or (s.profile_id is null and p.auth_user_id = s.user_id))
    cross join lateral (select to_jsonb(p) as j) pj
    cross join lateral (select trim(regexp_replace(lower(coalesce(nullif(pj.j->>'designation',''),nullif(pj.j->>'employee_designation',''),nullif(pj.j->>'job_title',''),pj.j->>'position','')),'[._ -]+',' ','g')) as des) d
    where s.id = p_subscription and s.is_active
      and coalesce(p.active,true) and coalesce(p.is_active,true)
      and p_event_at >= coalesce(s.notifications_enabled_at, s.created_at)
      and p_event_at between clock_timestamp() - interval '24 hours' and clock_timestamp() + interval '5 minutes'
      and (
        d.des in ('nurse manager','nursing manager')
        or (d.des = '' and lower(coalesce(pj.j->>'department','')) = 'nursing' and p.role = 'Manager')
        or (p_alert_type = 'Returned' and lower(trim(p.role)) in ('admin','administrator','director'))
      )
  ) then return false; end if;
  insert into public.fv_reply_push_receipts(alert_key, subscription_id, state)
  values (p_alert_key, p_subscription, 'claimed')
  on conflict (alert_key, subscription_id) do update set state='claimed', claimed_at=clock_timestamp(), retry_after=null, tries=fv_reply_push_receipts.tries+1
  where fv_reply_push_receipts.state='retry' and fv_reply_push_receipts.retry_after<=clock_timestamp() and fv_reply_push_receipts.tries<3;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.fv_claim_reply_push(text,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.fv_claim_reply_push(text,uuid,text,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;

-- Check (should list the 4 new functions):
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('fv_vendor_reply_alert_rows','fv_vendor_reply_alerts','fv_mark_vendor_reply_handled','fv_claim_reply_push')
order by 1;
