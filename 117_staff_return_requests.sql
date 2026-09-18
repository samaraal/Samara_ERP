begin;
create table if not exists public.staff_return_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  leave_id bigint references public.absence_requests(id),
  assignment_id uuid references public.store_incharge_assignments(id),
  returned_at timestamptz not null,
  remarks text not null,
  status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_remarks text
);
create unique index if not exists staff_return_one_pending on public.staff_return_requests(employee_id) where status='Pending';
alter table public.staff_return_requests enable row level security;
revoke all on public.staff_return_requests from anon,authenticated;

create or replace function public.staff_return_workspace()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; approver boolean;
begin
  select id into me from public.profiles where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(is_active,true) limit 1;
  if me is null then raise exception 'Active staff login required'; end if;
  approver:=public.stores_return_approval_allowed();
  return jsonb_build_object('can_approve',approver,
    'leaves',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'from_date',r.from_date,'to_date',r.to_date)) from public.absence_requests r where employee_id=me and request_type='Leave' and status='approved' and return_to_duty_date is null and from_date<=(now() at time zone 'Asia/Kolkata')::date and not exists(select 1 from public.staff_return_requests s where s.leave_id=r.id and s.status='Approved')),'[]'::jsonb),
    'handover',exists(select 1 from public.store_incharge_assignments where nursing_manager_id=me and status='Active' and effective_from<=now()),
    'requests',coalesce((select jsonb_agg(q order by q.submitted_at desc) from (select s.*,p.full_name as employee_name from public.staff_return_requests s join public.profiles p on p.id=s.employee_id where s.employee_id=me or approver order by s.submitted_at desc limit 100) q),'[]'::jsonb));
end $$;

create or replace function public.submit_staff_return(p_leave_id bigint,p_returned_at timestamptz,p_remarks text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; lr public.absence_requests%rowtype; aid uuid; started timestamptz; rid uuid;
begin
  select id into me from public.profiles where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(is_active,true) limit 1;
  if me is null then raise exception 'Active staff login required'; end if;
  perform pg_advisory_xact_lock(71620262);
  if p_returned_at is null or p_returned_at>now() then raise exception 'Actual return must be no later than now'; end if;
  if nullif(trim(p_remarks),'') is null then raise exception 'Please confirm that you have resumed duty'; end if;
  if exists(select 1 from public.staff_return_requests where employee_id=me and status='Pending') then raise exception 'Your return is already awaiting Admin/Director approval'; end if;
  select id,effective_from into aid,started from public.store_incharge_assignments where nursing_manager_id=me and status='Active' and effective_from<=now() order by effective_from desc limit 1;
  if p_leave_id is not null then
    select * into lr from public.absence_requests where id=p_leave_id for update;
    if not found or lr.employee_id<>me or lr.request_type<>'Leave' or lr.status<>'approved' or lr.return_to_duty_date is not null then raise exception 'Select your own approved leave awaiting return'; end if;
    if (p_returned_at at time zone 'Asia/Kolkata')::date<lr.from_date then raise exception 'Return cannot precede the leave start'; end if;
    if exists(select 1 from public.staff_return_requests where leave_id=p_leave_id and status='Approved') then raise exception 'This return has already been approved'; end if;
  elsif aid is null then raise exception 'Select an approved leave'; end if;
  if aid is not null and p_returned_at<started then raise exception 'Return cannot precede the handover start'; end if;
  insert into public.staff_return_requests(employee_id,leave_id,assignment_id,returned_at,remarks) values(me,p_leave_id,aid,p_returned_at,trim(p_remarks)) returning id into rid;
  return jsonb_build_object('message','Return submitted. Awaiting Admin/Director approval; delegated rights remain unchanged.','id',rid);
end $$;

create or replace function public.decide_staff_return(p_request_id uuid,p_approve boolean,p_remarks text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; r public.staff_return_requests%rowtype; lr public.absence_requests%rowtype; day date; aid uuid;
begin
  if not public.stores_return_approval_allowed() then raise exception 'Only Admin/Director can approve a return'; end if;
  select actor_id into me from public.stores_actor();
  if p_approve is null or nullif(trim(p_remarks),'') is null then raise exception 'Decision and confirmation remarks are required'; end if;
  perform pg_advisory_xact_lock(71620262);
  select * into r from public.staff_return_requests where id=p_request_id for update;
  if not found or r.status<>'Pending' then raise exception 'This request is no longer pending'; end if;
  if r.employee_id=me then raise exception 'Another Admin/Director must approve your return'; end if;
  if p_approve then
    day:=(r.returned_at at time zone 'Asia/Kolkata')::date;
    select id into aid from public.store_incharge_assignments where nursing_manager_id=r.employee_id and status='Active' and effective_from<=now() order by effective_from desc limit 1;
    if aid is not null then
      if r.assignment_id is not null and r.assignment_id<>aid then raise exception 'The handover changed. Reject this request and ask staff to resubmit'; end if;
      perform public.approve_stores_return_to_duty(aid,r.returned_at,trim(p_remarks));
    end if;
    if r.leave_id is not null then
      select * into lr from public.absence_requests where id=r.leave_id for update;
      if lr.return_to_duty_date is null then
        if lr.status<>'approved' or lr.employee_id<>r.employee_id or day<lr.from_date then raise exception 'Leave changed. Review the leave before approving'; end if;
        update public.absence_requests set original_leave_to_date=coalesce(original_leave_to_date,to_date),return_to_duty_date=day,return_recorded_by=me,return_recorded_at=now(),return_remarks=trim(p_remarks),
          to_date=case when day<=to_date then greatest(from_date,day-1) else to_date end,
          status=case when day=from_date then 'cancelled' else status end,
          cancelled_at=case when day=from_date then now() else cancelled_at end where id=lr.id;
      elsif lr.return_to_duty_date<>day then raise exception 'A different return date is already recorded. Review this request'; end if;
    end if;
  end if;
  update public.staff_return_requests set status=case when p_approve then 'Approved' else 'Rejected' end,decided_by=me,decided_at=now(),decision_remarks=trim(p_remarks) where id=r.id;
  insert into public.audit_log(user_id,action,entity,entity_id,details) values(me,case when p_approve then 'Approved' else 'Rejected' end,'Return to Duty',r.id::text,jsonb_build_object('employee_id',r.employee_id,'returned_at',r.returned_at,'remarks',trim(p_remarks)));
  return jsonb_build_object('message',case when p_approve then 'Return approved.' else 'Return rejected. Staff can submit a corrected request.' end);
end $$;
revoke all on function public.staff_return_workspace(),public.submit_staff_return(bigint,timestamptz,text),public.decide_staff_return(uuid,boolean,text) from public,anon;
grant execute on function public.staff_return_workspace(),public.submit_staff_return(bigint,timestamptz,text),public.decide_staff_return(uuid,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
