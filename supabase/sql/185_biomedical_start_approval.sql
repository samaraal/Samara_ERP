-- ERP 2.15.48. Run after SQL 184. Clinical start approval is separate from billing.
-- Does not alter existing issues, charges, or historical requests.
begin;
alter table public.nursing_procedure_requests add column if not exists equipment_id uuid references public.biomedical_equipment(id);

create or replace function public.bme_request_start(p_id uuid,p_equipment_id uuid,p_patient_id uuid,p_scheduled_at timestamptz default null,p_remarks text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.bme_access(); e public.biomedical_equipment; r public.nursing_procedure_requests;
begin
 if not coalesce((a->>'nurse')::boolean,false) then raise exception 'Only Nurse can request equipment start';end if;
 if p_id is null then raise exception 'Request ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.nursing_procedure_requests where id=p_id;
 if found then
  if r.requested_by is distinct from auth.uid() or r.equipment_id is distinct from p_equipment_id or r.patient_id is distinct from p_patient_id or r.scheduled_at is distinct from p_scheduled_at or r.remarks is distinct from nullif(trim(p_remarks),'') then raise exception 'Request ID already used';end if;
  return r.id;
 end if;
 if not exists(select 1 from public.patients where id=p_patient_id and is_active=true) then raise exception 'Select an active resident';end if;
 select * into e from public.biomedical_equipment where id=p_equipment_id for update;
 if not found or not e.active or e.status<>'Available' then raise exception 'Select available equipment';end if;
 if exists(select 1 from public.bme_care_requests where equipment_id=e.id and kind='Fault' and status='Pending') then raise exception 'Equipment has an unresolved fault';end if;
 if exists(select 1 from public.nursing_procedure_requests where equipment_id=e.id and patient_id=p_patient_id and status in ('Requested','Approved')) then raise exception 'An open request already exists for this equipment and resident';end if;
 insert into public.nursing_procedure_requests(id,patient_id,equipment_id,category,procedure_code,procedure_name,scheduled_at,remarks,status,requested_by,requested_by_name)
 values(p_id,p_patient_id,e.id,'Biomedical Equipment',e.asset_no,e.equipment_name,p_scheduled_at,nullif(trim(p_remarks),''),'Requested',auth.uid(),a->>'name');
 return p_id;
end $$;

create or replace function public.bme_start_approved(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.bme_access(); r public.nursing_procedure_requests; e public.biomedical_equipment; loc text;
begin
 if not coalesce((a->>'nurse')::boolean,false) then raise exception 'Only Nurse can confirm and start equipment';end if;
 select * into r from public.nursing_procedure_requests where id=p_request_id for update;
 if not found or r.category<>'Biomedical Equipment' or r.equipment_id is null then raise exception 'Equipment request not found';end if;
 if r.status='Started' then return jsonb_build_object('success',true,'request_id',r.id,'equipment_id',r.equipment_id);end if;
 if r.status<>'Approved' or r.decision_by is null then raise exception 'Nursing Manager approval required before starting equipment';end if;
 if not exists(select 1 from public.patients where id=r.patient_id and is_active=true) then raise exception 'Resident is no longer active';end if;
 select * into e from public.biomedical_equipment where id=r.equipment_id for update;
 if not found or not e.active or e.status<>'Available' then raise exception 'Equipment is no longer available; request another piece';end if;
 if exists(select 1 from public.bme_care_requests where equipment_id=e.id and kind='Fault' and status='Pending') then raise exception 'Resolve the equipment fault before starting';end if;
 select concat_ws(' / ',nullif(room_no,''),nullif(bed_no,'')) into loc from public.patients where id=r.patient_id;
 update public.biomedical_equipment set status='In Use',current_patient_id=r.patient_id,current_location=loc,issued_at=now(),updated_at=now() where id=e.id;
 insert into public.biomedical_equipment_movements(equipment_id,action,patient_id,location,remarks,actor_id,actor_name)
 values(e.id,'Issued',r.patient_id,loc,'Nursing Manager approved request '||r.id,(a->>'actor')::uuid,a->>'name');
 update public.nursing_procedure_requests set status='Started',started_by=auth.uid(),started_by_name=a->>'name',started_at=now(),updated_at=now() where id=r.id;
 -- No charge here. Existing issued-equipment day-based billing remains authoritative.
 return jsonb_build_object('success',true,'request_id',r.id,'equipment_id',e.id);
end $$;

-- Old clients also use the approved equipment start path, never procedure billing.
do $$ declare d text;
begin
 d:=pg_get_functiondef('public.start_nursing_procedure(uuid)'::regprocedure);
 if position('bme_start_approved' in d)=0 then
  d:=regexp_replace(d,'\mBEGIN\M|\mbegin\M',E'begin\n if exists(select 1 from public.nursing_procedure_requests where id=p_request_id and category=''Biomedical Equipment'') then return public.bme_start_approved(p_request_id);end if;');
  execute d;
 end if;
 -- Stores cannot bypass clinical approval by directly issuing to a resident.
 d:=pg_get_functiondef('public.bme_issue(uuid,uuid,text,text)'::regprocedure);
 if position('Use Approval Requests' in d)=0 then
  d:=regexp_replace(d,'\mBEGIN\M|\mbegin\M',E'begin\n if p_patient_id is not null then raise exception ''Use Approval Requests: Nursing Manager approves, then Nurse confirms and starts equipment'';end if;');
  execute d;
 end if;
 -- Existing Equipment request clients are routed into the same approval queue.
 d:=pg_get_functiondef('public.bme_care_request(uuid,text,uuid,uuid,text,text)'::regprocedure);
 if position('bme_request_start' in d)=0 then
  d:=regexp_replace(d,'\mBEGIN\M|\mbegin\M',E'begin\n if p_kind=''Equipment'' and coalesce((a->>''nurse'')::boolean,false) then return public.bme_request_start(p_id,p_equipment_id,p_patient_id,null,p_details);end if;');
  execute d;
 end if;
 -- Retain Admin/Manager decision authority, but enforce active verified identity.
 d:=pg_get_functiondef('public.decide_nursing_procedure_request(uuid,text,text)'::regprocedure);
 if position('bme_access()' in d)=0 then
  d:=regexp_replace(d,'\mBEGIN\M|\mbegin\M',E'begin\n perform public.bme_access();');execute d;
 end if;
end $$;
revoke all on function public.bme_request_start(uuid,uuid,uuid,timestamptz,text),public.bme_start_approved(uuid) from public,anon;
grant execute on function public.bme_request_start(uuid,uuid,uuid,timestamptz,text),public.bme_start_approved(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
