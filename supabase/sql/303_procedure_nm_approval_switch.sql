-- 303 — Nursing Procedures: "Nursing Manager Approval Needed: Yes / No" per procedure — ERP 2.18.150
-- Owner's rule (26-10-2026): Nursing Manager approval is no longer mandatory for every procedure.
-- Each Charge Master item in an approval-routed category (e.g. Nursing Procedures) gets its own switch.
--   * No  (default, and every existing item now) : the nurse's request is approved automatically — she goes
--          straight to "Confirm & Start", which raises the charge for Accounts as before.
--   * Yes : unchanged — Nursing Manager / Admin approves or declines first.
-- Same page (NURSING → Approval Requests), same start step, same charge. Safe to run more than once.

alter table public.charge_tariff_master add column if not exists requires_nm_approval boolean not null default false;

-- Admin / Director: set the switch for one item.
create or replace function public.set_charge_item_nm_approval(p_tariff_id uuid, p_required boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.charge_tariff_master%rowtype;
begin
  if auth.uid() is null or not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin / Director can change the approval switch'; end if;
  update public.charge_tariff_master set requires_nm_approval=coalesce(p_required,false), updated_at=now() where id=p_tariff_id returning * into t;
  if not found then raise exception 'Charge Master item not found'; end if;
  return jsonb_build_object('id',t.id,'service_name',t.service_name,'requires_nm_approval',t.requires_nm_approval);
end $$;
revoke all on function public.set_charge_item_nm_approval(uuid,boolean) from public,anon;
grant execute on function public.set_charge_item_nm_approval(uuid,boolean) to authenticated;

-- Catalogue for the Approval Requests page now also says whether approval is needed (code and name only, never the tariff).
drop function if exists public.get_approval_catalog();
create function public.get_approval_catalog()
returns table(id uuid, category text, charge_code text, service_name text, display_order integer, requires_nm_approval boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']) then
    raise exception 'Not allowed to view the approval list.';
  end if;
  return query
    select c.id, c.category, c.charge_code, c.service_name, c.display_order, coalesce(c.requires_nm_approval,false)
    from public.charge_tariff_master c
    join public.charge_category_settings s on s.category=c.category and s.requires_approval
    where c.is_active=true
    order by c.category, c.display_order, c.service_name;
end; $$;
revoke all on function public.get_approval_catalog() from public, anon;
grant execute on function public.get_approval_catalog() to authenticated;

-- Nurse raises a request; when the item does not need approval it is approved automatically.
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

  select c.id,c.category,c.charge_code,c.service_name,coalesce(c.requires_nm_approval,false) as needs into v_item
  from public.charge_tariff_master c
  where c.id=p_tariff_id and c.is_active=true
    and public.charge_category_requires_approval(c.category);
  if not found then raise exception 'Select a valid, active item from the approval list.'; end if;

  if lower(trim(v_item.service_name))='others' and v_remarks is null then
    raise exception 'For "Others", write the item name in Remarks.';
  end if;

  insert into public.nursing_procedure_requests(
    patient_id,tariff_id,category,procedure_code,procedure_name,scheduled_at,remarks,
    status,requested_by,requested_by_name,requested_at,
    decision_by_name,decision_at,decision_remarks)
  values(p_patient_id,v_item.id,v_item.category,v_item.charge_code,v_item.service_name,
    p_scheduled_at,v_remarks,
    case when v_item.needs then 'Requested' else 'Approved' end,auth.uid(),v_name,now(),
    case when v_item.needs then null else 'Auto — approval not needed' end,
    case when v_item.needs then null else now() end,
    case when v_item.needs then null else 'Nursing Manager approval is not needed for this item (Charge Master switch).' end)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.request_approval_item(uuid,uuid,timestamptz,text) from public, anon;
grant execute on function public.request_approval_item(uuid,uuid,timestamptz,text) to authenticated;

notify pgrst, 'reload schema';

-- Check: every item now "No"; the functions are in place.
select c.category, count(*) filter (where c.requires_nm_approval) as approval_yes, count(*) filter (where not c.requires_nm_approval) as approval_no
from public.charge_tariff_master c join public.charge_category_settings s on s.category=c.category and s.requires_approval
where c.is_active group by c.category order by 1;
