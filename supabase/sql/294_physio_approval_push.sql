-- 294 — Phone notification for physiotherapy reschedule / correction requests (ERP 2.18.126).
-- When a nurse (or the Nursing Manager) requests a physio reschedule / correction, the Nursing Manager and Admin get
-- a phone notification; tapping it opens only that request with Approve / Reject.
-- The person who made the request never gets it (they cannot approve their own) — so the Nursing Manager's own
-- request goes to Admin only. One notification per request per phone; requests made before this file are not sent.
-- First create the Edge Function "physio-approval-alert-dispatch" (supabase/functions/physio-approval-alert-dispatch/index.ts)
-- in Supabase Dashboard → Edge Functions, then run this once in SQL Editor. Safe to re-run.
begin;

create table if not exists public.physio_approval_push_settings(
  id int primary key default 1 check(id=1),
  push_from timestamptz not null default now()
);
insert into public.physio_approval_push_settings(id) values(1) on conflict(id) do nothing;
alter table public.physio_approval_push_settings enable row level security;
revoke all on public.physio_approval_push_settings from anon, authenticated;

-- Pending requests made since this feature was switched on.
create or replace function public.physio_approval_push_rows()
returns table(request_id uuid,action text,reason text,patient_name text,room_label text,session_date date,requested_at timestamptz,requested_by uuid,requested_by_name text)
language sql stable security definer set search_path=public,pg_temp as $$
 select r.id,r.action,r.reason,
   coalesce(nullif(concat_ws(' ',p.title,p.full_name),''),'Guest'),
   nullif(concat_ws('-',p.room_no,p.bed_no),''),
   (r.original->>'session_date')::date,r.requested_at,r.requested_by,
   coalesce(staff.full_name,'Care team')
 from public.physiotherapy_corrections r
 cross join public.physio_approval_push_settings s
 left join public.patients p on p.id=(r.original->>'patient_id')::uuid
 left join lateral (select pr.full_name from public.profiles pr where pr.id=r.requested_by or pr.auth_user_id=r.requested_by limit 1) staff on true
 where r.state='Pending' and r.requested_at>=s.push_from and r.requested_at>now()-interval '2 days'
 order by r.requested_at;
$$;
revoke all on function public.physio_approval_push_rows() from public, anon, authenticated;
grant execute on function public.physio_approval_push_rows() to service_role;

create table if not exists public.physio_approval_push_receipts(
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
alter table public.physio_approval_push_receipts enable row level security;
revoke all on public.physio_approval_push_receipts from anon, authenticated;
grant all on public.physio_approval_push_receipts to service_role;

-- Who receives it: phones of Admin and the Nursing Manager (same rule as physiotherapy_can_review), never the requester.
create or replace function public.physio_approval_claim_push(p_alert_key text, p_subscription uuid, p_requested_by uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if not exists (
    select 1
    from public.push_subscriptions s
    join public.profiles p on (p.id = coalesce(s.profile_id, s.user_id) or (s.profile_id is null and p.auth_user_id = s.user_id))
    where s.id = p_subscription and s.is_active
      and coalesce(p.active,true) and coalesce(p.is_active,true)
      and (p.role='Admin' or lower(trim(coalesce(p.designation,''))) in ('nurse manager','nursing manager')
           or (coalesce(trim(p.designation),'')='' and p.role='Manager' and lower(trim(coalesce(p.department,'')))='nursing'))
      and p_requested_by is distinct from p.id and p_requested_by is distinct from p.auth_user_id
  ) then return false; end if;
  insert into public.physio_approval_push_receipts(alert_key, subscription_id, state)
  values (p_alert_key, p_subscription, 'claimed')
  on conflict (alert_key, subscription_id) do update set state='claimed', claimed_at=clock_timestamp(), retry_after=null, tries=physio_approval_push_receipts.tries+1
  where physio_approval_push_receipts.state='retry' and physio_approval_push_receipts.retry_after<=clock_timestamp() and physio_approval_push_receipts.tries<3;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.physio_approval_claim_push(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.physio_approval_claim_push(text,uuid,uuid) to service_role;

-- Run the dispatch every minute (copies the URL + secret header of the existing clinical push job, like 205 / 206).
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; physio approval push job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/physio-approval-alert-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-physio-approval-alert-dispatch';
  perform cron.schedule('samara-physio-approval-alert-dispatch', '* * * * *', new_cmd);
end $$;

commit;
notify pgrst, 'reload schema';

-- Check: the cron job and requests waiting right now.
select jobname, schedule from cron.job where jobname = 'samara-physio-approval-alert-dispatch';
select patient_name, action, session_date, requested_by_name, requested_at from public.physio_approval_push_rows();
