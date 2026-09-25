-- Samara Care ERP 2.14.46
-- Nursing Procedures clinical workflow:
--   Nurse requests a procedure -> Admin / Nursing Manager approves or declines
--   -> the Nurse confirms and starts it. Starting a procedure automatically
--   raises the matching "Nursing Procedures" charge request in the existing
--   bill_charge_requests table, so Accounts verifies and posts it exactly as
--   they already do for every other charge category. Nothing on the billing
--   side changes.

-- 1. Procedure master — the "Code" list, maintained by Admin / Nursing Manager.
create table if not exists public.nursing_procedure_master (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  procedure_name text not null,
  is_active boolean not null default true,
  display_order integer not null default 100,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(procedure_name)
);
create unique index if not exists nursing_procedure_master_code_idx
  on public.nursing_procedure_master(upper(code));

alter table public.nursing_procedure_master enable row level security;
drop policy if exists nursing_procedure_master_select on public.nursing_procedure_master;
create policy nursing_procedure_master_select
on public.nursing_procedure_master for select to authenticated using (true);
drop policy if exists nursing_procedure_master_write on public.nursing_procedure_master;
create policy nursing_procedure_master_write
on public.nursing_procedure_master for all to authenticated
using (public.current_user_has_role(array['Admin','Manager']))
with check (public.current_user_has_role(array['Admin','Manager']));

-- Seed with the same procedure names already used under the existing
-- "Nursing Procedures" charge category (Charge Master), so tariffs line up
-- automatically the first time a procedure is started. Admin / Nursing
-- Manager can rename, add or deactivate codes afterwards from the app.
insert into public.nursing_procedure_master(code,procedure_name,display_order)
select 'NP-'||lpad(seq::text,3,'0'), name, seq from (values
  (1,'Dressing'),(2,'Injection'),(3,'IV Cannulation'),(4,'IV Fluid Administration'),
  (5,'Blood Transfusion Assistance'),(6,'Catheterization'),(7,'Ryle''s Tube Feeding'),
  (8,'Nebulization'),(9,'Oxygen Therapy'),(10,'Suctioning'),(11,'ECG'),
  (12,'Blood Sample Collection'),(13,'Wound Care'),(14,'Pressure Sore Care'),
  (15,'Other Nursing Procedure')
) as seed(seq,name)
on conflict(procedure_name) do nothing;

-- 2. Requests — the clinical workflow itself. All writes go through the
-- RPCs below (security definer, explicit role checks) so the state machine
-- (Requested -> Approved/Declined -> Started) can never be skipped or
-- reordered from the client. No direct insert/update policy is granted.
create table if not exists public.nursing_procedure_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  procedure_id uuid not null references public.nursing_procedure_master(id),
  procedure_code text,
  procedure_name text not null,
  scheduled_at timestamptz,
  remarks text,
  status text not null default 'Requested'
    check (status in ('Requested','Approved','Declined','Started','Cancelled')),
  requested_by uuid,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decision_by uuid,
  decision_by_name text,
  decision_at timestamptz,
  decision_remarks text,
  started_by uuid,
  started_by_name text,
  started_at timestamptz,
  charge_request_id uuid references public.bill_charge_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nursing_procedure_requests_patient_idx
  on public.nursing_procedure_requests(patient_id,requested_at desc);
create index if not exists nursing_procedure_requests_status_idx
  on public.nursing_procedure_requests(status,requested_at desc);

alter table public.nursing_procedure_requests enable row level security;
drop policy if exists nursing_procedure_requests_select on public.nursing_procedure_requests;
create policy nursing_procedure_requests_select
on public.nursing_procedure_requests for select to authenticated
using (public.current_user_has_role(array['Admin','Manager','Nurse']));

-- 3. Nurse raises a request.
create or replace function public.request_nursing_procedure(
  p_patient_id uuid,
  p_procedure_id uuid,
  p_scheduled_at timestamptz default null,
  p_remarks text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_role text; v_name text; v_procedure record; v_id uuid;
begin
  select role,coalesce(nullif(trim(concat_ws(' ',title,full_name)),''),'Nurse') into v_role,v_name
  from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if v_role is distinct from 'Nurse' then
    raise exception 'Only Nurse can raise a Nursing Procedure request.';
  end if;

  if p_patient_id is null then raise exception 'Select a patient.'; end if;

  select id,code,procedure_name into v_procedure
  from public.nursing_procedure_master where id=p_procedure_id and is_active=true;
  if not found then raise exception 'Select a valid, active procedure from the list.'; end if;

  insert into public.nursing_procedure_requests(
    patient_id,procedure_id,procedure_code,procedure_name,scheduled_at,remarks,
    status,requested_by,requested_by_name,requested_at)
  values(p_patient_id,v_procedure.id,v_procedure.code,v_procedure.procedure_name,
    p_scheduled_at,nullif(trim(coalesce(p_remarks,'')),''),
    'Requested',auth.uid(),v_name,now())
  returning id into v_id;

  return v_id;
end; $$;
grant execute on function public.request_nursing_procedure(uuid,uuid,timestamptz,text) to authenticated;

-- 4. Admin / Nursing Manager approves or declines.
create or replace function public.decide_nursing_procedure_request(
  p_request_id uuid,
  p_decision text,
  p_remarks text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_role text; v_name text; v_request public.nursing_procedure_requests%rowtype; v_decision text:=trim(p_decision);
begin
  select role,coalesce(nullif(trim(concat_ws(' ',title,full_name)),''),'Management') into v_role,v_name
  from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if v_role not in ('Admin','Manager') then
    raise exception 'Only Admin or the Nursing Manager can approve or decline a Nursing Procedure request.';
  end if;
  if v_decision not in ('Approved','Declined') then raise exception 'Invalid decision.'; end if;

  select * into v_request from public.nursing_procedure_requests where id=p_request_id for update;
  if not found then raise exception 'Nursing Procedure request not found.'; end if;
  if v_request.status<>'Requested' then raise exception 'This request has already been decided.'; end if;

  update public.nursing_procedure_requests set
    status=v_decision,decision_by=auth.uid(),decision_by_name=v_name,decision_at=now(),
    decision_remarks=nullif(trim(coalesce(p_remarks,'')),''),updated_at=now()
  where id=p_request_id;

  return jsonb_build_object('success',true,'decision',v_decision,'request_id',p_request_id);
end; $$;
grant execute on function public.decide_nursing_procedure_request(uuid,text,text) to authenticated;

-- 5. Nurse confirms and starts an approved procedure. Raises the matching
-- Nursing Procedures charge request automatically (category, service name,
-- quantity 1) for Accounts to verify and post, exactly like a manually
-- raised charge in Charge Approvals.
create or replace function public.start_nursing_procedure(
  p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_role text; v_name text; v_request public.nursing_procedure_requests%rowtype; v_charge_id uuid;
begin
  select role,coalesce(nullif(trim(concat_ws(' ',title,full_name)),''),'Nurse') into v_role,v_name
  from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if v_role is distinct from 'Nurse' then
    raise exception 'Only Nurse can confirm and start a Nursing Procedure.';
  end if;

  select * into v_request from public.nursing_procedure_requests where id=p_request_id for update;
  if not found then raise exception 'Nursing Procedure request not found.'; end if;
  if v_request.status<>'Approved' then
    raise exception 'This request must be approved by the Nursing Manager before it can be started.';
  end if;

  insert into public.bill_charge_requests(
    patient_id,category,service_name,description,quantity,unit,
    charge_date,service_datetime,status,approval_status,
    raised_by,raised_by_name,raised_at,bill_available)
  values(
    v_request.patient_id,'Nursing Procedures',v_request.procedure_name,
    concat('Nursing procedure ',coalesce(v_request.procedure_code,''),' — ',v_request.procedure_name,
      ' started by ',v_name,
      case when v_request.remarks is not null then ' · '||v_request.remarks else '' end),
    1,'Service',current_date,now(),'Raised','Pending',
    auth.uid(),v_name,now(),false)
  returning id into v_charge_id;

  update public.nursing_procedure_requests set
    status='Started',started_by=auth.uid(),started_by_name=v_name,started_at=now(),
    charge_request_id=v_charge_id,updated_at=now()
  where id=p_request_id;

  return jsonb_build_object('success',true,'request_id',p_request_id,'charge_request_id',v_charge_id);
end; $$;
grant execute on function public.start_nursing_procedure(uuid) to authenticated;

notify pgrst,'reload schema';

select
  to_regclass('public.nursing_procedure_master') is not null as nursing_procedure_master_ready,
  to_regclass('public.nursing_procedure_requests') is not null as nursing_procedure_requests_ready;
