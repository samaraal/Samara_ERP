-- ERP 2.20.44 — PENDING SALARY DEDUCTIONS + Akshi's kitchen cash not handed over (12-11-2026). Needs SQL 186, 331, 379.
-- 1. samara_payroll_pending_deductions: an amount Admin must recover from an employee's salary for a month. Payroll
--    pre-fills it in "Other deductions" (with its note) when that month's salary is opened; once the salary is saved
--    with at least that deduction, it is marked recovered automatically.
-- 2. Akshi (STD) left on 11-11-2026 without handing over the kitchen petty cash. The kitchen cash book still showed her
--    balance (₹707.48 on 12-11-2026). That balance is written off the kitchen book (Adjustment + reconciliation, so
--    Madhu Mithra starts at ₹0) and added as a pending deduction from Akshi's November 2026 salary.
-- Run once; safe to run again (the kitchen step runs only once).
begin;

create table if not exists public.samara_payroll_pending_deductions(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  month date not null,
  amount numeric(12,2) not null check (amount > 0),
  note text not null,
  source text,
  created_by uuid references public.profiles(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  recovered_payroll_id uuid,
  recovered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text
);
create unique index if not exists samara_payroll_pending_source on public.samara_payroll_pending_deductions(source) where source is not null;
alter table public.samara_payroll_pending_deductions enable row level security;
revoke all on public.samara_payroll_pending_deductions from anon, authenticated;
grant all on public.samara_payroll_pending_deductions to service_role;

-- Payroll screen (Admin only, same check as Payroll)
create or replace function public.samara_payroll_pending(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb := public.samara_profit_admin();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'amount', amount, 'note', note, 'id', id) order by created_at)
                     from public.samara_payroll_pending_deductions
                    where month = date_trunc('month', p_month)::date and cancelled_at is null and recovered_at is null), '[]'::jsonb);
end $$;
revoke all on function public.samara_payroll_pending(date) from public, anon;
grant execute on function public.samara_payroll_pending(date) to authenticated;

-- mark recovered when the salary is saved with at least that much deduction
create or replace function public.samara_payroll_pending_recovered()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare due numeric;
begin
  if new.voided_at is not null then return new; end if;
  select coalesce(sum(amount),0) into due from public.samara_payroll_pending_deductions
   where employee_id = new.employee_id and month = new.month and cancelled_at is null and recovered_at is null;
  if due > 0 and coalesce(new.advance_deduction,0) + coalesce(new.other_deduction,0) >= due then
    update public.samara_payroll_pending_deductions set recovered_payroll_id = new.id, recovered_at = now()
     where employee_id = new.employee_id and month = new.month and cancelled_at is null and recovered_at is null;
  end if;
  return new;
end $$;
drop trigger if exists samara_payroll_pending_recovered on public.samara_payroll;
create trigger samara_payroll_pending_recovered after insert on public.samara_payroll for each row execute function public.samara_payroll_pending_recovered();

-- if a salary is voided, the deduction becomes pending again
create or replace function public.samara_payroll_pending_reopen()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.voided_at is null and new.voided_at is not null then
    update public.samara_payroll_pending_deductions set recovered_payroll_id = null, recovered_at = null where recovered_payroll_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists samara_payroll_pending_reopen on public.samara_payroll;
create trigger samara_payroll_pending_reopen after update of voided_at on public.samara_payroll for each row execute function public.samara_payroll_pending_reopen();

-- ---------- Akshi: kitchen cash not handed over ----------
do $$
declare ak public.profiles; adm public.profiles; bal numeric;
begin
  if exists(select 1 from public.samara_payroll_pending_deductions where source = 'kitchen-cash-akshi-2026-11') then return; end if;
  select * into ak from public.profiles where role = 'STD' and full_name ~* '\mAkshi\M' order by created_at desc limit 1;
  if ak.id is null then raise exception 'Akshi (STD) not found'; end if;
  select * into adm from public.profiles where role = 'Admin' and coalesce(is_active,true) order by created_at limit 1;
  select coalesce(sum(amount),0) into bal from public.kitchen_cash_entries;
  if bal <= 0 then raise notice 'Kitchen cash book is %, nothing to recover', bal; return; end if;

  insert into public.kitchen_reconciliations(id, book_cash, physical_cash, difference, note, actor)
  values (gen_random_uuid(), bal, 0, -bal,
          'Akshi (STD) left on 11-11-2026 without handing over the kitchen cash. ₹' || bal || ' to be recovered from her November 2026 salary. New in-charge Madhu Mithra starts at ₹0.', adm.id);
  insert into public.kitchen_cash_entries(id, kind, amount, balance_after, details, actor, actor_name)
  values (gen_random_uuid(), 'Adjustment', -bal, 0,
          'Cash not handed over by Akshi (left 11-11-2026) — ₹' || bal || ' to be deducted from her November 2026 salary', adm.id, 'Admin');
  insert into public.kitchen_audit(action, actor, actor_name, details)
  values ('Cash not handed over — recovery from salary', adm.id, 'Admin', jsonb_build_object('employee', ak.full_name, 'amount', bal, 'month', '2026-11'));

  insert into public.samara_payroll_pending_deductions(employee_id, month, amount, note, source, created_by, created_by_name)
  values (ak.id, date '2026-11-01', bal,
          'Kitchen petty cash not handed over when leaving on 11-11-2026 (₹' || bal || ')', 'kitchen-cash-akshi-2026-11', adm.id, 'Admin');
end $$;

notify pgrst, 'reload schema';
commit;

select p.full_name, d.month, d.amount, d.note from public.samara_payroll_pending_deductions d join public.profiles p on p.id = d.employee_id where d.cancelled_at is null;
