-- Samara Care ERP 2.14.60
-- Nursing Procedures revamp:
--   1. The procedure list on NURSING -> Nursing Procedures now comes straight
--      from Charge Master (category "Nursing Procedures", active items only),
--      with the Charge Master code (NUR-xxxx). The separate
--      nursing_procedure_master (NP-xxx) list is no longer used; its table is
--      kept only so older requests keep their history.
--   2. "Nursing Procedures" can no longer be raised from Bills & Charges by
--      anyone. The only way a Nursing Procedures charge is created is the
--      nurse's "Confirm & Start" on an approved request. Accounts' verify/post
--      step and existing charges are unchanged.
--   3. Any request already marked "Started" whose charge is missing gets its
--      charge raised now (Pending, for Accounts to verify). Safe to re-run.
-- Run the whole file once in Supabase -> SQL Editor.

-- Charge Master code column (the app already writes it; this only makes sure it exists).
alter table public.charge_tariff_master add column if not exists charge_code text;

-- 1. Requests now point at the Charge Master item.
alter table public.nursing_procedure_requests
  add column if not exists tariff_id uuid references public.charge_tariff_master(id) on delete set null;
alter table public.nursing_procedure_requests alter column procedure_id drop not null;

-- Safe catalogue for Nurse / Nursing Manager / Admin: code and name only, never the tariff amount.
create or replace function public.get_nursing_procedure_catalog()
returns table(id uuid, charge_code text, service_name text, display_order integer)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']) then
    raise exception 'Not allowed to view the Nursing Procedures list.';
  end if;
  return query
    select c.id, c.charge_code, c.service_name, c.display_order
    from public.charge_tariff_master c
    where c.category='Nursing Procedures' and c.is_active=true
    order by c.display_order, c.service_name;
end; $$;
revoke all on function public.get_nursing_procedure_catalog() from public, anon;
grant execute on function public.get_nursing_procedure_catalog() to authenticated;

-- Nurse raises a request against a Charge Master item.
create or replace function public.request_nursing_procedure_v2(
  p_patient_id uuid,
  p_tariff_id uuid,
  p_scheduled_at timestamptz default null,
  p_remarks text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_role text; v_name text; v_item record; v_id uuid;
  v_remarks text := nullif(trim(coalesce(p_remarks,'')),'');
begin
  select role,coalesce(nullif(trim(concat_ws(' ',title,full_name)),''),'Nurse') into v_role,v_name
  from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if v_role is distinct from 'Nurse' then
    raise exception 'Only Nurse can raise a Nursing Procedure request.';
  end if;
  if p_patient_id is null then raise exception 'Select a patient.'; end if;

  select id,charge_code,service_name into v_item
  from public.charge_tariff_master
  where id=p_tariff_id and category='Nursing Procedures' and is_active=true;
  if not found then raise exception 'Select a valid, active procedure from the Charge Master list.'; end if;

  if lower(trim(v_item.service_name))='others' and v_remarks is null then
    raise exception 'For "Others", write the procedure name in Remarks.';
  end if;

  insert into public.nursing_procedure_requests(
    patient_id,tariff_id,procedure_code,procedure_name,scheduled_at,remarks,
    status,requested_by,requested_by_name,requested_at)
  values(p_patient_id,v_item.id,v_item.charge_code,v_item.service_name,
    p_scheduled_at,v_remarks,'Requested',auth.uid(),v_name,now())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.request_nursing_procedure_v2(uuid,uuid,timestamptz,text) from public, anon;
grant execute on function public.request_nursing_procedure_v2(uuid,uuid,timestamptz,text) to authenticated;

-- The old request (NP-xxx list) is retired; an old cached screen gets a clear message.
create or replace function public.request_nursing_procedure(
  p_patient_id uuid, p_procedure_id uuid,
  p_scheduled_at timestamptz default null, p_remarks text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
begin
  raise exception 'The Nursing Procedures list has been updated. Please refresh the ERP and raise the request again.';
end; $$;

-- 2. Only the Nursing Procedures workflow may create a "Nursing Procedures" charge.
create or replace function public.guard_nursing_procedure_charges()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.category='Nursing Procedures'
     and (TG_OP='INSERT' or old.category is distinct from new.category)
     and coalesce(current_setting('samara.nursing_procedure_charge',true),'') <> 'on' then
    raise exception 'Nursing Procedures are raised only from NURSING -> Nursing Procedures (request, approval, Confirm & Start).';
  end if;
  return new;
end; $$;
revoke all on function public.guard_nursing_procedure_charges() from public, anon, authenticated;
drop trigger if exists nursing_procedure_charge_guard on public.bill_charge_requests;
create trigger nursing_procedure_charge_guard before insert or update on public.bill_charge_requests
  for each row execute function public.guard_nursing_procedure_charges();

-- Shared: raise the charge for one started request (used by Start and by the repair below).
create or replace function public.raise_nursing_procedure_charge(
  p_request public.nursing_procedure_requests,
  p_actor uuid,
  p_actor_name text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_is_other boolean := lower(trim(coalesce(p_request.procedure_name,'')))='others';
  v_service text; v_charge_id uuid;
begin
  v_service := case when v_is_other then coalesce(left(p_request.remarks,120),'Other Nursing Procedure')
                    else p_request.procedure_name end;
  perform set_config('samara.nursing_procedure_charge','on',true);
  insert into public.bill_charge_requests(
    patient_id,category,service_code,charge_item_code,service_name,description,quantity,unit,
    charge_date,service_datetime,status,approval_status,
    raised_by,raised_by_name,raised_at,bill_available)
  values(
    p_request.patient_id,'Nursing Procedures',
    case when v_is_other then 'OTHER' else upper(regexp_replace(v_service,'[^A-Za-z0-9]+','_','g')) end,
    p_request.procedure_code,v_service,
    concat('Nursing procedure ',coalesce(p_request.procedure_code||' — ',''),v_service,
      ' started by ',coalesce(p_actor_name,'Nurse'),
      case when p_request.remarks is not null and not v_is_other then ' · '||p_request.remarks else '' end),
    1,'Service',
    coalesce((p_request.started_at at time zone 'Asia/Kolkata')::date,(now() at time zone 'Asia/Kolkata')::date),
    coalesce(p_request.started_at,now()),'Raised','Pending',
    p_actor,coalesce(p_actor_name,'Nurse'),coalesce(p_request.started_at,now()),false)
  returning id into v_charge_id;
  perform set_config('samara.nursing_procedure_charge','',true);
  return v_charge_id;
end; $$;
revoke all on function public.raise_nursing_procedure_charge(public.nursing_procedure_requests,uuid,text) from public, anon, authenticated;

-- Nurse confirms and starts an approved procedure -> charge raised for Accounts.
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

  update public.nursing_procedure_requests set
    status='Started',started_by=auth.uid(),started_by_name=v_name,started_at=now(),updated_at=now()
  where id=p_request_id
  returning * into v_request;

  v_charge_id := public.raise_nursing_procedure_charge(v_request,auth.uid(),v_name);

  update public.nursing_procedure_requests set charge_request_id=v_charge_id,updated_at=now()
  where id=p_request_id;

  return jsonb_build_object('success',true,'request_id',p_request_id,'charge_request_id',v_charge_id);
end; $$;
grant execute on function public.start_nursing_procedure(uuid) to authenticated;

-- 3. Repair: started requests whose charge is missing get it raised now.
do $$
declare r public.nursing_procedure_requests%rowtype; v_charge uuid;
begin
  for r in
    select * from public.nursing_procedure_requests q
    where q.status='Started'
      and (q.charge_request_id is null
           or not exists(select 1 from public.bill_charge_requests b where b.id=q.charge_request_id))
    order by q.started_at
  loop
    v_charge := public.raise_nursing_procedure_charge(r,r.started_by,r.started_by_name);
    update public.nursing_procedure_requests set charge_request_id=v_charge,updated_at=now() where id=r.id;
    raise notice 'Charge raised for % (%)', r.procedure_name, r.id;
  end loop;
end $$;

notify pgrst,'reload schema';

-- Result: every started procedure and its charge (all rows should show a charge_status).
select q.procedure_code, q.procedure_name, q.started_by_name, q.started_at,
       b.charge_date, b.status as charge_status, b.approval_status
from public.nursing_procedure_requests q
left join public.bill_charge_requests b on b.id=q.charge_request_id
where q.status='Started'
order by q.started_at desc;
