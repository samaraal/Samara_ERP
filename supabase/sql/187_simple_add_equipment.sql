-- ERP 2.15.52: one equipment receiving form; Admin owns resident billing.
-- Run after SQL 186. Existing equipment, billing links and history are preserved.
begin;

-- Extend the installed function without dropping the access guards added by SQL 184.
do $$ declare definition text;
begin
 definition:=pg_get_functiondef('public.bme_item_save(uuid,text,text,text,text,boolean)'::regprocedure);
 if position('Only Admin can change equipment billing links' in definition)=0 then
  if position('if not a.is_controller then' in definition)=0 then raise exception 'Unexpected bme_item_save definition; review before installing';end if;
  definition:=replace(definition,'if not a.is_controller then', $guard$
  if p_id is not null then perform 1 from public.biomedical_equipment_items where id=p_id for update;end if;
  if a.actor_role is distinct from 'Admin' and (
    (p_id is null and (nullif(trim(coalesce(p_charge_code,'')),'') is not null or nullif(trim(coalesce(p_charge_service_name,'')),'') is not null))
    or (p_id is not null and exists(select 1 from public.biomedical_equipment_items i where i.id=p_id and
      (i.charge_code is distinct from nullif(trim(coalesce(p_charge_code,'')),'') or
       i.charge_service_name is distinct from nullif(trim(coalesce(p_charge_service_name,'')),''))))
  ) then raise exception 'Only Admin can change equipment billing links';end if;
  if not a.is_controller then$guard$);
  execute definition;
 end if;
end $$;

create table if not exists public.bme_receive_operations(
 id uuid primary key, actor uuid not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.bme_receive_operations enable row level security;
revoke all on public.bme_receive_operations from public,anon,authenticated;

create or replace function public.bme_receive_equipment(p_operation_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; previous public.bme_receive_operations; item public.biomedical_equipment_items;
 item_id uuid; v_name text; created jsonb; received jsonb; result jsonb; serials text[];
begin
 select * into a from public.samara_equipment_actor();
 if not coalesce(a.is_controller,false) or not coalesce((public.bme_access()->>'controller')::boolean,false) then
  raise exception 'Store In-charge or Admin required';end if;
 if p_operation_id is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Operation ID and equipment details required';end if;
 perform pg_advisory_xact_lock(hashtextextended('bme-receive:'||p_operation_id::text,0));
 select * into previous from public.bme_receive_operations where id=p_operation_id;
 if found then
  if previous.actor is distinct from a.actor_id or previous.payload is distinct from p_data then raise exception 'Operation ID already used';end if;
  return previous.result;
 end if;
 item_id:=nullif(p_data->>'item_id','')::uuid;
 if item_id is null then
  v_name:=regexp_replace(trim(coalesce(p_data->>'item_name','')),'\s+',' ','g');
  if v_name='' then raise exception 'Equipment name is required';end if;
  perform pg_advisory_xact_lock(hashtextextended('bme-name:'||lower(v_name),0));
  select * into item from public.biomedical_equipment_items where lower(trim(biomedical_equipment_items.item_name))=lower(v_name) for update;
  if not found then
   created:=public.bme_item_save(null,v_name,null,null,null,true);
   select * into item from public.biomedical_equipment_items where id=(created->>'id')::uuid for update;
  end if;
 else
  select * into item from public.biomedical_equipment_items where id=item_id for update;
  if not found then raise exception 'Equipment type not found; refresh and select again';end if;
 end if;
 if p_data ? 'serials' then
  if jsonb_typeof(p_data->'serials')<>'array' then raise exception 'Serial numbers must be a list';end if;
  select array_agg(trim(value)) into serials from jsonb_array_elements_text(p_data->'serials') where trim(value)<>'';
 end if;
 received:=public.bme_receive(item.id,p_data->>'source',(p_data->>'quantity')::integer,
   p_data->>'vendor_name',p_data->>'bill_no',nullif(p_data->>'bill_date','')::date,
   nullif(p_data->>'unit_cost','')::numeric,nullif(p_data->>'warranty_until','')::date,serials,
   nullif(p_data->>'next_service_due','')::date,p_data->>'location',p_data->>'remarks');
 result:=received||jsonb_build_object('item',to_jsonb(item));
 insert into public.bme_receive_operations(id,actor,payload,result) values(p_operation_id,a.actor_id,p_data,result);
 return result;
end $$;
revoke all on function public.bme_receive_equipment(uuid,jsonb) from public,anon;
grant execute on function public.bme_receive_equipment(uuid,jsonb) to authenticated;
commit;
notify pgrst,'reload schema';
