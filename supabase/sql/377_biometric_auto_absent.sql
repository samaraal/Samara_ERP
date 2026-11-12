-- ERP 2.20.37 — AUTOMATIC ABSENT from the biometric machine (12-11-2026). Needs SQL 371, 376.
-- Every hour (at :12) a rostered Day / Night duty is marked Absent (status 'Absent' -> loss of pay in Payroll, red in the
-- Duty Roster) when ALL of these hold:
--   • the shift is over by 1 hour  (Day 7 AM-7 PM -> after 8 PM; Night 7 PM-7 AM -> after 8 AM next day)
--   • the duty date is on / after the start date (12-11-2026) — older days are never touched
--   • the staff member is linked to a machine number (Link Staff) — people without a number cannot punch
--   • there is no approved leave of any kind for that date (full / half day; permissions do not count)
--   • there is NO punch from her in the shift (Day: 03:00-23:59 on the date; Night: 15:00 on the date - 12:00 next day)
--   • the machine was working: someone else punched during that shift AND easy TimePro sent data after the shift ended
--     (so a switched-off PC or an offline machine never makes everyone absent)
-- Each duty is checked only once. If the Nursing Manager / Admin changes it back, it is not marked again.
-- If her punch arrives later (machine uploaded late), the Absent is undone automatically.
-- Run once; safe to run again.
begin;

alter table public.duty_assignments
  add column if not exists auto_absent boolean,              -- null = not checked yet, true = marked Absent by the machine check, false = checked, present / skipped
  add column if not exists auto_absent_at timestamptz,
  add column if not exists auto_absent_prev_status text;

alter table public.attendance_push_settings
  add column if not exists auto_absent_from date default date '2026-11-12',
  add column if not exists auto_absent_enabled boolean default true;
update public.attendance_push_settings set auto_absent_from = coalesce(auto_absent_from, date '2026-11-12'), auto_absent_enabled = coalesce(auto_absent_enabled, true) where id = 1;

create or replace function public.samara_shift_window(p_date date, p_night boolean)
returns tstzrange language sql immutable as $$
  select case when p_night
    then tstzrange(((p_date::timestamp + time '15:00') at time zone 'Asia/Kolkata'), (((p_date + 1)::timestamp + time '12:00') at time zone 'Asia/Kolkata'))
    else tstzrange(((p_date::timestamp + time '03:00') at time zone 'Asia/Kolkata'), ((p_date::timestamp + time '23:59') at time zone 'Asia/Kolkata')) end
$$;

create or replace function public.samara_auto_absent_run()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare st record; d record; v_end timestamptz; v_win tstzrange; v_codes text[]; marked int := 0; cleared int := 0; checked int := 0;
begin
  select * into st from public.attendance_push_settings where id = 1;
  if st is null or not coalesce(st.auto_absent_enabled, true) then return jsonb_build_object('ok', true, 'skipped', 'disabled'); end if;

  -- 1. undo an automatic Absent when her punch has arrived since
  for d in select a.* from public.duty_assignments a where a.auto_absent is true and a.status = 'Absent'
             and a.duty_date >= (now() at time zone 'Asia/Kolkata')::date - 40 loop
    v_win := public.samara_shift_window(d.duty_date, coalesce(d.shift,'') ilike '%night%');
    if exists(select 1 from public.attendance_punches p join public.attendance_device_users u on u.emp_code = p.emp_code and not coalesce(u.ignore,false)
               join public.profiles pr on pr.id = u.employee_id
              where d.employee_id in (pr.id, pr.auth_user_id) and p.punch_at <@ v_win) then
      update public.duty_assignments set status = coalesce(auto_absent_prev_status, 'Assigned'), auto_absent = false, auto_absent_at = now(),
             status_updated_at = now(), status_updated_by_name = 'Biometric check (punch received late)'
       where id = d.id;
      cleared := cleared + 1;
    end if;
  end loop;

  -- 2. mark Absent
  for d in select a.* from public.duty_assignments a
            where a.auto_absent is null
              and a.duty_date >= coalesce(st.auto_absent_from, date '2026-11-12')
              and a.duty_date >= (now() at time zone 'Asia/Kolkata')::date - 7
              and not coalesce(a.is_weekly_off, false)
              and coalesce(a.status,'') not in ('Absent','Cancelled','Rejected','Weekly Off','Leave granted')
              and (coalesce(a.shift,'') ilike '%day shift%' or coalesce(a.shift,'') ilike '%night shift%') loop
    v_end := case when coalesce(d.shift,'') ilike '%night%'
                  then (((d.duty_date + 1)::timestamp + time '07:00') at time zone 'Asia/Kolkata')
                  else ((d.duty_date::timestamp + time '19:00') at time zone 'Asia/Kolkata') end;
    continue when now() < v_end + interval '1 hour';                 -- shift not over yet: look again next hour
    checked := checked + 1;
    v_win := public.samara_shift_window(d.duty_date, coalesce(d.shift,'') ilike '%night%');

    -- her machine numbers
    select array_agg(u.emp_code) into v_codes from public.attendance_device_users u join public.profiles pr on pr.id = u.employee_id
     where not coalesce(u.ignore,false) and d.employee_id in (pr.id, pr.auth_user_id);
    if v_codes is null then update public.duty_assignments set auto_absent = false, auto_absent_at = now() where id = d.id; continue; end if;

    -- machine working during / after the shift?
    if coalesce(st.last_push_at, 'epoch'::timestamptz) < v_end
       or not exists(select 1 from public.attendance_punches p where p.punch_at <@ v_win and p.emp_code <> all(v_codes)) then
      continue;                                                       -- no data yet: check again next hour (never guess)
    end if;

    -- approved leave of any kind (not permission) that day -> not absent
    if exists(select 1 from public.absence_requests l join public.profiles pr on l.employee_id in (pr.id, pr.auth_user_id)
               where d.employee_id in (pr.id, pr.auth_user_id) and l.status = 'approved' and coalesce(l.request_type,'') <> 'Permission'
                 and l.from_date <= d.duty_date and l.to_date >= d.duty_date) then
      update public.duty_assignments set auto_absent = false, auto_absent_at = now() where id = d.id; continue;
    end if;

    if exists(select 1 from public.attendance_punches p where p.emp_code = any(v_codes) and p.punch_at <@ v_win) then
      update public.duty_assignments set auto_absent = false, auto_absent_at = now() where id = d.id;   -- present
    else
      update public.duty_assignments set auto_absent = true, auto_absent_at = now(), auto_absent_prev_status = status,
             status = 'Absent', status_updated_at = now(), status_updated_by_name = 'Biometric check (no punch, no approved leave)',
             remarks = left(concat_ws(' · ', nullif(remarks,''), 'Absent: no biometric punch, no approved leave (auto ' || to_char(now() at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI') || ')'), 1000)
       where id = d.id;
      marked := marked + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'checked', checked, 'marked_absent', marked, 'undone', cleared);
end $$;
revoke all on function public.samara_auto_absent_run() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-biometric-auto-absent';
  perform cron.schedule('samara-biometric-auto-absent', '12 * * * *', $c$select public.samara_auto_absent_run()$c$);
exception when others then raise notice 'pg_cron not available: %', sqlerrm; end $$;

notify pgrst, 'reload schema';
commit;

-- first run now (only shifts already over by 1 hour from 12-11-2026 are looked at)
select public.samara_auto_absent_run() as first_run;
