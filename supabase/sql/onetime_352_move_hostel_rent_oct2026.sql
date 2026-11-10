-- ONE-TIME (10-11-2026, ERP 2.20.5): move the hand-entered Expenses row "Samara Hostel Rent" ₹25,000 (03-11-2026, head "Rent",
-- paid by UPI to Kavi Priyadharshan, bill photo attached) into Rent Account → Hostel as the OCTOBER 2026 rent payment.
-- Run AFTER SQL 351. Safe to run again (does nothing the second time).
--   • The same Expenses row is kept (same amount, date, bill photo) — only its head becomes "Rent - Hostel" and its
--     description is tidied, so Net Profit does not change.
--   • A Hostel "Rent payment" entry for Oct 2026 is created and linked to that Expenses row (removing it from the
--     Rent Account later removes the Expenses row too, as for every rent payment).
--   • The Hostel owner name is filled in from the payment (only if still empty) — change it in ⚙ Account details if needed.
begin;

do $m$
declare v_exp public.samara_monthly_expenses%rowtype; v_acc uuid;
begin
  select id into v_acc from public.rental_accounts where name = 'Hostel' and category = 'Rent';
  if v_acc is null then raise exception 'Hostel rent account not found — run SQL 351 first.'; end if;
  select * into v_exp from public.samara_monthly_expenses where id = 'f7830576-2b99-4c0f-90f1-690495678849' and voided_at is null;
  if v_exp.id is null then raise notice 'Expenses row not found or removed — nothing to do.'; return; end if;
  if exists(select 1 from public.rental_entries where expense_id = v_exp.id) then raise notice 'Already moved — nothing to do.'; return; end if;

  update public.samara_monthly_expenses
     set head = 'Rent - Hostel', description = 'Hostel rent — Oct 2026 (₹25,000.00) · moved from Expenses "Samara Hostel Rent"'
   where id = v_exp.id;

  insert into public.rental_entries(account_id, entry_date, kind, period_month, amount, rent_amount, gst_amount, paid_mode, reference, note,
                                    bill_path, no_bill_reason, expense_id, created_by, created_by_name, created_at)
  values (v_acc, v_exp.expense_date, 'Rent payment', date '2026-10-01', v_exp.amount, v_exp.amount, 0, v_exp.paid_mode, v_exp.reference,
          'Moved from Expenses ("Samara Hostel Rent", entered 03-11-2026)', v_exp.bill_path, v_exp.no_bill_reason, v_exp.id,
          v_exp.created_by, v_exp.created_by_name, v_exp.created_at);

  update public.rental_accounts set vendor_name = v_exp.paid_to, updated_at = now()
   where id = v_acc and vendor_name is null and nullif(btrim(coalesce(v_exp.paid_to,'')),'') is not null;
end $m$;

commit;

-- Check
select a.name, r.entry_date, r.period_month, r.amount, r.paid_mode, r.note, e.head, e.description
  from public.rental_entries r join public.rental_accounts a on a.id = r.account_id
  left join public.samara_monthly_expenses e on e.id = r.expense_id
 where a.name = 'Hostel';
