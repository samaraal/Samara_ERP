-- 2.18.169 — Net Profit Statement (Admin / Directors only)
-- 1. samara_monthly_expenses: expenses the ERP does not already hold (salaries paid, rent, electricity, …).
-- 2. samara_expense_rpc(action, p): list / add / void monthly expenses, salary pre-fill from HR.
-- 3. get_net_profit_statement(from, to): income (charges raised, less discounts; Trial Guests excluded),
--    collections, and expenses from every ERP source, plus the manual monthly expenses.
-- No direct table access: everything goes through these checked functions.

create table if not exists public.samara_monthly_expenses(
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  head text not null,
  description text,
  amount numeric(12,2) not null check(amount>0),
  paid_mode text,
  paid_to text,
  employee_profile_id uuid,
  reference text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_name text,
  void_reason text
);
create index if not exists samara_monthly_expenses_date on public.samara_monthly_expenses(expense_date);
alter table public.samara_monthly_expenses enable row level security;
revoke all on public.samara_monthly_expenses from public, anon, authenticated;

create or replace function public.samara_profit_admin()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p record;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select id, coalesce(nullif(btrim(concat_ws(' ',title,full_name)),''),full_name) as name, role,
         coalesce(is_active, true) as on_
    into p from public.profiles
   where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if p.id is null or not p.on_ or p.role<>'Admin' then raise exception 'Net Profit is available to Admin / Directors only'; end if;
  return jsonb_build_object('id',p.id,'name',p.name);
end $$;

create or replace function public.samara_expense_rpc(p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb := public.samara_profit_admin(); v_from date; v_to date; v_id uuid; v_amt numeric; v_head text;
begin
  if p_action='list' then
    v_from := coalesce((p->>'from')::date, date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date);
    v_to   := coalesce((p->>'to')::date, (now() at time zone 'Asia/Kolkata')::date);
    return coalesce((select jsonb_agg(to_jsonb(e) order by e.expense_date desc, e.created_at desc)
                       from public.samara_monthly_expenses e
                      where e.expense_date between v_from and v_to
                        and (coalesce((p->>'include_void')::boolean,false) or e.voided_at is null)), '[]'::jsonb);
  elsif p_action='add' then
    v_amt := (p->>'amount')::numeric;
    v_head := btrim(coalesce(p->>'head',''));
    if v_head='' then raise exception 'Choose the expense head.'; end if;
    if v_amt is null or v_amt<=0 then raise exception 'Enter an amount greater than zero.'; end if;
    if (p->>'date') is null then raise exception 'Enter the expense date.'; end if;
    if (p->>'date')::date < date '2026-08-27' then raise exception 'Dates before 27-08-2026 are not allowed.'; end if;
    insert into public.samara_monthly_expenses(expense_date,head,description,amount,paid_mode,paid_to,employee_profile_id,reference,created_by,created_by_name)
    values((p->>'date')::date, v_head, nullif(btrim(coalesce(p->>'description','')),''), v_amt,
           nullif(btrim(coalesce(p->>'mode','')),''), nullif(btrim(coalesce(p->>'paid_to','')),''),
           nullif(p->>'employee_id','')::uuid, nullif(btrim(coalesce(p->>'reference','')),''),
           (a->>'id')::uuid, a->>'name')
    returning id into v_id;
    return jsonb_build_object('id',v_id);
  elsif p_action='void' then
    if length(btrim(coalesce(p->>'reason','')))<3 then raise exception 'Give the reason for removing this expense.'; end if;
    update public.samara_monthly_expenses
       set voided_at=now(), voided_by_name=a->>'name', void_reason=btrim(p->>'reason')
     where id=(p->>'id')::uuid and voided_at is null;
    if not found then raise exception 'Expense not found or already removed.'; end if;
    return jsonb_build_object('ok',true);
  elsif p_action='salary_prefill' then
    -- Active HR employees (not Admin / Director accounts) with their HR monthly salary, if set.
    return coalesce((select jsonb_agg(jsonb_build_object(
              'id',x.id,'name',coalesce(nullif(btrim(concat_ws(' ',x.title,x.full_name)),''),x.full_name),
              'designation',coalesce(x.designation,x.role),'department',x.department,
              'salary',x.current_salary,'frequency',coalesce(x.salary_frequency,'Monthly'))
              order by x.full_name)
             from public.profiles x
            where coalesce(x.is_active,true) and x.role<>'Admin'
              and nullif(btrim(coalesce(x.employee_id,'')),'') is not null), '[]'::jsonb);
  end if;
  raise exception 'Unknown action %', p_action;
end $$;
revoke all on function public.samara_expense_rpc(text,jsonb) from public, anon;
grant execute on function public.samara_expense_rpc(text,jsonb) to authenticated;

create or replace function public.get_net_profit_statement(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  a jsonb := public.samara_profit_admin();
  income jsonb; discounts numeric; collected numeric; refunds numeric; outstanding numeric;
  stores numeric; stores_missing int; food numeric; kitchen numeric; petty numeric; physio numeric;
  outside numeric; equipment numeric; manual jsonb; manual_total numeric; outgoing jsonb; outgoing_total numeric;
begin
  if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid period'; end if;

  -- Income: charges raised in the period, by category (Trial Guests excluded).
  select coalesce(jsonb_agg(jsonb_build_object('category',category,'amount',amt) order by amt desc),'[]'::jsonb) into income
    from (select coalesce(nullif(btrim(t.category),''),'Other') category, round(sum(t.amount),2) amt
            from public.billing_transactions t join public.patients pt on pt.id=t.patient_id
           where t.transaction_type='Charge' and not coalesce(pt.is_trial,false)
             and coalesce(t.source_date,t.transaction_date)::date between p_from and p_to
           group by 1) s;
  select coalesce(sum(t.amount),0) into discounts from public.billing_transactions t join public.patients pt on pt.id=t.patient_id
   where t.transaction_type='Discount' and not coalesce(pt.is_trial,false) and coalesce(t.source_date,t.transaction_date)::date between p_from and p_to;
  select coalesce(sum(t.amount),0) into collected from public.billing_transactions t join public.patients pt on pt.id=t.patient_id
   where t.transaction_type in ('Payment','Advance') and not coalesce(pt.is_trial,false) and t.transaction_date::date between p_from and p_to;
  select coalesce(sum(t.amount),0) into refunds from public.billing_transactions t join public.patients pt on pt.id=t.patient_id
   where t.transaction_type='Refund' and not coalesce(pt.is_trial,false) and t.transaction_date::date between p_from and p_to;
  select coalesce(sum(case when t.transaction_type='Charge' then t.amount
                           when t.transaction_type in ('Discount','Payment','Advance') then -t.amount
                           when t.transaction_type='Refund' then t.amount else 0 end),0)
    into outstanding from public.billing_transactions t join public.patients pt on pt.id=t.patient_id
   where not coalesce(pt.is_trial,false);

  -- Expenses already in the ERP.
  select coalesce(sum(r.quantity*r.unit_cost),0), count(*) filter (where r.unit_cost is null or r.unit_cost<=0)
    into stores, stores_missing from public.consumable_store_receipts r
   where r.voided_at is null and coalesce(r.invoice_date,r.received_date,r.received_at::date) between p_from and p_to;
  select coalesce(sum(l.amount),0) into food from public.fv_ledger l where l.kind='Receipt' and l.day between p_from and p_to;
  select coalesce(sum(k.total),0) into kitchen from public.kitchen_purchases k where k.status<>'Reversed' and k.expense_date between p_from and p_to;
  select coalesce(sum(-e.amount),0) into petty from public.nm_petty_cash_entries e where e.kind in ('Expense','Expense reversal') and e.entry_date between p_from and p_to;
  select coalesce(sum(l.amount),0) into physio from public.physio_supplier_ledger l
   where l.entry_date between p_from and p_to
     and (l.kind='Session fee' or (l.kind='Reversal' and exists(select 1 from public.physio_supplier_ledger o where o.id=l.reverses and o.kind='Session fee')));
  select coalesce(sum(b.outside_bill_amount),0) into outside from public.bill_charge_requests b join public.patients pt on pt.id=b.patient_id
   where coalesce(b.paid_by_samara,false) and b.outside_bill_amount is not null and not coalesce(pt.is_trial,false)
     and b.approval_status in ('Approved','Partially Approved') and b.charge_date between p_from and p_to;
  select coalesce(sum(e.quantity*coalesce(e.unit_cost,0)),0) into equipment from public.biomedical_equipment_purchases e
   where e.source='Purchase' and coalesce(e.bill_date,(e.received_at at time zone 'Asia/Kolkata')::date) between p_from and p_to;

  -- Paid through Outgoing Payments (Payment Requests → Vouchers), by date paid, not reversed.
  -- Food vendors / Purchases are excluded (already counted from food receipts and stock receipts);
  -- Patient refunds / Advance are not expenses.
  select coalesce(jsonb_agg(jsonb_build_object('head',cat,'amount',amt,'entries',n) order by amt desc),'[]'::jsonb), coalesce(sum(amt),0)
    into outgoing, outgoing_total
    from (select case when r.category ilike 'Other:%' then 'Other' else r.category end cat, round(sum(pay.amount),2) amt, count(*) n
            from public.op_trial_payments pay join public.op_trial_requests r on r.id=pay.request_id
           where pay.reversed_at is null and pay.paid_on between p_from and p_to
             and r.category not in ('Food vendors','Purchases','Patient refunds','Advance')
           group by 1) o;

  -- Manual monthly expenses by head.
  select coalesce(jsonb_agg(jsonb_build_object('head',head,'amount',amt,'entries',n) order by amt desc),'[]'::jsonb), coalesce(sum(amt),0)
    into manual, manual_total
    from (select head, round(sum(amount),2) amt, count(*) n from public.samara_monthly_expenses
           where voided_at is null and expense_date between p_from and p_to group by head) m;

  return jsonb_build_object(
    'from',p_from,'to',p_to,'generated_by',a->>'name','generated_at',now(),
    'income',income,'discounts',discounts,'collected',collected,'refunds',refunds,'outstanding_now',outstanding,
    'erp_expenses',jsonb_build_array(
      jsonb_build_object('head','Pharmacy & Consumables purchases','amount',stores,'note',case when stores_missing>0 then stores_missing||' stock receipts have no purchase price' end),
      jsonb_build_object('head','Food — vendor meals received','amount',food),
      jsonb_build_object('head','Kitchen / Food Stores purchases','amount',kitchen),
      jsonb_build_object('head','Petty cash expenses (Nursing Manager)','amount',petty),
      jsonb_build_object('head','Physiotherapy — outsourced session fees','amount',physio),
      jsonb_build_object('head','Outside bills paid by Samara for Guests','amount',outside)),
    'outgoing_expenses',outgoing,'outgoing_total',outgoing_total,
    'manual_expenses',manual,'manual_total',manual_total,
    'equipment',equipment);
end $$;
revoke all on function public.get_net_profit_statement(date,date) from public, anon;
grant execute on function public.get_net_profit_statement(date,date) to authenticated;
notify pgrst, 'reload schema';
