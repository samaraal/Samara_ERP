-- ERP 2.20.26 — BIOMETRIC STAFF SYNC uses the MACHINE'S OWN NUMBERS (11-11-2026). Needs SQL 371 + 372.
-- The Samara machine already has staff enrolled under its own numbers (SOBANA = 2, SARANYA = 22 …), not the ERP numbers.
-- So the sync now follows HR → Biometric Attendance → Link Staff (machine number ↔ ERP employee):
--   • linked employees are kept in line (active / suspended → blocked / left → blocked & Resigned, name, mobile, department)
--   • active employees with no machine number are added to easy TimePro with the next free number and linked automatically
--   • machine numbers not linked to an ERP employee (directors, old / unnamed entries) are never changed
-- Run once; safe to run again.
begin;

-- 1. Remove the links SQL 372 made from the ERP ID number (EMP-0025 → 25) — wrong for this machine.
delete from public.attendance_device_users where mapped_by_name = 'Auto (ERP staff sync)';

-- 2. Admin-approved links by name (11-11-2026): machine number → ERP Employee ID.
with m(code, erp) as (values ('2','EMP-00001'),('22','EMP-0017'),('23','EMP-0014'),('26','EMP-0018'),('27','EMP-0022'),
                             ('28','EMP-0016'),('29','EMP-0019'),('30','EMP-0020'),('31','EMP-0021')),
     j as (select m.code, p.id from m join public.profiles p on btrim(p.employee_id) = m.erp)
insert into public.attendance_device_users(emp_code, employee_id, mapped_by_name, mapped_at)
select j.code, j.id, 'Admin (by name, 11-11-2026)', now() from j
 where not exists (select 1 from public.attendance_device_users x where x.employee_id = j.id and x.emp_code <> j.code and not x.ignore)
on conflict (emp_code) do update set employee_id = excluded.employee_id, mapped_by_name = excluded.mapped_by_name, mapped_at = now(), ignore = false
 where attendance_device_users.employee_id is null or attendance_device_users.employee_id = excluded.employee_id;

-- 3. Staff list: machine number = the linked number (null = not on the machine yet → the PC program adds it).
create or replace function public.biometric_staff_list()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with today as (select (now() at time zone 'Asia/Kolkata')::date as d),
  emp as (
    select p.id, btrim(p.employee_id) as employee_id, nullif(btrim(coalesce(p.title,'')),'') as title, btrim(p.full_name) as full_name,
           nullif(regexp_replace(coalesce(p.mobile,''),'\D','','g'),'') as mobile, p.date_of_joining, p.designation, p.department,
           coalesce(p.is_active, p.active, true) as on_,
           (select u.emp_code from public.attendance_device_users u where u.employee_id = p.id and not u.ignore
             order by u.mapped_at desc nulls last limit 1) as code
      from public.profiles p
     where p.employee_id ~* '^\s*EMP\s*-?\s*\d+\s*$'
       and coalesce(p.role,'') <> 'Admin'
       and nullif(btrim(coalesce(p.full_name,'')),'') is not null
  ),
  st as (
    select e.*,
      (select s.exit_type from public.employee_separations s
        where s.employee_id = e.id and s.status not in ('Withdrawn','Cancelled')
        order by s.created_at desc limit 1) as exit_type,
      (select h.action_type from public.employee_employment_history h, today
        where h.employee_profile_id = e.id and h.action_type in ('Suspension','Reinstatement')
          and (h.effective_date is null or h.effective_date <= today.d)
        order by h.effective_date desc nulls last, h.created_at desc limit 1) as last_susp
    from emp e
  ),
  rows as (
    select st.*,
      case when not on_ and exit_type is not null then 'exited'
           when last_susp = 'Suspension' then 'suspended'
           when not on_ then 'exited'
           else 'active' end as status
    from st
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'emp_code', code, 'profile_id', id, 'employee_id', employee_id, 'title', title, 'name', full_name,
      'gender', case when lower(coalesce(title,'')) ~ '^(mrs|miss|ms|smt|sister|sr)\b' then 'F'
                     when lower(coalesce(title,'')) ~ '^(mr|shri|sri|master|brother)\b' then 'M' end,
      'mobile', mobile, 'date_of_joining', date_of_joining, 'designation', designation, 'department', department,
      'status', status,
      'reason', case status when 'exited' then coalesce(exit_type, 'ERP login disabled')
                            when 'suspended' then 'Under suspension' end)
    order by (code is null), nullif(regexp_replace(coalesce(code,''),'\D','','g'),'')::bigint nulls last, full_name), '[]'::jsonb)
  from rows
  -- people who left and were never on the machine are of no interest to it
  where not (code is null and status <> 'active');
$$;
revoke all on function public.biometric_staff_list() from public, anon, authenticated;

-- 4. Feed for the PC program: the list only (no guessing of links any more).
create or replace function public.biometric_staff_feed()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return jsonb_build_object('ok', true, 'generated_at', now(), 'today', (now() at time zone 'Asia/Kolkata')::date,
                            'employees', public.biometric_staff_list());
end $$;
revoke all on function public.biometric_staff_feed() from public, anon, authenticated;

-- 5. Result of each run. New: "links" (new joiners the program added → linked here) and "device_users"
--    (every number in easy TimePro with its name, so Link Staff lists them all before anyone punches).
create or replace function public.biometric_staff_sync_record(p jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ok boolean := coalesce((p->>'ok')::boolean, jsonb_array_length(coalesce(p->'errors','[]'::jsonb)) = 0);
        v_dry boolean := coalesce((p->>'dry_run')::boolean, false);
        v_changed int := jsonb_array_length(coalesce(p->'actions','[]'::jsonb));
        r jsonb;
begin
  if not v_dry then
    for r in select * from jsonb_array_elements(coalesce(p->'device_users','[]'::jsonb)) loop
      if coalesce(r->>'emp_code','') = '' then continue; end if;
      insert into public.attendance_device_users(emp_code, device_name) values (r->>'emp_code', nullif(btrim(coalesce(r->>'name','')),''))
      on conflict (emp_code) do update set device_name = coalesce(excluded.device_name, attendance_device_users.device_name);
    end loop;
    for r in select * from jsonb_array_elements(coalesce(p->'links','[]'::jsonb)) loop
      if coalesce(r->>'emp_code','') = '' or coalesce(r->>'profile_id','') = '' then continue; end if;
      if exists(select 1 from public.attendance_device_users x where x.employee_id = (r->>'profile_id')::uuid and not x.ignore) then continue; end if;
      insert into public.attendance_device_users(emp_code, employee_id, device_name, mapped_by_name, mapped_at)
      values (r->>'emp_code', (r->>'profile_id')::uuid, nullif(r->>'name',''), 'Auto (added by staff sync)', now())
      on conflict (emp_code) do update set employee_id = excluded.employee_id, mapped_by_name = excluded.mapped_by_name, mapped_at = now()
       where attendance_device_users.employee_id is null;
    end loop;
  end if;
  if v_changed > 0 or not v_ok or v_dry then
    insert into public.biometric_staff_sync_log(ok, dry_run, summary, actions, errors, agent)
    values (v_ok, v_dry, coalesce(p->'summary','{}'::jsonb), coalesce(p->'actions','[]'::jsonb), coalesce(p->'errors','[]'::jsonb), left(p->>'agent',120));
  end if;
  update public.attendance_push_settings set last_staff_sync_at = now(), last_staff_sync_ok = v_ok,
    last_staff_sync_summary = coalesce(p->'summary','{}'::jsonb) || jsonb_build_object('dry_run', v_dry),
    last_staff_sync_error = case when v_ok then null else left(coalesce(p->'errors'->0->>'message', p->'errors'->>0, 'Error'),300) end
   where id = 1;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.biometric_staff_sync_record(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;

select x->>'emp_code' as machine_no, x->>'employee_id' as erp_id, x->>'name' as name, x->>'status' as status
  from jsonb_array_elements(public.biometric_staff_list()) x;
