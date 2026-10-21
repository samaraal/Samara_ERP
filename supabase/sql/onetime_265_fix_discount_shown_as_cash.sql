-- 2.18.53 one-time fix: the ₹6,587 "Discount · Final Settlement" of 21-10-2026 was saved with the
-- previous Cash payment's mode and voucher (Cash · CV-2026-000012). A discount is not money received,
-- so its mode becomes "Not applicable" and the voucher number is removed. Amount and balance unchanged.
-- Safe to run more than once: it changes exactly one row or stops without changing anything.

-- STEP 1 (preview) — should show exactly ONE row
select id, patient_id, transaction_type, category, amount, payment_mode, payment_reference, description, transaction_date
from public.billing_transactions
where transaction_type = 'Discount'
  and payment_reference = 'CV-2026-000012'
  and amount = 6587;

-- STEP 2 (fix)
do $$
declare n integer;
begin
  select count(*) into n from public.billing_transactions
   where transaction_type = 'Discount' and payment_reference = 'CV-2026-000012' and amount = 6587;
  if n = 0 then raise notice 'Nothing to fix (already corrected).'; return; end if;
  if n > 1 then raise exception 'Found % rows — expected 1. Nothing changed.', n; end if;

  update public.billing_transactions
     set payment_mode = 'Not applicable',
         payment_reference = null,
         description = nullif(trim(both ' |' from regexp_replace(coalesce(description,''), '\s*\|?\s*Reference:\s*CV-2026-000012', '', 'g')), '')
   where transaction_type = 'Discount' and payment_reference = 'CV-2026-000012' and amount = 6587;
  raise notice 'Fixed: discount now shows as Not applicable, no voucher.';
end $$;
