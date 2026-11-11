-- ERP 2.20.9 — EMPLOYEE PROBATION / CONFIRMATION, EXIT (SEPARATION) and HR LETTERS (11-11-2026).
-- Run once; safe to run again. Nothing existing is changed (new tables + new RPCs + one daily cron job).
--
-- Samara policy (Admin, 11-11-2026):
--   • Probation 3 months from date of joining. Notice: 1 month during probation, 2 months after confirmation
--     (both sides). Per-employee override for staff on an older letter.
--   • Exit types: Resignation (accept → notice → last working day), Termination (show-cause notice + reply first),
--     Left without notice (report-to-duty notice → abandonment of service), all ending in Full & Final settlement.
--   • HR letters (Appointment, Confirmation / Permanent, Resignation acceptance, Show cause, Termination,
--     Report to duty, Abandonment, Relieving & Experience, Full & Final statement, Suspension order) get a
--     reference number SAM/HR/<FY>/<nnn>; the PDF is made and sent on WhatsApp by the hr-letters Edge Function.
--   • After the last working day the ERP login is switched off automatically (daily job at 00:05 IST).
-- All of this is Admin / Directors only (same check as Net Profit / Rent: samara_profit_admin()).
begin;

-- 1. Probation / confirmation / notice terms per employee
create table if not exists public.employee_hr_terms (
  employee_id uuid primary key references public.profiles(id) on delete cascade,
  probation_months int not null default 3 check (probation_months between 0 and 12),
  confirmed_on date,
  notice_probation_months int not null default 1 check (notice_probation_months between 0 and 6),
  notice_confirmed_months int not null default 2 check (notice_confirmed_months between 0 and 6),
  notice_override_months int check (notice_override_months between 0 and 6),
  override_reason text,
  updated_at timestamptz not null default now(),
  updated_by_name text
);
alter table public.employee_hr_terms enable row level security;
revoke all on public.employee_hr_terms from public, anon, authenticated;

-- 2. Exit / separation cases
create table if not exists public.employee_separations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  exit_type text not null check (exit_type in ('Resignation','Termination','Left without notice')),
  status text not null default 'Open' check (status in ('Open','Notice Period','Show Cause Issued','Reply Received',
           'Report Notice Sent','Completed','Withdrawn','Cancelled')),
  -- resignation
  resignation_received_on date,
  resignation_reason text,
  accepted_on date,
  -- notice
  on_probation boolean,
  notice_months int,
  notice_waived boolean not null default false,
  last_working_day date,
  -- termination
  show_cause_issued_on date,
  show_cause_reply_by date,
  show_cause_allegation text,
  reply_received_on date,
  reply_summary text,
  termination_reason text,
  -- left without notice
  absent_from date,
  report_by date,
  -- final settlement (all amounts in INR)
  fnf jsonb not null default '{}'::jsonb,
  fnf_paid_on date,
  remarks text,
  login_closed_at timestamptz,
  auth_blocked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by_name text,
  updated_at timestamptz not null default now(),
  updated_by_name text
);
create index if not exists employee_separations_emp on public.employee_separations(employee_id, created_at desc);
create unique index if not exists employee_separations_one_open on public.employee_separations(employee_id)
  where status not in ('Completed','Withdrawn','Cancelled');
alter table public.employee_separations enable row level security;
revoke all on public.employee_separations from public, anon, authenticated;

-- 3. HR letters issued
create table if not exists public.hr_letters (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  separation_id uuid references public.employee_separations(id) on delete set null,
  letter_type text not null check (letter_type in ('Appointment Letter','Confirmation Letter','Resignation Acceptance Letter',
     'Show Cause Notice','Termination Letter','Report to Duty Notice','Abandonment of Service Letter',
     'Relieving & Experience Letter','Full & Final Settlement Statement','Suspension Order')),
  ref_no text unique,
  letter_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  data jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  sent_to text,
  send_route text,
  send_error text,
  pdf_path text,
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz not null default now(),
  created_by_name text
);
create index if not exists hr_letters_emp on public.hr_letters(employee_id, created_at desc);
alter table public.hr_letters enable row level security;
revoke all on public.hr_letters from public, anon, authenticated;

-- 4. Helper: whole-month notice / probation date arithmetic (date + n months − 1 day)
create or replace function public.hr_add_months_less_day(d date, n int)
returns date language sql immutable as $$ select case when d is null then null else ((d + make_interval(months => coalesce(n,0)))::date - case when coalesce(n,0)>0 then 1 else 0 end) end $$;

-- 5. The RPC (Admin / Directors only)
create or replace function public.hr_exit_rpc(p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare a jsonb := public.samara_profit_admin();
  v_emp uuid := nullif(p->>'employee_id','')::uuid;
  v_id uuid := nullif(p->>'id','')::uuid;
  prof public.profiles%rowtype; t public.employee_hr_terms%rowtype; s public.employee_separations%rowtype;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_prob_end date; v_on_prob boolean; v_months int; v_fy text; v_fy_start int; v_n int; v_no text; v_date date;
begin
  if p_action = 'load' then
    select * into prof from public.profiles where id = v_emp;
    if prof.id is null then raise exception 'Employee not found.'; end if;
    insert into public.employee_hr_terms(employee_id) values (v_emp) on conflict do nothing;
    select * into t from public.employee_hr_terms where employee_id = v_emp;
    return jsonb_build_object('ok',true,
      'terms', to_jsonb(t) || jsonb_build_object('probation_end_date', public.hr_add_months_less_day(prof.date_of_joining::date, t.probation_months)),
      'separations', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.employee_separations x where x.employee_id = v_emp),'[]'::jsonb),
      'letters', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from public.hr_letters l where l.employee_id = v_emp),'[]'::jsonb));

  elsif p_action = 'status_all' then
    -- for the Employee Register / Employees list: latest separation + confirmation per employee
    return jsonb_build_object('ok',true,
      'separations', coalesce((select jsonb_agg(jsonb_build_object('employee_id',x.employee_id,'exit_type',x.exit_type,'status',x.status,
                       'last_working_day',x.last_working_day,'login_closed_at',x.login_closed_at,'auth_blocked_at',x.auth_blocked_at,'id',x.id))
                       from (select distinct on (employee_id) * from public.employee_separations
                              where status not in ('Withdrawn','Cancelled') order by employee_id, created_at desc) x),'[]'::jsonb),
      'terms', coalesce((select jsonb_agg(jsonb_build_object('employee_id',employee_id,'confirmed_on',confirmed_on,'probation_months',probation_months))
                       from public.employee_hr_terms),'[]'::jsonb));

  elsif p_action = 'save_terms' then
    insert into public.employee_hr_terms(employee_id) values (v_emp) on conflict do nothing;
    update public.employee_hr_terms set
      probation_months = coalesce(nullif(p->>'probation_months','')::int, probation_months),
      notice_override_months = nullif(p->>'notice_override_months','')::int,
      override_reason = nullif(btrim(coalesce(p->>'override_reason','')),''),
      updated_at = now(), updated_by_name = a->>'name'
     where employee_id = v_emp;
    return jsonb_build_object('ok',true);

  elsif p_action = 'confirm' then
    v_date := coalesce(nullif(p->>'confirmed_on','')::date, v_today);
    insert into public.employee_hr_terms(employee_id) values (v_emp) on conflict do nothing;
    update public.employee_hr_terms set confirmed_on = v_date, updated_at = now(), updated_by_name = a->>'name' where employee_id = v_emp;
    return jsonb_build_object('ok',true,'confirmed_on',v_date);

  elsif p_action = 'undo_confirm' then
    update public.employee_hr_terms set confirmed_on = null, updated_at = now(), updated_by_name = a->>'name' where employee_id = v_emp;
    return jsonb_build_object('ok',true);

  elsif p_action = 'start' then
    -- open a new exit case: resignation / termination / left without notice
    select * into prof from public.profiles where id = v_emp;
    if prof.id is null then raise exception 'Employee not found.'; end if;
    if exists(select 1 from public.employee_separations where employee_id = v_emp and status not in ('Completed','Withdrawn','Cancelled')) then
      raise exception 'This employee already has an open exit case. Finish or cancel it first.'; end if;
    insert into public.employee_hr_terms(employee_id) values (v_emp) on conflict do nothing;
    select * into t from public.employee_hr_terms where employee_id = v_emp;
    v_prob_end := public.hr_add_months_less_day(prof.date_of_joining::date, t.probation_months);
    v_date := coalesce(nullif(p->>'resignation_received_on','')::date, nullif(p->>'show_cause_issued_on','')::date, nullif(p->>'absent_from','')::date, v_today);
    v_on_prob := t.confirmed_on is null and (v_prob_end is null or v_date <= v_prob_end);
    v_months := coalesce(t.notice_override_months, case when v_on_prob then t.notice_probation_months else t.notice_confirmed_months end);
    insert into public.employee_separations(employee_id, exit_type, status, resignation_received_on, resignation_reason,
        show_cause_issued_on, show_cause_reply_by, show_cause_allegation, absent_from, report_by,
        on_probation, notice_months, last_working_day, remarks, created_by_name, updated_by_name)
    values (v_emp, p->>'exit_type',
        case p->>'exit_type' when 'Resignation' then 'Open' when 'Termination' then 'Show Cause Issued' else 'Report Notice Sent' end,
        nullif(p->>'resignation_received_on','')::date, nullif(btrim(coalesce(p->>'resignation_reason','')),''),
        nullif(p->>'show_cause_issued_on','')::date, nullif(p->>'show_cause_reply_by','')::date, nullif(btrim(coalesce(p->>'show_cause_allegation','')),''),
        nullif(p->>'absent_from','')::date, nullif(p->>'report_by','')::date,
        v_on_prob, v_months,
        case when p->>'exit_type'='Resignation' then public.hr_add_months_less_day(nullif(p->>'resignation_received_on','')::date, v_months) end,
        nullif(btrim(coalesce(p->>'remarks','')),''), a->>'name', a->>'name')
    returning * into s;
    return jsonb_build_object('ok',true,'separation',to_jsonb(s));

  elsif p_action = 'update' then
    -- generic step update (accept resignation, record reply, terminate, mark abandoned, change last day, F&F, complete…)
    select * into s from public.employee_separations where id = v_id;
    if s.id is null then raise exception 'Exit case not found.'; end if;
    if s.status in ('Completed','Withdrawn','Cancelled') and coalesce(p->>'allow_closed','') <> 'yes' then
      raise exception 'This exit case is already closed.'; end if;
    update public.employee_separations set
      status = coalesce(nullif(p->>'status',''), status),
      accepted_on = coalesce(nullif(p->>'accepted_on','')::date, accepted_on),
      notice_waived = coalesce((p->>'notice_waived')::boolean, notice_waived),
      last_working_day = case when p ? 'last_working_day' then nullif(p->>'last_working_day','')::date else last_working_day end,
      reply_received_on = coalesce(nullif(p->>'reply_received_on','')::date, reply_received_on),
      reply_summary = coalesce(nullif(btrim(coalesce(p->>'reply_summary','')),''), reply_summary),
      termination_reason = coalesce(nullif(btrim(coalesce(p->>'termination_reason','')),''), termination_reason),
      report_by = coalesce(nullif(p->>'report_by','')::date, report_by),
      fnf = case when p ? 'fnf' then coalesce(p->'fnf','{}'::jsonb) else fnf end,
      fnf_paid_on = case when p ? 'fnf_paid_on' then nullif(p->>'fnf_paid_on','')::date else fnf_paid_on end,
      remarks = coalesce(nullif(btrim(coalesce(p->>'remarks','')),''), remarks),
      completed_at = case when nullif(p->>'status','') = 'Completed' and completed_at is null then now() else completed_at end,
      updated_at = now(), updated_by_name = a->>'name'
     where id = v_id returning * into s;
    if s.exit_type = 'Termination' and s.status = 'Completed' and s.show_cause_issued_on is null then
      raise exception 'A termination needs a show-cause notice first.'; end if;
    return jsonb_build_object('ok',true,'separation',to_jsonb(s));

  elsif p_action = 'login_closed' then
    update public.employee_separations set login_closed_at = coalesce(login_closed_at, now()),
      auth_blocked_at = case when (p->>'auth')='yes' then coalesce(auth_blocked_at, now()) else auth_blocked_at end
     where id = v_id;
    return jsonb_build_object('ok',true);

  elsif p_action = 'new_letter' then
    -- reserve a reference number and store the letter snapshot (data = everything printed on the letter)
    if coalesce(p->>'letter_type','') = '' then raise exception 'Letter type is required.'; end if;
    v_date := coalesce(nullif(p->>'letter_date','')::date, v_today);
    v_fy_start := case when extract(month from v_date) >= 4 then extract(year from v_date)::int else extract(year from v_date)::int - 1 end;
    v_fy := v_fy_start::text || '-' || right((v_fy_start + 1)::text, 2);
    perform pg_advisory_xact_lock(hashtext('hr_letter_no'));
    select coalesce(max(split_part(ref_no,'/',4)::int),0) + 1 into v_n from public.hr_letters where ref_no like 'SAM/HR/'||v_fy||'/%';
    v_no := 'SAM/HR/'||v_fy||'/'||lpad(v_n::text,3,'0');
    insert into public.hr_letters(employee_id, separation_id, letter_type, ref_no, letter_date, data, created_by_name)
    values (v_emp, nullif(p->>'separation_id','')::uuid, p->>'letter_type', v_no, v_date, coalesce(p->'data','{}'::jsonb) || jsonb_build_object('issued_by', a->>'name'), a->>'name')
    returning id into v_id;
    return jsonb_build_object('ok',true,'id',v_id,'ref_no',v_no);

  elsif p_action = 'void_letter' then
    update public.hr_letters set voided_at = now(), voided_reason = coalesce(nullif(btrim(p->>'reason'),''),'Voided') where id = v_id and voided_at is null;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unknown action.';
end $f$;
revoke all on function public.hr_exit_rpc(text,jsonb) from public, anon;
grant execute on function public.hr_exit_rpc(text,jsonb) to authenticated;

-- 6. Daily: close the ERP login the day after the last working day (resignation / termination with a set last day).
--    The profile is switched to inactive (the ERP signs out inactive profiles); the Admin's next visit to Employees
--    also applies the full sign-in block (auth ban) through the existing Disable route.
create or replace function public.hr_exit_daily_close()
returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; n int := 0; v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  for r in select * from public.employee_separations
            where status in ('Notice Period','Open','Reply Received','Show Cause Issued')
              and exit_type in ('Resignation','Termination') and last_working_day is not null and last_working_day < v_today
              and login_closed_at is null
              and (exit_type = 'Resignation' and accepted_on is not null or exit_type = 'Termination' and termination_reason is not null)
  loop
    update public.profiles set is_active = false, active = false where id = r.employee_id;
    begin
      insert into public.audit_log(action, entity, entity_id, details)
        values ('DISABLE_EMPLOYEE', 'profiles', r.employee_id, jsonb_build_object('reason','Last working day over ('||r.exit_type||')','separation_id',r.id));
    exception when others then null; end;
    update public.employee_separations set login_closed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.hr_exit_daily_close() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-hr-exit-daily-close';
  perform cron.schedule('samara-hr-exit-daily-close', '35 18 * * *', 'select public.hr_exit_daily_close();');  -- 00:05 IST
exception when others then raise notice 'pg_cron not available: %', sqlerrm; end $$;

notify pgrst, 'reload schema';
commit;

-- Check
select count(*) as terms_rows from public.employee_hr_terms;
select jobname, schedule, active from cron.job where jobname = 'samara-hr-exit-daily-close';
