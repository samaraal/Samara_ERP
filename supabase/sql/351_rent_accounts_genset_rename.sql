-- ERP 2.20.5 — RENT ACCOUNTS (Samara · Hostel · Director House) + Zenset renamed to GENSET (10-11-2026).
-- Run AFTER SQL 350. Run once; safe to run again.
--   • rental_accounts gets a category ('Genset' / 'Rent') and a display order.
--   • The generator account "Zenset" is renamed "Genset"; its expense head "Zenset Rental" becomes "Genset Rental"
--     (existing Expenses rows are renamed too, amounts unchanged).
--   • Three rent accounts are added, each with its own Expenses head (counts in Net Profit) and its own
--     Deposit / Advance (refundable, NOT an expense):  Samara (building) · Hostel · Director House.
--     Monthly rent, GST %, due day and "Track rent from" are filled in by Admin in ⚙ Account details.
--   • rental_account_rpc('load') accepts {category} and returns each account's deposit / rent totals for the overview.
-- No existing rent payment or deposit is changed.
begin;

alter table public.rental_accounts add column if not exists category text not null default 'Genset';
alter table public.rental_accounts add column if not exists sort_order int not null default 0;

-- Zenset -> Genset (spelling)
update public.rental_accounts set name = 'Genset', expense_head = 'Genset Rental',
       notes = replace(coalesce(notes,''), 'Zenset', 'Genset'), updated_at = now()
 where name = 'Zenset';
update public.samara_monthly_expenses set head = 'Genset Rental',
       description = replace(coalesce(description,''), 'Zenset rent', 'Genset rent')
 where head = 'Zenset Rental';
update public.samara_monthly_expenses set void_reason = replace(void_reason, 'Zenset account', 'Genset account')
 where void_reason like '%Zenset account%';

insert into public.rental_accounts(name, item, category, sort_order, expense_head, monthly_rent, gst_percent, due_day, rent_from, notes) values
  ('Samara',         'Samara building (care home) rent', 'Rent', 1, 'Rent - Samara',         0, 0, 10, null, null),
  ('Hostel',         'Staff hostel rent',                'Rent', 2, 'Rent - Hostel',         0, 0, 10, null, null),
  ('Director House', 'Director house rent',              'Rent', 3, 'Rent - Director House', 0, 0, 10, null, null)
on conflict (name) do nothing;
update public.rental_accounts set category = 'Rent' where name in ('Samara','Hostel','Director House');

create or replace function public.rental_account_rpc(p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare a jsonb := public.samara_profit_admin();   -- Admin / Directors only (same as Expenses)
  acc public.rental_accounts%rowtype; v_id uuid; v_exp uuid; v_month date; v_date date; v_rent numeric; v_gst numeric; v_total numeric;
  today date := (now() at time zone 'Asia/Kolkata')::date; e public.rental_entries%rowtype; months jsonb; entries jsonb; accounts jsonb;
begin
  if p_action = 'load' then
    select * into acc from public.rental_accounts
     where ((nullif(p->>'account_id','') is null and active) or id = nullif(p->>'account_id','')::uuid)
       and (nullif(p->>'category','') is null or category = p->>'category')
     order by (id = nullif(p->>'account_id','')::uuid) desc nulls last, sort_order, created_at limit 1;
    select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'item',r.item,'active',r.active,'category',r.category,
             'monthly_rent',r.monthly_rent,'gst_percent',r.gst_percent,'due_day',r.due_day,'rent_from',r.rent_from,
             'deposit_held',(select coalesce(sum(case when kind='Deposit paid' then amount else -amount end),0) from public.rental_entries
                              where account_id=r.id and kind in ('Deposit paid','Deposit refunded') and voided_at is null),
             'rent_paid',(select coalesce(sum(amount),0) from public.rental_entries where account_id=r.id and kind='Rent payment' and voided_at is null),
             'this_month_paid',(select coalesce(sum(amount),0) from public.rental_entries where account_id=r.id and kind='Rent payment' and voided_at is null
                                 and period_month = date_trunc('month', today)::date))
             order by r.sort_order, r.created_at),'[]') into accounts
      from public.rental_accounts r where nullif(p->>'category','') is null or r.category = p->>'category';
    if acc.id is null then return jsonb_build_object('accounts',accounts,'account',null); end if;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.entry_date desc, x.created_at desc),'[]') into entries
      from (select r.*, to_char(r.period_month,'Mon YYYY') as period_label from public.rental_entries r where r.account_id = acc.id) x;
    -- month-by-month rent status from "rent from" to this month (and any month paid outside that range)
    with due as (select (acc.monthly_rent + round(acc.monthly_rent * acc.gst_percent/100)) as amt),
    mm as (
      -- 2.20.5: months are listed only once the monthly rent and "Track rent from" are set
      select generate_series(date_trunc('month', acc.rent_from)::date, date_trunc('month', today)::date, interval '1 month')::date as m
       where acc.rent_from is not null and acc.monthly_rent > 0
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
        'monthly_due', (acc.monthly_rent + round(acc.monthly_rent * acc.gst_percent/100))),
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
         having sum(amount) >= (acc.monthly_rent + round(acc.monthly_rent*acc.gst_percent/100)) - 1) then
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
    if coalesce(p->>'kind','') not in ('Deposit paid','Deposit refunded') then raise exception 'Choose Deposit / Advance paid or refunded.'; end if;
    v_date := (p->>'date')::date;
    if v_date is null or v_date > today or v_date < date '2020-01-01' then raise exception 'Choose the date (not in the future).'; end if;
    if coalesce(nullif(p->>'amount','')::numeric,0) <= 0 then raise exception 'Enter the amount.'; end if;
    if p->>'kind' = 'Deposit refunded' and (p->>'amount')::numeric >
       (select coalesce(sum(case when kind='Deposit paid' then amount else -amount end),0) from public.rental_entries
         where account_id=acc.id and kind in ('Deposit paid','Deposit refunded') and voided_at is null) + 0.5 then
      raise exception 'The refund is more than the deposit / advance held.';
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
select name, category, item, expense_head, monthly_rent, gst_percent, due_day, rent_from from public.rental_accounts order by category, sort_order;
select head, count(*), sum(amount) from public.samara_monthly_expenses where head in ('Zenset Rental','Genset Rental','Rent') and voided_at is null group by head;
