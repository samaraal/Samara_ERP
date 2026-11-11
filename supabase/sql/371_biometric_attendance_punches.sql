-- ERP 2.20.23 — BIOMETRIC ATTENDANCE: punches from easy TimePro (eSSL / ZKTeco) into the ERP (11-11-2026).
-- Run once; safe to run again. Nothing existing is changed.
--
-- easy TimePro (System → Configuration → Api Settings) posts every new punch every minute to the
-- Edge Function "attendance-push" (URL carries a private key). The function stores the punches here.
-- Staff are matched by the machine's Employee ID (emp_code) to the ERP employee list — the names in
-- easy TimePro are NOT used (they are out of date); Admin / Nursing Manager link each code once in
-- HR → Biometric Attendance.
begin;

-- 1. Private push key (put in the API URL). Only the Edge Function (service role) and Admin read it.
create table if not exists public.attendance_push_settings (
  id int primary key default 1 check (id = 1),
  push_key text not null default replace(gen_random_uuid()::text,'-',''),
  last_push_at timestamptz,
  last_push_count int,
  last_push_error text,
  updated_at timestamptz not null default now()
);
insert into public.attendance_push_settings(id) values (1) on conflict do nothing;
alter table public.attendance_push_settings enable row level security;
revoke all on public.attendance_push_settings from public, anon, authenticated;

-- 2. Raw pushes (for checking the format / troubleshooting) — kept 30 days.
create table if not exists public.attendance_push_log (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  ok boolean,
  rows_in int,
  rows_saved int,
  error text,
  body text
);
alter table public.attendance_push_log enable row level security;
revoke all on public.attendance_push_log from public, anon, authenticated;

-- 3. Punches
create table if not exists public.attendance_punches (
  id bigserial primary key,
  emp_code text not null,
  punch_at timestamptz not null,
  punch_date date not null,
  punch_state text,
  verify_type text,
  terminal_sn text not null default '',
  terminal_alias text,
  area_name text,
  device_name text,           -- name as stored in easy TimePro (reference only)
  source text not null default 'easy TimePro',
  raw jsonb,
  received_at timestamptz not null default now(),
  unique (emp_code, punch_at, terminal_sn)
);
create index if not exists attendance_punches_date on public.attendance_punches(punch_date, emp_code);
alter table public.attendance_punches enable row level security;
revoke all on public.attendance_punches from public, anon, authenticated;

-- 4. Machine Employee ID ↔ ERP employee
create table if not exists public.attendance_device_users (
  emp_code text primary key,
  employee_id uuid references public.profiles(id) on delete set null,
  device_name text,
  ignore boolean not null default false,     -- e.g. test / visitor codes
  mapped_by_name text,
  mapped_at timestamptz
);
alter table public.attendance_device_users enable row level security;
revoke all on public.attendance_device_users from public, anon, authenticated;

-- 5. Who may use it: Admin / Directors and Manager (Nursing Manager)
create or replace function public.attendance_viewer()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p record;
begin
  select id, full_name, role, coalesce(is_active,true) as on_ into p
    from public.profiles where id = auth.uid() or auth_user_id = auth.uid() limit 1;
  if p.id is null or not p.on_ or p.role not in ('Admin','Manager') then
    raise exception 'Biometric attendance is available to Admin / Directors and the Nursing Manager only.'; end if;
  return jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role);
end $$;
revoke all on function public.attendance_viewer() from public, anon;
grant execute on function public.attendance_viewer() to authenticated;

-- 6. Store punches (called by the Edge Function with the service role)
create or replace function public.attendance_store_punches(p_rows jsonb)
returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb; n int := 0; v_at timestamptz; c int;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_at := (r->>'punch_at')::timestamptz;
    if coalesce(r->>'emp_code','') = '' or v_at is null then continue; end if;
    insert into public.attendance_punches(emp_code, punch_at, punch_date, punch_state, verify_type, terminal_sn, terminal_alias, area_name, device_name, raw)
    values (r->>'emp_code', v_at, (v_at at time zone 'Asia/Kolkata')::date, nullif(r->>'punch_state',''), nullif(r->>'verify_type',''),
            coalesce(r->>'terminal_sn',''), nullif(r->>'terminal_alias',''), nullif(r->>'area_name',''), nullif(r->>'device_name',''), r->'raw')
    on conflict (emp_code, punch_at, terminal_sn) do nothing;
    get diagnostics c = row_count; n := n + c;
    insert into public.attendance_device_users(emp_code, device_name) values (r->>'emp_code', nullif(r->>'device_name',''))
    on conflict (emp_code) do update set device_name = coalesce(excluded.device_name, attendance_device_users.device_name);
  end loop;
  return n;
end $$;
revoke all on function public.attendance_store_punches(jsonb) from public, anon, authenticated;

-- 7. ERP screen RPC
create or replace function public.attendance_rpc(p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v jsonb := public.attendance_viewer(); v_from date; v_to date;
begin
  if p_action = 'status' then
    return jsonb_build_object('ok',true,
      'push', (select jsonb_build_object('last_push_at',last_push_at,'last_push_count',last_push_count,'last_push_error',last_push_error,
                 'push_key', case when v->>'role'='Admin' then push_key end) from public.attendance_push_settings where id=1),
      'last_punch_at', (select max(punch_at) from public.attendance_punches),
      'total_punches', (select count(*) from public.attendance_punches),
      'recent_log', coalesce((select jsonb_agg(jsonb_build_object('received_at',received_at,'ok',ok,'rows_in',rows_in,'rows_saved',rows_saved,'error',error,
                       'body', case when v->>'role'='Admin' then left(body,600) end) order by received_at desc)
                       from (select * from public.attendance_push_log order by received_at desc limit 5) l),'[]'::jsonb));

  elsif p_action = 'codes' then
    return jsonb_build_object('ok',true,'codes', coalesce((select jsonb_agg(jsonb_build_object(
        'emp_code',u.emp_code,'employee_id',u.employee_id,'device_name',u.device_name,'ignore',u.ignore,
        'mapped_by_name',u.mapped_by_name,'mapped_at',u.mapped_at,
        'last_punch_at',(select max(punch_at) from public.attendance_punches x where x.emp_code=u.emp_code),
        'punches_30d',(select count(*) from public.attendance_punches x where x.emp_code=u.emp_code and x.punch_at > now()-interval '30 days'))
        order by (u.employee_id is not null), u.emp_code) from public.attendance_device_users u),'[]'::jsonb));

  elsif p_action = 'map' then
    if coalesce(p->>'emp_code','') = '' then raise exception 'Employee code missing.'; end if;
    if nullif(p->>'employee_id','') is not null and exists(select 1 from public.attendance_device_users
         where employee_id = (p->>'employee_id')::uuid and emp_code <> p->>'emp_code' and not ignore) then
      raise exception 'This ERP employee is already linked to another machine code. Unlink that one first.'; end if;
    insert into public.attendance_device_users(emp_code) values (p->>'emp_code') on conflict do nothing;
    update public.attendance_device_users set employee_id = nullif(p->>'employee_id','')::uuid,
      ignore = coalesce((p->>'ignore')::boolean,false), mapped_by_name = v->>'name', mapped_at = now()
     where emp_code = p->>'emp_code';
    return jsonb_build_object('ok',true);

  elsif p_action = 'punches' then
    v_from := coalesce(nullif(p->>'from','')::date, (now() at time zone 'Asia/Kolkata')::date);
    v_to := coalesce(nullif(p->>'to','')::date, v_from);
    if v_to - v_from > 62 then raise exception 'Choose a period of up to 2 months.'; end if;
    return jsonb_build_object('ok',true,'punches', coalesce((select jsonb_agg(jsonb_build_object(
        'id',a.id,'emp_code',a.emp_code,'employee_id',u.employee_id,'punch_at',a.punch_at,'punch_date',a.punch_date,
        'punch_state',a.punch_state,'verify_type',a.verify_type,'terminal_alias',coalesce(a.terminal_alias,a.terminal_sn),'area_name',a.area_name,'device_name',a.device_name)
        order by a.punch_at)
      from public.attendance_punches a left join public.attendance_device_users u on u.emp_code=a.emp_code
      where a.punch_date between v_from and v_to
        and (nullif(p->>'employee_id','') is null or u.employee_id = (p->>'employee_id')::uuid)),'[]'::jsonb));

  elsif p_action = 'rotate_key' then
    if v->>'role' <> 'Admin' then raise exception 'Admin only.'; end if;
    update public.attendance_push_settings set push_key = replace(gen_random_uuid()::text,'-',''), updated_at = now() where id = 1;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unknown action.';
end $f$;
revoke all on function public.attendance_rpc(text,jsonb) from public, anon;
grant execute on function public.attendance_rpc(text,jsonb) to authenticated;

-- 8. Housekeeping: raw push log kept 30 days
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-attendance-push-log-trim';
  perform cron.schedule('samara-attendance-push-log-trim', '50 20 * * *', $c$delete from public.attendance_push_log where received_at < now() - interval '30 days'$c$);
exception when others then raise notice 'pg_cron not available: %', sqlerrm; end $$;

notify pgrst, 'reload schema';
commit;

select 'Biometric attendance ready' as status, (select count(*) from public.attendance_punches) as punches;
