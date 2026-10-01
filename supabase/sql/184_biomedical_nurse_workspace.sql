-- ERP 2.15.46. Apply after 183, before deploying the matching frontend.
-- Clinical equipment reads exclude procurement and maintenance administration.
begin;
create or replace function public.bme_access()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles; a record; n integer;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select count(*) into n from public.profiles where id=auth.uid() or auth_user_id=auth.uid();
 if n<>1 then raise exception 'Staff identity could not be verified';end if;
 select * into p from public.profiles where id=auth.uid() or auth_user_id=auth.uid();
 if not coalesce(p.active,true) or not coalesce(p.is_active,true) then raise exception 'Active staff required';end if;
 select * into a from public.samara_equipment_actor();
 return jsonb_build_object('version',1,'actor',p.id,'name',p.full_name,
 'controller',coalesce(a.is_controller,false),'nurse',coalesce(a.actor_role='Nurse',false),
 'clinical',coalesce(a.is_controller,false) or coalesce(a.actor_role in ('Admin','Manager','Nurse','Accounts','STD','Caregiver','Kitchen'),false));
end $$;
revoke all on function public.bme_access() from public,anon;
grant execute on function public.bme_access() to authenticated;

-- Remove broad raw-table visibility; checked RPCs serve the clinical projection below.
do $$ declare t text;
begin
 foreach t in array array['biomedical_equipment','biomedical_equipment_movements','biomedical_equipment_items','biomedical_equipment_purchases'] loop
  execute format('drop policy if exists bme_admin_scope on public.%I',t);
  execute format('create policy bme_admin_scope on public.%I as restrictive for all to authenticated using (coalesce((public.bme_access()->>''controller'')::boolean,false)) with check (false)',t);
  execute format('revoke insert,update,delete,truncate,references,trigger on public.%I from anon,authenticated',t);
 end loop;
end $$;
drop policy if exists bme_deleted_scope on public.equipment_register_deletions;
create policy bme_deleted_scope on public.equipment_register_deletions as restrictive for select to authenticated
 using (register<>'Biomedical Equipment' or coalesce((public.bme_access()->>'controller')::boolean,false));

create table if not exists public.bme_care_requests(
 id uuid primary key, kind text not null check(kind in ('Equipment','Fault')),
 equipment_id uuid references public.biomedical_equipment(id),
 patient_id uuid references public.patients(id), item_name text not null,
 details text not null, requested_by uuid not null references public.profiles(id), requested_by_name text not null,
 requested_at timestamptz not null default now(), status text not null default 'Pending' check(status in ('Pending','Resolved')),
 resolved_by uuid references public.profiles(id),resolved_by_name text,resolved_at timestamptz,resolution text
);
alter table public.bme_care_requests enable row level security;
revoke all on public.bme_care_requests from public,anon,authenticated;
grant all on public.bme_care_requests to service_role;

create or replace function public.bme_clinical_equipment()
returns table(id uuid,asset_no text,equipment_name text,charge_code text,charge_service_name text,status text,current_patient_id uuid,issued_at timestamptz,current_location text,serial_no text,fault_reported boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not coalesce((public.bme_access()->>'clinical')::boolean,false) then raise exception 'Clinical equipment access required';end if;
 return query select e.id,e.asset_no,e.equipment_name,e.charge_code,e.charge_service_name,e.status,e.current_patient_id,e.issued_at,e.current_location,e.serial_no,exists(select 1 from public.bme_care_requests r where r.equipment_id=e.id and r.kind='Fault' and r.status='Pending') from public.biomedical_equipment e order by e.asset_no;
end $$;
create or replace function public.bme_clinical_movements()
returns table(id uuid,equipment_id uuid,patient_id uuid,action text,moved_at timestamptz,actor_name text,location text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not coalesce((public.bme_access()->>'clinical')::boolean,false) then raise exception 'Clinical equipment access required';end if;
 return query select m.id,m.equipment_id,m.patient_id,m.action,m.moved_at,m.actor_name,m.location from public.biomedical_equipment_movements m
 where m.action in ('Issued','Returned') order by m.moved_at;
end $$;
create or replace function public.bme_care_requests_list()
returns setof public.bme_care_requests language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.bme_access();
begin
 if not (coalesce((a->>'controller')::boolean,false) or coalesce((a->>'nurse')::boolean,false)) then raise exception 'Nursing or Stores access required';end if;
 return query select r.* from public.bme_care_requests r where (a->>'controller')::boolean or r.requested_by=(a->>'actor')::uuid order by r.requested_at desc;
end $$;
create or replace function public.bme_care_request(p_id uuid,p_kind text,p_equipment_id uuid,p_patient_id uuid,p_item_name text,p_details text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.bme_access(); e public.biomedical_equipment; old public.bme_care_requests; item text:=trim(coalesce(p_item_name,''));
begin
 if not (coalesce((a->>'controller')::boolean,false) or coalesce((a->>'nurse')::boolean,false)) then raise exception 'Nursing or Stores access required';end if;
 if p_id is null or p_kind is null or p_kind not in ('Equipment','Fault') or length(trim(coalesce(p_details,'')))<3 or length(p_details)>2000 then raise exception 'Request type and details (3–2000 characters) required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_equipment_id is not null then
  select * into e from public.biomedical_equipment where id=p_equipment_id for update;
  if not found then raise exception 'Equipment not found';end if;
  item:=e.equipment_name;
 elsif p_kind='Fault' then raise exception 'Select the faulty equipment';end if;
 select * into old from public.bme_care_requests where id=p_id;
 if found then
  if old.requested_by<>(a->>'actor')::uuid or old.kind<>p_kind or old.equipment_id is distinct from p_equipment_id or old.patient_id is distinct from p_patient_id or old.item_name<>item or old.details<>trim(p_details) then raise exception 'Request ID already used';end if;
  return old.id;
 end if;
 if length(item)<2 or length(item)>200 then raise exception 'Enter the equipment needed';end if;
 if p_patient_id is not null and not exists(select 1 from public.patients where id=p_patient_id and is_active=true) then raise exception 'Select an active resident';end if;
 insert into public.bme_care_requests(id,kind,equipment_id,patient_id,item_name,details,requested_by,requested_by_name)
 values(p_id,p_kind,p_equipment_id,p_patient_id,item,trim(p_details),(a->>'actor')::uuid,a->>'name');
 return p_id;
end $$;
create or replace function public.bme_care_resolve(p_id uuid,p_resolution text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.bme_access(); r public.bme_care_requests;
begin
 if not coalesce((a->>'controller')::boolean,false) then raise exception 'Store In-charge or Admin required';end if;
 if length(trim(coalesce(p_resolution,'')))<3 then raise exception 'Record the action taken';end if;
 select * into r from public.bme_care_requests where id=p_id for update;
 if not found then raise exception 'Request not found';end if;
 if r.status='Resolved' then raise exception 'Request already resolved';end if;
 update public.bme_care_requests set status='Resolved',resolved_by=(a->>'actor')::uuid,resolved_by_name=a->>'name',resolved_at=now(),resolution=trim(p_resolution) where id=p_id;
end $$;

-- Defence in depth on all existing biomedical write RPCs. Oxygen permissions stay unchanged.
do $$ declare r record; definition text;
begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('bme_add','bme_issue','bme_set_status','bme_delete','bme_item_save','bme_item_delete','bme_receive','bme_return') loop
  definition:=pg_get_functiondef(r.oid);
  if position('bme_access()' in definition)=0 then
   if position('bme_return(' in definition)>0 then
    definition:=regexp_replace(definition,'\mBEGIN\M|\mbegin\M',E'begin\n if not (coalesce((public.bme_access()->>''controller'')::boolean,false) or coalesce((public.bme_access()->>''nurse'')::boolean,false)) then raise exception ''Nursing or Stores access required'';end if;');
   else
    definition:=regexp_replace(definition,'\mBEGIN\M|\mbegin\M',E'begin\n if not coalesce((public.bme_access()->>''controller'')::boolean,false) then raise exception ''Store In-charge or Admin required'';end if;');
   end if;
   -- An unresolved fault prevents re-issue, including after a nurse returns a piece.
   if position('bme_issue(' in definition)>0 then
    definition:=replace(definition,'if e.status<>''Available'' then',E'if exists(select 1 from public.bme_care_requests where equipment_id=e.id and kind=''Fault'' and status=''Pending'') then raise exception ''Resolve the reported fault before issuing this equipment'';end if;\n  if e.status<>''Available'' then');
   end if;
   execute definition;
  end if;
  execute format('revoke all on function %s from public,anon',r.oid::regprocedure);
  execute format('grant execute on function %s to authenticated',r.oid::regprocedure);
 end loop;
end $$;
revoke all on function public.bme_clinical_equipment(),public.bme_clinical_movements(),public.bme_care_requests_list(),public.bme_care_request(uuid,text,uuid,uuid,text,text),public.bme_care_resolve(uuid,text) from public,anon;
grant execute on function public.bme_clinical_equipment(),public.bme_clinical_movements(),public.bme_care_requests_list(),public.bme_care_request(uuid,text,uuid,uuid,text,text),public.bme_care_resolve(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
