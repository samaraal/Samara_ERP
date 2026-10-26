-- 304 — Correct & Resubmit: any Nursing Procedure can be chosen — ERP 2.18.151
-- Owner's rule (26-10-2026): when Accounts return a request, the nurse's Correct & Resubmit lists every active
-- Nursing Procedure (the Stores item's linked "Used for" service first, when set). The chosen procedure goes
-- straight to Accounts as a NEW request at the Charge Master rate, linked to the returned one.
-- Replaces resubmit_returned_charge_as_service from 302 (run 302 first). Safe to run more than once.

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
  if o.physiotherapy_session_id is not null then raise exception 'Physiotherapy session charges cannot be corrected by Nursing'; end if;
  if o.store_item_id is not null then select * into item from public.consumable_store_items where id=o.store_item_id; end if;
  select * into t from public.charge_tariff_master where charge_code=nullif(trim(coalesce(p_charge_code,'')),'') and is_active order by updated_at desc limit 1;
  if not found then raise exception 'Choose an active Charge Master service'; end if;
  -- 304: the item's linked "Used for" service, or any Nursing Procedure / approval-routed service
  if not (t.charge_code is not distinct from item.used_for_charge_code
          or t.category='Nursing Procedures' or public.charge_category_requires_approval(t.category)) then
    raise exception 'Only a Nursing Procedure (or the service linked to this item) can be chosen here';
  end if;
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
select count(*) as function_installed from pg_proc where proname='resubmit_returned_charge_as_service';
