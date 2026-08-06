-- Samara Care ERP 1.3.15
-- Controlled patient discharge with automatic room/bed release

create table if not exists public.patient_discharges (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  discharge_type text not null default 'Planned Discharge',
  proposed_discharge_date date not null,
  proposed_discharge_time time,
  destination text,
  destination_details text,
  doctor_name text,
  doctor_contact text,
  doctor_discharge_advice text,
  condition_at_discharge text,
  relative_name text,
  relative_contact text,
  transport_arrangement text,
  medicines_handed_over boolean not null default false,
  discharge_summary_handed_over boolean not null default false,
  reports_handed_over boolean not null default false,
  valuables_handed_over boolean not null default false,
  billing_clearance_status text not null default 'Pending',
  clinical_clearance_status text not null default 'Pending',
  room_clearance_status text not null default 'Pending',
  final_instructions text,
  remarks text,
  status text not null default 'Initiated',
  initiated_by uuid,
  completed_by uuid,
  completed_at timestamptz,
  released_room_no text,
  released_bed_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patient_discharges_patient_idx
  on public.patient_discharges(patient_id,created_at desc);

alter table public.patient_discharges enable row level security;

drop policy if exists patient_discharges_authenticated_select on public.patient_discharges;
create policy patient_discharges_authenticated_select
on public.patient_discharges for select
to authenticated
using (true);

drop policy if exists patient_discharges_clinical_insert on public.patient_discharges;
create policy patient_discharges_clinical_insert
on public.patient_discharges for insert
to authenticated
with check (public.current_user_has_role(array['Admin','Manager','Nurse']));

drop policy if exists patient_discharges_authorised_update on public.patient_discharges;
create policy patient_discharges_authorised_update
on public.patient_discharges for update
to authenticated
using (public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']))
with check (public.current_user_has_role(array['Admin','Manager','Nurse','Accounts']));

create or replace function public.complete_patient_discharge(p_discharge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_discharge public.patient_discharges%rowtype;
  v_patient public.patients%rowtype;
begin
  select role into v_role
  from public.profiles
  where id=auth.uid() or auth_user_id=auth.uid()
  limit 1;

  if v_role not in ('Admin','Manager') then
    raise exception 'Only Admin or Manager can complete patient discharge.';
  end if;

  select * into v_discharge
  from public.patient_discharges
  where id=p_discharge_id
  for update;

  if not found then raise exception 'Discharge record not found.'; end if;
  if v_discharge.status='Completed' then raise exception 'Discharge is already completed.'; end if;

  if v_discharge.billing_clearance_status<>'Cleared'
     or v_discharge.clinical_clearance_status<>'Cleared'
     or v_discharge.room_clearance_status<>'Cleared'
     or not v_discharge.medicines_handed_over
     or not v_discharge.discharge_summary_handed_over then
    raise exception 'Mandatory discharge clearances and handovers are incomplete.';
  end if;

  select * into v_patient from public.patients where id=v_discharge.patient_id for update;
  if not found then raise exception 'Patient record not found.'; end if;

  update public.room_beds
  set patient_id=null,status='Available',updated_at=now()
  where patient_id=v_patient.id
     or (room_no=v_patient.room_no and bed_no=v_patient.bed_no);

  update public.patients
  set is_active=false,
      discharge_date=v_discharge.proposed_discharge_date,
      room_no=null,
      bed_no=null,
      updated_at=now()
  where id=v_patient.id;

  update public.medication_orders set is_active=false where patient_id=v_patient.id and is_active=true;
  update public.care_orders set is_active=false where patient_id=v_patient.id and is_active=true;
  update public.physiotherapy_plans set is_active=false,updated_at=now() where patient_id=v_patient.id and is_active=true;
  update public.special_nurse_assignments set status='Completed',updated_at=now() where patient_id=v_patient.id and status not in ('Completed','Cancelled');

  update public.patient_discharges
  set status='Completed',
      completed_by=auth.uid(),
      completed_at=now(),
      released_room_no=v_patient.room_no,
      released_bed_no=v_patient.bed_no,
      updated_at=now()
  where id=p_discharge_id;

  return jsonb_build_object(
    'success',true,
    'patient_id',v_patient.id,
    'released_room_no',v_patient.room_no,
    'released_bed_no',v_patient.bed_no
  );
end;
$$;

grant execute on function public.complete_patient_discharge(uuid) to authenticated;

notify pgrst, 'reload schema';

select
  to_regclass('public.patient_discharges') is not null as discharge_table_ready,
  exists(select 1 from pg_proc where proname='complete_patient_discharge') as completion_function_ready;
