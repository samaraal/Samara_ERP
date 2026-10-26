-- 302 — Stores item "Used for" service + correcting a returned item charge to that service — ERP 2.18.149
-- Owner's rule (26-10-2026): some Stores items are part of a service and are not charged on their own
-- (e.g. Glucostrips are used for "Blood Glucose Monitoring"). Admin links each such Stores item to its
-- Charge Master service ("Used for"). When Accounts RETURN a request for that item, the nurse's
-- "Correct & Resubmit" offers the linked service and sends it STRAIGHT TO ACCOUNTS (Accounts already asked for
-- this change), even if the service's category normally needs Nursing Manager approval.
-- Run AFTER 300. Safe to run more than once. Nothing is deleted.

alter table public.consumable_store_items add column if not exists used_for_charge_code text;

-- Admin / Director: set or clear the "Used for" service of a Stores item.
create or replace function public.admin_set_store_item_used_for(p_item_id uuid, p_charge_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare code text := nullif(trim(coalesce(p_charge_code,'')),''); t public.charge_tariff_master%rowtype;
begin
  if auth.uid() is null or not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin / Director can link a Stores item to a service'; end if;
  if not exists(select 1 from public.consumable_store_items where id=p_item_id) then raise exception 'Stores item not found'; end if;
  if code is not null then
    select * into t from public.charge_tariff_master where charge_code=code and is_active order by updated_at desc limit 1;
    if not found then raise exception 'Choose an active Charge Master service'; end if;
  end if;
  update public.consumable_store_items set used_for_charge_code=code, updated_at=now() where id=p_item_id;
  return jsonb_build_object('item_id',p_item_id,'used_for_charge_code',code,'service_name',t.service_name,'category',t.category);
end $$;
revoke all on function public.admin_set_store_item_used_for(uuid,text) from public,anon;
grant execute on function public.admin_set_store_item_used_for(uuid,text) to authenticated;

-- Nurse: correct a RETURNED Stores-item request to the item's linked service. Creates a NEW pending request
-- (rate from Charge Master), links it to the returned one, and goes straight to Accounts.
create or replace function public.resubmit_returned_charge_as_service(
  p_returned uuid, p_charge_code text, p_quantity numeric default 1,
  p_service_datetime timestamptz default null, p_remarks text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.bill_charge_requests%rowtype; t public.charge_tariff_master%rowtype; item public.consumable_store_items%rowtype;
        v_profile uuid; v_name text; v_id uuid; v_at timestamptz; v_qty numeric := coalesce(p_quantity,1);
begin
  if auth.uid() is null or not public.current_user_has_role(array['Nurse','Manager','Admin']) then raise exception 'Only Nursing can resubmit a returned charge request'; end if;
  select * into o from public.bill_charge_requests where id=p_returned for update;
  if not found then raise exception 'Returned request not found'; end if;
  if coalesce(o.approval_status,'')<>'Rejected' then raise exception 'Only a returned request can be corrected'; end if;
  if o.resubmitted_as is not null then raise exception 'This returned request has already been resubmitted'; end if;
  if o.store_item_id is null then raise exception 'This returned request is not for a Stores item'; end if;
  select * into item from public.consumable_store_items where id=o.store_item_id;
  if item.used_for_charge_code is null or item.used_for_charge_code<>nullif(trim(coalesce(p_charge_code,'')),'') then
    raise exception 'This service is not the one Admin linked to % in Stores', coalesce(item.item_name,'this item');
  end if;
  select * into t from public.charge_tariff_master where charge_code=item.used_for_charge_code and is_active order by updated_at desc limit 1;
  if not found then raise exception 'The linked Charge Master service is not active'; end if;
  if v_qty<=0 or v_qty<>trunc(v_qty) or v_qty>50 then raise exception 'Enter a whole number quantity (1 to 50)'; end if;
  v_at := coalesce(p_service_datetime, o.service_datetime, now());
  if v_at > now() + interval '10 minutes' then raise exception 'Service time cannot be in the future'; end if;
  select id, coalesce(nullif(full_name,''),'Nursing staff') into v_profile, v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  perform set_config('samara.nursing_procedure_charge','on',true);   -- approved route: correction asked for by Accounts
  insert into public.bill_charge_requests(patient_id,charge_date,service_datetime,category,service_code,charge_item_code,service_name,description,
      service_provider,quantity,unit,unit_cost,estimated_amount,requested_amount,billable,bill_available,urgency,status,approval_status,
      remarks,raised_by,raised_by_name,raised_at,resubmitted_from,updated_at)
  values(o.patient_id,(v_at at time zone 'Asia/Kolkata')::date,v_at,t.category,upper(regexp_replace(t.service_name,'[^A-Za-z0-9]+','_','g')),t.charge_code,t.service_name,t.service_name,
      'Samara',v_qty,'Service',t.amount,case when t.amount is null then null else t.amount*v_qty end,case when t.amount is null then null else t.amount*v_qty end,true,false,coalesce(o.urgency,'Routine'),'Raised','Pending',
      concat_ws(' · ',nullif(trim(coalesce(p_remarks,'')),''),'Corrected from returned request: '||coalesce(o.service_name,'item')),
      auth.uid(),v_name,now(),o.id,now())
  returning id into v_id;
  perform set_config('samara.nursing_procedure_charge','',true);
  update public.bill_charge_requests set resubmitted_as=v_id,resubmitted_at=now(),resubmitted_by_name=v_name,updated_at=now() where id=o.id;
  return v_id;
end $$;
revoke all on function public.resubmit_returned_charge_as_service(uuid,text,numeric,timestamptz,text) from public,anon;
grant execute on function public.resubmit_returned_charge_as_service(uuid,text,numeric,timestamptz,text) to authenticated;

-- Check
select (select count(*) from information_schema.columns where table_schema='public' and table_name='consumable_store_items' and column_name='used_for_charge_code') as used_for_column,
       (select count(*) from pg_proc where proname in ('admin_set_store_item_used_for','resubmit_returned_charge_as_service')) as functions_installed;
