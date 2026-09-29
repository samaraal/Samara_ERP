-- Samara Care ERP 2.15.3 — delete a WRONGLY ADDED equipment piece / oxygen cylinder.
-- Only the Store In-charge (Nursing Manager) or Admin. Allowed only if the piece / cylinder was NEVER given
-- to a resident (so no charge or clinical history can depend on it). A copy of the deleted record, its
-- movements and the reason are kept in equipment_register_deletions for audit.
-- Safe to run again.
begin;

create table if not exists public.equipment_register_deletions(
  id uuid primary key default gen_random_uuid(),
  register text not null,          -- 'Biomedical Equipment' / 'Oxygen Cylinder'
  item_no text,                    -- BME-0003 / OXD-004
  item_name text,
  record jsonb not null,
  movements jsonb,
  reason text not null,
  deleted_by uuid, deleted_by_name text,
  deleted_at timestamptz not null default now()
);
alter table public.equipment_register_deletions enable row level security;
drop policy if exists equipment_register_deletions_read on public.equipment_register_deletions;
create policy equipment_register_deletions_read on public.equipment_register_deletions for select to authenticated using (true);

create or replace function public.bme_delete(p_equipment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; e public.biomedical_equipment; v_moves jsonb;
begin
  select * into a from public.samara_equipment_actor();
  if not a.is_controller then raise exception 'Only the Store In-charge (Nursing Manager) or Admin can delete equipment.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Please give a reason for deleting.'; end if;
  select * into e from public.biomedical_equipment where id=p_equipment_id for update;
  if not found then raise exception 'Equipment not found (already deleted?).'; end if;
  if e.status='In Use' then raise exception '% is with a resident. Return it first.',e.asset_no; end if;
  if exists(select 1 from public.biomedical_equipment_movements where equipment_id=e.id and (patient_id is not null or action='Issued')) then
    raise exception '% has been issued before, so it cannot be deleted (its history is needed). Use "Out of Service" instead.',e.asset_no;
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.moved_at),'[]'::jsonb) into v_moves from public.biomedical_equipment_movements m where m.equipment_id=e.id;
  insert into public.equipment_register_deletions(register,item_no,item_name,record,movements,reason,deleted_by,deleted_by_name)
  values('Biomedical Equipment',e.asset_no,e.equipment_name,to_jsonb(e),v_moves,trim(p_reason),a.actor_id,a.actor_name);
  delete from public.biomedical_equipment_movements where equipment_id=e.id;
  delete from public.biomedical_equipment where id=e.id;
  return jsonb_build_object('success',true,'asset_no',e.asset_no);
end $$;
grant execute on function public.bme_delete(uuid,text) to authenticated;

create or replace function public.oxy_delete(p_cylinder_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; c public.oxygen_cylinders; v_moves jsonb;
begin
  select * into a from public.samara_equipment_actor();
  if not a.is_controller then raise exception 'Only the Store In-charge (Nursing Manager) or Admin can delete a cylinder.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Please give a reason for deleting.'; end if;
  select * into c from public.oxygen_cylinders where id=p_cylinder_id for update;
  if not found then raise exception 'Cylinder not found (already deleted?).'; end if;
  if c.status='In Use' then raise exception '% is on a resident. Take it off first.',c.cylinder_no; end if;
  if exists(select 1 from public.oxygen_cylinder_movements where cylinder_id=c.id and patient_id is not null) then
    raise exception '% has been used for a resident before, so it cannot be deleted (its history is needed). Use "Out of Service" instead.',c.cylinder_no;
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.moved_at),'[]'::jsonb) into v_moves from public.oxygen_cylinder_movements m where m.cylinder_id=c.id;
  insert into public.equipment_register_deletions(register,item_no,item_name,record,movements,reason,deleted_by,deleted_by_name)
  values('Oxygen Cylinder',c.cylinder_no,c.cylinder_size||' cylinder',to_jsonb(c),v_moves,trim(p_reason),a.actor_id,a.actor_name);
  delete from public.oxygen_cylinder_movements where cylinder_id=c.id;
  delete from public.oxygen_cylinders where id=c.id;
  return jsonb_build_object('success',true,'cylinder_no',c.cylinder_no);
end $$;
grant execute on function public.oxy_delete(uuid,text) to authenticated;

commit;
notify pgrst, 'reload schema';
