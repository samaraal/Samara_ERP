-- ERP 2.19.78 — ZENSET (GENERATOR) ACCOUNT (07-11-2026). Run AFTER SQL 305 / 309 (Expenses). Run once; safe to run again.
--
-- A separate account for the generator hired from the Zenset vendor (₹15,000 + GST a month, paid before the 10th):
--   • Refundable deposit paid to the vendor — Samara's money held by the vendor. NOT an expense (no effect on Net Profit).
--     A refund received later reduces it.
--   • Monthly rent — recorded ONCE here; it is added to Expenses automatically under the head "Zenset Rental"
--     (rent + GST), so it counts in Net Profit and is never typed twice. Removing it here removes it from Expenses too.
--   • Month-by-month status: Paid / Part paid / Due / Overdue (after the due day).
-- Built generic (rental_accounts) so another hired item can be added later; Zenset is created as the first account.
-- Admin / Directors only, same as Expenses. Bill photo / PDF (or a "No bill" reason) is needed for rent, as in Expenses.
begin;

create table if not exists public.rental_accounts(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  item text,
  expense_head text not null,
  vendor_name text, vendor_phone text, vendor_gstin text,
  monthly_rent numeric(12,2) not null default 0 check (monthly_rent >= 0),
  gst_percent numeric(5,2) not null default 18 check (gst_percent between 0 and 28),
  due_day int not null default 10 check (due_day between 1 and 28),
  rent_from date,               -- first month tracked here
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  updated_by_name text
);

create table if not exists public.rental_entries(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.rental_accounts(id),
  entry_date date not null,
  kind text not null check (kind in ('Deposit paid','Deposit refunded','Rent payment')),
  period_month date,            -- 1st of the rent month (rent payments)
  amount numeric(12,2) not null check (amount > 0),   -- total paid / received (rent: incl. GST)
  rent_amount numeric(12,2), gst_amount numeric(12,2),
  paid_mode text, reference text, note text,
  bill_path text, no_bill_reason text,
  expense_id uuid,              -- the matching row in samara_monthly_expenses (rent only)
  created_by uuid, created_by_name text, created_at timestamptz not null default now(),
  voided_at timestamptz, voided_by_name text, void_reason text
);
create index if not exists rental_entries_account on public.rental_entries(account_id, entry_date);

alter table public.rental_accounts enable row level security;
alter table public.rental_entries enable row level security;
revoke all on public.rental_accounts from public, anon, authenticated;
revoke all on public.rental_entries from public, anon, authenticated;

insert into public.rental_accounts(name, item, expense_head, monthly_rent, gst_percent, due_day, rent_from, notes)
values ('Zenset', 'Generator (genset) on hire', 'Zenset Rental', 15000, 18, 10, date '2026-11-01',
        'Rent ₹15,000 + GST a month, paid before the 10th. Refundable deposit paid to the vendor.')
on conflict (name) do nothing;

create or replace function public.rental_account_rpc(p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare a jsonb := public.samara_profit_admin();   -- Admin / Directors only (same as Expenses)
  acc public.rental_accounts%rowtype; v_id uuid; v_exp uuid; v_month date; v_date date; v_rent numeric; v_gst numeric; v_total numeric;
  today date := (now() at time zone 'Asia/Kolkata')::date; e public.rental_entries%rowtype; months jsonb; entries jsonb; accounts jsonb;
begin
  if p_action = 'load' then
    select * into acc from public.rental_accounts
     where (nullif(p->>'account_id','') is null and active) or id = nullif(p->>'account_id','')::uuid
     order by (id = nullif(p->>'account_id','')::uuid) desc nulls last, created_at limit 1;
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'item',item,'active',active) order by created_at),'[]') into accounts from public.rental_accounts;
    if acc.id is null then return jsonb_build_object('accounts',accounts,'account',null); end if;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.entry_date desc, x.created_at desc),'[]') into entries
      from (select r.*, to_char(r.period_month,'Mon YYYY') as period_label from public.rental_entries r where r.account_id = acc.id) x;
    -- month-by-month rent status from "rent from" to this month (and any month paid outside that range)
    with due as (select round(acc.monthly_rent * (1 + acc.gst_percent/100), 2) as amt),
    mm as (
      select generate_series(date_trunc('month', coalesce(acc.rent_from, today))::date, date_trunc('month', today)::date, interval '1 month')::date as m
      union
      select distinct period_month from public.rental_entries where account_id = acc.id and kind = 'Rent payment' and voided_at is null and period_month is not null
    ),
    paid as (select period_month m, sum(amount) amt, max(entry_date) last_date, count(*) n
               from public.rental_entries where account_id = acc.id and kind = 'Rent payment' and voided_at is null group by period_month)
    select coalesce(jsonb_agg(jsonb_build_object(
             'month', mm.m, 'label', to_char(mm.m,'Mon YYYY'), 'due', (select amt from due),
             'due_date', (mm.m + (acc.due_day - 1)), 'paid', coalesce(paid.amt,0), 'paid_on', paid.last_date, 'payments', coalesce(paid.n,0),
             'status', case when coalesce(paid.amt,0) >= (select amt from due) - 1 then 'Paid'
                            when coalesce(paid.amt,0) > 0 then 'Part paid'
                            when today > mm.m + (acc.due_day - 1) then 'Overdue'
                            else 'Due' end) order by mm.m desc),'[]') into months
      from mm left join paid on paid.m = mm.m;
    return jsonb_build_object('accounts',accounts,'account',to_jsonb(acc),'entries',entries,'months',months,
      'totals', jsonb_build_object(
        'deposit_paid', (select coalesce(sum(amount),0) from public.rental_entries where account_id=acc.id and kind='Deposit paid' and voided_at is null),
        'deposit_refunded', (select coalesce(sum(amount),0) from public.rental_entries where account_id=acc.id and kind='Deposit refunded' and voided_at is null),
        'rent_paid', (select coalesce(sum(amount),0) from public.rental_entries where account_id=acc.id and kind='Rent payment' and voided_at is null),
        'rent_paid_gst', (select coalesce(sum(gst_amount),0) from public.rental_entries where account_id=acc.id and kind='Rent payment' and voided_at is null),
        'monthly_due', round(acc.monthly_rent * (1 + acc.gst_percent/100), 2)),
      'today', today);

  elsif p_action = 'save_account' then
    if nullif(p->>'id','') is null then raise exception 'Account missing.'; end if;
    if coalesce((p->>'monthly_rent')::numeric, -1) < 0 then raise exception 'Enter the monthly rent.'; end if;
    update public.rental_accounts set
      vendor_name = nullif(btrim(coalesce(p->>'vendor_name','')),''), vendor_phone = nullif(btrim(coalesce(p->>'vendor_phone','')),''),
      vendor_gstin = upper(nullif(btrim(coalesce(p->>'vendor_gstin','')),'')),
      monthly_rent = (p->>'monthly_rent')::numeric, gst_percent = coalesce(nullif(p->>'gst_percent','')::numeric, 18),
      due_day = coalesce(nullif(p->>'due_day','')::int, 10), rent_from = date_trunc('month', nullif(p->>'rent_from','')::date)::date,
      notes = nullif(btrim(coalesce(p->>'notes','')),''), updated_at = now(), updated_by_name = a->>'name'
     where id = (p->>'id')::uuid;
    if not found then raise exception 'Account not found.'; end if;
    return jsonb_build_object('ok',true);

  elsif p_action = 'pay_rent' then
    select * into acc from public.rental_accounts where id = (p->>'account_id')::uuid;
    if acc.id is null then raise exception 'Account not found.'; end if;
    v_date := (p->>'date')::date; v_month := date_trunc('month', (p->>'month')::date)::date;
    v_rent := coalesce(nullif(p->>'rent_amount','')::numeric, 0); v_gst := coalesce(nullif(p->>'gst_amount','')::numeric, 0);
    v_total := v_rent + v_gst;
    if v_date is null or v_date > today then raise exception 'Choose the payment date (not in the future).'; end if;
    if v_date < date '2026-08-27' then raise exception 'Dates before 27-08-2026 are not allowed (Expenses start on 27-08-2026).'; end if;
    if v_month is null then raise exception 'Choose the rent month.'; end if;
    if v_rent <= 0 or v_gst < 0 then raise exception 'Enter the rent amount (and GST, if any).'; end if;
    if nullif(btrim(coalesce(p->>'bill_path','')),'') is null and length(btrim(coalesce(p->>'no_bill_reason',''))) < 3 then
      raise exception 'Add a photo of the bill, or tick "No bill" and give the reason.';
    end if;
    if coalesce((p->>'confirm_again')::boolean,false) = false and exists(select 1 from public.rental_entries
         where account_id = acc.id and kind = 'Rent payment' and voided_at is null and period_month = v_month
         having sum(amount) >= round(acc.monthly_rent*(1+acc.gst_percent/100),2) - 1) then
      raise exception 'Rent for % is already paid in full. Tick "Pay again for this month" only if this is really a second payment.', to_char(v_month,'Mon YYYY');
    end if;
    -- 1) Expenses (counts in Net Profit)
    insert into public.samara_monthly_expenses(expense_date, head, description, amount, paid_mode, paid_to, reference,
                                               created_by, created_by_name, bill_path, no_bill_reason)
    values (v_date, acc.expense_head,
            left(concat(acc.name,' rent — ',to_char(v_month,'Mon YYYY'),' (₹',to_char(v_rent,'FM99,99,99,990.00'),
                        case when v_gst > 0 then ' + GST ₹'||to_char(v_gst,'FM99,99,99,990.00') else '' end,')',
                        coalesce(' · '||nullif(btrim(p->>'note'),''),'')),500),
            v_total, nullif(p->>'mode',''), coalesce(nullif(btrim(coalesce(p->>'paid_to','')),''), acc.vendor_name), nullif(btrim(coalesce(p->>'reference','')),''),
            (a->>'id')::uuid, a->>'name', nullif(btrim(coalesce(p->>'bill_path','')),''), nullif(btrim(coalesce(p->>'no_bill_reason','')),''))
    returning id into v_exp;
    -- 2) the account entry, linked to it
    insert into public.rental_entries(account_id, entry_date, kind, period_month, amount, rent_amount, gst_amount, paid_mode, reference, note,
                                      bill_path, no_bill_reason, expense_id, created_by, created_by_name)
    values (acc.id, v_date, 'Rent payment', v_month, v_total, v_rent, v_gst, nullif(p->>'mode',''), nullif(btrim(coalesce(p->>'reference','')),''),
            nullif(btrim(coalesce(p->>'note','')),''), nullif(btrim(coalesce(p->>'bill_path','')),''), nullif(btrim(coalesce(p->>'no_bill_reason','')),''),
            v_exp, (a->>'id')::uuid, a->>'name')
    returning id into v_id;
    return jsonb_build_object('ok',true,'id',v_id,'expense_id',v_exp);

  elsif p_action = 'deposit' then
    select * into acc from public.rental_accounts where id = (p->>'account_id')::uuid;
    if acc.id is null then raise exception 'Account not found.'; end if;
    if coalesce(p->>'kind','') not in ('Deposit paid','Deposit refunded') then raise exception 'Choose Deposit paid or Deposit refunded.'; end if;
    v_date := (p->>'date')::date;
    if v_date is null or v_date > today or v_date < date '2025-01-01' then raise exception 'Choose the date (not in the future).'; end if;
    if coalesce(nullif(p->>'amount','')::numeric,0) <= 0 then raise exception 'Enter the amount.'; end if;
    if p->>'kind' = 'Deposit refunded' and (p->>'amount')::numeric >
       (select coalesce(sum(case when kind='Deposit paid' then amount else -amount end),0) from public.rental_entries
         where account_id=acc.id and kind in ('Deposit paid','Deposit refunded') and voided_at is null) + 0.5 then
      raise exception 'The refund is more than the deposit held by the vendor.';
    end if;
    insert into public.rental_entries(account_id, entry_date, kind, amount, paid_mode, reference, note, bill_path, created_by, created_by_name)
    values (acc.id, v_date, p->>'kind', (p->>'amount')::numeric, nullif(p->>'mode',''), nullif(btrim(coalesce(p->>'reference','')),''),
            nullif(btrim(coalesce(p->>'note','')),''), nullif(btrim(coalesce(p->>'bill_path','')),''), (a->>'id')::uuid, a->>'name')
    returning id into v_id;
    return jsonb_build_object('ok',true,'id',v_id);

  elsif p_action = 'void' then
    if length(btrim(coalesce(p->>'reason',''))) < 3 then raise exception 'Give the reason for removing this entry.'; end if;
    select * into e from public.rental_entries where id = (p->>'id')::uuid and voided_at is null;
    if e.id is null then raise exception 'Entry not found or already removed.'; end if;
    update public.rental_entries set voided_at = now(), voided_by_name = a->>'name', void_reason = btrim(p->>'reason') where id = e.id;
    if e.expense_id is not null then
      update public.samara_monthly_expenses set voided_at = now(), voided_by_name = a->>'name',
             void_reason = 'Removed from the '||(select name from public.rental_accounts where id=e.account_id)||' account: '||btrim(p->>'reason')
       where id = e.expense_id and voided_at is null;
    end if;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unknown action.';
end $f$;
revoke all on function public.rental_account_rpc(text,jsonb) from public, anon;
grant execute on function public.rental_account_rpc(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check
select name, item, expense_head, monthly_rent, gst_percent, due_day, rent_from from public.rental_accounts;
