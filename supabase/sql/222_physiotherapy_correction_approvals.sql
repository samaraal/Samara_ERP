begin;
create table if not exists public.physiotherapy_corrections (
 id uuid primary key default gen_random_uuid(), session_id uuid not null,
 action text not null check(action in ('Delete','Modify','Reschedule')),
 reason text not null check(length(trim(reason))>0), proposed jsonb not null,
 original jsonb not null, requested_by uuid not null, requested_at timestamptz not null default now(),
 state text not null default 'Pending' check(state in ('Pending','Applying','Approved','Rejected','Restored')),
 reviewed_by uuid, reviewed_at timestamptz, review_note text
);
create unique index if not exists physiotherapy_correction_pending on public.physiotherapy_corrections(session_id) where state in ('Pending','Applying');
alter table public.physiotherapy_corrections enable row level security;
revoke all on public.physiotherapy_corrections from anon, authenticated;
grant select on public.physiotherapy_corrections to authenticated;

create or replace function public.physiotherapy_can_review() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid())
 and coalesce(p.active,true) and coalesce(p.is_active,true)
 and (p.role='Admin' or lower(trim(coalesce(p.designation,''))) in ('nurse manager','nursing manager')
 or (coalesce(trim(p.designation),'')='' and p.role='Manager' and lower(trim(coalesce(p.department,'')))='nursing')));
$$;
revoke all on function public.physiotherapy_can_review() from public;
grant execute on function public.physiotherapy_can_review() to authenticated;
drop policy if exists physiotherapy_corrections_read on public.physiotherapy_corrections;
create policy physiotherapy_corrections_read on public.physiotherapy_corrections for select to authenticated
 using(requested_by=auth.uid() or public.physiotherapy_can_review());

create or replace function public.request_physiotherapy_correction(p_session uuid,p_action text,p_reason text,p_proposed jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.physiotherapy_sessions%rowtype; rid uuid; d date;
begin
 if auth.uid() is null or not(public.current_user_has_role(array['Nurse','Caregiver','Admin']) or public.physiotherapy_can_review()) then raise exception 'Clinical staff access required';end if;
 if p_action not in ('Delete','Modify','Reschedule') or nullif(trim(p_reason),'') is null then raise exception 'Select an action and enter a reason';end if;
 select * into s from public.physiotherapy_sessions where id=p_session for update;
 if not found then raise exception 'Session no longer exists';end if;
 if coalesce((to_jsonb(s)->>'billable')::boolean,false) or to_jsonb(s)->>'charge_request_id' is not null then raise exception 'Billing-linked session: Accounts must review the charge first';end if;
 if p_action in ('Modify','Reschedule') then
   d:=(p_proposed->>'session_date')::date;
   if d is null or nullif(p_proposed->>'scheduled_time','') is null then raise exception 'Enter the revised date and time';end if;
   perform (p_proposed->>'scheduled_time')::time;
   if p_action='Modify' and (coalesce(p_proposed->>'status','') not in ('Completed','Pending','Not Done') or (p_proposed->>'status'='Completed' and d>(now() at time zone 'Asia/Kolkata')::date)) then raise exception 'Invalid status or future completion date';end if;
   if p_action='Reschedule' and d<(now() at time zone 'Asia/Kolkata')::date then raise exception 'Reschedule to today or a future date';end if;
 end if;
 insert into public.physiotherapy_corrections(session_id,action,reason,proposed,original,requested_by)
 values(p_session,p_action,trim(p_reason),coalesce(p_proposed,'{}'),to_jsonb(s),auth.uid()) returning id into rid;
 perform public.record_audit_event('Physiotherapy Correction Requested','Physiotherapy',p_session::text,jsonb_build_object('request_id',rid,'action',p_action,'reason',p_reason),'Success');
 return rid;
end $$;

create or replace function public.review_physiotherapy_correction(p_request uuid,p_approve boolean,p_note text default '')
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.physiotherapy_corrections%rowtype; s public.physiotherapy_sessions%rowtype;
begin
 if not public.physiotherapy_can_review() then raise exception 'Nursing Manager or Admin approval required';end if;
 select * into r from public.physiotherapy_corrections where id=p_request for update;
 if not found or r.state<>'Pending' then raise exception 'Request already reviewed or unavailable';end if;
 if r.requested_by=auth.uid() then raise exception 'Another Nursing Manager or Admin must review your request';end if;
 if not p_approve then
   if nullif(trim(p_note),'') is null then raise exception 'Enter a reason for rejection';end if;
   update public.physiotherapy_corrections set state='Rejected',reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note where id=r.id;
 else
   select * into s from public.physiotherapy_sessions where id=r.session_id for update;
   if not found or to_jsonb(s)<>r.original then raise exception 'Session changed since this request. Reject it and submit a new request';end if;
   if coalesce((to_jsonb(s)->>'billable')::boolean,false) or to_jsonb(s)->>'charge_request_id' is not null then raise exception 'Accounts must review the linked charge first';end if;
   if r.action<>'Delete' and exists(select 1 from public.patients p where p.id=s.patient_id and (p.is_active=false or p.admission_status='Discharged')) then raise exception 'Patient discharged: cannot modify or reschedule';end if;
   if r.action='Modify' and r.proposed->>'status'='Completed' and (r.proposed->>'session_date')::date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Future completion is not permitted';end if;
   if r.action='Reschedule' and (r.proposed->>'session_date')::date<(now() at time zone 'Asia/Kolkata')::date then raise exception 'Requested date has passed. Reject and submit a new request';end if;
   update public.physiotherapy_corrections set state='Applying',reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note where id=r.id;
   if r.action='Delete' then delete from public.physiotherapy_sessions where id=s.id;
   else
     update public.physiotherapy_sessions set
       session_date=(r.proposed->>'session_date')::date,
       scheduled_time=(r.proposed->>'scheduled_time')::time,
       status=case when r.action='Reschedule' then 'Pending' else r.proposed->>'status' end,
       session_at=case when r.action='Modify' and r.proposed->>'status'='Completed' then coalesce(s.session_at,now()) else null end,
       reason=r.reason, notes=case when r.action='Modify' then r.proposed->>'notes' else s.notes end, updated_at=now()
     where id=s.id;
   end if;
   update public.physiotherapy_corrections set state='Approved' where id=r.id;
 end if;
 perform public.record_audit_event(case when p_approve then 'Physiotherapy Correction Approved' else 'Physiotherapy Correction Rejected' end,'Physiotherapy',r.session_id::text,jsonb_build_object('request_id',r.id,'action',r.action,'reason',r.reason,'original',r.original,'proposed',r.proposed,'review_note',p_note),'Success');
end $$;

-- Preserve deleted records in the request; reviewers can restore an approved deletion.
create or replace function public.restore_physiotherapy_deletion(p_request uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.physiotherapy_corrections%rowtype;
begin
 if not public.physiotherapy_can_review() then raise exception 'Nursing Manager or Admin required';end if;
 select * into r from public.physiotherapy_corrections where id=p_request for update;
 if not found or r.action<>'Delete' or r.state<>'Approved' then raise exception 'Approved deletion not found';end if;
 insert into public.physiotherapy_sessions select (jsonb_populate_record(null::public.physiotherapy_sessions,r.original)).*;
 update public.physiotherapy_corrections set state='Restored',reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 perform public.record_audit_event('Physiotherapy Deletion Restored','Physiotherapy',r.session_id::text,jsonb_build_object('request_id',r.id),'Success');
end $$;

-- Prevent bypass by direct updates or Record Session upserts on existing entries.
create or replace function public.guard_physiotherapy_correction() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
   if (to_jsonb(new)-array['billable','billing_rate','charge_request_id','updated_at'])=(to_jsonb(old)-array['billable','billing_rate','charge_request_id','updated_at']) then return new;end if;
   -- Recording an actual outcome for a planned Pending session is routine care.
   if old.status='Pending' and old.session_at is null and new.status in ('Completed','Not Done')
      and new.session_date<=(now() at time zone 'Asia/Kolkata')::date
      and (new.status<>'Completed' or new.session_at is not null)
      and public.current_user_has_role(array['Nurse','Caregiver','Admin','Manager'])
      and (to_jsonb(new)-array['status','session_at','performed_by','reason','notes','updated_at'])=(to_jsonb(old)-array['status','session_at','performed_by','reason','notes','updated_at']) then return new;end if;
 end if;
 if auth.uid() is null or not public.physiotherapy_can_review() or not exists(
 select 1 from public.physiotherapy_corrections where session_id=old.id and state='Applying' and reviewed_by=auth.uid()) then
 raise exception 'Existing sessions require a correction request and Nursing Manager/Admin approval';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists physiotherapy_correction_guard on public.physiotherapy_sessions;
create trigger physiotherapy_correction_guard before update or delete on public.physiotherapy_sessions for each row execute function public.guard_physiotherapy_correction();

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='physiotherapy_corrections') then
 alter publication supabase_realtime add table public.physiotherapy_corrections;
 end if;
end $$;

revoke all on function public.request_physiotherapy_correction(uuid,text,text,jsonb),public.review_physiotherapy_correction(uuid,boolean,text),public.restore_physiotherapy_deletion(uuid),public.guard_physiotherapy_correction() from public;
grant execute on function public.request_physiotherapy_correction(uuid,text,text,jsonb),public.review_physiotherapy_correction(uuid,boolean,text),public.restore_physiotherapy_deletion(uuid) to authenticated;
commit;
notify pgrst,'reload schema';
select to_regclass('public.physiotherapy_corrections') is not null as approvals_ready;
