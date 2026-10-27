-- ERP 2.18.179 — Payroll (Admin / Directors): salary by days, on a 30-day month (decided 27-10-2026)
--   Per-day rate = monthly salary ÷ 30
--   Paid days    = days worked + weekly offs (max 4) + casual leave (1 credited per month, unused carried forward)
--                  — capped at 30.  Loss of pay = 30 − paid days.  Any leave other than Casual Leave is unpaid.
--   Net pay      = per-day × paid days + overtime + incentives + other earnings − advance − other deductions
--   Overtime / incentives are typed by Admin.  Days worked, weekly offs and leave are pre-filled from the Duty Roster
--   and approved leave, editable before saving.  Saving also records the net pay as that month's "Salaries"
--   expense (Net Profit).  Voiding removes both.
-- Run once in Supabase SQL Editor (after SQL 309). Safe to run again.

begin;

create table if not exists public.samara_payroll(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  employee_name text,
  designation text,
  month date not null check (month = date_trunc('month', month)::date),
  monthly_salary numeric(12,2) not null check (monthly_salary > 0),
  basis_days int not null default 30,
  per_day numeric(12,2) not null,
  days_worked numeric(5,1) not null default 0 check (days_worked >= 0),
  weekly_offs numeric(5,1) not null default 0 check (weekly_offs >= 0),
  cl_opening numeric(5,1) not null default 0,
  cl_credit numeric(5,1) not null default 1,
  cl_used numeric(5,1) not null default 0 check (cl_used >= 0),
  cl_paid numeric(5,1) not null default 0,
  cl_closing numeric(5,1) not null default 0,
  other_leave numeric(5,1) not null default 0 check (other_leave >= 0),
  paid_days numeric(5,1) not null,
  lop_days numeric(5,1) not null,
  earned numeric(12,2) not null,
  overtime numeric(12,2) not null default 0 check (overtime >= 0),
  incentives numeric(12,2) not null default 0 check (incentives >= 0),
  other_earnings numeric(12,2) not null default 0 check (other_earnings >= 0),
  earnings_note text,
  advance_deduction numeric(12,2) not null default 0 check (advance_deduction >= 0),
  other_deduction numeric(12,2) not null default 0 check (other_deduction >= 0),
  deduction_note text,
  net_pay numeric(12,2) not null check (net_pay >= 0),
  paid_on date not null,
  paid_mode text,
  roster jsonb,                       -- what the roster / leave said, kept for audit
  expense_id uuid,
  payslip_sent_at timestamptz,
  payslip_sent_to text,
  payslip_error text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_name text,
  void_reason text
);
create unique index if not exists samara_payroll_one_per_month on public.samara_payroll(employee_id, month) where voided_at is null;
alter table public.samara_payroll enable row level security;
revoke all on public.samara_payroll from public, anon, authenticated;
grant all on public.samara_payroll to service_role;

-- Days of one approved leave request falling inside [m_from, m_to]; half-day requests count 0.5 per day.
create or replace function public.samara_leave_days(p_from date, p_to date, p_shift_part text, m_from date, m_to date)
returns numeric language sql immutable as $$
  select case when p_from is null or p_to is null or greatest(p_from,m_from) > least(p_to,m_to) then 0
              else (least(p_to,m_to) - greatest(p_from,m_from) + 1)::numeric
                   * case when coalesce(p_shift_part,'') ilike '%half%' then 0.5 else 1 end end
$$;

create or replace function public.samara_payroll_rpc(p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a jsonb := public.samara_profit_admin();
  v_month date; v_end date; v_emp record; v_open numeric; v_row record;
  v_sal numeric; v_pd numeric; v_dw numeric; v_wo numeric; v_clu numeric; v_ol numeric;
  v_clav numeric; v_clp numeric; v_paid numeric; v_earn numeric; v_net numeric;
  v_ot numeric; v_inc numeric; v_oe numeric; v_adv numeric; v_od numeric; v_paid_on date;
  v_id uuid; v_exp uuid;
begin
  if p_action = 'month' then
    v_month := date_trunc('month', coalesce((p->>'month')::date, (now() at time zone 'Asia/Kolkata')::date))::date;
    v_end := (v_month + interval '1 month - 1 day')::date;
    return coalesce((
      select jsonb_agg(x order by x->>'name') from (
        select jsonb_build_object(
          'id', pr.id,
          'name', coalesce(nullif(btrim(concat_ws(' ', pr.title, pr.full_name)),''), pr.full_name),
          'designation', coalesce(pr.designation, pr.role), 'department', pr.department,
          'mobile', pr.mobile, 'is_active', coalesce(pr.is_active,true),
          'salary', pr.current_salary, 'frequency', coalesce(pr.salary_frequency,'Monthly'),
          'roster_days', (select count(distinct d.duty_date) from public.duty_assignments d
                           where d.employee_id in (pr.id, pr.auth_user_id) and d.duty_date between v_month and v_end
                             and coalesce(d.status,'') not in ('Cancelled','Rejected')
                             and not (coalesce(d.is_weekly_off,false) or d.shift='Weekly Off' or d.status='Weekly Off')),
          'roster_offs', (select count(distinct d.duty_date) from public.duty_assignments d
                           where d.employee_id in (pr.id, pr.auth_user_id) and d.duty_date between v_month and v_end
                             and (coalesce(d.is_weekly_off,false) or d.shift='Weekly Off' or d.status='Weekly Off')),
          'roster_entries', (select count(*) from public.duty_assignments d
                           where d.employee_id in (pr.id, pr.auth_user_id) and d.duty_date between v_month and v_end),
          'leave_cl', coalesce((select sum(public.samara_leave_days(l.from_date,l.to_date,l.shift_part,v_month,v_end)) from public.absence_requests l
                           where l.employee_id in (pr.id, pr.auth_user_id) and l.status='approved' and l.request_type='Leave'
                             and coalesce(l.leave_type,'') ilike 'casual%'),0),
          'leave_other', coalesce((select sum(public.samara_leave_days(l.from_date,l.to_date,l.shift_part,v_month,v_end)) from public.absence_requests l
                           where l.employee_id in (pr.id, pr.auth_user_id) and l.status='approved' and l.request_type='Leave'
                             and coalesce(l.leave_type,'') not ilike 'casual%'),0),
          'cl_opening', coalesce((select s.cl_closing from public.samara_payroll s
                           where s.employee_id=pr.id and s.voided_at is null and s.month < v_month
                           order by s.month desc limit 1),0),
          'saved', (select to_jsonb(s) from public.samara_payroll s where s.employee_id=pr.id and s.month=v_month and s.voided_at is null)
        ) x
        from public.profiles pr
        where pr.role <> 'Admin' and nullif(btrim(coalesce(pr.employee_id,'')),'') is not null
          and (coalesce(pr.is_active,true)
               or exists(select 1 from public.samara_payroll s where s.employee_id=pr.id and s.month=v_month and s.voided_at is null)
               or exists(select 1 from public.duty_assignments d where d.employee_id in (pr.id,pr.auth_user_id) and d.duty_date between v_month and v_end))
      ) q), '[]'::jsonb);

  elsif p_action = 'save' then
    v_month := date_trunc('month', (p->>'month')::date)::date;
    if v_month is null then raise exception 'Choose the month.'; end if;
    if v_month < date '2026-08-01' then raise exception 'Months before Samara opened are not allowed.'; end if;
    select id, coalesce(nullif(btrim(concat_ws(' ',title,full_name)),''),full_name) nm, coalesce(designation,role) des
      into v_emp from public.profiles where id=(p->>'employee_id')::uuid;
    if v_emp.id is null then raise exception 'Employee not found.'; end if;
    if exists(select 1 from public.samara_payroll where employee_id=v_emp.id and month=v_month and voided_at is null) then
      raise exception 'Salary for % is already saved for this month. Void it first to change it.', v_emp.nm;
    end if;
    v_sal := (p->>'monthly_salary')::numeric;
    if v_sal is null or v_sal <= 0 then raise exception 'Enter the monthly salary.'; end if;
    v_dw := greatest(coalesce((p->>'days_worked')::numeric,0),0);
    v_wo := greatest(coalesce((p->>'weekly_offs')::numeric,0),0);
    v_clu := greatest(coalesce((p->>'cl_used')::numeric,0),0);
    v_ol := greatest(coalesce((p->>'other_leave')::numeric,0),0);
    if v_dw > 31 or v_wo > 31 or v_clu > 31 or v_ol > 31 then raise exception 'Days cannot be more than 31.'; end if;
    v_ot := greatest(coalesce((p->>'overtime')::numeric,0),0);
    v_inc := greatest(coalesce((p->>'incentives')::numeric,0),0);
    v_oe := greatest(coalesce((p->>'other_earnings')::numeric,0),0);
    v_adv := greatest(coalesce((p->>'advance_deduction')::numeric,0),0);
    v_od := greatest(coalesce((p->>'other_deduction')::numeric,0),0);
    v_paid_on := coalesce((p->>'paid_on')::date, (now() at time zone 'Asia/Kolkata')::date);
    v_open := coalesce((select s.cl_closing from public.samara_payroll s where s.employee_id=v_emp.id and s.voided_at is null and s.month < v_month order by s.month desc limit 1),0);
    v_pd := round(v_sal/30, 2);
    v_clav := v_open + 1;
    v_clp := least(v_clu, v_clav);
    v_paid := least(30, v_dw + least(v_wo,4) + v_clp);
    v_earn := round(v_sal * v_paid / 30);
    v_net := v_earn + v_ot + v_inc + v_oe - v_adv - v_od;
    if v_net < 0 then raise exception 'Deductions are more than the salary earned (net would be below zero).'; end if;
    insert into public.samara_monthly_expenses(expense_date,head,description,amount,paid_mode,paid_to,employee_profile_id,reference,created_by,created_by_name)
    values (v_paid_on, 'Salaries',
            format('Salary — %s (%s) · %s · %s/30 paid days', v_emp.nm, coalesce(v_emp.des,''), to_char(v_month,'FMMonth YYYY'), trim(to_char(v_paid,'FM990.0'))),
            v_net, nullif(btrim(coalesce(p->>'paid_mode','')),''), v_emp.nm, v_emp.id, 'Payroll', (a->>'id')::uuid, a->>'name')
    returning id into v_exp;
    insert into public.samara_payroll(employee_id,employee_name,designation,month,monthly_salary,per_day,days_worked,weekly_offs,
           cl_opening,cl_credit,cl_used,cl_paid,cl_closing,other_leave,paid_days,lop_days,earned,
           overtime,incentives,other_earnings,earnings_note,advance_deduction,other_deduction,deduction_note,net_pay,
           paid_on,paid_mode,roster,expense_id,created_by,created_by_name)
    values (v_emp.id, v_emp.nm, v_emp.des, v_month, v_sal, v_pd, v_dw, v_wo,
           v_open, 1, v_clu, v_clp, v_clav - v_clp, v_ol, v_paid, 30 - v_paid, v_earn,
           v_ot, v_inc, v_oe, nullif(btrim(coalesce(p->>'earnings_note','')),''), v_adv, v_od, nullif(btrim(coalesce(p->>'deduction_note','')),''), v_net,
           v_paid_on, nullif(btrim(coalesce(p->>'paid_mode','')),''), p->'roster', v_exp, (a->>'id')::uuid, a->>'name')
    returning id into v_id;
    return (select to_jsonb(s) from public.samara_payroll s where s.id=v_id);

  elsif p_action = 'void' then
    if length(btrim(coalesce(p->>'reason',''))) < 3 then raise exception 'Give the reason for voiding this salary.'; end if;
    update public.samara_payroll set voided_at=now(), voided_by_name=a->>'name', void_reason=btrim(p->>'reason')
     where id=(p->>'id')::uuid and voided_at is null returning * into v_row;
    if v_row.id is null then raise exception 'Salary not found or already voided.'; end if;
    update public.samara_monthly_expenses set voided_at=now(), voided_by_name=a->>'name', void_reason='Payroll voided: '||btrim(p->>'reason')
     where id=v_row.expense_id and voided_at is null;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unknown action %', p_action;
end $$;
revoke all on function public.samara_payroll_rpc(text,jsonb) from public, anon;
grant execute on function public.samara_payroll_rpc(text,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;

-- Check
select to_regclass('public.samara_payroll') is not null as payroll_ready,
       public.samara_leave_days(date '2026-10-30', date '2026-11-02', null, date '2026-10-01', date '2026-10-31') = 2 as leave_split_ok;
