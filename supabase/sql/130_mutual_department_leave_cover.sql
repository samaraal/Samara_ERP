-- Approved leave adds the absent department to the employee providing cover.
-- The extra duties end only on an approved return or authorised cancellation.
begin;
create table if not exists public.department_leave_covers(
 id uuid primary key default gen_random_uuid(),leave_id bigint not null unique references public.absence_requests(id),
 absent_profile_id uuid not null references public.profiles(id),cover_profile_id uuid references public.profiles(id),
 absent_duties jsonb not null,cover_duties jsonb,
 starts_at timestamptz not null,expected_return_at timestamptz not null,
 created_at timestamptz not null default statement_timestamp(),created_by uuid,
 ended_at timestamptz,ended_by uuid,end_reason text,
 check(absent_profile_id is distinct from cover_profile_id),check(expected_return_at>starts_at)
);
alter table public.department_leave_covers enable row level security;
revoke all on public.department_leave_covers from public,anon,authenticated;
create table if not exists public.department_leave_permission_backup(kind text,identity text,definition text,primary key(kind,identity));
alter table public.department_leave_permission_backup enable row level security;
revoke all on public.department_leave_permission_backup from public,anon,authenticated,service_role;

-- Preserve the previous implementation once; rerunning must not alias a wrapper.
do $$ declare item record;source text;begin
 for item in select * from (values
 ('duty_swap_profile','duty_training_profile'),('duty_swap_context','duty_training_context'),
 ('duty_responsible_profile_id','duty_training_responsible_profile_id'),
 ('stores_controller_authorised','stores_controller_before_leave_cover'),('fv_access','fv_access_before_leave_cover'),
 ('claim_department_duty_notice','claim_training_duty_notice')) x(original,alias) loop
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=item.alias) then
   select pg_get_functiondef(p.oid) into source from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=item.original;
   if source is null then raise exception 'Required function missing: %',item.original;end if;
   insert into public.department_leave_permission_backup values('function',item.original,source) on conflict do nothing;
   execute replace(source,'FUNCTION public.'||item.original||'(','FUNCTION public.'||item.alias||'(');
  end if;
 end loop;
end $$;
revoke all on function public.duty_training_profile(public.profiles),public.duty_training_context(),public.duty_training_responsible_profile_id(uuid),public.stores_controller_before_leave_cover(),public.fv_access_before_leave_cover(),public.claim_training_duty_notice() from public,anon,authenticated;

create or replace function public.active_department_leave_cover(p_profile uuid)
returns public.department_leave_covers language sql stable security definer set search_path=public,pg_temp as $$
 select c from public.department_leave_covers c
 join public.profiles a on a.id=c.absent_profile_id join public.profiles b on b.id=c.cover_profile_id
 join public.absence_requests r on r.id=c.leave_id
 where c.cover_profile_id=p_profile and c.ended_at is null and c.starts_at<=statement_timestamp()
 and r.status='approved' and r.return_to_duty_date is null
 and coalesce(a.active,true) and coalesce(a.is_active,true) and coalesce(b.active,true) and coalesce(b.is_active,true)
 and jsonb_build_object('role',a.role,'designation',a.designation,'department',a.department)=c.absent_duties
 and jsonb_build_object('role',b.role,'designation',b.designation,'department',b.department)=c.cover_duties
 and not exists(select 1 from public.department_leave_covers own_leave where own_leave.absent_profile_id=b.id and own_leave.ended_at is null and own_leave.starts_at<=statement_timestamp())
 order by c.starts_at limit 1
$$;
revoke all on function public.active_department_leave_cover(uuid) from public,anon,authenticated;

create or replace function public.sync_department_leave_cover()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.profiles%rowtype;b public.profiles%rowtype;c public.department_leave_covers%rowtype;start_time timestamptz;return_time timestamptz;eligible integer;
begin
 perform pg_advisory_xact_lock(71620262);
 select * into c from public.department_leave_covers where leave_id=new.id for update;
 if c.id is not null and c.ended_at is null and (new.status<>'approved' or new.return_to_duty_date is not null or new.request_type<>'Leave') then
  if c.starts_at<=statement_timestamp() and not public.stores_return_approval_allowed() then raise exception 'Admin/Director must approve the return before ending active department cover.';end if;
  if new.return_to_duty_date is not null and (not public.stores_return_approval_allowed() or new.employee_id=auth.uid()) then raise exception 'Another Admin/Director must approve the return.';end if;
  update public.department_leave_covers set ended_at=statement_timestamp(),ended_by=auth.uid(),end_reason=case when new.return_to_duty_date is not null then 'Return approved' else 'Leave cancelled' end where id=c.id;
  return new;
 end if;
 if new.request_type<>'Leave' or new.status<>'approved' or new.return_to_duty_date is not null then return new;end if;
 if c.ended_at is not null then return new;end if;
 select * into a from public.profiles where id=new.employee_id;
 if not (a.role='STD' or (a.role='Manager' and lower(trim(a.designation)) in('nurse manager','nursing manager'))) then return new;end if;
 if exists(select 1 from public.director_office_positions where position_key='director' and assigned_profile_id=a.id) then return new;end if;
 -- Do not resurrect historical leaves when unrelated metadata is edited.
 if c.id is null and new.to_date<(statement_timestamp() at time zone 'Asia/Kolkata')::date then return new;end if;
 start_time:=new.from_date::timestamp at time zone 'Asia/Kolkata';
 return_time:=(new.to_date+1)::timestamp at time zone 'Asia/Kolkata';
 if c.id is not null and c.starts_at<=statement_timestamp() and start_time<>c.starts_at then raise exception 'An active leave cover start cannot be changed. Admin/Director must approve the return.';end if;
 if start_time is null or return_time is null or return_time<=start_time then raise exception 'Select valid leave dates.';end if;
 if exists(select 1 from public.department_duty_swaps where cancelled_at is null and ends_at>greatest(statement_timestamp(),start_time)) then
  raise exception 'Admin/Director must end the conflicting training swap before approving this department leave.';
 end if;
 select count(*) into eligible from public.profiles p where coalesce(p.active,true) and coalesce(p.is_active,true)
 and ((a.role='STD' and p.role='Manager' and lower(trim(p.designation)) in('nurse manager','nursing manager')) or (a.role='Manager' and p.role='STD'))
 and not exists(select 1 from public.director_office_positions d where d.position_key='director' and d.assigned_profile_id=p.id);
 if eligible=1 then
  select * into b from public.profiles p where coalesce(p.active,true) and coalesce(p.is_active,true)
  and ((a.role='STD' and p.role='Manager' and lower(trim(p.designation)) in('nurse manager','nursing manager')) or (a.role='Manager' and p.role='STD'))
  and not exists(select 1 from public.director_office_positions d where d.position_key='director' and d.assigned_profile_id=p.id);
 end if;
 insert into public.department_leave_covers(leave_id,absent_profile_id,cover_profile_id,absent_duties,cover_duties,starts_at,expected_return_at,created_by)
 values(new.id,a.id,b.id,jsonb_build_object('role',a.role,'designation',a.designation,'department',a.department),
 case when b.id is not null then jsonb_build_object('role',b.role,'designation',b.designation,'department',b.department) end,start_time,return_time,auth.uid())
 on conflict(leave_id) do update set starts_at=excluded.starts_at,expected_return_at=excluded.expected_return_at;
 return new;
end $$;
revoke all on function public.sync_department_leave_cover() from public,anon,authenticated;
drop trigger if exists department_leave_cover_sync on public.absence_requests;
create trigger department_leave_cover_sync after insert or update of status,from_date,to_date,return_to_duty_date,request_type on public.absence_requests for each row execute function public.sync_department_leave_cover();

create or replace function public.guard_department_leave_conflicts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(71620262);
 if tg_table_name='profiles' then
  if (new.role,new.designation,new.department) is distinct from(old.role,old.designation,old.department)
  and exists(select 1 from public.department_leave_covers where old.id in(absent_profile_id,cover_profile_id) and ended_at is null) then
   raise exception 'Resolve the department leave cover before changing permanent duties.';
  end if;
 elsif exists(select 1 from public.department_leave_covers where ended_at is null and starts_at<new.ends_at) then
  raise exception 'Approve the return from leave before scheduling a conflicting training swap.';
 end if;
 return new;
end $$;
revoke all on function public.guard_department_leave_conflicts() from public,anon,authenticated;
drop trigger if exists department_leave_profile_guard on public.profiles;
create trigger department_leave_profile_guard before update of role,designation,department on public.profiles for each row execute function public.guard_department_leave_conflicts();
drop trigger if exists department_leave_swap_guard on public.department_duty_swaps;
create trigger department_leave_swap_guard before insert or update of starts_at,ends_at on public.department_duty_swaps for each row execute function public.guard_department_leave_conflicts();

create or replace function public.duty_swap_profile(p public.profiles)
returns public.profiles language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.department_leave_covers%rowtype;
begin
 p:=public.duty_training_profile(p);c:=public.active_department_leave_cover(p.id);
 if c.id is not null and c.absent_duties->>'role'='Manager' then
  p.role:=c.absent_duties->>'role';p.designation:=c.absent_duties->>'designation';p.department:=c.absent_duties->>'department';
 end if;
 return p;
end $$;
create or replace function public.department_permission_profiles(p public.profiles)
returns setof public.profiles language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.department_leave_covers%rowtype;q public.profiles%rowtype;duties jsonb;
begin
 q:=public.duty_swap_profile(p);return next q;c:=public.active_department_leave_cover(p.id);
 if c.id is not null then
  duties:=case when c.absent_duties->>'role'=q.role then c.cover_duties else c.absent_duties end;
  p.role:=duties->>'role';p.designation:=duties->>'designation';p.department:=duties->>'department';return next p;
 end if;
 return;
end $$;
create or replace view public.duty_permission_profiles with(security_invoker=true) as select effective.* from public.profiles p cross join lateral public.department_permission_profiles(p) effective;
revoke all on public.duty_permission_profiles from public,anon,authenticated;
grant select on public.duty_permission_profiles to authenticated,service_role;
revoke all on function public.department_permission_profiles(public.profiles) from public,anon;
grant execute on function public.department_permission_profiles(public.profiles) to authenticated,service_role;

-- Preserve every existing row predicate, changing only the source of role membership.
do $$ declare r record;source text;changed text;f record;begin
 for r in select * from pg_policies where schemaname='public' and (qual~'\mduty_profiles\M' or with_check~'\mduty_profiles\M') loop
  source:=format('alter policy %I on public.%I%s%s',r.policyname,r.tablename,case when r.qual is null then '' else ' using ('||r.qual||')' end,case when r.with_check is null then '' else ' with check ('||r.with_check||')' end);
  insert into public.department_leave_permission_backup values('policy',r.tablename||'.'||r.policyname,source) on conflict do nothing;
  execute regexp_replace(source,'\mduty_profiles\M','duty_permission_profiles','g');
 end loop;
 for f in select p.oid,p.oid::regprocedure::text identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='current_user_has_role' loop
  source:=pg_get_functiondef(f.oid);changed:=regexp_replace(source,'\mduty_profiles\M','duty_permission_profiles','g');
  if changed<>source then insert into public.department_leave_permission_backup values('function',f.identity,source) on conflict do nothing;execute changed;end if;
 end loop;
end $$;

create or replace function public.duty_responsible_profile_id(p_id uuid)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.department_leave_covers%rowtype;
begin
 select x.* into c from public.department_leave_covers x where x.absent_profile_id=p_id and x.ended_at is null and x.starts_at<=statement_timestamp()
 and (public.active_department_leave_cover(x.cover_profile_id)).id=x.id limit 1;
 if c.id is not null then return c.cover_profile_id;end if;
 return public.duty_training_responsible_profile_id(p_id);
end $$;
create or replace function public.stores_controller_authorised()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select (public.active_department_leave_cover(auth.uid())).id is not null or public.stores_controller_before_leave_cover()
$$;
create or replace function public.fv_access()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 result:=public.fv_access_before_leave_cover();
 if (public.active_department_leave_cover(auth.uid())).id is not null then result:=result||jsonb_build_object('control',true,'read',true);end if;
 return result;
end $$;

create or replace function public.duty_swap_context()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;c public.department_leave_covers%rowtype;boundary timestamptz;roles jsonb;
begin
 result:=public.duty_training_context();c:=public.active_department_leave_cover(auth.uid());
 select jsonb_agg(distinct role) into roles from public.duty_permission_profiles where id=auth.uid();
 select min(starts_at) into boundary from public.department_leave_covers where auth.uid() in(absent_profile_id,cover_profile_id) and ended_at is null and starts_at>statement_timestamp();
 if boundary is not null and (result->>'next_change_at' is null or boundary<(result->>'next_change_at')::timestamptz) then result:=result||jsonb_build_object('next_change_at',boundary);end if;
 return result||jsonb_build_object('roles',roles,'leave_cover',case when c.id is null then null else jsonb_build_object('id',c.id,'absent_profile_id',c.absent_profile_id,'covering_role',c.absent_duties->>'role','covering_designation',c.absent_duties->>'designation','expected_return_at',c.expected_return_at,'starts_at',c.starts_at) end);
end $$;

-- The inbox is the union of the existing STD and Nursing Manager scopes.
create or replace function public.wa_std_row(r jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select nullif(r->>'career_application_id','') is null and nullif(r->>'application_id','') is null
 and lower(coalesce(r->>'template_name',''))<>'employee_welcome_samara'
 and lower(coalesce(r->>'source_type','')) !~ '(patient|family|emergency|hr applicant|employee)'
 and lower(coalesce(r->>'communication_type','')) !~ '(payment|receipt|daily report|discharge|employee|emergency|family portal|patient)'
$$;
create or replace function public.has_department_leave_cover()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select (public.active_department_leave_cover(auth.uid())).id is not null
$$;
alter policy nursing_food_whatsapp_scope on public.hr_whatsapp_communications
 using(not wa_food_only() or (wa_food_active() and (wa_food_row(to_jsonb(hr_whatsapp_communications)) or (has_department_leave_cover() and wa_std_row(to_jsonb(hr_whatsapp_communications))))))
 with check(not wa_food_only() or (wa_food_active() and (wa_food_row(to_jsonb(hr_whatsapp_communications)) or (has_department_leave_cover() and wa_std_row(to_jsonb(hr_whatsapp_communications))))));
create or replace function public.wa_food_inbox()
returns setof public.hr_whatsapp_communications language sql stable security invoker set search_path=public,pg_temp as $$
 select * from hr_whatsapp_communications h where wa_food_active() and (wa_food_row(to_jsonb(h)) or (has_department_leave_cover() and wa_std_row(to_jsonb(h)))) order by created_at desc limit 1000
$$;
create or replace function public.wa_food_guard(p_user uuid,p_phone text default null,p_media text default null,p_template text default null)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p profiles;cover boolean;
begin
 select * into p from duty_profiles where id=p_user or auth_user_id=p_user;
 if not found or not coalesce(p.is_active,p.active,false) then return false;end if;
 if not coalesce(wa_food_is_nursing(to_jsonb(p)),false) then return p.role in ('Admin','Manager');end if;
 cover:=(public.active_department_leave_cover(p.id)).id is not null;
 if p_media is not null then
  return exists(select 1 from hr_whatsapp_communications h where (wa_food_row(to_jsonb(h)) or (cover and wa_std_row(to_jsonb(h)))) and h.direction='inbound' and h.message_type in ('image','audio','video','document','sticker') and h.message_payload->h.message_type->>'id'=p_media);
 end if;
 -- STD has no broader send permission. Cover keeps the Nursing Manager send scope.
 return (p_template is null or p_template='samara_callback_request') and wa_food_vendor(p_phone);
end $$;
revoke all on function public.wa_std_row(jsonb),public.has_department_leave_cover() from public,anon;
grant execute on function public.wa_std_row(jsonb),public.has_department_leave_cover() to authenticated,service_role;

create or replace function public.department_leave_workspace()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid;manager boolean;entries jsonb;
begin
 select id into me from profiles where id=auth.uid() and coalesce(active,true) and coalesce(is_active,true);
 if me is null then raise exception 'Active employee login required.';end if;
 manager:=stores_return_approval_allowed();
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'absent_name',a.full_name,'cover_name',b.full_name,
 'absent_role',case when c.absent_duties->>'role'='STD' then 'STD' else 'Nursing Manager' end,
 'starts_at',c.starts_at,'expected_return_at',c.expected_return_at,'ended_at',c.ended_at,'end_reason',c.end_reason,
 'status',case when c.ended_at is not null then c.end_reason when c.cover_profile_id is null then 'Admin/Director attention needed: no unique covering employee'
 when not coalesce(a.active,true) or not coalesce(a.is_active,true) or not coalesce(b.active,true) or not coalesce(b.is_active,true) then 'Admin/Director attention needed: inactive employee'
 when exists(select 1 from department_leave_covers own_leave where own_leave.absent_profile_id=c.cover_profile_id and own_leave.ended_at is null and own_leave.starts_at<=greatest(statement_timestamp(),c.starts_at)) then 'Admin/Director attention needed: covering employee also on leave'
 when c.starts_at>statement_timestamp() then 'Scheduled' else 'Covering until return is approved' end) order by c.starts_at desc),'[]'::jsonb)
 into entries from department_leave_covers c join profiles a on a.id=c.absent_profile_id left join profiles b on b.id=c.cover_profile_id
 where manager or me in(c.absent_profile_id,c.cover_profile_id);
 return jsonb_build_object('can_manage',manager,'assignments',entries);
end $$;
revoke all on function public.department_leave_workspace() from public,anon;
grant execute on function public.department_leave_workspace() to authenticated;

create table if not exists public.department_leave_notice_receipts(
 profile_id uuid not null references public.profiles(id),cover_id uuid not null references public.department_leave_covers(id),
 notice_date date not null,displayed_at timestamptz not null default statement_timestamp(),primary key(profile_id,cover_id,notice_date)
);
alter table public.department_leave_notice_receipts enable row level security;
revoke all on public.department_leave_notice_receipts from public,anon,authenticated;
create or replace function public.claim_department_duty_notice()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.department_leave_covers%rowtype;me profiles;claimed integer;today date:=(statement_timestamp() at time zone 'Asia/Kolkata')::date;
begin
 select * into me from profiles where id=auth.uid() and coalesce(active,true) and coalesce(is_active,true);
 if not found then raise exception 'Active employee login required.';end if;
 c:=active_department_leave_cover(me.id);
 if c.id is null then return claim_training_duty_notice();end if;
 insert into department_leave_notice_receipts(profile_id,cover_id,notice_date) values(me.id,c.id,today) on conflict do nothing;
 get diagnostics claimed=row_count;if claimed=0 then return null;end if;
 return jsonb_build_object('id',c.id,'profile_id',me.id,'kind','leave','name',me.full_name,'notice_date',today,
 'acting_as',case when c.absent_duties->>'role'='STD' then 'STD' else 'Nursing Manager' end,'starts_at',c.starts_at,'upcoming',false);
end $$;
notify pgrst,'reload schema';
commit;
