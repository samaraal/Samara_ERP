-- Samara Care ERP 2.8.86
-- STRICTLY BILLING / CHARGE MASTER ONLY
-- Admin controls chargeable items and fixed tariffs.
-- Nursing sees item names only; no tariff/amount is exposed to Nursing.
-- 'Others' is editable by Nursing and Accounts.

create table if not exists public.charge_tariff_master (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  service_name text not null,
  amount numeric,
  is_active boolean not null default true,
  display_order integer not null default 100,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category,service_name)
);

alter table public.charge_tariff_master alter column amount drop not null;
alter table public.charge_tariff_master add column if not exists display_order integer not null default 100;

-- Seed the complete current chargeable-item catalogue without overwriting any tariffs already fixed by Admin.
insert into public.charge_tariff_master(category,service_name,amount,is_active,display_order) values
  ('Doctor Services','General Physician Visit',null,true,1),
  ('Doctor Services','Emergency Doctor Visit',null,true,2),
  ('Doctor Services','Specialist Consultation',null,true,3),
  ('Doctor Services','Teleconsultation',null,true,4),
  ('Doctor Services','Home Visit',null,true,5),
  ('Doctor Services','Follow-up Consultation',null,true,6),
  ('Doctor Services','Others',null,true,7),
  ('Nursing Procedures','Dressing',null,true,1),
  ('Nursing Procedures','Injection',null,true,2),
  ('Nursing Procedures','IV Cannulation',null,true,3),
  ('Nursing Procedures','IV Fluid Administration',null,true,4),
  ('Nursing Procedures','Blood Transfusion Assistance',null,true,5),
  ('Nursing Procedures','Catheterization',null,true,6),
  ('Nursing Procedures','Ryle’s Tube Feeding',null,true,7),
  ('Nursing Procedures','Nebulization',null,true,8),
  ('Nursing Procedures','Oxygen Therapy',null,true,9),
  ('Nursing Procedures','Suctioning',null,true,10),
  ('Nursing Procedures','ECG',null,true,11),
  ('Nursing Procedures','Blood Sample Collection',null,true,12),
  ('Nursing Procedures','Wound Care',null,true,13),
  ('Nursing Procedures','Pressure Sore Care',null,true,14),
  ('Nursing Procedures','Other Nursing Procedure',null,true,15),
  ('Nursing Procedures','Others',null,true,16),
  ('Physiotherapy','Regular Physiotherapy Session',null,true,1),
  ('Physiotherapy','Additional Physiotherapy Session',null,true,2),
  ('Physiotherapy','Walking Training',null,true,3),
  ('Physiotherapy','Gait Training',null,true,4),
  ('Physiotherapy','Balance Training',null,true,5),
  ('Physiotherapy','Respiratory Physiotherapy',null,true,6),
  ('Physiotherapy','Electrotherapy',null,true,7),
  ('Physiotherapy','Home Exercise Training',null,true,8),
  ('Physiotherapy','Mobility Assessment',null,true,9),
  ('Physiotherapy','Wheelchair Training',null,true,10),
  ('Physiotherapy','Other Physiotherapy Service',null,true,11),
  ('Physiotherapy','Others',null,true,12),
  ('Laboratory Services','Blood Sample Collection',null,true,1),
  ('Laboratory Services','Urine Sample Collection',null,true,2),
  ('Laboratory Services','Stool Sample Collection',null,true,3),
  ('Laboratory Services','Sputum Sample Collection',null,true,4),
  ('Laboratory Services','Swab Collection',null,true,5),
  ('Laboratory Services','Complete Blood Count (CBC)',null,true,6),
  ('Laboratory Services','Blood Sugar',null,true,7),
  ('Laboratory Services','HbA1c',null,true,8),
  ('Laboratory Services','Renal Function Test (RFT)',null,true,9),
  ('Laboratory Services','Liver Function Test (LFT)',null,true,10),
  ('Laboratory Services','Lipid Profile',null,true,11),
  ('Laboratory Services','Thyroid Profile',null,true,12),
  ('Laboratory Services','Electrolytes',null,true,13),
  ('Laboratory Services','Coagulation Profile',null,true,14),
  ('Laboratory Services','Urine Routine',null,true,15),
  ('Laboratory Services','Urine Culture',null,true,16),
  ('Laboratory Services','Blood Culture',null,true,17),
  ('Laboratory Services','COVID / Influenza Test',null,true,18),
  ('Laboratory Services','Other Laboratory Test',null,true,19),
  ('Laboratory Services','Others',null,true,20),
  ('Diagnostic / Imaging','X-Ray',null,true,1),
  ('Diagnostic / Imaging','Ultrasound',null,true,2),
  ('Diagnostic / Imaging','CT Scan',null,true,3),
  ('Diagnostic / Imaging','MRI',null,true,4),
  ('Diagnostic / Imaging','ECG',null,true,5),
  ('Diagnostic / Imaging','Echo',null,true,6),
  ('Diagnostic / Imaging','Doppler',null,true,7),
  ('Diagnostic / Imaging','Endoscopy',null,true,8),
  ('Diagnostic / Imaging','Colonoscopy',null,true,9),
  ('Diagnostic / Imaging','Other Imaging',null,true,10),
  ('Diagnostic / Imaging','Others',null,true,11),
  ('Hospital Visits','Patient Taken to Hospital',null,true,1),
  ('Hospital Visits','Hospital Bill Paid by Samara',null,true,2),
  ('Hospital Visits','Hospital Registration Fee',null,true,3),
  ('Hospital Visits','Investigation Charges',null,true,4),
  ('Hospital Visits','Outside Pharmacy Purchase',null,true,5),
  ('Hospital Visits','Radiology Charges',null,true,6),
  ('Hospital Visits','Others',null,true,7),
  ('Transport','Ambulance',null,true,1),
  ('Transport','Samara Vehicle',null,true,2),
  ('Transport','Taxi',null,true,3),
  ('Transport','Auto',null,true,4),
  ('Transport','Fuel',null,true,5),
  ('Transport','Toll',null,true,6),
  ('Transport','Parking',null,true,7),
  ('Transport','Others',null,true,8),
  ('Special Care','Special Nurse',null,true,1),
  ('Special Care','Extra Caregiver',null,true,2),
  ('Special Care','Additional Nursing Hours',null,true,3),
  ('Special Care','Night Duty Charges',null,true,4),
  ('Special Care','Others',null,true,5),
  ('Consumables','Adult Diapers',null,true,1),
  ('Consumables','Gloves',null,true,2),
  ('Consumables','Syringes',null,true,3),
  ('Consumables','Dressing Materials',null,true,4),
  ('Consumables','PPE',null,true,5),
  ('Consumables','Feeding Tubes',null,true,6),
  ('Consumables','Catheters',null,true,7),
  ('Consumables','Oxygen Consumables',null,true,8),
  ('Consumables','Other Consumables',null,true,9),
  ('Consumables','Others',null,true,10),
  ('Food & Nutrition','Special Diet',null,true,1),
  ('Food & Nutrition','Nutritional Supplements',null,true,2),
  ('Food & Nutrition','Tube Feed Formula',null,true,3),
  ('Food & Nutrition','Outside Food Purchase',null,true,4),
  ('Food & Nutrition','Others',null,true,5),
  ('Miscellaneous','Laundry',null,true,1),
  ('Miscellaneous','Courier',null,true,2),
  ('Miscellaneous','Miscellaneous Expense',null,true,3),
  ('Miscellaneous','Others',null,true,4)
on conflict(category,service_name) do update set
  display_order=excluded.display_order,
  updated_at=public.charge_tariff_master.updated_at;

-- Existing financial RLS remains Admin/Accounts only. Nursing must never select tariff amounts directly.
alter table public.charge_tariff_master enable row level security;
drop policy if exists charge_tariff_finance_select on public.charge_tariff_master;
create policy charge_tariff_finance_select on public.charge_tariff_master for select to authenticated
using (public.current_user_has_role(array['Admin','Accounts']));
drop policy if exists charge_tariff_admin_write on public.charge_tariff_master;
create policy charge_tariff_admin_write on public.charge_tariff_master for all to authenticated
using (public.current_user_has_role(array['Admin']))
with check (public.current_user_has_role(array['Admin']));

-- Safe non-financial catalogue for Nursing. It intentionally does NOT return the tariff amount.
create or replace function public.get_charge_service_catalog()
returns table(category text,service_name text,is_active boolean,display_order integer)
language sql
security definer
set search_path=public
as $$
  select c.category,c.service_name,c.is_active,c.display_order
  from public.charge_tariff_master c
  where c.is_active=true
  order by c.category,c.display_order,c.service_name;
$$;
grant execute on function public.get_charge_service_catalog() to authenticated;

-- Accounts-only financial decision.
-- Rule: external bill available => Accounts verifies actual bill amount.
--       no external bill => amount MUST equal Admin-fixed tariff.
--       service_code OTHER => Accounts may enter verified amount because the item is custom/ad-hoc.
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
  v_is_other boolean;
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

  if coalesce(p_approved_amount,0)<=0 then
    raise exception 'Verified amount must be greater than zero.';
  end if;

  if coalesce(v_request.bill_available,false) then
    if v_request.bill_number is null or v_request.bill_date is null then
      raise exception 'Bill number and bill date are mandatory for bill-based charges.';
    end if;
  elsif not v_is_other then
    select amount into v_tariff
    from public.charge_tariff_master
    where category=v_request.category and service_name=v_request.service_name and is_active=true
    limit 1;
    if v_tariff is null then
      raise exception 'Admin-fixed tariff is not configured for this charge item. Ask Admin to set the tariff before approval.';
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
