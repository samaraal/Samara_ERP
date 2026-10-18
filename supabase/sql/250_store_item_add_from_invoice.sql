-- Samara Care ERP · Scan Lab 1.3.0 — add a NEW Stores item from a supplier invoice line
-- Rule (Boomi, 18-10-2026): adding an item to the Stores / Charge Master needs NO Admin / Director
-- login or approval; FIXING ITS PRICE (Guest charge rate) strictly stays Admin / Director only.
--   * store_add_item_from_invoice(): any active ERP staff member may add the item
--     (name, section, unit, strength, dosage form). The ERP gives the code (CON- / PHA- / HKG- / KIT-).
--     No charge rate is set here — the item shows under "without a rate" in Charge Master until
--     Admin / Director fixes it (admin_set_store_item_charge_rate, unchanged, Admin / Director only;
--     every rate change is still recorded in charge_rate_history).
--   * admin_add_store_item / admin_update_store_item are unchanged.
-- Safe to run more than once.

create or replace function public.store_add_item_from_invoice(
  p_item_name text, p_category text, p_unit text, p_strength text default null, p_dosage_form text default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare new_id uuid; v_name text := regexp_replace(trim(coalesce(p_item_name,'')), '\s+', ' ', 'g');
begin
  if not exists (select 1 from public.profiles p
                 where (p.id = auth.uid() or p.auth_user_id = auth.uid()) and coalesce(p.is_active, true)) then
    raise exception 'Please log in to the ERP with an active staff account.';
  end if;
  if v_name = '' then raise exception 'Item name is required.'; end if;
  if nullif(trim(p_unit),'') is null then raise exception 'Unit is required.'; end if;
  if not (p_category = any (public.store_section_names())) then
    raise exception 'Select a Stores section: Consumables, Pharmacy, Housekeeping & General or Kitchen / Food Stores.';
  end if;
  select id into new_id from public.consumable_store_items where lower(trim(item_name)) = lower(v_name) limit 1;
  if new_id is not null then raise exception 'An item with this name already exists in the Stores Master.'; end if;
  insert into public.consumable_store_items(item_name, unit, item_category, strength, dosage_form)
  values (v_name, trim(p_unit), p_category, nullif(trim(p_strength),''), nullif(trim(p_dosage_form),''))
  returning id into new_id;
  return new_id;
end; $function$;

revoke all on function public.store_add_item_from_invoice(text,text,text,text,text) from public, anon;
grant execute on function public.store_add_item_from_invoice(text,text,text,text,text) to authenticated;

-- check: should return  true
select exists (select 1 from pg_proc where proname = 'store_add_item_from_invoice') as store_add_item_from_invoice_ready;
