-- Samara Care ERP 2.15.4 — Biomedical Equipment: Item Master + Receive / Purchase from vendor.
--   Item (kind of equipment) : BME-001 Pulse Oximeter, BME-002 Air Mattress …   (created once; name picked from a list after that)
--   Piece (one physical unit): BME-001-01, BME-001-02 …                         (created when received from a vendor / opening stock)
-- An item may be linked to its Charge Master "Biomedical Equipment" rate (BIO- code) or be "Not charged to residents".
-- Existing pieces are grouped into items by name and renumbered to the new style (movements are linked by id, so history stays).
-- Run AFTER SQL 163. Safe to run again.
begin;

-- 1. Item Master ---------------------------------------------------------------------------------
create sequence if not exists public.samara_bme_item_seq;
create table if not exists public.biomedical_equipment_items(
  id uuid primary key default gen_random_uuid(),
  item_code text unique,
  item_name text not null,
  charge_code text,
  charge_service_name text,
  notes text,
  active boolean not null default true,
  next_piece_no integer not null default 0,
  created_by uuid, created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists biomedical_equipment_items_name_uq on public.biomedical_equipment_items(lower(trim(item_name)));

create or replace function public.bme_item_assign_code() returns trigger language plpgsql as $$
begin
  if nullif(trim(new.item_code),'') is null then
    new.item_code := 'BME-'||lpad(nextval('public.samara_bme_item_seq')::text,3,'0');
  end if;
  return new;
end $$;
drop trigger if exists trg_bme_item_code on public.biomedical_equipment_items;
create trigger trg_bme_item_code before insert on public.biomedical_equipment_items for each row execute function public.bme_item_assign_code();

alter table public.biomedical_equipment_items enable row level security;
drop policy if exists bme_items_read on public.biomedical_equipment_items;
create policy bme_items_read on public.biomedical_equipment_items for select to authenticated using (true);

-- 2. Purchases / receipts -----------------------------------------------------------------------
create sequence if not exists public.samara_bme_purchase_seq;
create table if not exists public.biomedical_equipment_purchases(
  id uuid primary key default gen_random_uuid(),
  receipt_no integer not null default nextval('public.samara_bme_purchase_seq'),
  item_id uuid not null references public.biomedical_equipment_items(id),
  source text not null default 'Purchase' check (source in ('Purchase','Opening stock')),
  quantity integer not null check (quantity between 1 and 100),
  vendor_name text, bill_no text, bill_date date,
  unit_cost numeric(12,2), warranty_until date,
  remarks text,
  asset_nos text[],
  received_by uuid, received_by_name text,
  received_at timestamptz not null default now()
);
alter table public.biomedical_equipment_purchases enable row level security;
drop policy if exists bme_purchases_read on public.biomedical_equipment_purchases;
create policy bme_purchases_read on public.biomedical_equipment_purchases for select to authenticated using (true);

-- 3. Pieces get their item + purchase details ----------------------------------------------------
alter table public.biomedical_equipment add column if not exists item_id uuid references public.biomedical_equipment_items(id);
alter table public.biomedical_equipment add column if not exists purchase_id uuid references public.biomedical_equipment_purchases(id);
alter table public.biomedical_equipment add column if not exists vendor_name text;
alter table public.biomedical_equipment add column if not exists bill_no text;
alter table public.biomedical_equipment add column if not exists bill_date date;
alter table public.biomedical_equipment add column if not exists unit_cost numeric(12,2);
alter table public.biomedical_equipment add column if not exists warranty_until date;

-- piece number follows the item code: BME-001-01
create or replace function public.bme_assign_asset_no() returns trigger language plpgsql as $$
declare v_code text; v_no integer;
begin
  if nullif(trim(new.asset_no),'') is null then
    if new.item_id is not null then
      update public.biomedical_equipment_items set next_piece_no=next_piece_no+1, updated_at=now()
       where id=new.item_id returning item_code, next_piece_no into v_code, v_no;
      new.asset_no := v_code||'-'||lpad(v_no::text,2,'0');
    else
      new.asset_no := 'BME-'||lpad(nextval('public.samara_bme_asset_seq')::text,4,'0');
    end if;
  end if;
  return new;
end $$;

-- 4. Move existing pieces into items (by name) and renumber them ---------------------------------
insert into public.biomedical_equipment_items(item_name,charge_code,charge_service_name)
select distinct on (lower(trim(e.equipment_name))) case when trim(e.equipment_name)=upper(trim(e.equipment_name)) then initcap(lower(trim(e.equipment_name))) else trim(e.equipment_name) end, e.charge_code, e.charge_service_name
  from public.biomedical_equipment e
 where e.item_id is null
   and not exists(select 1 from public.biomedical_equipment_items i where lower(trim(i.item_name))=lower(trim(e.equipment_name)))
 order by lower(trim(e.equipment_name)), (e.charge_code is null), e.created_at;

update public.biomedical_equipment e set item_id=i.id
  from public.biomedical_equipment_items i
 where e.item_id is null and lower(trim(i.item_name))=lower(trim(e.equipment_name));

do $$
declare r record; v_code text; v_no integer;
begin
  for r in select e.id, e.item_id from public.biomedical_equipment e
            where e.item_id is not null and e.asset_no !~ '^BME-[0-9]{3}-[0-9]+$'
            order by e.created_at, e.asset_no loop
    update public.biomedical_equipment_items set next_piece_no=next_piece_no+1 where id=r.item_id returning item_code,next_piece_no into v_code,v_no;
    update public.biomedical_equipment set asset_no=v_code||'-'||lpad(v_no::text,2,'0') where id=r.id;
  end loop;
end $$;
update public.biomedical_equipment e set equipment_name=i.item_name, charge_code=i.charge_code, charge_service_name=i.charge_service_name
  from public.biomedical_equipment_items i where e.item_id=i.id;

-- 5. Functions -------------------------------------------------------------------------------------
-- create / edit an item; edits flow to every piece of that item (name and Charge Master link)
create or replace function public.bme_item_save(p_id uuid, p_item_name text, p_charge_code text, p_charge_service_name text,
  p_notes text default null, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; v_id uuid; v_code text; v_name text := regexp_replace(trim(coalesce(p_item_name,'')),'\s+',' ','g');
begin
  select * into a from public.samara_equipment_actor();
  if not a.is_controller then raise exception 'Only the Store In-charge (Nursing Manager) or Admin can manage equipment items.'; end if;
  if v_name='' then raise exception 'Equipment name is required.'; end if;
  if exists(select 1 from public.biomedical_equipment_items where lower(trim(item_name))=lower(v_name) and (p_id is null or id<>p_id)) then
    raise exception '"%" already exists in the Equipment Items. Please pick it from the list.',v_name;
  end if;
  if p_id is null then
    insert into public.biomedical_equipment_items(item_name,charge_code,charge_service_name,notes,active,created_by,created_by_name)
    values(v_name,nullif(trim(coalesce(p_charge_code,'')),''),nullif(trim(coalesce(p_charge_service_name,'')),''),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_active,true),a.actor_id,a.actor_name)
    returning id,item_code into v_id,v_code;
  else
    update public.biomedical_equipment_items
       set item_name=v_name, charge_code=nullif(trim(coalesce(p_charge_code,'')),''), charge_service_name=nullif(trim(coalesce(p_charge_service_name,'')),''),
           notes=nullif(trim(coalesce(p_notes,'')),''), active=coalesce(p_active,true), updated_at=now()
     where id=p_id returning id,item_code into v_id,v_code;
    if v_id is null then raise exception 'Equipment item not found.'; end if;
    update public.biomedical_equipment set equipment_name=v_name, charge_code=nullif(trim(coalesce(p_charge_code,'')),''),
           charge_service_name=nullif(trim(coalesce(p_charge_service_name,'')),''), updated_at=now()
     where item_id=v_id;
  end if;
  return jsonb_build_object('success',true,'id',v_id,'item_code',v_code,'item_name',v_name);
end $$;
grant execute on function public.bme_item_save(uuid,text,text,text,text,boolean) to authenticated;

-- delete an item only when it has no pieces (a wrong name)
create or replace function public.bme_item_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; i public.biomedical_equipment_items;
begin
  select * into a from public.samara_equipment_actor();
  if not a.is_controller then raise exception 'Only the Store In-charge (Nursing Manager) or Admin can delete equipment items.'; end if;
  select * into i from public.biomedical_equipment_items where id=p_id for update;
  if not found then raise exception 'Equipment item not found.'; end if;
  if exists(select 1 from public.biomedical_equipment where item_id=p_id) or exists(select 1 from public.biomedical_equipment_purchases where item_id=p_id) then
    raise exception '% has pieces or receipts, so it cannot be deleted. Turn it Inactive instead.',i.item_code;
  end if;
  insert into public.equipment_register_deletions(register,item_no,item_name,record,movements,reason,deleted_by,deleted_by_name)
  values('Equipment Item',i.item_code,i.item_name,to_jsonb(i),'[]'::jsonb,'Item with no pieces deleted',a.actor_id,a.actor_name);
  delete from public.biomedical_equipment_items where id=p_id;
  return jsonb_build_object('success',true);
end $$;
grant execute on function public.bme_item_delete(uuid) to authenticated;

-- receive pieces: from a vendor (Purchase) or already owned (Opening stock)
create or replace function public.bme_receive(p_item_id uuid, p_source text, p_quantity integer,
  p_vendor_name text default null, p_bill_no text default null, p_bill_date date default null,
  p_unit_cost numeric default null, p_warranty_until date default null, p_serials text[] default null,
  p_next_service_due date default null, p_location text default null, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; i public.biomedical_equipment_items; v_pid uuid; v_eid uuid; v_asset text; v_assets text[] := '{}'; v_loc text; v_serial text; n integer;
begin
  select * into a from public.samara_equipment_actor();
  if not a.is_controller then raise exception 'Only the Store In-charge (Nursing Manager) or Admin can receive equipment.'; end if;
  select * into i from public.biomedical_equipment_items where id=p_item_id;
  if not found then raise exception 'Choose the equipment item.'; end if;
  if not i.active then raise exception '% is Inactive. Turn it Active in Equipment Items first.',i.item_name; end if;
  if coalesce(p_source,'') not in ('Purchase','Opening stock') then raise exception 'Choose Purchase from vendor or Already owned.'; end if;
  if coalesce(p_quantity,0) < 1 or p_quantity > 100 then raise exception 'Quantity must be between 1 and 100.'; end if;
  if p_source='Purchase' and nullif(trim(coalesce(p_vendor_name,'')),'') is null then raise exception 'Vendor name is required for a purchase.'; end if;
  if p_unit_cost is not null and p_unit_cost < 0 then raise exception 'Cost cannot be negative.'; end if;
  if p_serials is not null and array_length(array_remove(p_serials,''),1) is not null and array_length(array_remove(p_serials,''),1)<>p_quantity then
    raise exception 'You entered % serial number(s) for % piece(s). Enter one per piece, or leave serials blank.',array_length(array_remove(p_serials,''),1),p_quantity;
  end if;
  v_loc := coalesce(nullif(trim(coalesce(p_location,'')),''),'Stores');
  insert into public.biomedical_equipment_purchases(item_id,source,quantity,vendor_name,bill_no,bill_date,unit_cost,warranty_until,remarks,received_by,received_by_name)
  values(i.id,p_source,p_quantity,nullif(trim(coalesce(p_vendor_name,'')),''),nullif(trim(coalesce(p_bill_no,'')),''),p_bill_date,p_unit_cost,p_warranty_until,
         nullif(trim(coalesce(p_remarks,'')),''),a.actor_id,a.actor_name)
  returning id into v_pid;
  for n in 1..p_quantity loop
    v_serial := case when p_serials is null then null else nullif(trim(coalesce((array_remove(p_serials,''))[n],'')),'') end;
    insert into public.biomedical_equipment(item_id,purchase_id,equipment_name,charge_code,charge_service_name,serial_no,next_service_due,current_location,
                                            vendor_name,bill_no,bill_date,unit_cost,warranty_until,notes)
    values(i.id,v_pid,i.item_name,i.charge_code,i.charge_service_name,v_serial,p_next_service_due,v_loc,
           nullif(trim(coalesce(p_vendor_name,'')),''),nullif(trim(coalesce(p_bill_no,'')),''),p_bill_date,p_unit_cost,p_warranty_until,nullif(trim(coalesce(p_remarks,'')),''))
    returning id,asset_no into v_eid,v_asset;
    v_assets := v_assets || v_asset;
    insert into public.biomedical_equipment_movements(equipment_id,action,location,remarks,actor_id,actor_name)
    values(v_eid,case when p_source='Purchase' then 'Received from vendor' else 'Opening stock' end,v_loc,
           concat_ws(' · ',nullif(trim(coalesce(p_vendor_name,'')),''),case when nullif(trim(coalesce(p_bill_no,'')),'') is not null then 'Bill '||trim(p_bill_no) end),a.actor_id,a.actor_name);
  end loop;
  update public.biomedical_equipment_purchases set asset_nos=v_assets where id=v_pid;
  return jsonb_build_object('success',true,'purchase_id',v_pid,'asset_nos',to_jsonb(v_assets));
end $$;
grant execute on function public.bme_receive(uuid,text,integer,text,text,date,numeric,date,text[],date,text,text) to authenticated;

commit;
notify pgrst, 'reload schema';
