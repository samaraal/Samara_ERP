-- Actual resident consumption is independent of charging and central Stores stock.
begin;
create table if not exists public.patient_item_consumption (
 id uuid primary key, indent_id uuid not null references public.patient_consumable_indents(id),
 patient_id uuid not null references public.patients(id), store_item_id uuid not null references public.consumable_store_items(id),
 quantity numeric(12,2) not null check(quantity>0), used_on date not null,
 recorded_by uuid not null references public.profiles(id), recorded_by_name text not null,
 recorded_at timestamptz not null default now(), remarks text,
 voided_at timestamptz, voided_by uuid references public.profiles(id), voided_by_name text, void_reason text
);
create index if not exists patient_item_consumption_indent_idx on public.patient_item_consumption(indent_id);
alter table public.patient_item_consumption enable row level security;
revoke all on public.patient_item_consumption from anon,authenticated;
grant select on public.patient_item_consumption to authenticated;
drop policy if exists patient_item_consumption_read on public.patient_item_consumption;
create policy patient_item_consumption_read on public.patient_item_consumption for select to authenticated using (
 exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)
 and (p.role in ('Nurse','Admin','Manager','Accounts','STD') or public.stores_controller_authorised()))
);
create or replace function public.record_patient_item_consumption(p_entry_id uuid,p_indent_id uuid,p_quantity numeric,p_used_on date,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; v public.patient_consumable_indents%rowtype; prior public.patient_item_consumption%rowtype; used numeric; reserved numeric; available numeric;
begin
 select * into a from public.stores_actor();
 if not exists(select 1 from public.profiles p where p.id=a.actor_id and p.role='Nurse' and coalesce(p.is_active,true)) then raise exception 'Only an active Nurse can record resident item consumption.'; end if;
 if p_entry_id is null or p_quantity is null or p_quantity<=0 or p_quantity<>round(p_quantity,2) or p_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a positive quantity with at most two decimal places.'; end if;
 select * into v from public.patient_consumable_indents where id=p_indent_id for update;
 if not found or v.patient_id is null or v.outside_visit_id is not null or v.status<>'Received' then raise exception 'Select a completed resident Received indent.'; end if;
 select * into prior from public.patient_item_consumption where id=p_entry_id;
 if found then
  if prior.indent_id=p_indent_id and prior.quantity=p_quantity and prior.used_on=p_used_on and prior.recorded_by=a.actor_id and prior.remarks is not distinct from nullif(trim(p_remarks),'') then return jsonb_build_object('success',true,'id',prior.id,'already_saved',true); end if;
  raise exception 'This entry reference was already used. Refresh and retry.';
 end if;
 if p_used_on is null or p_used_on>(now() at time zone 'Asia/Kolkata')::date or p_used_on<(v.received_at at time zone 'Asia/Kolkata')::date then raise exception 'Usage date must be between receipt day and today.'; end if;
 select coalesce(sum(quantity),0) into used from public.patient_item_consumption where indent_id=v.id and voided_at is null;
 select coalesce(sum(quantity),0) into reserved from public.patient_store_returns where indent_id=v.id and status in ('Pending','Confirmed');
 available:=coalesce(v.received_qty,0)-used-reserved;
 if p_quantity>available then raise exception 'Only % % remains available after recorded use and returns.',available,v.unit; end if;
 insert into public.patient_item_consumption(id,indent_id,patient_id,store_item_id,quantity,used_on,recorded_by,recorded_by_name,remarks)
 values(p_entry_id,v.id,v.patient_id,v.store_item_id,p_quantity,p_used_on,a.actor_id,a.actor_name,nullif(trim(p_remarks),''));
 perform public.record_audit_event('Resident item consumption','Patient Consumables',p_entry_id::text,jsonb_build_object('indent_id',v.id,'quantity',p_quantity,'used_on',p_used_on),'Success');
 return jsonb_build_object('success',true,'id',p_entry_id,'available_balance',available-p_quantity);
end $$;
revoke all on function public.record_patient_item_consumption(uuid,uuid,numeric,date,text) from public,anon;
grant execute on function public.record_patient_item_consumption(uuid,uuid,numeric,date,text) to authenticated;
create or replace function public.void_patient_item_consumption(p_entry_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; v public.patient_item_consumption%rowtype;
begin
 select * into a from public.stores_actor();
 select * into v from public.patient_item_consumption where id=p_entry_id;
 if not found then raise exception 'Consumption entry not found.'; end if;
 if not exists(select 1 from public.profiles p where p.id=a.actor_id and coalesce(p.is_active,true) and (p.role='Admin' or (p.role='Nurse' and (v.recorded_by=p.id or public.current_user_is_nurse_manager())))) then raise exception 'Only the recording Nurse, Nursing Manager or Admin may void an entry.'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Enter a correction reason.'; end if;
 perform 1 from public.patient_consumable_indents where id=v.indent_id for update;
 select * into v from public.patient_item_consumption where id=p_entry_id for update;
 if v.voided_at is not null then return jsonb_build_object('success',true,'already_voided',true); end if;
 update public.patient_item_consumption set voided_at=now(),voided_by=a.actor_id,voided_by_name=a.actor_name,void_reason=trim(p_reason) where id=v.id;
 perform public.record_audit_event('Void resident item consumption','Patient Consumables',v.id::text,jsonb_build_object('reason',trim(p_reason),'quantity',v.quantity),'Success');
 return jsonb_build_object('success',true);
end $$;
revoke all on function public.void_patient_item_consumption(uuid,text) from public,anon;
grant execute on function public.void_patient_item_consumption(uuid,text) to authenticated;
-- Every return path shares the same indent lock as consumption, preventing overdraw.
create or replace function public.guard_patient_return_consumption() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare received numeric; used numeric; reserved numeric;
begin
 if new.status not in ('Pending','Confirmed') then return new; end if;
 select received_qty into received from public.patient_consumable_indents where id=new.indent_id for update;
 select coalesce(sum(quantity),0) into used from public.patient_item_consumption where indent_id=new.indent_id and voided_at is null;
 select coalesce(sum(quantity),0) into reserved from public.patient_store_returns where indent_id=new.indent_id and id<>new.id and status in ('Pending','Confirmed');
 if coalesce(received,0)-used-reserved<new.quantity then raise exception 'Return exceeds the patient balance after recorded consumption and other returns.'; end if;
 return new;
end $$;
drop trigger if exists patient_return_consumption_guard on public.patient_store_returns;
create trigger patient_return_consumption_guard before insert or update of status,quantity,indent_id on public.patient_store_returns for each row execute function public.guard_patient_return_consumption();
create or replace function public.request_patient_store_return(p_indent_id uuid,p_quantity numeric,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.patient_consumable_indents%rowtype; a record; used numeric; reserved numeric; available numeric; new_id uuid;
begin
 select * into a from public.stores_actor();
 if not exists(select 1 from public.profiles p where p.id=a.actor_id and p.role='Nurse' and coalesce(p.is_active,true)) then raise exception 'Only an active Nurse can initiate an unused patient-stock return.'; end if;
 select * into v from public.patient_consumable_indents where id=p_indent_id for update;
 if not found or v.status<>'Received' or v.outside_visit_id is not null then raise exception 'Only a completed resident Received indent can be returned.'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity<>round(p_quantity,2) or p_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid return quantity.'; end if;
 select coalesce(sum(quantity),0) into used from public.patient_item_consumption where indent_id=v.id and voided_at is null;
 select coalesce(sum(quantity),0) into reserved from public.patient_store_returns where indent_id=v.id and status in ('Pending','Confirmed');
 available:=coalesce(v.received_qty,0)-used-reserved;
 if p_quantity>available then raise exception 'Only % % remains unused and available to return.',available,v.unit; end if;
 insert into public.patient_store_returns(indent_id,patient_id,store_item_id,item_name,unit,quantity,requested_by,requested_by_name,request_remarks)
 values(v.id,v.patient_id,v.store_item_id,v.item_name,v.unit,p_quantity,a.actor_id,a.actor_name,nullif(trim(p_remarks),'')) returning id into new_id;
 return jsonb_build_object('success',true,'return_id',new_id,'quantity',p_quantity,'remaining_balance',available-p_quantity);
end $$;
revoke all on function public.request_patient_store_return(uuid,numeric,text) from public,anon;
grant execute on function public.request_patient_store_return(uuid,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
