-- Samara Care ERP 1.3.16
-- Bills & Charges request, verification and ledger-posting workflow

create table if not exists public.bill_charge_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  charge_date date not null default current_date,
  category text not null,
  service_provider text,
  description text not null,
  quantity numeric not null default 1,
  unit_cost numeric,
  estimated_amount numeric,
  bill_available boolean not null default false,
  bill_number text,
  bill_date date,
  bill_reference text,
  requested_amount numeric,
  final_amount numeric,
  urgency text not null default 'Routine',
  requested_for_date date,
  remarks text,
  status text not null default 'Raised',
  raised_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  approval_remarks text,
  billing_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bill_charge_patient_idx
  on public.bill_charge_requests(patient_id,created_at desc);

alter table public.bill_charge_requests enable row level security;

drop policy if exists bill_charge_authorised_select on public.bill_charge_requests;
create policy bill_charge_authorised_select
on public.bill_charge_requests for select
to authenticated
using (public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']));

drop policy if exists bill_charge_authorised_insert on public.bill_charge_requests;
create policy bill_charge_authorised_insert
on public.bill_charge_requests for insert
to authenticated
with check (public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']));

drop policy if exists bill_charge_authorised_update on public.bill_charge_requests;
create policy bill_charge_authorised_update
on public.bill_charge_requests for update
to authenticated
using (public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']))
with check (public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']));

create or replace function public.approve_bill_charge_request(
  p_request_id uuid,
  p_final_amount numeric
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
begin
  select role into v_role
  from public.profiles
  where id=auth.uid() or auth_user_id=auth.uid()
  limit 1;

  if v_role not in ('Admin','Manager','Accounts') then
    raise exception 'Only Admin, Manager or Accounts can approve and post charges.';
  end if;

  if coalesce(p_final_amount,0)<=0 then
    raise exception 'Final approved amount must be greater than zero.';
  end if;

  select * into v_request
  from public.bill_charge_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Bill/charge request not found.'; end if;
  if v_request.status='Posted' then raise exception 'This charge has already been posted.'; end if;
  if v_request.status='Rejected' then raise exception 'Rejected request cannot be posted.'; end if;

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
    p_final_amount,
    'Not applicable',
    concat(v_request.description,
      case when v_request.service_provider is not null then ' · Provider: '||v_request.service_provider else '' end,
      case when v_request.bill_number is not null then ' · Bill: '||v_request.bill_number else '' end
    ),
    now(),
    auth.uid()
  )
  returning id into v_transaction_id;

  update public.bill_charge_requests
  set final_amount=p_final_amount,
      status='Posted',
      approved_by=auth.uid(),
      approved_at=now(),
      billing_transaction_id=v_transaction_id,
      updated_at=now()
  where id=p_request_id;

  return jsonb_build_object(
    'success',true,
    'request_id',p_request_id,
    'billing_transaction_id',v_transaction_id,
    'final_amount',p_final_amount
  );
end;
$$;

grant execute on function public.approve_bill_charge_request(uuid,numeric) to authenticated;

notify pgrst, 'reload schema';

select
  to_regclass('public.bill_charge_requests') is not null as bills_charges_ready,
  exists(select 1 from pg_proc where proname='approve_bill_charge_request') as approval_function_ready;
