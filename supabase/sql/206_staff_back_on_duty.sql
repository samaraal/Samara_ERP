-- Samara Care ERP 2.15.90 — Staff back on duty after approved leave
-- Run once in Supabase > SQL Editor (file 206). Safe to run again.
--
-- 1. The Manager (Nursing Manager for nursing staff) or Admin marks "Back on Duty" with the actual
--    date & time the staff reported. Works for an early, on-time or late return.
--    (Early return shortens the leave exactly as "Record Early Return" did.)
-- 2. Due back = the first rostered working shift after the leave ends (looked up to 7 days ahead in
--    Duty Assignment); if no roster, the day after the leave ends.
--    Not marked back 2 hours after that shift starts (10 AM if no roster) -> "Not back on duty" alert:
--    Admin / Director (pop-up, Alerts page, phone) and the staff member's Manager (pop-up, Alerts page).
-- 3. When a staff member is marked back on duty -> Admin / Director are informed (pop-up, Alerts page, phone).
-- 4. Staff Leave Calendar shows Due back / Back on duty / Not back for each leave.
-- The Nursing Manager's own return (Stores In-charge handover) still goes through
-- "Approve Return to Duty"; nothing in the leave approval workflow is changed.

begin;

alter table public.absence_requests
  add column if not exists return_to_duty_at timestamptz;

-- Settings (one row). hours_after_shift = grace after the shift start; default_time = when there is no roster.
create table if not exists public.staff_return_alert_settings(
  id integer primary key default 1 check (id = 1),
  hours_after_shift numeric not null default 2 check (hours_after_shift between 0 and 12),
  default_time time not null default '10:00',
  push_from timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.staff_return_alert_settings(id) values (1) on conflict (id) do nothing;
alter table public.staff_return_alert_settings enable row level security;
revoke all on public.staff_return_alert_settings from anon, authenticated;
grant select on public.staff_return_alert_settings to authenticated;
grant all on public.staff_return_alert_settings to service_role;
drop policy if exists staff_return_alert_settings_read on public.staff_return_alert_settings;
create policy staff_return_alert_settings_read on public.staff_return_alert_settings for select to authenticated using (true);

-- Start time of a shift label such as "Day Shift (7 AM–7 PM)" or "General Shift (9:30 AM–6 PM)".
create or replace function public.staff_shift_start(p_shift text)
returns time language plpgsql immutable set search_path=public,pg_temp as $$
declare m text[]; hh int; mm int;
begin
  m := regexp_match(coalesce(p_shift,''), '\(\s*(\d{1,2})(?:[:.](\d{2}))?\s*([AaPp])\.?[Mm]');
  if m is null then return null; end if;
  hh := m[1]::int % 12; mm := coalesce(m[2],'0')::int;
  if upper(m[3]) = 'P' then hh := hh + 12; end if;
  return make_time(hh, mm, 0);
exception when others then return null;
end $$;

-- One row per approved / returned leave: when she is due back, the alert time, and her return.
create or replace function public.staff_return_rows(p_from date, p_to date, p_now timestamptz default now())
returns table(leave_id bigint, employee_id uuid, employee_name text, department text, reporting_superior_id uuid,
              leave_from date, leave_to date, due_date date, due_shift text, alert_at timestamptz,
              returned_date date, returned_at timestamptz, recorded_by uuid, recorded_by_name text,
              recorded_at timestamptz, return_remarks text, late_days integer, return_status text)
language sql stable security definer set search_path=public,pg_temp as $$
  with s as (select hours_after_shift, default_time from public.staff_return_alert_settings where id = 1),
  lv as (
    select r.*, coalesce(r.original_leave_to_date, r.to_date) as planned_to
    from public.absence_requests r
    where r.request_type = 'Leave'
      and (r.status = 'approved' or r.return_to_duty_date is not null)
      and coalesce(r.original_leave_to_date, r.to_date) + 1 between p_from - 7 and p_to
  ),
  duty as (
    select lv.id as leave_id, d.duty_date, d.shift,
           row_number() over (partition by lv.id order by d.duty_date, public.staff_shift_start(d.shift) nulls last) as rn
    from lv
    join public.duty_assignments d on d.employee_id = lv.employee_id
     and d.duty_date between lv.planned_to + 1 and lv.planned_to + 7
     and not coalesce(d.is_weekly_off,false)
     and coalesce(d.status,'') not in ('Weekly Off','Leave granted','Cancelled')
     and coalesce(d.shift,'') <> 'Weekly Off'
  )
  select lv.id, lv.employee_id, nullif(trim(concat_ws(' ', p.title, p.full_name)),''), p.department, lv.reporting_superior_id,
         lv.from_date, lv.planned_to,
         coalesce(d.duty_date, lv.planned_to + 1),
         d.shift,
         case when d.duty_date is not null and public.staff_shift_start(d.shift) is not null
              then ((d.duty_date + public.staff_shift_start(d.shift))::timestamp at time zone 'Asia/Kolkata') + make_interval(secs => s.hours_after_shift * 3600)
              else ((coalesce(d.duty_date, lv.planned_to + 1) + s.default_time)::timestamp at time zone 'Asia/Kolkata') end,
         lv.return_to_duty_date, lv.return_to_duty_at, lv.return_recorded_by,
         nullif(trim(concat_ws(' ', rb.title, rb.full_name)),''), lv.return_recorded_at, lv.return_remarks,
         case when lv.return_to_duty_date is not null then greatest(0, lv.return_to_duty_date - coalesce(d.duty_date, lv.planned_to + 1)) end,
         case
           when lv.return_to_duty_date is not null then 'Back on duty'
           when lv.status <> 'approved' then 'Closed'
           when p_now >= case when d.duty_date is not null and public.staff_shift_start(d.shift) is not null
                         then ((d.duty_date + public.staff_shift_start(d.shift))::timestamp at time zone 'Asia/Kolkata') + make_interval(secs => s.hours_after_shift * 3600)
                         else ((coalesce(d.duty_date, lv.planned_to + 1) + s.default_time)::timestamp at time zone 'Asia/Kolkata') end
             then 'Not back'
           else 'Due back' end
  from lv
  cross join s
  join public.profiles p on p.id = lv.employee_id
  left join duty d on d.leave_id = lv.id and d.rn = 1
  left join public.profiles rb on rb.id = lv.return_recorded_by
  where coalesce(d.duty_date, lv.planned_to + 1) between p_from and p_to
     or (lv.return_to_duty_date between p_from and p_to)
$$;
revoke all on function public.staff_return_rows(date,date,timestamptz) from public, anon, authenticated;
grant execute on function public.staff_return_rows(date,date,timestamptz) to service_role;

-- Caller: Admin / Director, or Manager (Managers see staff of their department or reporting to them).
create or replace function public.staff_return_caller()
returns table(id uuid, is_admin boolean, is_manager boolean, department text)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,
         lower(trim(p.role)) in ('admin','administrator','director'),
         lower(trim(p.role)) = 'manager',
         lower(trim(coalesce(p.department,'')))
  from public.duty_profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid()) and coalesce(p.is_active,true)
  limit 1
$$;
revoke all on function public.staff_return_caller() from public, anon, authenticated;

-- Staff Leave Calendar: return status for the week shown (Admin / Director / Manager).
create or replace function public.staff_return_status(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c record;
begin
  select * into c from public.staff_return_caller();
  if c.id is null or not (c.is_admin or c.is_manager) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.due_date)
                   from public.staff_return_rows(p_from, p_to, now()) r where r.return_status <> 'Closed'), '[]'::jsonb);
end $$;
revoke all on function public.staff_return_status(date,date) from public, anon;
grant execute on function public.staff_return_status(date,date) to authenticated;

-- Alerts (pop-up + Alerts page):
--   Admin / Director: every "Not back" + every "Back on duty" marked in the last 24 hours (not by themselves).
--   Manager: "Not back" for staff of their department or reporting to them.
create or replace function public.staff_return_alerts()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c record; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into c from public.staff_return_caller();
  if c.id is null or not (c.is_admin or c.is_manager) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) || jsonb_build_object('alert', case when r.return_status = 'Not back' then 'Not back' else 'Back on duty' end)
                     order by r.return_status desc, coalesce(r.recorded_at, r.alert_at) desc)
    from public.staff_return_rows(today - 7, today, now()) r
    where r.employee_id <> c.id
      and (
        (r.return_status = 'Not back' and (c.is_admin or r.reporting_superior_id = c.id
                                           or (c.department <> '' and lower(trim(coalesce(r.department,''))) = c.department)))
        or (c.is_admin and r.return_status = 'Back on duty' and r.recorded_at > now() - interval '24 hours'
            and r.recorded_by is distinct from c.id)
      )
  ), '[]'::jsonb);
end $$;
revoke all on function public.staff_return_alerts() from public, anon;
grant execute on function public.staff_return_alerts() to authenticated;

-- Mark back on duty (Admin / Director / Manager; not for oneself).
create or replace function public.mark_staff_back_on_duty(p_request_id bigint, p_returned_at timestamptz, p_remarks text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c record; r public.absence_requests%rowtype; day date; due date; late int; msg text;
begin
  select * into c from public.staff_return_caller();
  if c.id is null or not (c.is_admin or c.is_manager) then raise exception 'Only a Manager or Admin can mark a staff member back on duty'; end if;
  select * into r from public.absence_requests where id = p_request_id for update;
  if not found then raise exception 'Leave not found'; end if;
  if r.employee_id = c.id then raise exception 'Another Manager or Admin must mark your return'; end if;
  if r.request_type <> 'Leave' or r.status <> 'approved' then raise exception 'Only approved leave can be marked back on duty'; end if;
  if r.return_to_duty_date is not null then raise exception 'Back on duty is already recorded for this leave'; end if;
  if exists (select 1 from public.store_incharge_assignments where nursing_manager_id = r.employee_id and status = 'Active' and effective_from <= now()) then
    raise exception 'Nursing Manager return: use Approve Return to Duty under Stores In-charge Assignment';
  end if;
  if p_returned_at is null or p_returned_at > now() + interval '5 minutes' then raise exception 'Enter the actual time she reported — not a future time'; end if;
  if nullif(trim(coalesce(p_remarks,'')),'') is null then raise exception 'Remarks are required (e.g. Reported for Day Shift)'; end if;
  day := (p_returned_at at time zone 'Asia/Kolkata')::date;
  if day < r.from_date then raise exception 'Return cannot be before the leave starts'; end if;
  select due_date into due from public.staff_return_rows(r.to_date + 1, r.to_date + 8, now()) where leave_id = r.id;
  due := coalesce(due, r.to_date + 1);
  late := greatest(0, day - due);
  update public.absence_requests set
    original_leave_to_date = coalesce(original_leave_to_date, to_date),
    return_to_duty_date = day, return_to_duty_at = p_returned_at,
    return_recorded_by = c.id, return_recorded_at = now(), return_remarks = trim(p_remarks),
    to_date = case when day <= r.to_date then greatest(r.from_date, day - 1) else r.to_date end,
    status = case when day = r.from_date then 'cancelled' else r.status end,
    cancelled_at = case when day = r.from_date then now() else r.cancelled_at end
  where id = r.id;
  insert into public.audit_log(user_id, action, entity, entity_id, details)
  values (c.id, 'Back on Duty', 'Leave / Permission', r.id::text, jsonb_build_object(
    'employee_id', r.employee_id, 'from_date', r.from_date, 'to_date', r.to_date, 'due_date', due,
    'returned_at', p_returned_at, 'late_days', late, 'remarks', trim(p_remarks)));
  msg := case when day <= r.to_date then 'Back on duty recorded (early return — leave shortened). Admin informed.'
              when late > 0 then format('Back on duty recorded — %s day(s) after the due date. Admin informed.', late)
              else 'Back on duty recorded. Admin informed.' end;
  return jsonb_build_object('ok', true, 'message', msg, 'late_days', late);
end $$;
revoke all on function public.mark_staff_back_on_duty(bigint,timestamptz,text) from public, anon;
grant execute on function public.mark_staff_back_on_duty(bigint,timestamptz,text) to authenticated;

-- Phone notifications to Admin / Director: one per leave per event, claimed so it is never sent twice.
create table if not exists public.staff_return_push_receipts(
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
alter table public.staff_return_push_receipts enable row level security;
revoke all on public.staff_return_push_receipts from anon, authenticated;
grant all on public.staff_return_push_receipts to service_role;

-- Events for the phone job (from go-live only): Not back now, or marked back on duty in the last 6 hours.
create or replace function public.staff_return_push_rows(p_now timestamptz default now())
returns table(alert_key text, alert text, leave_id bigint, employee_id uuid, employee_name text, due_date date,
              due_shift text, returned_at timestamptz, recorded_by uuid, recorded_by_name text, late_days integer)
language sql stable security definer set search_path=public,pg_temp as $$
  with s as (select push_from from public.staff_return_alert_settings where id = 1)
  select case when r.return_status = 'Not back' then 'notback:' else 'back:' end || r.leave_id,
         r.return_status, r.leave_id, r.employee_id, r.employee_name, r.due_date, r.due_shift,
         r.returned_at, r.recorded_by, r.recorded_by_name, r.late_days
  from public.staff_return_rows(((p_now at time zone 'Asia/Kolkata')::date) - 7, (p_now at time zone 'Asia/Kolkata')::date, p_now) r
  cross join s
  where (r.return_status = 'Not back' and r.alert_at >= s.push_from)
     or (r.return_status = 'Back on duty' and r.recorded_at >= s.push_from and r.recorded_at > p_now - interval '6 hours')
$$;
revoke all on function public.staff_return_push_rows(timestamptz) from public, anon, authenticated;
grant execute on function public.staff_return_push_rows(timestamptz) to service_role;

create or replace function public.staff_return_claim_push(p_alert_key text, p_subscription uuid, p_recorded_by uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if not exists (
    select 1
    from public.push_subscriptions s
    join public.profiles p on (p.id = coalesce(s.profile_id, s.user_id) or (s.profile_id is null and p.auth_user_id = s.user_id))
    where s.id = p_subscription and s.is_active
      and coalesce(p.active,true) and coalesce(p.is_active,true)
      and lower(trim(p.role)) in ('admin','administrator','director')
      and p.id is distinct from p_recorded_by
  ) then return false; end if;
  insert into public.staff_return_push_receipts(alert_key, subscription_id, state)
  values (p_alert_key, p_subscription, 'claimed')
  on conflict (alert_key, subscription_id) do update set state='claimed', claimed_at=clock_timestamp(), retry_after=null, tries=staff_return_push_receipts.tries+1
  where staff_return_push_receipts.state='retry' and staff_return_push_receipts.retry_after<=clock_timestamp() and staff_return_push_receipts.tries<3;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.staff_return_claim_push(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.staff_return_claim_push(text,uuid,uuid) to service_role;

-- Run the phone job every minute (same URL + secret header as the clinical push job).
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; staff return push job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/staff-return-alert-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-staff-return-alert-dispatch';
  perform cron.schedule('samara-staff-return-alert-dispatch', '* * * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: the cron job, and staff due back in the last 7 / next 7 days.
select jobname, schedule from cron.job where jobname = 'samara-staff-return-alert-dispatch';
select employee_name, leave_to, due_date, due_shift, alert_at at time zone 'Asia/Kolkata' as alert_at_ist, return_status
from public.staff_return_rows((now() at time zone 'Asia/Kolkata')::date - 7, (now() at time zone 'Asia/Kolkata')::date + 7) order by due_date;
