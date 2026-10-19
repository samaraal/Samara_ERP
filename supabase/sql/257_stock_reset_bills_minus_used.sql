-- Samara Care ERP 2.18.38 — Stock Reset: "Bills − recorded use" method (Boomi, 19-10-2026)
-- Boomi's choice: whatever was used for Guests is already saved in the ERP; whatever was purchased is on the
-- supplier bills. So the shelf stock = purchases (bills scanned again) − recorded use.
--
-- New reset method p_mode = 'bills_minus_used':
--   * The old, unreliable PURCHASE side is removed: every Vendor Receipt and every old Adjustment (In / Out)
--     stops counting, by ONE "Stock Reset" adjustment line per item (nothing is deleted).
--   * The recorded USE stays: Patient Issue (handover to Guests / Outside Nursing), Department Issue, and
--     Return to Store. After the reset each item's balance = − (net recorded use), i.e. it starts BELOW ZERO
--     by what was used, and scanning the purchase bills brings it up to what should be on the shelf.
--   p_mode = 'zero' (the 2.18.37 method: balance 0, then physical count) stays available.
-- Item names, codes, units, Charge Master rates and every Guest record stay untouched.
-- Run once in Supabase → SQL Editor. Safe to run again.
begin;

alter table public.store_stock_resets add column if not exists mode text not null default 'zero';
alter table public.store_stock_reset_items add column if not exists used_net numeric;
alter table public.store_stock_reset_items add column if not exists new_balance numeric;

drop function if exists public.store_stock_reset(text[],text,boolean);

create or replace function public.store_stock_reset(p_sections text[], p_reason text, p_backup_confirmed boolean, p_mode text default 'zero')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  a record; v_reset public.store_stock_resets; r record; v_bal numeric; v_target numeric; v_diff numeric; v_used numeric; v_ledger uuid;
  v_total int := 0; v_adj int := 0; v_out numeric := 0; v_in numeric := 0; v_sec text; v_in_item numeric; v_out_item numeric;
  v_mode text := coalesce(nullif(trim(p_mode),''),'zero');
begin
  if not public.store_item_admin_allowed() then raise exception 'Only Admin / Director can reset the stock.'; end if;
  if coalesce(p_backup_confirmed,false) is not true then raise exception 'Download the Excel backup of the current stock first.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Enter the reason for the stock reset.'; end if;
  if v_mode not in ('zero','bills_minus_used') then raise exception 'Unknown reset method.'; end if;
  if p_sections is null or cardinality(p_sections)=0 then raise exception 'Choose the Stores section(s) to reset.'; end if;
  foreach v_sec in array p_sections loop
    if not (v_sec = any (public.store_section_names())) then raise exception 'Unknown Stores section: %', v_sec; end if;
  end loop;
  select * into a from public.stores_actor();

  perform set_config('samara.stock_reset','on',true);
  insert into public.store_stock_resets(sections,reason,backup_confirmed,reset_by,reset_by_name,mode)
  values(p_sections,trim(p_reason),true,a.actor_id,a.actor_name,v_mode) returning * into v_reset;

  for r in
    select i.* from public.consumable_store_items i
    where coalesce(i.item_category,'Consumables') = any (p_sections)
    order by i.item_code nulls last, i.item_name
    for update
  loop
    v_total := v_total+1; v_ledger := null;
    select coalesce(sum(qty_in),0),coalesce(sum(qty_out),0) into v_in_item,v_out_item
      from public.consumable_store_ledger where item_id=r.id and voided_at is null;
    v_bal := v_in_item-v_out_item;
    -- net recorded use = issued to Guests / departments − returned to Stores
    select coalesce(sum(case when movement_type in ('Patient Issue','Department Issue') then qty_out-qty_in
                             when movement_type='Return to Store' then -(qty_in-qty_out) else 0 end),0)
      into v_used from public.consumable_store_ledger where item_id=r.id and voided_at is null;
    v_target := case when v_mode='bills_minus_used' then -v_used else 0 end;
    v_diff := v_bal - v_target;
    if v_diff <> 0 then
      insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
      values(r.id,case when v_diff>0 then 'Adjustment Out' else 'Adjustment In' end,greatest(-v_diff,0),greatest(v_diff,0),v_target,
        'Stock Reset RST-'||lpad(v_reset.reset_no::text,4,'0')||case when v_mode='bills_minus_used'
          then ' · old purchases removed, recorded use kept (old balance '||rtrim(to_char(v_bal,'FM999999990.99'),'.')||', used '||rtrim(to_char(v_used,'FM999999990.99'),'.')||')'
          else ' · fresh start (old balance '||rtrim(to_char(v_bal,'FM999999990.99'),'.')||')' end,
        trim(p_reason),a.actor_id,a.actor_name)
      returning id into v_ledger;
      v_adj := v_adj+1;
      if v_diff>0 then v_out := v_out+v_diff; else v_in := v_in-v_diff; end if;
    end if;
    insert into public.store_stock_reset_items(reset_id,item_id,item_code,item_name,item_category,standard_category,unit,strength,dosage_form,
      charge_rate,reorder_level,active,total_in,total_out,old_balance,ledger_id,used_net,new_balance)
    values(v_reset.id,r.id,r.item_code,r.item_name,coalesce(r.item_category,'Consumables'),
      to_jsonb(r)->>'standard_category',r.unit,to_jsonb(r)->>'strength',to_jsonb(r)->>'dosage_form',
      nullif(to_jsonb(r)->>'charge_rate','')::numeric,nullif(to_jsonb(r)->>'reorder_level','')::numeric,coalesce((to_jsonb(r)->>'active')::boolean,true),
      v_in_item,v_out_item,v_bal,v_ledger,v_used,v_target);
  end loop;
  perform set_config('samara.stock_reset','off',true);

  update public.store_stock_resets set items_total=v_total,items_adjusted=v_adj,qty_removed=v_out,qty_added=v_in where id=v_reset.id;
  return jsonb_build_object('success',true,'reset_id',v_reset.id,'reset_no',v_reset.reset_no,'mode',v_mode,'items_total',v_total,'items_adjusted',v_adj,'qty_removed',v_out,'qty_added',v_in);
end; $function$;
revoke all on function public.store_stock_reset(text[],text,boolean,text) from public, anon;
grant execute on function public.store_stock_reset(text[],text,boolean,text) to authenticated;

notify pgrst,'reload schema';
commit;

-- check: should return  true
select exists(select 1 from pg_proc p where p.proname='store_stock_reset' and pg_get_function_arguments(p.oid) like '%p_mode%') as bills_minus_used_ready;
