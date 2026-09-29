-- Samara Care ERP 2.14.89 — Pharmacy & Stores: add / edit Batch No. and Expiry Date on items already received
-- Run once in Supabase > SQL Editor (file 159). Safe to run again.
--
-- When stock is received from a vendor the expiry date is often not at hand, so receipts were saved without it
-- (on 29-09-2026 none of the 91 vendor receipts had an expiry date) and there was no way to add it later.
-- This adds one function the Stores / Pharmacy in-charge uses from the new "Expiry" button:
-- it changes ONLY the batch number and expiry date of one vendor receipt. Quantities, stock balance,
-- vendor, invoice and charges are not touched. Who changed it and when is recorded on the receipt.

begin;

alter table public.consumable_store_receipts add column if not exists expiry_updated_at timestamptz;
alter table public.consumable_store_receipts add column if not exists expiry_updated_by uuid;
alter table public.consumable_store_receipts add column if not exists expiry_updated_by_name text;

create or replace function public.store_incharge_update_receipt_expiry(
  p_receipt_id uuid,
  p_batch_no text,
  p_expiry_date date,
  p_actor_name text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_row record;
begin
  if not public.stores_controller_authorised() then
    raise exception 'Only the current Stores/Pharmacy in-charge can change the expiry date.';
  end if;
  select * into v_row from public.consumable_store_receipts where id=p_receipt_id for update;
  if not found then raise exception 'Vendor receipt not found. Refresh and try again.'; end if;
  if p_expiry_date is not null and p_expiry_date < coalesce(v_row.received_date, v_row.received_at::date) - 3650 then
    raise exception 'Please check the expiry date — it looks too old.';
  end if;
  update public.consumable_store_receipts
     set batch_no=nullif(btrim(coalesce(p_batch_no,'')),''),
         expiry_date=p_expiry_date,
         expiry_updated_at=now(),
         expiry_updated_by=auth.uid(),
         expiry_updated_by_name=nullif(btrim(coalesce(p_actor_name,'')),'')
   where id=p_receipt_id;
  return jsonb_build_object('success',true,'receipt_id',p_receipt_id,'batch_no',nullif(btrim(coalesce(p_batch_no,'')),''),'expiry_date',p_expiry_date);
end; $$;
grant execute on function public.store_incharge_update_receipt_expiry(uuid,text,date,text) to authenticated;

notify pgrst,'reload schema';
commit;

-- Check: should return 1.
select count(*) as expiry_edit_ready from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='store_incharge_update_receipt_expiry';
