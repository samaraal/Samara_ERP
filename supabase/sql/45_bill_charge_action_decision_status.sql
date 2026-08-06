-- Samara Care ERP 1.3.25
-- Bill & Charge request action/decision workflow

alter table public.bill_charge_requests
  add column if not exists approval_status text not null default 'Pending';

alter table public.bill_charge_requests
  add column if not exists decision_date timestamptz;

update public.bill_charge_requests
set approval_status=
  case
    when status='Rejected' then 'Rejected'
    when status in ('Posted','Approved') then 'Approved'
    when status='Partially Approved' then 'Partially Approved'
    else 'Pending'
  end
where approval_status is null
   or approval_status=''
   or approval_status='Pending';

create or replace function public.decide_bill_charge_request(
  p_request_id uuid,
  p_decision text,
  p_approved_amount numeric default 0,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_request public.bill_charge_requests%rowtype;
  v_transaction_id uuid;
  v_decision text:=trim(p_decision);
begin
  select role into v_role
  from public.profiles
  where id=auth.uid() or auth_user_id=auth.uid()
  limit 1;

  if v_role not in ('Admin','Manager','Accounts') then
    raise exception 'Only Admin, Manager or Accounts can decide a bill/charge request.';
  end if;

  if v_decision not in ('Approved','Partially Approved','Rejected') then
    raise exception 'Invalid decision.';
  end if;

  select * into v_request
  from public.bill_charge_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Bill/charge request not found.'; end if;
  if coalesce(v_request.approval_status,'Pending')<>'Pending' then
    raise exception 'This request has already been decided.';
  end if;

  if v_decision='Rejected' then
    update public.bill_charge_requests
    set approval_status='Rejected',
        status='Rejected',
        final_amount=0,
        approval_remarks=p_remarks,
        approved_by=auth.uid(),
        approved_at=now(),
        decision_date=now(),
        updated_at=now()
    where id=p_request_id;

    return jsonb_build_object('success',true,'decision','Rejected','request_id',p_request_id);
  end if;

  if coalesce(p_approved_amount,0)<=0 then
    raise exception 'Approved amount must be greater than zero.';
  end if;

  insert into public.billing_transactions(
    patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by
  ) values (
    v_request.patient_id,
    'Charge',
    case
      when v_request.category='Medicines' then 'Medicine Charges'
      when v_request.category='Additional Food' then 'Food Charges'
      else v_request.category
    end,
    p_approved_amount,
    'Not applicable',
    concat(
      v_request.description,
      ' · Decision: ',v_decision,
      case when p_remarks is not null then ' · Remarks: '||p_remarks else '' end,
      case when v_request.service_provider is not null then ' · Provider: '||v_request.service_provider else '' end,
      case when v_request.bill_number is not null then ' · Bill: '||v_request.bill_number else '' end
    ),
    now(),
    auth.uid()
  )
  returning id into v_transaction_id;

  update public.bill_charge_requests
  set final_amount=p_approved_amount,
      approval_status=v_decision,
      status=case when v_decision='Approved' then 'Posted' else 'Partially Approved' end,
      approved_by=auth.uid(),
      approved_at=now(),
      decision_date=now(),
      approval_remarks=p_remarks,
      billing_transaction_id=v_transaction_id,
      updated_at=now()
  where id=p_request_id;

  return jsonb_build_object(
    'success',true,
    'decision',v_decision,
    'request_id',p_request_id,
    'approved_amount',p_approved_amount,
    'billing_transaction_id',v_transaction_id
  );
end;
$$;

grant execute on function public.decide_bill_charge_request(uuid,text,numeric,text) to authenticated;

notify pgrst, 'reload schema';

select exists(
  select 1 from information_schema.columns
  where table_schema='public'
    and table_name='bill_charge_requests'
    and column_name='approval_status'
) as approval_status_ready;
