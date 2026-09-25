-- Samara Care ERP 2.14.52
-- "Existing Inventory Item" in Pharmacy & Stores > Receive from Vendor showed
-- every item in the section regardless of the "Standard Item List" category
-- chosen (e.g. picking "Tablets" still listed capsules, injections, etc.).
-- This adds a proper per-item Standard Category tag so that list can be
-- filtered to just the chosen category.
--
-- A new item's category is set automatically by the app right after it is
-- received (when it was added via the Standard Item List). Existing items
-- can be tagged individually ("Category" button on each item) or in bulk
-- (new "Assign Category to All" button, best-effort auto-match from the
-- item's Dosage Form / name — please spot-check the results).

alter table public.consumable_store_items add column if not exists standard_category text;

create or replace function public.store_incharge_set_standard_category(
  p_item_id uuid,
  p_standard_category text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_item record; v_category text:=nullif(trim(coalesce(p_standard_category,'')),'');
begin
  if not public.stores_controller_authorised() then
    raise exception 'Only the current Stores/Pharmacy in-charge can update an item''s standard category.';
  end if;
  select * into v_item from public.consumable_store_items where id=p_item_id for update;
  if not found then raise exception 'Item not found.'; end if;
  update public.consumable_store_items set standard_category=v_category,updated_at=now() where id=p_item_id;
  return jsonb_build_object('success',true,'item_id',p_item_id,'standard_category',v_category);
end; $$;
grant execute on function public.store_incharge_set_standard_category(uuid,text) to authenticated;
notify pgrst,'reload schema';
