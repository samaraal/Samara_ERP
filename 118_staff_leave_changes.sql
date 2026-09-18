begin;
create table if not exists public.staff_leave_changes(
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.profiles(id),
 leave_id bigint not null references public.absence_requests(id),
 original_from date not null, original_to date not null, requested_from date not null, requested_to date not null,
 original_values jsonb not null, reason text not null,
 status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),
 submitted_at timestamptz not null default now(), decided_by uuid references public.profiles(id),
 decided_at timestamptz, decision_remarks text,
 check(requested_to>=requested_from)
);
create unique index if not exists staff_leave_change_pending on public.staff_leave_changes(leave_id) where status='Pending';
alter table public.staff_leave_changes enable row level security;
revoke all on public.staff_leave_changes from public,anon,authenticated;

create or replace function public.staff_leave_change_workspace()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; approver boolean;
begin
 select id into me from public.profiles where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(is_active,true) limit 1;
 if me is null then raise exception 'Active staff login required'; end if;
 approver:=public.stores_return_approval_allowed();
 return jsonb_build_object('can_approve',approver,
 'leaves',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'from_date',r.from_date,'to_date',r.to_date,'leave_type',r.leave_type) order by r.from_date desc) from public.absence_requests r where employee_id=me and request_type='Leave' and status='approved' and return_to_duty_date is null and not exists(select 1 from public.staff_return_requests s where s.leave_id=r.id and s.status in ('Pending','Approved'))),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(q order by q.submitted_at desc) from (select s.*,p.full_name as employee_name,dp.full_name as decided_by_name from public.staff_leave_changes s join public.profiles p on p.id=s.employee_id left join public.profiles dp on dp.id=s.decided_by where s.employee_id=me or approver order by (s.status='Pending') desc,s.submitted_at desc limit 200) q),'[]'::jsonb));
end $$;

create or replace function public.submit_staff_leave_change(p_leave_id bigint,p_from date,p_to date,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; r public.absence_requests%rowtype; today date:=(now() at time zone 'Asia/Kolkata')::date; rid uuid;
begin
 select id into me from public.profiles where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(is_active,true) limit 1;
 if me is null then raise exception 'Active staff login required'; end if;
 perform pg_advisory_xact_lock(71620262);
 select * into r from public.absence_requests where id=p_leave_id for update;
 if not found or r.employee_id<>me or r.request_type<>'Leave' or r.status<>'approved' or r.return_to_duty_date is not null then raise exception 'Select your own approved leave awaiting return'; end if;
 if p_from is null or p_to is null or p_to<p_from then raise exception 'Enter a valid revised leave period'; end if;
 if p_from=r.from_date and p_to=r.to_date then raise exception 'Change at least one leave date'; end if;
 if r.from_date<=today and p_from<>r.from_date then raise exception 'The start date of leave already started cannot be changed'; end if;
 if r.from_date>today and p_from<today then raise exception 'New leave start cannot be in the past'; end if;
 if p_to<today then raise exception 'For an actual earlier return, use Return to Duty'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A reason for the revised dates is required'; end if;
 if exists(select 1 from public.staff_return_requests where employee_id=me and status='Pending') then raise exception 'Your Return to Duty is awaiting approval. Resolve that request first'; end if;
 if exists(select 1 from public.staff_leave_changes where leave_id=r.id and status='Pending') then raise exception 'A change to this leave is already awaiting approval'; end if;
 if exists(select 1 from public.absence_requests where employee_id=me and id<>r.id and request_type='Leave' and status='approved' and from_date<=p_to and to_date>=p_from) then raise exception 'Revised dates overlap another approved leave'; end if;
 insert into public.staff_leave_changes(employee_id,leave_id,original_from,original_to,requested_from,requested_to,original_values,reason) values(me,r.id,r.from_date,r.to_date,p_from,p_to,to_jsonb(r),trim(p_reason)) returning id into rid;
 return jsonb_build_object('id',rid,'message','Leave change submitted for Admin/Director approval. Current approved dates remain unchanged.');
end $$;

create or replace function public.decide_staff_leave_change(p_request_id uuid,p_approve boolean,p_remarks text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; s public.staff_leave_changes%rowtype; r public.absence_requests%rowtype; a public.store_incharge_assignments%rowtype; today date:=(now() at time zone 'Asia/Kolkata')::date; expected timestamptz;
begin
 if not public.stores_return_approval_allowed() then raise exception 'Only Admin/Director can approve leave changes'; end if;
 select actor_id into me from public.stores_actor();
 if p_approve is null or nullif(trim(p_remarks),'') is null then raise exception 'Decision remarks are required'; end if;
 perform pg_advisory_xact_lock(71620262);
 select * into s from public.staff_leave_changes where id=p_request_id for update;
 if not found or s.status<>'Pending' then raise exception 'This request is no longer pending'; end if;
 if s.employee_id=me then raise exception 'Another Admin/Director must decide your request'; end if;
 if p_approve then
   select * into r from public.absence_requests where id=s.leave_id for update;
   if not found or r.employee_id<>s.employee_id or r.status<>'approved' or r.return_to_duty_date is not null or r.from_date<>s.original_from or r.to_date<>s.original_to then raise exception 'The leave changed. Reject this request and ask staff to resubmit'; end if;
   if (r.from_date<=today and s.requested_from<>r.from_date) or (r.from_date>today and s.requested_from<today) or s.requested_to<today then raise exception 'These dates are no longer valid. Reject and request current dates or Return to Duty'; end if;
   if exists(select 1 from public.staff_return_requests where employee_id=s.employee_id and status='Pending') then raise exception 'Return to Duty is awaiting approval. Resolve it first'; end if;
   if exists(select 1 from public.absence_requests where employee_id=s.employee_id and id<>r.id and request_type='Leave' and status='approved' and from_date<=s.requested_to and to_date>=s.requested_from) then raise exception 'Revised dates overlap another approved leave'; end if;
   update public.absence_requests set from_date=s.requested_from,to_date=s.requested_to where id=r.id;
   -- Keep the active handover; only revise its expected return for the current leave.
   if r.from_date<=today then
     for a in select * from public.store_incharge_assignments where nursing_manager_id=s.employee_id and status='Active' and effective_from<=now() for update loop
       expected:=((s.requested_to+1)+(a.effective_until at time zone 'Asia/Kolkata')::time) at time zone 'Asia/Kolkata';
       if expected>a.effective_from then perform public.modify_stores_std_assignment(a.id,a.effective_from,expected,'Approved leave change: '||s.reason); end if;
     end loop;
   end if;
 end if;
 update public.staff_leave_changes set status=case when p_approve then 'Approved' else 'Rejected' end,decided_by=me,decided_at=now(),decision_remarks=trim(p_remarks) where id=s.id;
 insert into public.audit_log(user_id,action,entity,entity_id,details) values(me,case when p_approve then 'Approved' else 'Rejected' end,'Leave Date Change',s.id::text,jsonb_build_object('leave_id',s.leave_id,'original_from',s.original_from,'original_to',s.original_to,'requested_from',s.requested_from,'requested_to',s.requested_to,'reason',s.reason,'decision',trim(p_remarks)));
 return jsonb_build_object('message',case when p_approve then 'Leave dates updated. Original dates and approval history retained.' else 'Leave change rejected. Previously approved dates remain unchanged.' end);
end $$;
revoke all on function public.staff_leave_change_workspace(),public.submit_staff_leave_change(bigint,date,date,text),public.decide_staff_leave_change(uuid,boolean,text) from public,anon;
grant execute on function public.staff_leave_change_workspace(),public.submit_staff_leave_change(bigint,date,date,text),public.decide_staff_leave_change(uuid,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
