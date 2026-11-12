-- ERP 2.20.42 — Biometric: (1) BACK ON DUTY after leave from the first punch, (2) DAILY ATTENDANCE WHATSAPP to Admin / Directors.
-- Needs SQL 206, 371, 376, 377. Run once; safe to run again.
--
-- 1. Back on duty: every 5 minutes, an approved leave not yet marked "Back on duty" is marked automatically when the
--    staff member punches on the biometric machine from the day after her leave started (an early return shortens the
--    leave, exactly like the Manager's button). Marked by "Biometric machine"; Admin gets the usual "Back on duty" alert.
--    The Manager's "Mark Back on Duty" button stays for staff without a machine number. The Nursing Manager's own
--    return still goes through "Approve Return to Duty" (Stores In-charge).
-- 2. attendance_daily_summary(day): who came late (more than 15 min after 7 AM / 7 PM), who did overtime (Out more than
--    15 min after 7 PM / 7 AM) and who had no punch without approved leave — for that day's Day shift and Night shift.
--    Sent each morning by the Edge Function attendance-daily-dispatch (template samara_staff_attendance_daily).
begin;

-- ---------- 1. Back on duty from the punch ----------
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
         coalesce(nullif(trim(concat_ws(' ', rb.title, rb.full_name)),''), case when lv.return_recorded_by is null and lv.return_remarks ilike 'Biometric%' then 'Biometric machine' end), lv.return_recorded_at, lv.return_remarks,
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

alter table public.attendance_push_settings
  add column if not exists auto_return_from timestamptz default timestamptz '2026-11-12 00:00+05:30',
  add column if not exists daily_whatsapp_enabled boolean default true;

create or replace function public.samara_auto_back_on_duty()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare st record; r record; v_codes text[]; v_first timestamptz; v_day date; n int := 0;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into st from public.attendance_push_settings where id = 1;
  for r in select a.* from public.absence_requests a
            where a.request_type = 'Leave' and a.status = 'approved' and a.return_to_duty_date is null
              and a.from_date < today and coalesce(a.original_leave_to_date, a.to_date) >= today - 14 loop
    if exists (select 1 from public.store_incharge_assignments s where s.nursing_manager_id = r.employee_id and s.status = 'Active' and s.effective_from <= now()) then continue; end if;
    select array_agg(u.emp_code) into v_codes from public.attendance_device_users u join public.profiles pr on pr.id = u.employee_id
     where not coalesce(u.ignore,false) and r.employee_id in (pr.id, pr.auth_user_id);
    continue when v_codes is null;
    select min(p.punch_at) into v_first from public.attendance_punches p
     where p.emp_code = any(v_codes)
       and p.punch_at >= ((r.from_date + 1)::timestamp at time zone 'Asia/Kolkata')
       and p.punch_at >= coalesce(st.auto_return_from, timestamptz '2026-11-12 00:00+05:30');
    continue when v_first is null;
    v_day := (v_first at time zone 'Asia/Kolkata')::date;
    update public.absence_requests set
      original_leave_to_date = coalesce(original_leave_to_date, to_date),
      return_to_duty_date = v_day, return_to_duty_at = v_first,
      return_recorded_by = null, return_recorded_at = now(),
      return_remarks = 'Biometric punch at ' || to_char(v_first at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI') || ' (automatic)',
      to_date = case when v_day <= to_date then greatest(from_date, v_day - 1) else to_date end
    where id = r.id and return_to_duty_date is null;
    begin
      insert into public.audit_log(user_id, action, entity, entity_id, details)
      values (null, 'Back on Duty (biometric)', 'Leave / Permission', r.id::text, jsonb_build_object(
        'employee_id', r.employee_id, 'from_date', r.from_date, 'to_date', r.to_date, 'returned_at', v_first));
    exception when others then null; end;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'marked_back', n);
end $$;
revoke all on function public.samara_auto_back_on_duty() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-biometric-back-on-duty';
  perform cron.schedule('samara-biometric-back-on-duty', '*/5 * * * *', $c$select public.samara_auto_back_on_duty()$c$);
exception when others then raise notice 'pg_cron not available: %', sqlerrm; end $$;

-- ---------- 2. Daily late / overtime summary ----------
create or replace function public.samara_dur_text(p_min int)
returns text language sql immutable as $$
  select case when p_min >= 60 then (p_min/60)::text || case when p_min/60 = 1 then ' hr' else ' hrs' end
              || case when p_min % 60 > 0 then ' ' || (p_min % 60)::text || ' min' else '' end
         else p_min::text || ' min' end
$$;

create or replace function public.attendance_daily_summary(p_day date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare d record; v_codes text[]; v_first timestamptz; v_last timestamptz; v_cnt int; v_start timestamptz; v_end timestamptz;
  v_win tstzrange; v_night boolean; v_late int; v_ot int;
  late jsonb := '[]'; ot jsonb := '[]'; nop jsonb := '[]'; rostered int := 0; present int := 0;
begin
  for d in select a.*, coalesce(nullif(trim(pr.full_name),''), 'Staff') as nm, pr.id as pid
             from public.duty_assignments a join public.profiles pr on a.employee_id in (pr.id, pr.auth_user_id)
            where a.duty_date = p_day and not coalesce(a.is_weekly_off,false)
              and coalesce(a.status,'') not in ('Cancelled','Rejected','Weekly Off','Leave granted')
              and (coalesce(a.shift,'') ilike '%day shift%' or coalesce(a.shift,'') ilike '%night shift%')
              and (coalesce(a.status,'') <> 'Absent' or a.auto_absent is true)
            order by (a.shift ilike '%night%'), pr.full_name loop
    v_night := d.shift ilike '%night%';
    v_start := ((p_day::timestamp + case when v_night then time '19:00' else time '07:00' end) at time zone 'Asia/Kolkata');
    v_end := v_start + interval '12 hours';
    v_win := public.samara_shift_window(p_day, v_night);
    select array_agg(u.emp_code) into v_codes from public.attendance_device_users u join public.profiles pr on pr.id = u.employee_id
     where not coalesce(u.ignore,false) and pr.id = d.pid;
    continue when v_codes is null;                       -- not on the machine: not judged
    rostered := rostered + 1;
    select min(p.punch_at), max(p.punch_at), count(*) into v_first, v_last, v_cnt
      from public.attendance_punches p where p.emp_code = any(v_codes) and p.punch_at <@ v_win;
    if v_cnt = 0 then
      if not exists(select 1 from public.absence_requests l where l.employee_id in (d.pid, d.employee_id) and l.status = 'approved'
                      and coalesce(l.request_type,'') <> 'Permission' and l.from_date <= p_day and l.to_date >= p_day) then
        nop := nop || jsonb_build_object('name', d.nm, 'shift', case when v_night then 'Night' else 'Day' end);
      end if;
      continue;
    end if;
    present := present + 1;
    v_late := floor(extract(epoch from (v_first - v_start)) / 60);
    v_ot := case when v_cnt > 1 then floor(extract(epoch from (v_last - v_end)) / 60) else 0 end;
    if v_late > 15 then late := late || jsonb_build_object('name', d.nm, 'shift', case when v_night then 'Night' else 'Day' end,
        'minutes', v_late, 'in', to_char(v_first at time zone 'Asia/Kolkata','HH24:MI')); end if;
    if v_ot > 15 then ot := ot || jsonb_build_object('name', d.nm, 'shift', case when v_night then 'Night' else 'Day' end,
        'minutes', v_ot, 'out', to_char(v_last at time zone 'Asia/Kolkata','HH24:MI')); end if;
  end loop;
  return jsonb_build_object(
    'day', p_day, 'day_label', to_char(p_day,'DD-MM-YYYY') || ' (' || trim(to_char(p_day,'Day')) || ')',
    'rostered', rostered, 'present', present,
    'late', late, 'overtime', ot, 'no_punch', nop,
    'late_count', jsonb_array_length(late), 'overtime_count', jsonb_array_length(ot),
    'late_text', coalesce((select string_agg(format('%s. %s (%s, in %s) – %s late', o, x->>'name', x->>'shift', x->>'in', public.samara_dur_text((x->>'minutes')::int)), ' · ' order by o)
                           from jsonb_array_elements(late) with ordinality t(x,o)), 'None – everyone came on time'),
    'overtime_text', coalesce((select string_agg(format('%s. %s (%s, out %s) – %s extra', o, x->>'name', x->>'shift', x->>'out', public.samara_dur_text((x->>'minutes')::int)), ' · ' order by o)
                           from jsonb_array_elements(ot) with ordinality t(x,o)), 'None'),
    'no_punch_text', coalesce((select string_agg(format('%s (%s)', x->>'name', x->>'shift'), ' · ') from jsonb_array_elements(nop) x), 'None'));
end $$;
revoke all on function public.attendance_daily_summary(date) from public, anon, authenticated;
grant execute on function public.attendance_daily_summary(date) to service_role;

-- one row per recipient per day (failed ones are retried by the next run)
create table if not exists public.attendance_whatsapp_daily(
  id uuid primary key default gen_random_uuid(),
  summary_day date not null,
  recipient_profile_id uuid,
  recipient_name text,
  recipient_number text not null,
  status text not null default 'Sending',
  meta_message_id text,
  error_text text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists attendance_whatsapp_daily_day on public.attendance_whatsapp_daily(summary_day, recipient_number);
alter table public.attendance_whatsapp_daily enable row level security;
revoke all on public.attendance_whatsapp_daily from anon, authenticated;
grant all on public.attendance_whatsapp_daily to service_role;

notify pgrst, 'reload schema';
commit;

select public.samara_auto_back_on_duty() as back_on_duty_first_run;
select public.attendance_daily_summary(((now() at time zone 'Asia/Kolkata')::date) - 1) as yesterday_preview;

-- AFTER deploying the Edge Function attendance-daily-dispatch (Verify JWT OFF): morning job + template submission (done 12-11-2026)
-- do $$ declare base_cmd text; new_cmd text; begin
--   select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
--   new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/attendance-daily-dispatch');
--   perform cron.schedule('samara-attendance-daily-whatsapp', '1,31 4,5 * * *', new_cmd);   -- 9:31 / 10:01 / 10:31 / 11:01 IST
--   execute replace(new_cmd, '''{}''::jsonb', '''{"mode":"submit_template"}''::jsonb');      -- Meta template samara_staff_attendance_daily
-- end $$;
