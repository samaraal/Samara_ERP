-- Samara Care ERP 2.14.95 — Biomedical Equipment register + Oxygen Cylinders register
-- New tables only (nothing existing is changed except the Accounts approval rule in part 4).
-- Safe to run again.
--
--  1. Biomedical Equipment: every physical piece (asset no. BME-0001…), linked to its Charge Master
--     "Biomedical Equipment" item (BIO- code). Issue to a resident / room → return; repair / service;
--     service due date. Full movement history.
--  2. Oxygen Cylinders: B-type and D-type (OXB-001…, OXD-001…). Full → In use (resident / room) →
--     Empty → At refill → Full. Full movement history. Tracking only — oxygen is still charged through
--     Approval Requests (Oxygen Therapy – B/D-type – 6/12/24 Hours), as before.
--  3. Who: the Store In-charge (Nursing Manager) / Admin issue, add, repair, send for refill. Nurses on
--     duty can return equipment and put on / take off a cylinder (night swaps).
--  4. Accounts approval: a Biomedical Equipment charge = Charge Master rate × quantity (days), so a
--     10-day rental approves at 10 × the daily rate (was always 1 × rate).
begin;

-- helpers ---------------------------------------------------------------------------------------
create or replace function public.samara_equipment_actor()
returns table(actor_id uuid, actor_name text, actor_role text, is_controller boolean)
language plpgsql stable security definer set search_path to 'public' as $$
declare a record;
begin
  select * into a from public.consumables_actor();
  return query select a.actor_id, a.actor_name, a.actor_role,
    (coalesce(public.stores_controller_authorised(),false) or a.actor_role='Admin');
end $$;

-- 1. Biomedical Equipment -------------------------------------------------------------------------
create sequence if not exists public.samara_bme_asset_seq;
create table if not exists public.biomedical_equipment(
  id uuid primary key default gen_random_uuid(),
  asset_no text unique,
  equipment_name text not null,
  charge_code text,              -- Charge Master Biomedical Equipment code (BIO-xxxx)
  charge_service_name text,      -- Charge Master service name (same item everywhere)
  serial_no text,
  status text not null default 'Available' check (status in ('Available','In Use','Under Repair','Out of Service')),
  current_patient_id uuid references public.patients(id),
  current_location text,
  issued_at timestamptz,
  next_service_due date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.biomedical_equipment_movements(
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.biomedical_equipment(id),
  action text not null,
  patient_id uuid references public.patients(id),
  location text,
  remarks text,
  actor_id uuid, actor_name text,
  moved_at timestamptz not null default now()
);
create index if not exists biomedical_equipment_movements_eq on public.biomedical_equipment_movements(equipment_id,moved_at desc);

create or replace function public.bme_assign_asset_no() returns trigger language plpgsql as $$
begin
  if nullif(trim(new.asset_no),'') is null then
    new.asset_no := 'BME-'||lpad(nextval('public.samara_bme_asset_seq')::text,4,'0');
  end if;
  return new;
end $$;
drop trigger if exists trg_bme_asset_no on public.biomedical_equipment;
create trigger trg_bme_asset_no before insert on public.biomedical_equipment for each row execute function public.bme_assign_asset_no();

alter table public.biomedical_equipment enable row level security;
alter table public.biomedical_equipment_movements enable row level security;
drop policy if exists bme_read on public.biomedical_equipment;
create policy bme_read on public.biomedical_equipment for select to authenticated using (true);
drop policy if exists bme_mov_read on public.biomedical_equipment_movements;
create policy bme_mov_read on public.biomedical_equipment_movements for select to authenticated using (true);

create or replace function public.bme_add(p_equipment_name text, p_charge_code text, p_charge_service_name text,
  p_serial_no text default null, p_next_service_due date default null, p_notes text default null, p_location text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare a record; v_id uuid;
begin
  select * into a from public.samara_equipment_actor();
  if not a.is_controller then raise exception 'Only the Store In-charge (Nursing Manager) or Admin can add equipment.'; end if;
  if nullif(trim(coalesce(p_equipment_name,'')),'') is null then raise exception 'Equipment name is required.'; end if;
  insert into public.biomedical_equipment(equipment_name,charge_code,charge_service_name,serial_no,next_service_due,notes,current_location)
  values(trim(p_equipment_name),nullif(trim(coalesce(p_charge_code,'')),''),nullif(trim(coalesce(p_charge_service_name,'')),''),
         nullif(trim(coalesce(p_serial_no,'')),''),p_next_service_due,nullif(trim(coalesce(p_notes,'')),''),coalesce(nullif(trim(coalesce(p_location,'')),''),'Stores'))
  returning id into v_id;
  insert into public.biomedical_equipment_movements(equipment_id,action,location,remarks,actor_id,actor_name)
  values(v_id,'Added to register',coalesce(nullif(trim(coalesce(p_location,'')),''),'Stores'),nullif(trim(coalesce(p_notes,'')),''),a.actor_id,a.actor_name);
  return v_id;
end $$;

create or replace function public.bme_issue(p_equipment_id uuid, p_patient_id uuid, p_location text default null, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; e public.biomedical_equipment; v_loc text;
begin
  select * into a from public.samara_equipment_actor();
  if not a.is_controller then raise exception 'Only the Store In-charge (Nursing Manager) or Admin can issue equipment.'; end if;
  select * into e from public.biomedical_equipment where id=p_equipment_id for update;
  if not found then raise exception 'Equipment not found.'; end if;
  if e.status<>'Available' then raise exception '% is %; only Available equipment can be issued.',e.equipment_name,e.status; end if;
  if p_patient_id is null and nullif(trim(coalesce(p_location,'')),'') is null then raise exception 'Select the resident or enter the room / location.'; end if;
  v_loc := coalesce(nullif(trim(coalesce(p_location,'')),''),(select concat_ws(' / ',nullif(room_no,''),nullif(bed_no,'')) from public.patients where id=p_patient_id));
  update public.biomedical_equipment set status='In Use',current_patient_id=p_patient_id,current_location=v_loc,issued_at=now(),updated_at=now() where id=e.id;
  insert into public.biomedical_equipment_movements(equipment_id,action,patient_id,location,remarks,actor_id,actor_name)
  values(e.id,'Issued',p_patient_id,v_loc,nullif(trim(coalesce(p_remarks,'')),''),a.actor_id,a.actor_name);
  return jsonb_build_object('success',true);
end $$;

create or replace function public.bme_return(p_equipment_id uuid, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; e public.biomedical_equipment;
begin
  select * into a from public.samara_equipment_actor();
  if not (a.is_controller or a.actor_role='Nurse') then raise exception 'Only Nursing or the Store In-charge can return equipment.'; end if;
  select * into e from public.biomedical_equipment where id=p_equipment_id for update;
  if not found then raise exception 'Equipment not found.'; end if;
  if e.status<>'In Use' then raise exception '% is not in use.',e.equipment_name; end if;
  insert into public.biomedical_equipment_movements(equipment_id,action,patient_id,location,remarks,actor_id,actor_name)
  values(e.id,'Returned',e.current_patient_id,e.current_location,
    concat_ws(' · ','In use '||greatest(1,ceil(extract(epoch from (now()-coalesce(e.issued_at,now())))/86400.0))::int||' day(s)',nullif(trim(coalesce(p_remarks,'')),'')),
    a.actor_id,a.actor_name);
  update public.biomedical_equipment set status='Available',current_patient_id=null,current_location='Stores',issued_at=null,updated_at=now() where id=e.id;
  return jsonb_build_object('success',true);
end $$;

create or replace function public.bme_set_status(p_equipment_id uuid, p_status text, p_next_service_due date default null, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; e public.biomedical_equipment; v_action text;
begin
  select * into a from public.samara_equipment_actor();
  if not a.is_controller then raise exception 'Only the Store In-charge (Nursing Manager) or Admin can change equipment status.'; end if;
  if p_status not in ('Available','Under Repair','Out of Service','Serviced') then raise exception 'Invalid status.'; end if;
  select * into e from public.biomedical_equipment where id=p_equipment_id for update;
  if not found then raise exception 'Equipment not found.'; end if;
  if e.status='In Use' then raise exception 'Return % from the resident first.',e.equipment_name; end if;
  v_action := case p_status when 'Under Repair' then 'Sent for repair' when 'Out of Service' then 'Out of service'
                            when 'Serviced' then 'Serviced' else 'Back in service' end;
  update public.biomedical_equipment
     set status=case when p_status='Serviced' then 'Available' else p_status end,
         next_service_due=coalesce(p_next_service_due,next_service_due),
         active=(p_status<>'Out of Service'), updated_at=now()
   where id=e.id;
  insert into public.biomedical_equipment_movements(equipment_id,action,location,remarks,actor_id,actor_name)
  values(e.id,v_action,e.current_location,concat_ws(' · ',case when p_next_service_due is not null then 'Next service '||to_char(p_next_service_due,'DD-MM-YYYY') end,nullif(trim(coalesce(p_remarks,'')),'')),a.actor_id,a.actor_name);
  return jsonb_build_object('success',true);
end $$;

-- 2. Oxygen Cylinders -----------------------------------------------------------------------------
create sequence if not exists public.samara_oxb_seq;
create sequence if not exists public.samara_oxd_seq;
create table if not exists public.oxygen_cylinders(
  id uuid primary key default gen_random_uuid(),
  cylinder_no text unique,
  cylinder_size text not null check (cylinder_size in ('B-type','D-type')),
  serial_no text,
  status text not null default 'Full' check (status in ('Full','In Use','Empty','At Refill','Out of Service')),
  current_patient_id uuid references public.patients(id),
  current_location text,
  status_since timestamptz not null default now(),
  refill_vendor text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.oxygen_cylinder_movements(
  id uuid primary key default gen_random_uuid(),
  cylinder_id uuid not null references public.oxygen_cylinders(id),
  action text not null,
  patient_id uuid references public.patients(id),
  location text,
  vendor text,
  remarks text,
  actor_id uuid, actor_name text,
  moved_at timestamptz not null default now()
);
create index if not exists oxygen_cylinder_movements_cyl on public.oxygen_cylinder_movements(cylinder_id,moved_at desc);

create or replace function public.oxy_assign_cylinder_no() returns trigger language plpgsql as $$
begin
  if nullif(trim(new.cylinder_no),'') is null then
    new.cylinder_no := case when new.cylinder_size='B-type' then 'OXB-'||lpad(nextval('public.samara_oxb_seq')::text,3,'0')
                            else 'OXD-'||lpad(nextval('public.samara_oxd_seq')::text,3,'0') end;
  end if;
  return new;
end $$;
drop trigger if exists trg_oxy_cylinder_no on public.oxygen_cylinders;
create trigger trg_oxy_cylinder_no before insert on public.oxygen_cylinders for each row execute function public.oxy_assign_cylinder_no();

alter table public.oxygen_cylinders enable row level security;
alter table public.oxygen_cylinder_movements enable row level security;
drop policy if exists oxy_read on public.oxygen_cylinders;
create policy oxy_read on public.oxygen_cylinders for select to authenticated using (true);
drop policy if exists oxy_mov_read on public.oxygen_cylinder_movements;
create policy oxy_mov_read on public.oxygen_cylinder_movements for select to authenticated using (true);

create or replace function public.oxy_add(p_size text, p_status text default 'Full', p_serial_no text default null, p_vendor text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare a record; v_id uuid;
begin
  select * into a from public.samara_equipment_actor();
  if not a.is_controller then raise exception 'Only the Store In-charge (Nursing Manager) or Admin can add cylinders.'; end if;
  if p_size not in ('B-type','D-type') then raise exception 'Select B-type or D-type.'; end if;
  if coalesce(p_status,'Full') not in ('Full','Empty') then raise exception 'A new cylinder is added as Full or Empty.'; end if;
  insert into public.oxygen_cylinders(cylinder_size,status,serial_no,refill_vendor,notes,current_location)
  values(p_size,coalesce(p_status,'Full'),nullif(trim(coalesce(p_serial_no,'')),''),nullif(trim(coalesce(p_vendor,'')),''),nullif(trim(coalesce(p_notes,'')),''),'Stores')
  returning id into v_id;
  insert into public.oxygen_cylinder_movements(cylinder_id,action,location,vendor,remarks,actor_id,actor_name)
  values(v_id,'Added to register ('||coalesce(p_status,'Full')||')','Stores',nullif(trim(coalesce(p_vendor,'')),''),nullif(trim(coalesce(p_notes,'')),''),a.actor_id,a.actor_name);
  return v_id;
end $$;

-- action: 'put_on' (Full → In Use), 'take_off_empty' (In Use → Empty), 'take_off_unused' (In Use → Full),
--         'send_refill' (Empty → At Refill), 'receive_full' (At Refill → Full), 'out_of_service', 'back_in_service'
create or replace function public.oxy_move(p_cylinder_id uuid, p_action text, p_patient_id uuid default null,
  p_location text default null, p_vendor text default null, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; c public.oxygen_cylinders; v_new text; v_label text; v_loc text; v_nurse_ok boolean;
begin
  select * into a from public.samara_equipment_actor();
  select * into c from public.oxygen_cylinders where id=p_cylinder_id for update;
  if not found then raise exception 'Cylinder not found.'; end if;
  v_nurse_ok := p_action in ('put_on','take_off_empty','take_off_unused');
  if not (a.is_controller or (v_nurse_ok and a.actor_role='Nurse')) then
    raise exception 'This cylinder action is for the Store In-charge (Nursing Manager) or Admin.';
  end if;
  if p_action='put_on' then
    if c.status<>'Full' then raise exception 'Only a Full cylinder can be put on a resident (% is %).',c.cylinder_no,c.status; end if;
    if p_patient_id is null then raise exception 'Select the resident.'; end if;
    v_loc := coalesce(nullif(trim(coalesce(p_location,'')),''),(select concat_ws(' / ',nullif(room_no,''),nullif(bed_no,'')) from public.patients where id=p_patient_id));
    v_new := 'In Use'; v_label := 'Put on resident';
  elsif p_action in ('take_off_empty','take_off_unused') then
    if c.status<>'In Use' then raise exception '% is not in use.',c.cylinder_no; end if;
    v_new := case when p_action='take_off_empty' then 'Empty' else 'Full' end;
    v_label := case when p_action='take_off_empty' then 'Taken off — empty' else 'Taken off — still full' end;
    v_loc := 'Stores';
  elsif p_action='send_refill' then
    if c.status<>'Empty' then raise exception 'Only an Empty cylinder can be sent for refill.'; end if;
    v_new := 'At Refill'; v_label := 'Sent for refill'; v_loc := coalesce(nullif(trim(coalesce(p_vendor,'')),''),c.refill_vendor,'Refill vendor');
  elsif p_action='receive_full' then
    if c.status<>'At Refill' then raise exception 'This cylinder is not at the refill vendor.'; end if;
    v_new := 'Full'; v_label := 'Received back full'; v_loc := 'Stores';
  elsif p_action='out_of_service' then
    if c.status='In Use' then raise exception 'Take the cylinder off the resident first.'; end if;
    v_new := 'Out of Service'; v_label := 'Out of service'; v_loc := 'Stores';
  elsif p_action='back_in_service' then
    if c.status<>'Out of Service' then raise exception 'This cylinder is not out of service.'; end if;
    v_new := 'Empty'; v_label := 'Back in service (empty)'; v_loc := 'Stores';
  else
    raise exception 'Unknown cylinder action.';
  end if;
  insert into public.oxygen_cylinder_movements(cylinder_id,action,patient_id,location,vendor,remarks,actor_id,actor_name)
  values(c.id,v_label,
    case when p_action='put_on' then p_patient_id else c.current_patient_id end,
    case when p_action='put_on' then v_loc else coalesce(c.current_location,v_loc) end,
    case when p_action in ('send_refill','receive_full') then coalesce(nullif(trim(coalesce(p_vendor,'')),''),c.refill_vendor) end,
    concat_ws(' · ',case when p_action in ('take_off_empty','take_off_unused') then 'In use '||round(extract(epoch from (now()-c.status_since))/3600.0,1)||' h' end,nullif(trim(coalesce(p_remarks,'')),'')),
    a.actor_id,a.actor_name);
  update public.oxygen_cylinders
     set status=v_new,
         current_patient_id=case when v_new='In Use' then p_patient_id else null end,
         current_location=v_loc,
         refill_vendor=case when p_action='send_refill' then coalesce(nullif(trim(coalesce(p_vendor,'')),''),refill_vendor) else refill_vendor end,
         active=(v_new<>'Out of Service'),
         status_since=now(), updated_at=now()
   where id=c.id;
  return jsonb_build_object('success',true,'status',v_new);
end $$;

grant execute on function public.samara_equipment_actor() to authenticated;
grant execute on function public.bme_add(text,text,text,text,date,text,text) to authenticated;
grant execute on function public.bme_issue(uuid,uuid,text,text) to authenticated;
grant execute on function public.bme_return(uuid,text) to authenticated;
grant execute on function public.bme_set_status(uuid,text,date,text) to authenticated;
grant execute on function public.oxy_add(text,text,text,text,text) to authenticated;
grant execute on function public.oxy_move(uuid,text,uuid,text,text,text) to authenticated;

-- 4. Accounts approval: Biomedical Equipment = Charge Master rate × quantity (days) -----------------------
--    Same function as SQL 160; the only change is the "else" branch multiplies by quantity for
--    Biomedical Equipment. Every other category behaves exactly as before.
create or replace function public.decide_bill_charge_request_v5(
  p_request_id uuid, p_decision text, p_approved_amount numeric default 0, p_remarks text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_role text; v_name text; v_request public.bill_charge_requests%rowtype;
  v_transaction_id uuid; v_decision text:=trim(p_decision); v_tariff numeric;
  v_is_other boolean; v_is_store boolean;
begin
  select role,coalesce(nullif(full_name,''),'Accounts') into v_role,v_name
  from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if v_role <> 'Accounts' then raise exception 'Only Accounts can financially verify and decide a charge request.'; end if;
  if v_decision not in ('Approved','Partially Approved','Rejected') then raise exception 'Invalid decision.'; end if;

  select * into v_request from public.bill_charge_requests where id=p_request_id for update;
  if not found then raise exception 'Bill/charge request not found.'; end if;
  if coalesce(v_request.approval_status,'Pending')<>'Pending' then raise exception 'This request has already been decided.'; end if;

  if v_decision='Rejected' then
    update public.bill_charge_requests set approval_status='Rejected',status='Rejected',final_amount=0,
      approval_remarks=p_remarks,approved_by=auth.uid(),approved_at=now(),decision_date=now(),
      decision_by_name=v_name,decision_by_role=v_role,updated_at=now() where id=p_request_id;
    return jsonb_build_object('success',true,'decision','Rejected','request_id',p_request_id);
  end if;

  v_is_other := upper(coalesce(v_request.service_code,''))='OTHER';
  v_is_store := v_request.category in ('Consumables','Pharmacy','Pharmacy & Basic Supplies','Housekeeping & General','Kitchen / Food Stores');

  if coalesce(p_approved_amount,0)<=0 then
    raise exception 'Verified amount must be greater than zero.';
  end if;

  if coalesce(v_request.bill_available,false) then
    if v_request.bill_number is null or v_request.bill_date is null then
      raise exception 'Bill number and bill date are mandatory for bill-based charges.';
    end if;
  elsif not v_is_other then
    if v_is_store then
      select charge_rate into v_tariff
      from public.consumable_store_items
      where active=true
        and ((v_request.charge_item_code is not null and item_code=v_request.charge_item_code) or item_name=v_request.service_name)
      order by (v_request.charge_item_code is not null and item_code=v_request.charge_item_code) desc
      limit 1;
      if v_tariff is null then
        raise exception 'Admin-fixed charge rate is not configured for this Stores/Pharmacy item. Ask Admin to set the rate in Stores Master before approval.';
      end if;
      v_tariff := v_tariff * coalesce(v_request.quantity,1);
    else
      select amount into v_tariff
      from public.charge_tariff_master
      where category=v_request.category and service_name=v_request.service_name and is_active=true
      limit 1;
      if v_tariff is null then
        raise exception 'Admin-fixed tariff is not configured for this charge item. Ask Admin to set the tariff before approval.';
      end if;
      if v_request.category='Biomedical Equipment' then
        v_tariff := v_tariff * greatest(coalesce(v_request.quantity,1),1);
      end if;
    end if;
    if abs(coalesce(p_approved_amount,0)-v_tariff) > 0.009 then
      raise exception 'Approved amount must match the current Admin-fixed tariff of %.',v_tariff;
    end if;
  end if;

  insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by)
  values(v_request.patient_id,'Charge',v_request.category,p_approved_amount,'Not applicable',
    concat(v_request.description,' · Accounts verified by: ',v_name,
      case when coalesce(v_request.bill_available,false) then ' · Bill: '||coalesce(v_request.bill_number,'—')
           when v_is_other then ' · Custom/Others charge' else ' · Admin-fixed tariff' end,
      case when p_remarks is not null then ' · Remarks: '||p_remarks else '' end),now(),auth.uid())
  returning id into v_transaction_id;

  update public.bill_charge_requests set final_amount=p_approved_amount,approved_amount=p_approved_amount,
    approval_status=v_decision,status=case when v_decision='Approved' then 'Posted' else 'Partially Approved' end,
    approved_by=auth.uid(),approved_at=now(),decision_date=now(),decision_by_name=v_name,decision_by_role=v_role,
    approval_remarks=p_remarks,billing_transaction_id=v_transaction_id,updated_at=now() where id=p_request_id;

  return jsonb_build_object('success',true,'decision',v_decision,'request_id',p_request_id,
    'approved_amount',p_approved_amount,'billing_transaction_id',v_transaction_id);
end; $$;
grant execute on function public.decide_bill_charge_request_v5(uuid,text,numeric,text) to authenticated;

notify pgrst,'reload schema';
commit;

select to_regclass('public.biomedical_equipment') is not null as equipment_register_ready,
       to_regclass('public.oxygen_cylinders') is not null as oxygen_register_ready,
       (select count(*) from public.charge_tariff_master where category='Biomedical Equipment' and is_active) as charge_master_biomedical_items;
