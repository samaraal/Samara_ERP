-- Superseded records remain in the audit history; all staff registers use active rows.
begin;
create policy store_active_ledger_only on public.consumable_store_ledger as restrictive for select to authenticated using (voided_at is null);
create policy store_active_receipts_only on public.consumable_store_receipts as restrictive for select to authenticated using (voided_at is null);
commit;
