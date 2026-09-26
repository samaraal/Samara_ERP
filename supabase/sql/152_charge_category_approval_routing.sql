-- Samara Care ERP 2.14.61
-- Charge Master approval routing (builds on 151).
--   * Admin can switch ON "Needs Nursing Manager approval" for any non-stock
--     Charge Master category (Nursing Procedures is ON by default).
--   * Items in an approval category are raised ONLY from the
--     "Approval Requests" page: Nurse requests -> Admin / Nursing Manager
--     approves or declines -> Nurse confirms & starts -> the charge is raised
--     for Accounts automatically. This applies to everyone: such charges
--     cannot be raised directly from Bills & Charges.
--   * Every other Charge Master category is raised from Bills & Charges as
--     before (nurses included).
-- Run 151 first (if not already run), then this file. Safe to re-run.

-- 1. Category setting, maintained by Admin from Charge Master.
create table if not exists public.charge_category_settings (
  category text primary key,
  requires_approval boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint charge_category_settings_not_stock
    check (requires_approval = false or category not in ('Consumables','Pharmacy','Pharmacy & Basic Supplies'))
);
alter table public.charge_category_settings enable row level security;
drop policy if exists charge_category_settings_select on public.charge_category_settings;
create policy charge_category_settings_select on public.charge_category_settings
  for select to authenticated using (true);
drop policy if exists charge_category_settings_admin_write on public.charge_category_settings;
create policy charge_category_settings_admin_write on public.charge_category_settings
  for all to authenticated
  using (public.current_user_has_role(array['Admin']))
  with check (public.current_user_has_role(array['Admin']));

insert into public.charge_category_settings(category,requires_approval)
values ('Nursing Procedures',true)
on conflict (category) do nothing;

create or replace function public.charge_category_requires_approval(p_category text)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select s.requires_approval from public.charge_category_settings s
                   where s.category=trim(coalesce(p_category,''))),false);
$$;
grant execute on function public.charge_category_requires_approval(text) to authenticated;

-- 2. Requests remember their Charge Master category.
alter table public.nursing_procedure_requests add column if not exists category text;
update public.nursing_procedure_requests set category='Nursing Procedures' where category is null;
alter table public.nursing_procedure_requests alter column category set default 'Nursing Procedures';

-- Catalogue for the Approval Requests page: code and name only, never the tariff.
create or replace function public.get_approval_catalog()
returns table(id uuid, category text, charge_code text, service_name text, display_order integer)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']) then
    raise exception 'Not allowed to view the approval list.';
  end if;
  return query
    select c.id, c.category, c.charge_code, c.service_name, c.display_order
    from public.charge_tariff_master c
    join public.charge_category_settings s on s.category=c.category and s.requires_approval
    where c.is_active=true
    order by c.category, c.display_order, c.service_name;
end; $$;
revoke all on function public.get_approval_catalog() from public, anon;
grant execute on function public.get_approval_catalog() to authenticated;

-- Nurse raises a request for any item in an approval category.
create or replace function public.request_approval_item(
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
    raise exception 'Only Nurse can raise an approval request.';
  end if;
  if p_patient_id is null then raise exception 'Select a patient.'; end if;

  select c.id,c.category,c.charge_code,c.service_name into v_item
  from public.charge_tariff_master c
  where c.id=p_tariff_id and c.is_active=true
    and public.charge_category_requires_approval(c.category);
  if not found then raise exception 'Select a valid, active item from the approval list.'; end if;

  if lower(trim(v_item.service_name))='others' and v_remarks is null then
    raise exception 'For "Others", write the item name in Remarks.';
  end if;

  insert into public.nursing_procedure_requests(
    patient_id,tariff_id,category,procedure_code,procedure_name,scheduled_at,remarks,
    status,requested_by,requested_by_name,requested_at)
  values(p_patient_id,v_item.id,v_item.category,v_item.charge_code,v_item.service_name,
    p_scheduled_at,v_remarks,'Requested',auth.uid(),v_name,now())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.request_approval_item(uuid,uuid,timestamptz,text) from public, anon;
grant execute on function public.request_approval_item(uuid,uuid,timestamptz,text) to authenticated;

-- Older 2.14.60 screens keep working through the new function.
create or replace function public.request_nursing_procedure_v2(
  p_patient_id uuid, p_tariff_id uuid,
  p_scheduled_at timestamptz default null, p_remarks text default null
) returns uuid
language sql security definer set search_path=public as $$
  select public.request_approval_item(p_patient_id,p_tariff_id,p_scheduled_at,p_remarks);
$$;

-- 3. Guard: a charge in an approval category comes only from Confirm & Start.
create or replace function public.guard_nursing_procedure_charges()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if public.charge_category_requires_approval(new.category)
     and (TG_OP='INSERT' or old.category is distinct from new.category)
     and coalesce(current_setting('samara.nursing_procedure_charge',true),'') <> 'on' then
    raise exception '% items need Nursing Manager approval. Raise them from NURSING -> Approval Requests (request, approval, Confirm & Start).', new.category;
  end if;
  return new;
end; $$;
revoke all on function public.guard_nursing_procedure_charges() from public, anon, authenticated;
drop trigger if exists nursing_procedure_charge_guard on public.bill_charge_requests;
create trigger nursing_procedure_charge_guard before insert or update on public.bill_charge_requests
  for each row execute function public.guard_nursing_procedure_charges();

-- 4. The charge raised on Confirm & Start uses the request's own category.
create or replace function public.raise_nursing_procedure_charge(
  p_request public.nursing_procedure_requests,
  p_actor uuid,
  p_actor_name text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_category text := coalesce(nullif(trim(p_request.category),''),'Nursing Procedures');
  v_is_other boolean := lower(trim(coalesce(p_request.procedure_name,'')))='others';
  v_service text; v_charge_id uuid;
begin
  v_service := case when v_is_other then coalesce(left(p_request.remarks,120),'Other '||v_category)
                    else p_request.procedure_name end;
  perform set_config('samara.nursing_procedure_charge','on',true);
  insert into public.bill_charge_requests(
    patient_id,category,service_code,charge_item_code,service_name,description,quantity,unit,
    charge_date,service_datetime,status,approval_status,
    raised_by,raised_by_name,raised_at,bill_available)
  values(
    p_request.patient_id,v_category,
    case when v_is_other then 'OTHER' else upper(regexp_replace(v_service,'[^A-Za-z0-9]+','_','g')) end,
    p_request.procedure_code,v_service,
    concat(v_category,' ',coalesce(p_request.procedure_code||' — ',''),v_service,
      ' · approved and started by ',coalesce(p_actor_name,'Nurse'),
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

notify pgrst,'reload schema';

-- Result: which categories currently need approval.
select category, requires_approval from public.charge_category_settings order by category;
