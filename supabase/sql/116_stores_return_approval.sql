begin;

alter table public.store_incharge_assignments
  add column if not exists nursing_manager_id uuid references public.profiles(id),
  add column if not exists returned_at timestamptz,
  add column if not exists return_approved_at timestamptz,
  add column if not exists return_approved_by uuid references public.profiles(id),
  add column if not exists return_approved_by_name text;

create or replace function public.stores_return_approval_allowed()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles p
    where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)
      and (p.role='Admin' or exists(select 1 from public.director_office_positions d
        where d.position_key='director' and d.assigned_profile_id=p.id)));
$$;
revoke all on function public.stores_return_approval_allowed() from public,anon;
grant execute on function public.stores_return_approval_allowed() to authenticated;

-- A delegation's end time is now the expected return time, not an expiry.
do $$ declare definition text;
begin
  definition:=pg_get_functiondef('public.stores_controller_authorised()'::regprocedure);
  if position('now() between effective_from and effective_until' in definition)>0 then
    execute replace(definition,'now() between effective_from and effective_until','effective_from<=now()');
  elsif position('effective_from<=now()' in definition)=0 then raise exception 'Unexpected Stores authority definition'; end if;
  definition:=pg_get_functiondef('public.fv_access()'::regprocedure);
  if position('effective_from<=now() and effective_until>=now()' in definition)>0 then
    execute replace(definition,'effective_from<=now() and effective_until>=now()','effective_from<=now()');
  elsif position('effective_from<=now()' in definition)=0 then raise exception 'Unexpected food authority definition'; end if;
end $$;

-- Associate existing open handovers only when the primary manager is unambiguous.
update public.store_incharge_assignments set nursing_manager_id=(
  select id from public.profiles where coalesce(is_active,true)
    and lower(trim(designation)) in ('nurse manager','nursing manager') limit 1)
where status='Active' and nursing_manager_id is null and
  (select count(*) from public.profiles where coalesce(is_active,true)
    and lower(trim(designation)) in ('nurse manager','nursing manager'))=1;

create or replace function public.assign_stores_to_std(p_effective_from timestamptz,p_effective_until timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; new_id uuid; nm uuid; manager_count integer;
begin
  if not public.stores_return_approval_allowed() then raise exception 'Only Admin/Director can delegate Stores responsibility.'; end if;
  select * into a from public.stores_actor();
  if p_effective_from is null or p_effective_until is null or p_effective_until<=p_effective_from then raise exception 'Expected return must be later than the delegation start.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Reason for delegation is required.'; end if;
  perform pg_advisory_xact_lock(71620262);
  if exists(select 1 from public.store_incharge_assignments where status='Active') then raise exception 'Modify the current assignment, or approve Return to Duty before creating a new assignment.'; end if;
  select count(*) into manager_count from public.profiles where coalesce(is_active,true) and lower(trim(designation)) in ('nurse manager','nursing manager');
  if manager_count<>1 then raise exception 'A single active Nursing Manager must be configured before assigning the handover.'; end if;
  select id into nm from public.profiles where coalesce(is_active,true) and lower(trim(designation)) in ('nurse manager','nursing manager') limit 1;
  insert into public.store_incharge_assignments(effective_from,effective_until,reason,assigned_by,assigned_by_name,nursing_manager_id)
    values(p_effective_from,p_effective_until,trim(p_reason),a.actor_id,a.actor_name,nm) returning id into new_id;
  return jsonb_build_object('success',true,'assignment_id',new_id);
end;
$$;

create or replace function public.modify_stores_std_assignment(p_assignment_id uuid,p_effective_from timestamptz,p_effective_until timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; old_row public.store_incharge_assignments%rowtype;
begin
  if not public.stores_return_approval_allowed() then raise exception 'Only Admin/Director can modify Stores delegation.'; end if;
  select * into a from public.stores_actor();
  if p_effective_from is null or p_effective_until is null or p_effective_until<=p_effective_from then raise exception 'Expected return must be later than the delegation start.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Reason is required.'; end if;
  perform pg_advisory_xact_lock(71620262);
  select * into old_row from public.store_incharge_assignments where id=p_assignment_id and status='Active' for update;
  if not found then raise exception 'Active assignment not found.'; end if;
  if old_row.effective_from<=now() and p_effective_from>now() then raise exception 'An active handover cannot be moved into the future. Approve Return to Duty to end it.'; end if;
  update public.store_incharge_assignments set effective_from=p_effective_from,effective_until=p_effective_until,reason=trim(p_reason) where id=p_assignment_id;
  insert into public.store_incharge_assignment_changes(assignment_id,action,previous_values,revised_values,changed_by,changed_by_name,reason)
    values(p_assignment_id,'Modified',to_jsonb(old_row),jsonb_build_object('effective_from',p_effective_from,'effective_until',p_effective_until,'reason',trim(p_reason)),a.actor_id,a.actor_name,'Expected return / assignment conditions revised; STD continues until return approval');
  return jsonb_build_object('success',true);
end;
$$;

create or replace function public.approve_stores_return_to_duty(p_assignment_id uuid,p_returned_at timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; old_row public.store_incharge_assignments%rowtype; leave_row public.absence_requests%rowtype;
  return_day date; matches integer; shortened boolean:=false;
begin
  if not public.stores_return_approval_allowed() then raise exception 'Only Admin/Director can approve Return to Duty.'; end if;
  select * into a from public.stores_actor();
  if p_returned_at is null or p_returned_at>now() then raise exception 'Enter the actual return date and time, no later than now.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Return confirmation remarks are required.'; end if;
  perform pg_advisory_xact_lock(71620262);
  select * into old_row from public.store_incharge_assignments where id=p_assignment_id for update;
  if not found or old_row.status<>'Active' then raise exception 'This assignment is no longer awaiting return approval.'; end if;
  if p_returned_at<old_row.effective_from then raise exception 'Return cannot be before the delegation started.'; end if;
  if old_row.nursing_manager_id is null then raise exception 'The Nursing Manager must be linked before approving this return.'; end if;
  if old_row.nursing_manager_id=a.actor_id then raise exception 'Another Admin/Director must approve your return.'; end if;
  return_day:=(p_returned_at at time zone 'Asia/Kolkata')::date;
  select count(*) into matches from public.absence_requests where employee_id=old_row.nursing_manager_id
    and request_type='Leave' and status='approved' and from_date<=return_day and to_date>=return_day;
  if matches>1 then raise exception 'Multiple overlapping approved leaves were found. Correct the leave records before confirming return.'; end if;
  if matches=1 then
    select * into leave_row from public.absence_requests where employee_id=old_row.nursing_manager_id
      and request_type='Leave' and status='approved' and from_date<=return_day and to_date>=return_day for update;
    if leave_row.return_to_duty_date is not null then raise exception 'This leave already has a return record. Review it before confirming the handover.'; end if;
    update public.absence_requests set original_leave_to_date=to_date,return_to_duty_date=return_day,
      return_recorded_by=a.actor_id,return_recorded_at=now(),return_remarks=trim(p_reason),
      to_date=greatest(from_date,return_day-1),status=case when return_day=from_date then 'cancelled' else 'approved' end,
      cancelled_at=case when return_day=from_date then now() else cancelled_at end where id=leave_row.id;
    shortened:=true;
    insert into public.audit_log(user_id,action,entity,entity_id,details) values(a.actor_id,'Record Early Return','Leave / Permission',leave_row.id::text,
      jsonb_build_object('employee_id',old_row.nursing_manager_id,'original_to_date',leave_row.to_date,'return_to_duty_date',return_day,'assignment_id',p_assignment_id,'remarks',trim(p_reason)));
  end if;
  update public.store_incharge_assignments set status='Ended',returned_at=p_returned_at,return_approved_at=now(),
    return_approved_by=a.actor_id,return_approved_by_name=a.actor_name,ended_at=now(),ended_by=a.actor_id,ended_by_name=a.actor_name,end_reason=trim(p_reason)
    where id=p_assignment_id;
  insert into public.store_incharge_assignment_changes(assignment_id,action,previous_values,revised_values,changed_by,changed_by_name,reason)
    values(p_assignment_id,'Modified',to_jsonb(old_row),jsonb_build_object('event','Return to Duty approved','status','Ended','returned_at',p_returned_at,'approved_at',now()),a.actor_id,a.actor_name,trim(p_reason));
  insert into public.audit_log(user_id,action,entity,entity_id,details) values(a.actor_id,'Approve Return to Duty','Stores In-charge Assignment',p_assignment_id::text,
    jsonb_build_object('nursing_manager_id',old_row.nursing_manager_id,'returned_at',p_returned_at,'leave_shortened',shortened,'remarks',trim(p_reason)));
  return jsonb_build_object('success',true,'leave_shortened',shortened,'message','Return approved. Stores and Food & Diet control has returned to the Nursing Manager.');
end;
$$;
revoke all on function public.approve_stores_return_to_duty(uuid,timestamptz,text) from public,anon;
grant execute on function public.approve_stores_return_to_duty(uuid,timestamptz,text) to authenticated;

-- Old clients may cancel a future handover, but cannot bypass return approval.
create or replace function public.end_stores_std_assignment(p_assignment_id uuid,p_reason text default 'Ended by Management')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; old_row public.store_incharge_assignments%rowtype;
begin
  if not public.stores_return_approval_allowed() then raise exception 'Only Admin/Director can cancel Stores delegation.'; end if;
  select * into a from public.stores_actor();
  perform pg_advisory_xact_lock(71620262);
  select * into old_row from public.store_incharge_assignments where id=p_assignment_id and status='Active' for update;
  if not found then raise exception 'Active assignment not found.'; end if;
  if old_row.effective_from<=now() then raise exception 'Use Approve Return to Duty to end this active handover.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Cancellation reason is required.'; end if;
  update public.store_incharge_assignments set status='Ended',ended_at=now(),ended_by=a.actor_id,ended_by_name=a.actor_name,end_reason=trim(p_reason) where id=p_assignment_id;
  insert into public.store_incharge_assignment_changes(assignment_id,action,previous_values,revised_values,changed_by,changed_by_name,reason)
    values(p_assignment_id,'Cancelled',to_jsonb(old_row),jsonb_build_object('status','Ended'),a.actor_id,a.actor_name,trim(p_reason));
  return jsonb_build_object('success',true);
end;
$$;
-- The generic early-leave action must not bypass the handover approval.
do $$ declare definition text; anchor text:='if not found then raise exception ''Leave request not found''; end if;';
begin
  definition:=pg_get_functiondef('public.record_absence_early_return(bigint,date,text)'::regprocedure);
  if position('Use Approve Return to Duty' in definition)=0 then
    if position(anchor in definition)=0 then raise exception 'Unexpected early-return function definition'; end if;
    execute replace(definition,anchor,anchor||E'\n  if exists(select 1 from public.store_incharge_assignments where status=''Active'' and nursing_manager_id=r.employee_id and effective_from<=now()) then raise exception ''Use Approve Return to Duty in Stores In-charge Assignment. Admin/Director approval is required for this handover.''; end if;');
  end if;
end $$;
notify pgrst,'reload schema';
commit;
