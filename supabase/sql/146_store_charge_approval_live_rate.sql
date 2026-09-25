-- Samara Care ERP 2.14.50
-- Fix: approving a Consumables/Pharmacy charge was checked against a leftover
-- charge_tariff_master row (from before Stores Master had its own charge_rate
-- column) instead of the live Stores Master rate, and never accounted for
-- quantity. Admin edits the rate from Charge Master -> Stores / Pharmacy
-- Items -> Edit Rate (consumable_store_items.charge_rate); that edit had no
-- effect on what Accounts was required to approve, and a request for more
-- than 1 unit could never match a flat, unit-blind legacy tariff.
--
-- This reissues decide_bill_charge_request_v5 with the SAME name and
-- parameters (so nothing in the app needs to change) and only changes the
-- amount check: for a Consumables / Pharmacy / Pharmacy & Basic Supplies
-- charge, the required amount is now the live consumable_store_items
-- .charge_rate for that item, multiplied by the request's quantity. Every
-- other category keeps using charge_tariff_master exactly as before.
create or replace function public.decide_bill_charge_request_v5(
  p_request_id uuid,
  p_decision text,
  p_approved_amount numeric default 0,
  p_remarks text default null
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
  v_is_store := v_request.category in ('Consumables','Pharmacy','Pharmacy & Basic Supplies');

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
        and (
          (v_request.charge_item_code is not null and item_code=v_request.charge_item_code)
          or item_name=v_request.service_name
        )
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
notify pgrst,'reload schema';
