-- Samara Care ERP 2.18.37 — Pharmacy & Consumables: FRESH START of stock (Boomi, 19-10-2026)
--
-- The present stock numbers were entered by non-professionals and do not match the shelves. We start
-- afresh WITHOUT erasing anything:
--   * Item names, item codes, units and the Charge Master rate (MRP) are NOT changed.
--   * Every Guest-linked record (indents, approvals, hand-overs, received, used, returned, charges,
--     bills, Patient Ledger, Family Portal) is NOT touched.
--   * Nothing is deleted. Each item's balance is brought to ZERO by ONE permanent "Stock Reset"
--     adjustment line in the Stock Movement Register (who, when, reason), and a full snapshot of
--     every item and its old balance is kept in store_stock_resets / store_stock_reset_items
--     (a server-side copy, in addition to the Excel file Admin downloads first).
--   * Fresh stock then comes in through Receive from Vendor (invoice auto-read) and, for stock on the
--     shelf without an invoice, "Opening Stock – Physical Count".
--   * Bill MRP different from the Charge Master rate: the Charge Master rate is KEPT and the difference
--     is listed for Admin / Director review (store_mrp_reviews). Price changes stay Admin / Director only.
--
-- Run once in Supabase → SQL Editor. Safe to run again.
begin;

-- 1. Snapshot tables -------------------------------------------------------------------------------
create sequence if not exists public.store_stock_reset_no_seq;
create table if not exists public.store_stock_resets(
  id uuid primary key default gen_random_uuid(),
  reset_no integer not null default nextval('public.store_stock_reset_no_seq'),
  sections text[] not null,
  reason text not null,
  backup_confirmed boolean not null default false,
  reset_at timestamptz not null default now(),
  reset_by uuid,
  reset_by_name text,
  items_total integer not null default 0,
  items_adjusted integer not null default 0,
  qty_removed numeric not null default 0,
  qty_added numeric not null default 0
);
create table if not exists public.store_stock_reset_items(
  id uuid primary key default gen_random_uuid(),
  reset_id uuid not null references public.store_stock_resets(id),
  item_id uuid not null,
  item_code text, item_name text, item_category text, standard_category text, unit text,
  strength text, dosage_form text, charge_rate numeric, reorder_level numeric, active boolean,
  total_in numeric, total_out numeric, old_balance numeric not null default 0,
  ledger_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists store_stock_reset_items_reset_idx on public.store_stock_reset_items(reset_id);
create index if not exists store_stock_reset_items_item_idx on public.store_stock_reset_items(item_id);

-- 2. MRP review list (bill MRP ≠ Charge Master rate, or a new item with no rate yet) ----------------
create table if not exists public.store_mrp_reviews(
  id uuid primary key default gen_random_uuid(),
  item_id uuid,
  item_code text, item_name text, item_category text, unit text,
  bill_mrp numeric, charge_rate_at_flag numeric,
  vendor_name text, invoice_no text, invoice_date date, pack_size text, remarks text,
  status text not null default 'Open' check (status in ('Open','Kept','Rate Changed')),
  flagged_by uuid, flagged_by_name text, flagged_at timestamptz not null default now(),
  decided_by uuid, decided_by_name text, decided_at timestamptz, new_rate numeric, decision_note text
);
create index if not exists store_mrp_reviews_status_idx on public.store_mrp_reviews(status);

alter table public.store_stock_resets enable row level security;
alter table public.store_stock_reset_items enable row level security;
alter table public.store_mrp_reviews enable row level security;
drop policy if exists store_stock_resets_read on public.store_stock_resets;
create policy store_stock_resets_read on public.store_stock_resets for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)));
drop policy if exists store_stock_reset_items_read on public.store_stock_reset_items;
create policy store_stock_reset_items_read on public.store_stock_reset_items for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)));
drop policy if exists store_mrp_reviews_read on public.store_mrp_reviews;
create policy store_mrp_reviews_read on public.store_mrp_reviews for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)));
revoke insert, update, delete on public.store_stock_resets, public.store_stock_reset_items, public.store_mrp_reviews from anon, authenticated;
grant select on public.store_stock_resets, public.store_stock_reset_items, public.store_mrp_reviews to authenticated;

-- 3. Whole-number guard: unchanged, except it lets the Stock Reset bring an old fractional balance
--    (e.g. 2.5 entered earlier) to zero. The flag is set only inside store_stock_reset() for that
--    one transaction; staff entries are still whole numbers only.
create or replace function public.store_require_whole_quantity()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare col text; value numeric; changed boolean;
begin
 if coalesce(current_setting('samara.stock_reset',true),'')='on' then return new; end if;
 foreach col in array tg_argv loop
  changed:=tg_op='INSERT';
  if tg_op='UPDATE' then changed:=(to_jsonb(new)->col) is distinct from (to_jsonb(old)->col); end if;
  if changed and to_jsonb(new)->>col is not null then
   value:=(to_jsonb(new)->>col)::numeric;
   if value::text in ('NaN','Infinity','-Infinity') or value<>trunc(value) then
    raise exception 'Stores quantities must be whole numbers; decimals are not allowed (%).',col;
   end if;
  end if;
 end loop;
 return new;
end $$;

-- 4. The reset (Admin / Director only) ------------------------------------------------------------
create or replace function public.store_stock_reset(p_sections text[], p_reason text, p_backup_confirmed boolean)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  a record; v_reset public.store_stock_resets; r record; v_bal numeric; v_ledger uuid;
  v_total int := 0; v_adj int := 0; v_out numeric := 0; v_in numeric := 0; v_sec text; v_in_item numeric; v_out_item numeric;
begin
  if not public.store_item_admin_allowed() then raise exception 'Only Admin / Director can reset the stock.'; end if;
  if coalesce(p_backup_confirmed,false) is not true then raise exception 'Download the Excel backup of the current stock first.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Enter the reason for the stock reset.'; end if;
  if p_sections is null or cardinality(p_sections)=0 then raise exception 'Choose the Stores section(s) to reset.'; end if;
  foreach v_sec in array p_sections loop
    if not (v_sec = any (public.store_section_names())) then raise exception 'Unknown Stores section: %', v_sec; end if;
  end loop;
  select * into a from public.stores_actor();

  perform set_config('samara.stock_reset','on',true);
  insert into public.store_stock_resets(sections,reason,backup_confirmed,reset_by,reset_by_name)
  values(p_sections,trim(p_reason),true,a.actor_id,a.actor_name) returning * into v_reset;

  for r in
    select i.* from public.consumable_store_items i
    where coalesce(i.item_category,'Consumables') = any (p_sections)
    order by i.item_code nulls last, i.item_name
    for update
  loop
    v_total := v_total+1; v_ledger := null;
    -- live totals straight from the ledger (not the rounded view)
    select coalesce(sum(qty_in),0),coalesce(sum(qty_out),0) into v_in_item,v_out_item
      from public.consumable_store_ledger where item_id=r.id and voided_at is null;
    v_bal := v_in_item-v_out_item;
    if v_bal <> 0 then
      insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
      values(r.id,case when v_bal>0 then 'Adjustment Out' else 'Adjustment In' end,greatest(-v_bal,0),greatest(v_bal,0),0,
        'Stock Reset RST-'||lpad(v_reset.reset_no::text,4,'0')||' · fresh start (old balance '||rtrim(to_char(v_bal,'FM999999990.99'),'.')||')',
        trim(p_reason),a.actor_id,a.actor_name)
      returning id into v_ledger;
      v_adj := v_adj+1;
      if v_bal>0 then v_out := v_out+v_bal; else v_in := v_in-v_bal; end if;
    end if;
    insert into public.store_stock_reset_items(reset_id,item_id,item_code,item_name,item_category,standard_category,unit,strength,dosage_form,
      charge_rate,reorder_level,active,total_in,total_out,old_balance,ledger_id)
    values(v_reset.id,r.id,r.item_code,r.item_name,coalesce(r.item_category,'Consumables'),
      to_jsonb(r)->>'standard_category',r.unit,to_jsonb(r)->>'strength',to_jsonb(r)->>'dosage_form',
      nullif(to_jsonb(r)->>'charge_rate','')::numeric,nullif(to_jsonb(r)->>'reorder_level','')::numeric,coalesce((to_jsonb(r)->>'active')::boolean,true),
      v_in_item,v_out_item,v_bal,v_ledger);
  end loop;
  perform set_config('samara.stock_reset','off',true);

  update public.store_stock_resets set items_total=v_total,items_adjusted=v_adj,qty_removed=v_out,qty_added=v_in where id=v_reset.id;
  return jsonb_build_object('success',true,'reset_id',v_reset.id,'reset_no',v_reset.reset_no,'items_total',v_total,'items_adjusted',v_adj,'qty_removed',v_out,'qty_added',v_in);
end; $function$;
revoke all on function public.store_stock_reset(text[],text,boolean) from public, anon;
grant execute on function public.store_stock_reset(text[],text,boolean) to authenticated;

-- 5. Opening Stock – Physical Count (stock on the shelf that has no invoice) -------------------------
--    Uses the SAME receiving function as Receive from Vendor (same checks: the Nurse Manager / Store
--    In-charge), so batch and expiry go into Expiry Watch. The movement is shown as an adjustment
--    "Opening Stock – Physical Count", not as a purchase from a vendor. No price is set or changed.
create or replace function public.store_opening_physical_count(
  p_section text, p_item_id uuid, p_item_name text, p_unit text, p_quantity numeric,
  p_count_date date default null, p_batch_no text default null, p_expiry_date date default null, p_remarks text default null
) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_rec public.consumable_store_receipts; v_led uuid;
begin
  if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) then raise exception 'Enter the counted quantity as a whole number above zero.'; end if;
  v_rec := public.store_receive_into_section(p_section,p_item_id,p_item_name,p_unit,'Opening Stock – Physical Count','PHYSICAL COUNT',
    coalesce(p_count_date,(now() at time zone 'Asia/Kolkata')::date),coalesce(p_count_date,(now() at time zone 'Asia/Kolkata')::date),p_quantity,
    nullif(trim(coalesce(p_batch_no,'')),''),p_expiry_date,null,
    concat_ws(' | ','Category: '||p_section,'Opening Stock – Physical Count (fresh start)',nullif(trim(coalesce(p_remarks,'')),'')));
  begin
    select l.id into v_led from public.consumable_store_ledger l
     where l.item_id=v_rec.item_id and l.movement_type='Vendor Receipt' and l.voided_at is null
     order by l.movement_at desc nulls last limit 1;
    if v_led is not null then
      update public.consumable_store_ledger set movement_type='Adjustment In',
        reference_text='Opening Stock – Physical Count'
      where id=v_led;
    end if;
  exception when others then null; -- the stock is in; it simply stays labelled as a receipt
  end;
  return jsonb_build_object('success',true,'receipt_id',v_rec.id,'item_id',v_rec.item_id);
end; $function$;
revoke all on function public.store_opening_physical_count(text,uuid,text,text,numeric,date,text,date,text) from public, anon;
grant execute on function public.store_opening_physical_count(text,uuid,text,text,numeric,date,text,date,text) to authenticated;

-- 6. MRP review: flag (any active staff while receiving) and decide (Admin / Director only) ----------
create or replace function public.store_flag_mrp_difference(
  p_item_id uuid, p_item_name text, p_bill_mrp numeric, p_vendor_name text default null, p_invoice_no text default null,
  p_invoice_date date default null, p_pack_size text default null, p_remarks text default null
) returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare a record; it record; v_id uuid; v_item uuid := p_item_id;
begin
  if not exists (select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)) then
    raise exception 'Please log in to the ERP with an active staff account.';
  end if;
  if p_bill_mrp is null or p_bill_mrp<0 then return null; end if;
  if v_item is null and nullif(trim(coalesce(p_item_name,'')),'') is not null then
    select id into v_item from public.consumable_store_items where lower(trim(item_name))=lower(regexp_replace(trim(p_item_name),'\s+',' ','g')) limit 1;
  end if;
  select * into it from public.consumable_store_items where id=v_item;
  -- one open review per item: refresh it with the latest bill instead of piling up duplicates
  select id into v_id from public.store_mrp_reviews where item_id is not distinct from v_item and status='Open' and v_item is not null limit 1;
  select * into a from public.stores_actor();
  if v_id is not null then
    update public.store_mrp_reviews set bill_mrp=p_bill_mrp,charge_rate_at_flag=nullif(to_jsonb(it)->>'charge_rate','')::numeric,vendor_name=p_vendor_name,
      invoice_no=p_invoice_no,invoice_date=p_invoice_date,pack_size=p_pack_size,remarks=p_remarks,flagged_by=a.actor_id,flagged_by_name=a.actor_name,flagged_at=now()
    where id=v_id;
    return v_id;
  end if;
  insert into public.store_mrp_reviews(item_id,item_code,item_name,item_category,unit,bill_mrp,charge_rate_at_flag,vendor_name,invoice_no,invoice_date,pack_size,remarks,flagged_by,flagged_by_name)
  values(v_item,it.item_code,coalesce(it.item_name,p_item_name),it.item_category,it.unit,p_bill_mrp,nullif(to_jsonb(it)->>'charge_rate','')::numeric,
    p_vendor_name,p_invoice_no,p_invoice_date,p_pack_size,p_remarks,a.actor_id,a.actor_name)
  returning id into v_id;
  return v_id;
end; $function$;
revoke all on function public.store_flag_mrp_difference(uuid,text,numeric,text,text,date,text,text) from public, anon;
grant execute on function public.store_flag_mrp_difference(uuid,text,numeric,text,text,date,text,text) to authenticated;

create or replace function public.store_mrp_review_decide(p_review_id uuid, p_decision text, p_new_rate numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare a record; v public.store_mrp_reviews;
begin
  if not public.store_item_admin_allowed() then raise exception 'Only Admin / Director can decide the Guest rate.'; end if;
  select * into v from public.store_mrp_reviews where id=p_review_id for update;
  if not found then raise exception 'Review not found.'; end if;
  if v.status<>'Open' then raise exception 'This MRP review is already closed (%).', v.status; end if;
  select * into a from public.stores_actor();
  if p_decision='keep' then
    update public.store_mrp_reviews set status='Kept',decided_by=a.actor_id,decided_by_name=a.actor_name,decided_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),'') where id=v.id;
  elsif p_decision='change' then
    if v.item_id is null then raise exception 'This line is not linked to a Stores item; set its rate in Stores Master.'; end if;
    if p_new_rate is null or p_new_rate<0 then raise exception 'Enter a valid new rate.'; end if;
    perform public.admin_set_store_item_charge_rate(p_item_id=>v.item_id,p_charge_rate=>p_new_rate); -- the normal rate route (rate history kept)
    update public.store_mrp_reviews set status='Rate Changed',new_rate=p_new_rate,decided_by=a.actor_id,decided_by_name=a.actor_name,decided_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),'') where id=v.id;
  else raise exception 'Unknown decision.';
  end if;
  return jsonb_build_object('success',true);
end; $function$;
revoke all on function public.store_mrp_review_decide(uuid,text,numeric,text) from public, anon;
grant execute on function public.store_mrp_review_decide(uuid,text,numeric,text) to authenticated;

notify pgrst,'reload schema';
commit;

-- check: should return  true | true | true | true
select exists(select 1 from pg_proc where proname='store_stock_reset') as stock_reset_ready,
       exists(select 1 from pg_proc where proname='store_opening_physical_count') as physical_count_ready,
       exists(select 1 from pg_proc where proname='store_flag_mrp_difference') as mrp_flag_ready,
       exists(select 1 from pg_proc where proname='store_mrp_review_decide') as mrp_decide_ready;
