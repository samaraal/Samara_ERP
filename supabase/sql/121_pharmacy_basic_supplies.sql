begin;
-- Catalogue only: no purchases, stock receipts, issues or tariffs are fabricated.
create temporary table pharmacy_seed(item_name text,unit text) on commit drop;
insert into pharmacy_seed values
('Glucometer Strips','Nos'),
('Lancets','Nos'),
('Alcohol Swabs','Nos'),
('Digital Thermometer','Nos'),
('Thermometer Probe Covers','Nos'),
('Pulse Oximeter','Nos'),
('BP Cuff / Spare Cuff','Nos'),
('Sterile Gauze Pads - 2 x 2','Nos'),
('Sterile Gauze Pads - 4 x 4','Nos'),
('Cotton Rolls','Rolls'),
('Cotton Balls','Nos'),
('Micropore Adhesive Tape','Rolls'),
('Sterile Dressing Pads','Nos'),
('Crepe Bandage - 2 inch','Rolls'),
('Crepe Bandage - 4 inch','Rolls'),
('Crepe Bandage - 6 inch','Rolls'),
('Roller / Gauze Bandages','Rolls'),
('Disposable Examination Gloves - S','Pieces'),
('Disposable Examination Gloves - M','Pieces'),
('Disposable Examination Gloves - L','Pieces'),
('Surgical Masks','Nos'),
('Disposable Syringe - 1 mL','Nos'),
('Disposable Syringe - 2 mL','Nos'),
('Disposable Syringe - 3 mL','Nos'),
('Disposable Syringe - 5 mL','Nos'),
('Disposable Syringe - 10 mL','Nos'),
('Disposable Syringe - 20 mL','Nos'),
('Needle - 18G','Nos'),
('Needle - 20G','Nos'),
('Needle - 21G','Nos'),
('Needle - 22G','Nos'),
('Needle - 23G','Nos'),
('Needle - 24G','Nos'),
('Needle - 25G','Nos'),
('Needle - 26G','Nos'),
('Insulin Syringe - U-40','Nos'),
('Insulin Syringe - U-100','Nos'),
('Insulin Pen Needle - 4 mm','Nos'),
('Insulin Pen Needle - 5 mm','Nos'),
('Insulin Pen Needle - 6 mm','Nos'),
('Insulin Pen Needle - 8 mm','Nos'),
('IV Cannula - 18G','Nos'),
('IV Cannula - 20G','Nos'),
('IV Cannula - 22G','Nos'),
('IV Cannula - 24G','Nos'),
('IV Sets','Nos'),
('IV Extension Lines','Nos'),
('Normal Saline Flush Syringes','Nos'),
('Urine Specimen Containers','Nos'),
('Disposable Urine Measuring Containers','Nos'),
('Adult Urine Bags','Nos'),
('Nebulizer Mask / Kit - Adult','Nos'),
('Oxygen Nasal Cannula','Nos'),
('Oxygen Masks','Nos'),
('Suction Catheter - 10 Fr','Nos'),
('Suction Catheter - 12 Fr','Nos'),
('Suction Catheter - 14 Fr','Nos'),
('Suction Catheter - 16 Fr','Nos'),
('Feeding Syringe - 50 mL','Nos'),
('Feeding Syringe - 60 mL','Nos'),
('Disposable Underpads','Nos'),
('Tongue Depressors','Nos'),
('Hand Sanitizer','Bottles'),
('Povidone-iodine Solution','Bottles'),
('Chlorhexidine Antiseptic - As per Samara Protocol','Bottles'),
('Normal Saline for Wound Cleansing','Bottles'),
('Sharps Disposal Containers','Nos'),
('Biomedical-waste Bags','Nos');
insert into public.consumable_store_items(item_name,unit)
select s.item_name,s.unit from pharmacy_seed s
where not exists(select 1 from public.consumable_store_items i where lower(trim(i.item_name))=lower(trim(s.item_name)));
insert into public.charge_tariff_master(category,service_name,amount,is_active)
select 'Pharmacy & Basic Supplies',s.item_name,null,true from pharmacy_seed s
where not exists(select 1 from public.charge_tariff_master c where lower(trim(c.service_name))=lower(trim(s.item_name)));

alter table public.bill_charge_requests add column if not exists store_item_id uuid references public.consumable_store_items(id);
create or replace function public.validate_charge_stock_reference()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare stock_item record;
begin
  if new.store_item_id is null then return new; end if;
  if TG_OP='UPDATE' and new.store_item_id is not distinct from old.store_item_id and new.unit is not distinct from old.unit then return new; end if;
  select * into stock_item from public.consumable_store_items where id=new.store_item_id;
  if not found or not stock_item.active then raise exception 'Select an active stock item.'; end if;
  if lower(trim(coalesce(new.unit,'')))<>lower(trim(stock_item.unit)) then raise exception 'Charge quantity must use the selected stock item unit (%).',stock_item.unit; end if;
  return new;
end;
$$;
revoke all on function public.validate_charge_stock_reference() from public,anon,authenticated;
drop trigger if exists charge_stock_reference_guard on public.bill_charge_requests;
create trigger charge_stock_reference_guard before insert or update on public.bill_charge_requests for each row execute function public.validate_charge_stock_reference();
-- Keep receipt -> charge behavior, using the item's catalogue category and an explicit stock/indent reference.
do $$ declare definition text;
begin
  definition:=pg_get_functiondef('public.receive_patient_consumable_indent(uuid,numeric,text)'::regprocedure);
  if position('now(),''Consumables'',upper' in definition)=0 then raise exception 'Unexpected indent receipt definition; review before migration.'; end if;
  definition:=replace(definition,'now(),''Consumables'',upper',
    'now(),coalesce((select c.category from public.charge_tariff_master c where lower(trim(c.service_name))=lower(trim(v.item_name)) and c.is_active order by c.created_at limit 1),''Consumables''),upper');
  definition:=replace(definition,'raised_at,updated_at)','raised_at,updated_at,store_item_id,consumable_indent_id)');
  definition:=replace(definition,'a.actor_id,a.actor_name,now(),now())','a.actor_id,a.actor_name,now(),now(),v.store_item_id,v.id)');
  execute definition;
end;
$$;

commit;
