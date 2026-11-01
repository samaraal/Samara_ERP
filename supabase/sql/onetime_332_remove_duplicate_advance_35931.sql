-- 2.19.39 one-time fix (01-11-2026): duplicate ₹35,931 entry in the Guest Ledger.
-- The family paid ₹35,931 ONCE through Razorpay — credited automatically at 08:26 PM ("Payment received · Razorpay Online").
-- Accounts then entered the same money again by hand at 08:49 PM ("Advance received · UPI · Ref 630595478825").
-- Confirmed by Admin as a duplicate. This removes ONLY the hand-entered 08:49 PM advance; the Razorpay entry stays,
-- so the Guest's balance returns to ₹0. A full copy of the removed row is shown in the result for the record.
-- Safe to run more than once: it removes exactly one row, or stops without changing anything.

-- STEP 1 (preview) — should show TWO rows for the same Guest: the Razorpay payment (kept) and the UPI advance (to remove)
select t.id, concat_ws(' ', p.title, p.full_name) as guest, p.patient_id as guest_id,
       t.transaction_type, t.amount, t.payment_mode, t.payment_reference,
       to_char(t.transaction_date at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as entered_at,
       case when t.payment_reference='630595478825' and t.transaction_type='Advance' then 'REMOVE (duplicate)' else 'keep' end as action
from public.billing_transactions t join public.patients p on p.id=t.patient_id
where t.amount=35931 and (t.transaction_date at time zone 'Asia/Kolkata')::date=date '2026-11-01'
  and t.transaction_type in ('Payment','Advance')
order by t.transaction_date;

-- STEP 2 (fix)
do $$
declare n integer; dup public.billing_transactions%rowtype;
begin
  select count(*) into n from public.billing_transactions
   where transaction_type='Advance' and payment_reference='630595478825' and amount=35931
     and (transaction_date at time zone 'Asia/Kolkata')::date=date '2026-11-01';
  if n=0 then raise notice 'Nothing to fix (already corrected).'; return; end if;
  if n>1 then raise exception 'Found % matching advance rows — expected 1. Nothing changed.', n; end if;
  select * into dup from public.billing_transactions
   where transaction_type='Advance' and payment_reference='630595478825' and amount=35931
     and (transaction_date at time zone 'Asia/Kolkata')::date=date '2026-11-01';
  -- safety: the Razorpay payment of the same amount for the same Guest that day must exist, or nothing is changed
  if not exists(select 1 from public.billing_transactions r
                 where r.patient_id=dup.patient_id and r.id<>dup.id and r.amount=35931
                   and r.transaction_type in ('Payment','Advance')
                   and (r.transaction_date at time zone 'Asia/Kolkata')::date=date '2026-11-01'
                   and (coalesce(r.payment_mode,'')||' '||coalesce(r.description,'')) ilike '%razorpay%') then
    raise exception 'The Razorpay payment of ₹35,931 for this Guest was not found — nothing changed. Please check.';
  end if;
  raise notice 'Removed duplicate (copy for the record): %', to_jsonb(dup)::text;
  delete from public.billing_transactions where id=dup.id;
  raise notice 'Fixed: duplicate ₹35,931 UPI advance removed; Razorpay payment kept.';
end $$;

-- STEP 3 (check) — only the Razorpay payment should remain
select t.transaction_type, t.amount, t.payment_mode, t.payment_reference,
       to_char(t.transaction_date at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as entered_at
from public.billing_transactions t
where t.amount=35931 and (t.transaction_date at time zone 'Asia/Kolkata')::date=date '2026-11-01'
  and t.transaction_type in ('Payment','Advance');
