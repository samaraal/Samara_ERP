-- ERP 2.20.24 — BIOMETRIC STAFF SYNC: the ERP employee list drives who can use the ZKTeco machine (11-11-2026).
-- Run once; safe to run again. Needs SQL 371 (Biometric Attendance). Nothing existing is changed.
--
-- A small program on the Samara PC (where easy TimePro runs) asks the Edge Function "biometric-staff-sync"
-- every 5 minutes for the staff list below and updates easy TimePro, which updates the machine:
--   • active    → added to easy TimePro (new joiners) and kept in the machine's area
--   • suspended → moved to a "Blocked – No Access" area (cannot punch; fingerprint / face kept for reinstatement)
--   • exited    → (resigned / terminated / left without notice / login disabled) blocked and marked Resigned in easy TimePro
-- Machine Employee ID = number part of the ERP Employee ID (EMP-0025 → 25). Admin / Director accounts are not sent.
-- The same private key as the punch receiver (attendance_push_settings.push_key) protects the URL.
begin;

alter table public.attendance_push_settings
  add column if not exists last_staff_sync_at timestamptz,
  add column if not exists last_staff_sync_ok boolean,
  add column if not exists last_staff_sync_summary jsonb,
  add column if not exists last_staff_sync_error text;

create table if not exists public.biometric_staff_sync_log (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  ok boolean,
  dry_run boolean not null default false,
  summary jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  agent text
);
create index if not exists biometric_staff_sync_log_at on public.biometric_staff_sync_log(received_at desc);
alter table public.biometric_staff_sync_log enable row level security;
revoke all on public.biometric_staff_sync_log from public, anon, authenticated;

-- 1. The staff list as easy TimePro should have it (no side effects).
create or replace function public.biometric_staff_list()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with today as (select (now() at time zone 'Asia/Kolkata')::date as d),
  emp as (
    select p.id, btrim(p.employee_id) as employee_id, nullif(btrim(coalesce(p.title,'')),'') as title, btrim(p.full_name) as full_name,
           nullif(regexp_replace(coalesce(p.mobile,''),'\D','','g'),'') as mobile, p.date_of_joining, p.designation, p.department,
           coalesce(p.is_active, p.active, true) as on_,
           ltrim(regexp_replace(p.employee_id,'\D','','g'),'0') as code
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
    from emp e where e.code <> ''
  ),
  rows as (
    select st.*,
      case when not on_ and exit_type is not null then 'exited'
           when last_susp = 'Suspension' then 'suspended'
           when not on_ then 'exited'
           else 'active' end as status
    from st
  ),
  one as (  -- one person per machine code (an active profile wins over an old disabled duplicate)
    select distinct on (code) * from rows
     order by code, (status = 'active') desc, (status = 'suspended') desc, date_of_joining desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'emp_code', code, 'profile_id', id, 'employee_id', employee_id, 'title', title, 'name', full_name,
      'gender', case when lower(coalesce(title,'')) ~ '^(mrs|miss|ms|smt|sister|sr)\b' then 'F'
                     when lower(coalesce(title,'')) ~ '^(mr|shri|sri|master|brother)\b' then 'M' end,
      'mobile', mobile, 'date_of_joining', date_of_joining, 'designation', designation, 'department', department,
      'status', status,
      'reason', case status when 'exited' then coalesce(exit_type, 'ERP login disabled')
                            when 'suspended' then 'Under suspension' end)
    order by code::bigint), '[]'::jsonb)
  from one;
$$;
revoke all on function public.biometric_staff_list() from public, anon, authenticated;

-- 2. Feed for the PC program (service role): the list + link each machine code to its ERP employee
--    automatically in HR → Biometric Attendance → Link Staff (only codes not linked / ignored yet).
create or replace function public.biometric_staff_feed()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_list jsonb := public.biometric_staff_list(); r jsonb;
begin
  for r in select * from jsonb_array_elements(v_list) loop
    if r->>'status' = 'exited' then continue; end if;
    if exists(select 1 from public.attendance_device_users x
               where x.employee_id = (r->>'profile_id')::uuid and x.emp_code <> r->>'emp_code' and not x.ignore) then continue; end if;
    insert into public.attendance_device_users(emp_code, employee_id, mapped_by_name, mapped_at)
    values (r->>'emp_code', (r->>'profile_id')::uuid, 'Auto (ERP staff sync)', now())
    on conflict (emp_code) do update set employee_id = excluded.employee_id, mapped_by_name = excluded.mapped_by_name, mapped_at = now()
     where attendance_device_users.employee_id is null and not attendance_device_users.ignore;
  end loop;
  return jsonb_build_object('ok', true, 'generated_at', now(), 'today', (now() at time zone 'Asia/Kolkata')::date, 'employees', v_list);
end $$;
revoke all on function public.biometric_staff_feed() from public, anon, authenticated;

-- 3. Result of each run, sent back by the PC program (service role).
create or replace function public.biometric_staff_sync_record(p jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ok boolean := coalesce((p->>'ok')::boolean, jsonb_array_length(coalesce(p->'errors','[]'::jsonb)) = 0);
        v_dry boolean := coalesce((p->>'dry_run')::boolean, false);
        v_changed int := jsonb_array_length(coalesce(p->'actions','[]'::jsonb));
begin
  -- keep every run that changed something or failed; quiet runs only update the "last sync" line
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

-- 4. ERP screen (Admin / Directors and Nursing Manager — same rule as Biometric Attendance)
create or replace function public.biometric_staff_sync_rpc(p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v jsonb := public.attendance_viewer();
begin
  if p_action = 'status' then
    return jsonb_build_object('ok', true,
      'sync', (select jsonb_build_object('last_at', last_staff_sync_at, 'ok', last_staff_sync_ok, 'summary', last_staff_sync_summary,
                 'error', last_staff_sync_error) from public.attendance_push_settings where id = 1),
      'staff', public.biometric_staff_list(),
      'runs', coalesce((select jsonb_agg(jsonb_build_object('at', received_at, 'ok', ok, 'dry_run', dry_run, 'summary', summary,
                 'actions', actions, 'errors', errors) order by received_at desc)
               from (select * from public.biometric_staff_sync_log order by received_at desc limit 15) l), '[]'::jsonb));
  end if;
  raise exception 'Unknown action.';
end $f$;
revoke all on function public.biometric_staff_sync_rpc(text,jsonb) from public, anon;
grant execute on function public.biometric_staff_sync_rpc(text,jsonb) to authenticated;

-- 5. Housekeeping: sync log kept 90 days
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-biometric-staff-sync-log-trim';
  perform cron.schedule('samara-biometric-staff-sync-log-trim', '55 20 * * *', $c$delete from public.biometric_staff_sync_log where received_at < now() - interval '90 days'$c$);
exception when others then raise notice 'pg_cron not available: %', sqlerrm; end $$;

notify pgrst, 'reload schema';
commit;

select x->>'emp_code' as machine_code, x->>'employee_id' as erp_id, x->>'name' as name, x->>'status' as status, x->>'reason' as reason
  from jsonb_array_elements(public.biometric_staff_list()) x;
