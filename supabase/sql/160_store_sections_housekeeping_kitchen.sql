-- Samara Care ERP 2.14.93 — Pharmacy & Stores: new sections
--   Housekeeping & General  (codes HKG-0001 …)
--   Kitchen / Food Stores   (codes KIT-0001 …)
-- Built from the live function definitions (diagnostic_store_functions.sql, 29-09-2026).
-- Every function below keeps its SAME name and parameters; only the category list /
-- mapping is extended. Nothing is deleted. Safe to run again.
--
--  1. Store Master item categories: 4 sections (was Pharmacy / Consumables only).
--  2. Item codes: HKG- and KIT- numbering, alongside PHA- and CON-.
--  3. Stock ledger: new movement type 'Department Issue' (issue to floor / kitchen /
--     department — not charged to a resident).
--  4. Add / Edit item (Admin + Stores in-charge) accept the new sections and keep the
--     Charge Master name/category link.
--  5. NEW store_receive_into_section(): receive from vendor into the right section. A
--     brand-new item is created in that section first, so it gets the right code
--     (this also fixes new Pharmacy items being saved as Consumables / CON-).
--  6. NEW store_issue_to_department(): issue stock to a department (ledger entry;
--     the stock balance is calculated from the ledger, so it reduces automatically).
--  7. Nurse "Received" on a resident indent: the automatic charge request uses the
--     item's own section when there is no Charge Master row (was always Consumables).
--  8. Accounts approval: the new sections are store categories — the required amount
--     is the live Store Master rate × quantity (same rule as Consumables / Pharmacy).
begin;

-- 1. categories -------------------------------------------------------------------
alter table public.consumable_store_items drop constraint if exists consumable_store_items_item_category_check;
alter table public.consumable_store_items add constraint consumable_store_items_item_category_check
  check (item_category = any (array['Pharmacy','Consumables','Housekeeping & General','Kitchen / Food Stores']));

create or replace function public.store_section_names()
returns text[] language sql immutable as $$
  select array['Consumables','Pharmacy','Housekeeping & General','Kitchen / Food Stores']::text[]
$$;
grant execute on function public.store_section_names() to authenticated;

-- 2. item codes ---------------------------------------------------------------------
create sequence if not exists public.samara_housekeeping_code_seq;
create sequence if not exists public.samara_kitchen_code_seq;

create or replace function public.assign_samara_store_item_code()
returns trigger language plpgsql as $function$
begin
  if nullif(trim(new.item_code),'') is null then
    if lower(trim(coalesce(new.item_category,'')))='pharmacy' then
      new.item_code := 'PHA-'||lpad(nextval('public.samara_pharmacy_code_seq')::text,4,'0');
    elsif new.item_category='Housekeeping & General' then
      new.item_code := 'HKG-'||lpad(nextval('public.samara_housekeeping_code_seq')::text,4,'0');
    elsif new.item_category='Kitchen / Food Stores' then
      new.item_code := 'KIT-'||lpad(nextval('public.samara_kitchen_code_seq')::text,4,'0');
    else
      new.item_code := 'CON-'||lpad(nextval('public.samara_consumable_code_seq')::text,4,'0');
    end if;
  end if;
  return new;
end $function$;

-- 3. ledger movement types ----------------------------------------------------------
alter table public.consumable_store_ledger drop constraint if exists consumable_store_ledger_movement_type_check;
alter table public.consumable_store_ledger add constraint consumable_store_ledger_movement_type_check
  check (movement_type = any (array['Vendor Receipt','Patient Issue','Return to Store','Adjustment In','Adjustment Out','Department Issue']));

-- 4. add / edit item ------------------------------------------------------------------
create or replace function public.admin_add_store_item(p_item_name text, p_category text, p_unit text, p_strength text default null, p_dosage_form text default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare new_id uuid;
begin
  if not public.store_item_admin_allowed() then raise exception 'Admin/Director access required.'; end if;
  if nullif(trim(p_item_name),'') is null then raise exception 'Item name is required.'; end if;
  if nullif(trim(p_unit),'') is null then raise exception 'Unit is required.'; end if;
  if not (p_category = any (public.store_section_names())) then
    raise exception 'Select a Stores section: Consumables, Pharmacy, Housekeeping & General or Kitchen / Food Stores.';
  end if;
  if exists(select 1 from public.consumable_store_items where lower(trim(item_name))=lower(trim(p_item_name))) then
    raise exception 'An item with this name already exists.';
  end if;
  insert into public.consumable_store_items(item_name,unit,item_category,strength,dosage_form)
  values(trim(p_item_name),trim(p_unit),p_category,nullif(trim(p_strength),''),nullif(trim(p_dosage_form),''))
  returning id into new_id;
  return new_id;
end; $function$;

create or replace function public.admin_update_store_item(p_item_id uuid, p_item_name text, p_category text, p_unit text, p_strength text default null, p_dosage_form text default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare old_name text;
begin
  if not public.store_item_admin_allowed() then raise exception 'Admin/Director access required.'; end if;
  if nullif(trim(p_item_name),'') is null or nullif(trim(p_unit),'') is null then raise exception 'Item name and unit are required.'; end if;
  if not (p_category = any (public.store_section_names())) then
    raise exception 'Select a Stores section: Consumables, Pharmacy, Housekeeping & General or Kitchen / Food Stores.';
  end if;
  if exists(select 1 from public.consumable_store_items where id<>p_item_id and lower(trim(item_name))=lower(trim(p_item_name))) then raise exception 'Another item already uses this name.'; end if;
  select item_name into old_name from public.consumable_store_items where id=p_item_id;
  update public.consumable_store_items set item_name=trim(p_item_name),item_category=p_category,unit=trim(p_unit),
    strength=nullif(trim(p_strength),''),dosage_form=nullif(trim(p_dosage_form),'') where id=p_item_id;
  if not found then raise exception 'Stock item not found.'; end if;
  update public.charge_tariff_master set service_name=trim(p_item_name),
    category=case when p_category='Pharmacy' then 'Pharmacy & Basic Supplies' when p_category='Consumables' then 'Consumables' else p_category end
  where lower(trim(service_name))=lower(trim(old_name));
end; $function$;

create or replace function public.store_incharge_edit_item(p_item_id uuid, p_item_name text, p_unit text, p_strength text default null, p_dosage_form text default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_allowed boolean := false; v_old_name text; v_category text;
begin
  select exists(
    select 1 from public.profiles p
    where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)
      and (p.role in ('Admin','Manager','STD')
           or lower(trim(coalesce(p.designation,''))) in ('director','admin/director','nurse manager','nursing manager','stores in-charge','store in-charge'))
  ) into v_allowed;
  if not v_allowed then raise exception 'Stores In-charge / Nursing Manager access required.'; end if;
  if nullif(trim(p_item_name),'') is null or nullif(trim(p_unit),'') is null then raise exception 'Item name and unit are required.'; end if;
  if exists(select 1 from public.consumable_store_items where id<>p_item_id and lower(trim(item_name))=lower(trim(p_item_name))) then
    raise exception 'Another item already uses this name.';
  end if;
  select item_name,item_category into v_old_name,v_category from public.consumable_store_items where id=p_item_id;
  if not found then raise exception 'Item not found.'; end if;
  update public.consumable_store_items
     set item_name=trim(p_item_name), unit=trim(p_unit), strength=nullif(trim(p_strength),''), dosage_form=nullif(trim(p_dosage_form),'')
   where id=p_item_id;
  update public.charge_tariff_master
     set service_name=trim(p_item_name),
         category=case when v_category='Pharmacy' then 'Pharmacy' when v_category in ('Housekeeping & General','Kitchen / Food Stores') then v_category else 'Consumables' end,
         updated_at=now()
   where lower(trim(service_name))=lower(trim(v_old_name));
end; $function$;

-- 5. receive into a section -------------------------------------------------------------
create or replace function public.store_receive_into_section(
  p_section text, p_item_id uuid, p_item_name text, p_unit text, p_vendor_name text, p_invoice_no text,
  p_invoice_date date, p_received_date date, p_quantity numeric, p_batch_no text default null,
  p_expiry_date date default null, p_unit_cost numeric default null, p_remarks text default null
) returns public.consumable_store_receipts
language plpgsql security definer set search_path to 'public' as $function$
declare v_item_id uuid := p_item_id; v_section text := trim(coalesce(p_section,''));
begin
  if not public.current_user_is_nurse_manager() then
    raise exception 'Only the Nurse Manager can receive items into Stores.';
  end if;
  if not (v_section = any (public.store_section_names())) then raise exception 'Unknown Stores section.'; end if;
  if v_item_id is null then
    if coalesce(trim(p_item_name),'')='' then raise exception 'Item name is required.'; end if;
    select id into v_item_id from public.consumable_store_items where lower(trim(item_name))=lower(trim(p_item_name)) limit 1;
    if v_item_id is null then
      insert into public.consumable_store_items(item_name,unit,item_category)
      values(trim(p_item_name),coalesce(nullif(trim(p_unit),''),'Nos'),v_section)
      returning id into v_item_id;
    end if;
  end if;
  -- the established receiving function records the receipt and the ledger entry
  return public.receive_consumable_store_stock(v_item_id,null,p_unit,p_vendor_name,p_invoice_no,p_invoice_date,
    p_received_date,p_quantity,p_batch_no,p_expiry_date,p_unit_cost,p_remarks);
end; $function$;
grant execute on function public.store_receive_into_section(text,uuid,text,text,text,text,date,date,numeric,text,date,numeric,text) to authenticated;

-- 6. issue to a department ----------------------------------------------------------------
create or replace function public.store_issue_to_department(
  p_item_id uuid, p_quantity numeric, p_department text, p_issued_to text default null, p_remarks text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare a record; v_item public.consumable_store_items; bal numeric; v_dept text := nullif(trim(coalesce(p_department,'')),'');
begin
  if not public.stores_controller_authorised() then
    raise exception 'Only the currently assigned Store In-charge can issue Stores items.';
  end if;
  select * into a from public.stores_actor();
  if v_dept is null then raise exception 'Select the department the item is issued to.'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Enter a valid quantity.'; end if;
  select * into v_item from public.consumable_store_items where id=p_item_id for update;
  if not found then raise exception 'Store item not found.'; end if;
  select balance_qty into bal from public.consumable_store_stock where item_id=p_item_id;
  if bal is null or bal<p_quantity then raise exception 'Insufficient Stores balance (available %).',coalesce(bal,0); end if;
  bal := bal-p_quantity;
  insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
  values(p_item_id,'Department Issue',0,p_quantity,bal,
    concat('Issued to ',v_dept,case when nullif(trim(coalesce(p_issued_to,'')),'') is not null then ' · '||trim(p_issued_to) else '' end),
    nullif(trim(coalesce(p_remarks,'')),''),a.actor_id,a.actor_name);
  return jsonb_build_object('success',true,'balance',bal);
end; $function$;
grant execute on function public.store_issue_to_department(uuid,numeric,text,text,text) to authenticated;

-- 7. nurse "Received" → automatic charge request category -----------------------------
create or replace function public.receive_patient_consumable_indent(p_indent_id uuid, p_received_qty numeric, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v public.patient_consumable_indents%rowtype; a record; new_status text; charge_id uuid;
begin
  select * into a from public.consumables_actor();
  if a.actor_id is null or a.actor_role not in ('Nurse','Admin') then raise exception 'Only Nursing can confirm receipt.'; end if;
  select * into v from public.patient_consumable_indents where id=p_indent_id for update;
  if not found or v.status<>'Handed Over' then raise exception 'This indent is not awaiting receipt.'; end if;
  if p_received_qty<=0 or p_received_qty>v.handed_over_qty then raise exception 'Invalid received quantity.'; end if;
  new_status:=case when p_received_qty<v.handed_over_qty then 'Receipt Discrepancy' else 'Received' end;
  update public.patient_consumable_indents set received_qty=p_received_qty,received_by=a.actor_id,
    received_by_name=a.actor_name,received_at=now(),receipt_remarks=p_remarks,status=new_status,updated_at=now()
  where id=p_indent_id;
  if new_status='Received' and to_regclass('public.bill_charge_requests') is not null then
    insert into public.bill_charge_requests
      (patient_id,charge_date,service_datetime,category,service_code,service_name,description,quantity,unit,
       billable,bill_available,urgency,status,approval_status,remarks,raised_by,raised_by_name,raised_at,updated_at,store_item_id,consumable_indent_id)
    values
      (v.patient_id,current_date,now(),
       coalesce((select c.category from public.charge_tariff_master c where lower(trim(c.service_name))=lower(trim(v.item_name)) and c.is_active order by c.created_at limit 1),
                (select i.item_category from public.consumable_store_items i where i.id=v.store_item_id and i.item_category in ('Housekeeping & General','Kitchen / Food Stores')),
                'Consumables'),
       upper(regexp_replace(v.item_name,'[^A-Za-z0-9]+','_','g')),
       v.item_name,v.item_name,p_received_qty,v.unit,true,false,'Routine','Raised','Pending',
       concat('Received against consumables indent CI-',lpad(v.indent_no::text,5,'0')),a.actor_id,a.actor_name,now(),now(),v.store_item_id,v.id)
    returning id into charge_id;
    update public.patient_consumable_indents set charge_request_id=charge_id where id=p_indent_id;
  end if;
  return jsonb_build_object('success',true,'indent_id',p_indent_id,'status',new_status,'charge_request_id',charge_id);
end $function$;

-- 8. Accounts approval: new sections are store categories (live Store Master rate) -----------
create or replace function public.decide_bill_charge_request_v5(
  p_request_id uuid, p_decision text, p_approved_amount numeric default 0, p_remarks text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_role text; v_name text; v_request public.bill_charge_requests%rowtype;
  v_transaction_id uuid; v_decision text:=trim(p_decision); v_tariff numeric;
  v_is_other boolean; v_is_store boolean;
begin
  select role,coalesce(nullif(full_name,''),'Accounts') into v_role,v_name
  from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if v_role <> 'Accounts' then raise exception 'Only Accounts can financially verify and decide a charge request.'; end if;
  if v_decision not in ('Approved','Partially Approved','Rejected') then raise exception 'Invalid decision.'; end if;

  select * into v_request from public.bill_charge_requests where id=p_request_id for update;
  if not found then raise exception 'Bill/charge request not found.'; end if;
  if coalesce(v_request.approval_status,'Pending')<>'Pending' then raise exception 'This request has already been decided.'; end if;

  if v_decision='Rejected' then
    update public.bill_charge_requests set approval_status='Rejected',status='Rejected',final_amount=0,
      approval_remarks=p_remarks,approved_by=auth.uid(),approved_at=now(),decision_date=now(),
      decision_by_name=v_name,decision_by_role=v_role,updated_at=now() where id=p_request_id;
    return jsonb_build_object('success',true,'decision','Rejected','request_id',p_request_id);
  end if;

  v_is_other := upper(coalesce(v_request.service_code,''))='OTHER';
  v_is_store := v_request.category in ('Consumables','Pharmacy','Pharmacy & Basic Supplies','Housekeeping & General','Kitchen / Food Stores');

  if coalesce(p_approved_amount,0)<=0 then
    raise exception 'Verified amount must be greater than zero.';
  end if;

  if coalesce(v_request.bill_available,false) then
    if v_request.bill_number is null or v_request.bill_date is null then
      raise exception 'Bill number and bill date are mandatory for bill-based charges.';
    end if;
  elsif not v_is_other then
    if v_is_store then
      select charge_rate into v_tariff
      from public.consumable_store_items
      where active=true
        and ((v_request.charge_item_code is not null and item_code=v_request.charge_item_code) or item_name=v_request.service_name)
      order by (v_request.charge_item_code is not null and item_code=v_request.charge_item_code) desc
      limit 1;
      if v_tariff is null then
        raise exception 'Admin-fixed charge rate is not configured for this Stores/Pharmacy item. Ask Admin to set the rate in Stores Master before approval.';
      end if;
      v_tariff := v_tariff * coalesce(v_request.quantity,1);
    else
      select amount into v_tariff
      from public.charge_tariff_master
      where category=v_request.category and service_name=v_request.service_name and is_active=true
      limit 1;
      if v_tariff is null then
        raise exception 'Admin-fixed tariff is not configured for this charge item. Ask Admin to set the tariff before approval.';
      end if;
    end if;
    if abs(coalesce(p_approved_amount,0)-v_tariff) > 0.009 then
      raise exception 'Approved amount must match the current Admin-fixed tariff of %.',v_tariff;
    end if;
  end if;

  insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by)
  values(v_request.patient_id,'Charge',v_request.category,p_approved_amount,'Not applicable',
    concat(v_request.description,' · Accounts verified by: ',v_name,
      case when coalesce(v_request.bill_available,false) then ' · Bill: '||coalesce(v_request.bill_number,'—')
           when v_is_other then ' · Custom/Others charge' else ' · Admin-fixed tariff' end,
      case when p_remarks is not null then ' · Remarks: '||p_remarks else '' end),now(),auth.uid())
  returning id into v_transaction_id;

  update public.bill_charge_requests set final_amount=p_approved_amount,approved_amount=p_approved_amount,
    approval_status=v_decision,status=case when v_decision='Approved' then 'Posted' else 'Partially Approved' end,
    approved_by=auth.uid(),approved_at=now(),decision_date=now(),decision_by_name=v_name,decision_by_role=v_role,
    approval_remarks=p_remarks,billing_transaction_id=v_transaction_id,updated_at=now() where id=p_request_id;

  return jsonb_build_object('success',true,'decision',v_decision,'request_id',p_request_id,
    'approved_amount',p_approved_amount,'billing_transaction_id',v_transaction_id);
end; $$;
grant execute on function public.decide_bill_charge_request_v5(uuid,text,numeric,text) to authenticated;

-- Charge Master approval routing (2.14.61): store sections can never be approval categories
do $$ begin
  if to_regclass('public.charge_category_settings') is not null then
    alter table public.charge_category_settings drop constraint if exists charge_category_settings_not_stock;
    alter table public.charge_category_settings add constraint charge_category_settings_not_stock
      check (requires_approval = false or category not in ('Consumables','Pharmacy','Pharmacy & Basic Supplies','Housekeeping & General','Kitchen / Food Stores'));
  end if;
end $$;

notify pgrst,'reload schema';
commit;

-- Check (should show 4 sections and both new functions = true)
select public.store_section_names() as sections,
       exists(select 1 from pg_proc where proname='store_receive_into_section') as receive_into_section_ready,
       exists(select 1 from pg_proc where proname='store_issue_to_department') as issue_to_department_ready;
