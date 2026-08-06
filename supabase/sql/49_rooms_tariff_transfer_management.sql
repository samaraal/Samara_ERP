-- Samara Care ERP 1.3.31
-- Rooms Management, tariff fixation, admission allocation and room-transfer history

alter table public.room_beds add column if not exists room_daily_rate numeric not null default 0;
alter table public.room_beds add column if not exists nursing_daily_rate numeric not null default 0;
alter table public.room_beds add column if not exists special_nurse_daily_rate numeric not null default 0;

update public.room_beds
set room_daily_rate=case
  when coalesce(room_daily_rate,0)>0 then room_daily_rate
  when lower(coalesce(room_type,'')) similar to '%(private|single|separate|deluxe)%' then 3000
  when lower(coalesce(room_type,'')) similar to '%(general|ward|dorm)%' then 1800
  else 2000 end,
nursing_daily_rate=case
  when coalesce(nursing_daily_rate,0)>0 then nursing_daily_rate
  when lower(coalesce(room_type,'')) similar to '%(private|single|separate|deluxe)%' then 1000
  when lower(coalesce(room_type,'')) similar to '%(general|ward|dorm)%' then 750
  else 800 end
where coalesce(room_daily_rate,0)=0 or coalesce(nursing_daily_rate,0)=0;

update public.room_beds set daily_rate=room_daily_rate where daily_rate is distinct from room_daily_rate;

create table if not exists public.room_transfer_history(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  patient_name text,
  from_room_bed_id uuid,
  from_room_no text,
  from_bed_no text,
  to_room_bed_id uuid not null,
  to_room_no text not null,
  to_bed_no text not null,
  reason text not null,
  effective_at timestamptz not null default now(),
  shifted_by uuid,
  shifted_by_name text,
  shifted_by_role text,
  created_at timestamptz not null default now()
);

create index if not exists room_transfer_history_patient_idx
  on public.room_transfer_history(patient_id,effective_at desc);

alter table public.room_transfer_history enable row level security;
drop policy if exists room_transfer_history_select on public.room_transfer_history;
create policy room_transfer_history_select on public.room_transfer_history
for select to authenticated
using(public.current_user_has_role(array['Admin','Manager','Accounts','Nurse','Caregiver']));

create or replace function public.assign_patient_room(
  p_patient_id uuid,
  p_room_bed_id uuid,
  p_reason text default 'Room allotted'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_name text;
  v_patient public.patients%rowtype;
  v_bed public.room_beds%rowtype;
begin
  select role,coalesce(nullif(full_name,''),'Authorised user')
  into v_role,v_name
  from public.profiles
  where id=auth.uid() or auth_user_id=auth.uid()
  limit 1;

  if v_role not in ('Admin','Manager') then
    raise exception 'Only Admin or Manager can allot a room.';
  end if;

  select * into v_patient from public.patients where id=p_patient_id for update;
  if not found then raise exception 'Patient not found.'; end if;

  select * into v_bed from public.room_beds where id=p_room_bed_id for update;
  if not found then raise exception 'Room/bed not found.'; end if;
  if v_bed.status<>'Available' or v_bed.patient_id is not null then
    raise exception 'Selected room/bed is no longer available.';
  end if;

  update public.room_beds set patient_id=null,status='Available',updated_at=now()
  where patient_id=p_patient_id;

  update public.room_beds set patient_id=p_patient_id,status='Occupied',updated_at=now()
  where id=p_room_bed_id;

  update public.patients set room_no=v_bed.room_no,bed_no=v_bed.bed_no,updated_at=now()
  where id=p_patient_id;

  insert into public.room_transfer_history(
    patient_id,patient_name,to_room_bed_id,to_room_no,to_bed_no,reason,effective_at,
    shifted_by,shifted_by_name,shifted_by_role
  ) values(
    p_patient_id,v_patient.full_name,p_room_bed_id,v_bed.room_no,v_bed.bed_no,p_reason,now(),
    auth.uid(),v_name,v_role
  );

  return jsonb_build_object('success',true,'room_no',v_bed.room_no,'bed_no',v_bed.bed_no);
end;
$$;

grant execute on function public.assign_patient_room(uuid,uuid,text) to authenticated;

create or replace function public.transfer_patient_room(
  p_patient_id uuid,
  p_to_room_bed_id uuid,
  p_reason text,
  p_effective_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_name text;
  v_patient public.patients%rowtype;
  v_from public.room_beds%rowtype;
  v_to public.room_beds%rowtype;
begin
  select role,coalesce(nullif(full_name,''),'Authorised user')
  into v_role,v_name
  from public.profiles
  where id=auth.uid() or auth_user_id=auth.uid()
  limit 1;

  if v_role not in ('Admin','Manager') then
    raise exception 'Only Admin or Manager can shift a patient room.';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Reason for room shifting is mandatory.'; end if;
  if p_effective_at>now() then raise exception 'Future room-shift date/time is not permitted.'; end if;

  select * into v_patient from public.patients where id=p_patient_id and is_active=true for update;
  if not found then raise exception 'Active patient not found.'; end if;

  select * into v_from from public.room_beds
  where patient_id=p_patient_id
     or (room_no=v_patient.room_no and upper(coalesce(bed_no,''))=upper(coalesce(v_patient.bed_no,'')))
  order by patient_id=p_patient_id desc
  limit 1 for update;

  select * into v_to from public.room_beds where id=p_to_room_bed_id for update;
  if not found then raise exception 'New room/bed not found.'; end if;
  if v_to.status<>'Available' or v_to.patient_id is not null then raise exception 'New room/bed is no longer available.'; end if;
  if v_from.id=v_to.id then raise exception 'Patient is already allotted to this room/bed.'; end if;

  if v_from.id is not null then
    update public.room_beds set patient_id=null,status='Available',updated_at=now() where id=v_from.id;
  end if;

  update public.room_beds set patient_id=p_patient_id,status='Occupied',updated_at=now() where id=v_to.id;
  update public.patients set room_no=v_to.room_no,bed_no=v_to.bed_no,updated_at=now() where id=p_patient_id;

  insert into public.room_transfer_history(
    patient_id,patient_name,from_room_bed_id,from_room_no,from_bed_no,
    to_room_bed_id,to_room_no,to_bed_no,reason,effective_at,
    shifted_by,shifted_by_name,shifted_by_role
  ) values(
    p_patient_id,v_patient.full_name,v_from.id,v_patient.room_no,v_patient.bed_no,
    v_to.id,v_to.room_no,v_to.bed_no,trim(p_reason),p_effective_at,
    auth.uid(),v_name,v_role
  );

  -- Recalculate today's automatic accommodation charges using the new room tariff.
  delete from public.billing_transactions
  where patient_id=p_patient_id
    and source_date=current_date
    and source_type in ('Daily Room Charge','Daily Nursing Charge','Daily Special Nurse Charge')
    and auto_generated=true;

  perform public.run_daily_billing_automation(current_date,true);

  return jsonb_build_object(
    'success',true,
    'patient_id',p_patient_id,
    'from_room_no',v_patient.room_no,'from_bed_no',v_patient.bed_no,
    'to_room_no',v_to.room_no,'to_bed_no',v_to.bed_no,
    'billing_history_carried_forward',true
  );
end;
$$;

grant execute on function public.transfer_patient_room(uuid,uuid,text,timestamptz) to authenticated;

-- Replace daily billing generator to use tariff fixed in Rooms Management.
create or replace function public.run_daily_billing_automation(
  p_charge_date date default current_date,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  rec record;
  v_run_id uuid;
  v_run_type text:=case when p_force then 'Admin Rerun' else 'Automatic' end;
  v_room_rate numeric;
  v_nursing_rate numeric;
  v_special_rate numeric;
  v_room_created integer:=0;
  v_nursing_created integer:=0;
  v_special_created integer:=0;
  v_skipped integer:=0;
  v_errors integer:=0;
  v_inserted integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_charge_date>current_date then raise exception 'Future daily charges are not permitted.'; end if;

  insert into public.daily_billing_runs(charge_date,run_type,triggered_by,status)
  values(p_charge_date,v_run_type,auth.uid(),'Started')
  returning id into v_run_id;

  for rec in
    select distinct on(p.id)
      p.id patient_id,p.full_name,p.patient_id patient_code,p.admission_date,p.discharge_date,
      p.room_no,p.bed_no,p.special_nurse_required,
      rb.id room_bed_id,rb.room_type,
      coalesce(nullif(rb.room_daily_rate,0),nullif(rb.daily_rate,0),
        case when lower(coalesce(rb.room_type,'')) similar to '%(private|single|separate|deluxe)%' then 3000
             when lower(coalesce(rb.room_type,'')) similar to '%(general|ward|dorm)%' then 1800 else 2000 end) room_rate,
      coalesce(nullif(rb.nursing_daily_rate,0),
        case when lower(coalesce(rb.room_type,'')) similar to '%(private|single|separate|deluxe)%' then 1000
             when lower(coalesce(rb.room_type,'')) similar to '%(general|ward|dorm)%' then 750 else 800 end) nursing_rate,
      coalesce(rb.special_nurse_daily_rate,0) special_rate
    from public.patients p
    join public.room_beds rb on rb.patient_id=p.id
      or (rb.room_no=p.room_no and upper(coalesce(rb.bed_no,''))=upper(coalesce(p.bed_no,'')))
    where p.is_active=true
      and coalesce(p.admission_date,p_charge_date)<=p_charge_date
      and (p.discharge_date is null or p.discharge_date>=p_charge_date)
    order by p.id,rb.patient_id=p.id desc,rb.updated_at desc nulls last
  loop
    begin
      v_room_rate:=rec.room_rate;
      v_nursing_rate:=rec.nursing_rate;
      v_special_rate:=rec.special_rate;

      insert into public.billing_transactions(
        patient_id,transaction_type,category,amount,payment_mode,description,
        transaction_date,entered_by,auto_generated,source_date,source_type,source_key
      ) values(
        rec.patient_id,'Charge','Room Charges',v_room_rate,'Not applicable',
        format('Automatic room rent for %s · Room %s-%s · %s',to_char(p_charge_date,'DD-MM-YYYY'),rec.room_no,rec.bed_no,rec.room_type),
        p_charge_date::timestamptz,auth.uid(),true,p_charge_date,'Daily Room Charge',
        format('ROOM:%s:%s',rec.patient_id,p_charge_date)
      ) on conflict(source_key) where source_key is not null do nothing;
      get diagnostics v_inserted=row_count;
      if v_inserted=1 then v_room_created:=v_room_created+1; else v_skipped:=v_skipped+1; end if;

      insert into public.billing_transactions(
        patient_id,transaction_type,category,amount,payment_mode,description,
        transaction_date,entered_by,auto_generated,source_date,source_type,source_key
      ) values(
        rec.patient_id,'Charge','Nursing Charges',v_nursing_rate,'Not applicable',
        format('Automatic nursing charge for %s · Room %s-%s',to_char(p_charge_date,'DD-MM-YYYY'),rec.room_no,rec.bed_no),
        p_charge_date::timestamptz,auth.uid(),true,p_charge_date,'Daily Nursing Charge',
        format('NURSING:%s:%s',rec.patient_id,p_charge_date)
      ) on conflict(source_key) where source_key is not null do nothing;
      get diagnostics v_inserted=row_count;
      if v_inserted=1 then v_nursing_created:=v_nursing_created+1; else v_skipped:=v_skipped+1; end if;

      if rec.special_nurse_required=true and v_special_rate>0 then
        insert into public.billing_transactions(
          patient_id,transaction_type,category,amount,payment_mode,description,
          transaction_date,entered_by,auto_generated,source_date,source_type,source_key
        ) values(
          rec.patient_id,'Charge','Special Nurse',v_special_rate,'Not applicable',
          format('Automatic special nurse charge for %s · Room %s-%s',to_char(p_charge_date,'DD-MM-YYYY'),rec.room_no,rec.bed_no),
          p_charge_date::timestamptz,auth.uid(),true,p_charge_date,'Daily Special Nurse Charge',
          format('SPECIAL_NURSE:%s:%s',rec.patient_id,p_charge_date)
        ) on conflict(source_key) where source_key is not null do nothing;
        get diagnostics v_inserted=row_count;
        if v_inserted=1 then v_special_created:=v_special_created+1; else v_skipped:=v_skipped+1; end if;
      end if;
    exception when others then
      v_errors:=v_errors+1;
    end;
  end loop;

  update public.daily_billing_runs
  set completed_at=now(),room_charges_created=v_room_created,nursing_charges_created=v_nursing_created,
      skipped_count=v_skipped,error_count=v_errors,status=case when v_errors>0 then 'Completed with Errors' else 'Completed' end,
      details=jsonb_build_object('room_charges_created',v_room_created,'nursing_charges_created',v_nursing_created,
        'special_nurse_charges_created',v_special_created,'skipped_count',v_skipped,'error_count',v_errors)
  where id=v_run_id;

  return jsonb_build_object('success',true,'run_id',v_run_id,'charge_date',p_charge_date,
    'room_charges_created',v_room_created,'nursing_charges_created',v_nursing_created,
    'special_nurse_charges_created',v_special_created,'skipped_count',v_skipped,'error_count',v_errors);
end;
$$;

grant execute on function public.run_daily_billing_automation(date,boolean) to authenticated;

notify pgrst,'reload schema';

select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='room_beds' and column_name='room_daily_rate') as room_tariff_ready,
  to_regclass('public.room_transfer_history') is not null as transfer_history_ready,
  exists(select 1 from pg_proc where proname='transfer_patient_room') as transfer_function_ready;
