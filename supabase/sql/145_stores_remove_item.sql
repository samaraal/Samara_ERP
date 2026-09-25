-- Samara Care ERP 2.14.46
-- "Remove Item" option on the Consumables / Pharmacy stock page, for Admin
-- and the Nursing Manager (profiles.role = 'Manager' — the same role check
-- already used for Nursing-Manager-scoped actions elsewhere in this app).
-- An item that was never received or issued is deleted outright; an item
-- with any stock history is deactivated instead, so past receipts, issues
-- and charges are never lost.

alter table public.consumable_store_items add column if not exists active boolean not null default true;

create or replace function public.store_item_remove(
  p_item_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_role text; v_item record; v_used boolean;
begin
  select role into v_role
  from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if v_role not in ('Admin','Manager') then
    raise exception 'Only Admin or the Nursing Manager can remove a store item.';
  end if;

  select * into v_item from public.consumable_store_items where id=p_item_id for update;
  if not found then raise exception 'Item not found.'; end if;

  select
    exists(select 1 from public.consumable_store_ledger where item_id=p_item_id)
    or exists(select 1 from public.consumable_store_receipts where item_id=p_item_id)
  into v_used;

  if v_used then
    update public.consumable_store_items set active=false,updated_at=now() where id=p_item_id;
    return jsonb_build_object('success',true,'mode','deactivated','item_id',p_item_id);
  end if;

  delete from public.consumable_store_items where id=p_item_id;
  return jsonb_build_object('success',true,'mode','deleted','item_id',p_item_id);
exception when foreign_key_violation then
  update public.consumable_store_items set active=false,updated_at=now() where id=p_item_id;
  return jsonb_build_object('success',true,'mode','deactivated','item_id',p_item_id);
end; $$;
grant execute on function public.store_item_remove(uuid) to authenticated;

notify pgrst,'reload schema';
