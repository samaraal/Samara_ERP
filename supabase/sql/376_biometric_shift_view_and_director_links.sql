-- ERP 2.20.29 — Biometric Attendance: Day / Night shift view + director machine numbers (12-11-2026). Needs SQL 371 + 373.
-- 1. Machine numbers approved by Admin: 21 "DR.. CHELLA BOOMI" → Dr. Chella Boomi, 25 "BOOMINATHAN R" → Boomi R, 1 "hari" → Ignore.
-- 2. attendance_roster(): Duty Roster shifts (Day / Night / Both) for the Punches screen, so a night shift's
--    morning out-punch is counted under the shift's start date.
-- Run once; safe to run again.
begin;

do $$
declare v_chella uuid; v_boomi uuid; n int;
begin
  select count(*), min(id::text)::uuid into n, v_chella from public.profiles
   where full_name ilike '%chella%boomi%' and coalesce(is_active, active, true);
  if n = 1 then
    insert into public.attendance_device_users(emp_code, employee_id, mapped_by_name, mapped_at) values ('21', v_chella, 'Admin (12-11-2026)', now())
    on conflict (emp_code) do update set employee_id = excluded.employee_id, ignore = false, mapped_by_name = excluded.mapped_by_name, mapped_at = now();
  else raise notice 'Dr. Chella Boomi: % matching ERP logins - link machine no. 21 in Link Staff', n; end if;

  select count(*), min(id::text)::uuid into n, v_boomi from public.profiles
   where (full_name ilike 'boomi r' or full_name ilike 'boominathan%') and coalesce(is_active, active, true);
  if n = 1 then
    insert into public.attendance_device_users(emp_code, employee_id, mapped_by_name, mapped_at) values ('25', v_boomi, 'Admin (12-11-2026)', now())
    on conflict (emp_code) do update set employee_id = excluded.employee_id, ignore = false, mapped_by_name = excluded.mapped_by_name, mapped_at = now();
  else raise notice 'Boomi R: % matching ERP logins - link machine no. 25 in Link Staff', n; end if;

  insert into public.attendance_device_users(emp_code, ignore, mapped_by_name, mapped_at) values ('1', true, 'Admin (12-11-2026)', now())
  on conflict (emp_code) do update set ignore = true, employee_id = null, mapped_by_name = excluded.mapped_by_name, mapped_at = now()
   where attendance_device_users.employee_id is null;
end $$;

create or replace function public.attendance_roster(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb := public.attendance_viewer();
begin
  if p_to - p_from > 70 then raise exception 'Choose a period of up to 2 months.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('employee_id', pr.id, 'duty_date', d.duty_date,
           'shift', case when coalesce(d.is_weekly_off,false) or d.shift ilike '%weekly off%' or d.status ilike '%weekly off%' then 'Off'
                         when d.shift ilike '%both%' or d.shift ilike '%24%' then 'Both'
                         when d.shift ilike '%night%' then 'Night'
                         when d.shift ilike '%day%' then 'Day'
                         else coalesce(d.shift,'') end))
    from public.duty_assignments d
    join public.profiles pr on d.employee_id in (pr.id, pr.auth_user_id)
   where d.duty_date between p_from and p_to
     and coalesce(d.status,'') not ilike '%cancel%'), '[]'::jsonb);
end $$;
revoke all on function public.attendance_roster(date,date) from public, anon;
grant execute on function public.attendance_roster(date,date) to authenticated;

notify pgrst, 'reload schema';
commit;

select u.emp_code, u.device_name, p.full_name, u.ignore from public.attendance_device_users u left join public.profiles p on p.id = u.employee_id
 where u.emp_code in ('1','21','25');
