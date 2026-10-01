-- ERP 2.15.44. Run after migrations through 182, before deploying the new UI.
-- Food vendor responsibility is independent of Nursing Manager, STD, Stores and duty cover.
-- This transaction stops without making changes unless exactly one active STD named Akshi exists.
begin;
create table if not exists public.fv_assignments (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references public.profiles(id),
 staff_name text not null,
 starts_at timestamptz not null default now(),
 ends_at timestamptz,
 revoked_at timestamptz,
 reason text not null check(length(trim(reason))>0),
 assigned_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at)
);
create table if not exists public.fv_assignment_audit (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references public.fv_assignments(id),
 action text not null,
 actor uuid references public.profiles(id),
 reason text not null,
 before_data jsonb,
 after_data jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.fv_assignment_requests (
 id uuid primary key, actor uuid not null, payload jsonb not null, result jsonb not null
);
alter table public.fv_assignments enable row level security;
alter table public.fv_assignment_audit enable row level security;
alter table public.fv_assignment_requests enable row level security;
revoke all on public.fv_assignments,public.fv_assignment_audit,public.fv_assignment_requests from public,anon,authenticated;
grant all on public.fv_assignments,public.fv_assignment_audit,public.fv_assignment_requests to service_role;

-- Internal identity helper: base profile only, never a temporary/duty-cover role.
create or replace function public.fv_authority_for(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p jsonb; n integer; full_access boolean:=false; assigned boolean:=false; director boolean:=false; current_assignment jsonb;
begin
 select count(*),jsonb_agg(to_jsonb(x))->0 into n,p from public.profiles x where x.id=p_user or x.auth_user_id=p_user;
 if n<>1 or not coalesce((p->>'is_active')::boolean,true) or not coalesce((p->>'active')::boolean,true) then
  return jsonb_build_object('assignment_version',1,'read',false,'control',false,'billing',false);
 end if;
 if to_regclass('public.director_office_positions') is not null then
  execute 'select exists(select 1 from public.director_office_positions where position_key=''director'' and assigned_profile_id::text=$1)' into director using p->>'id';
 end if;
 full_access:=coalesce(p->>'role'='Admin',false) or director;
 select jsonb_build_object('id',a.id,'profile_id',a.profile_id,'name',a.staff_name,'starts_at',a.starts_at,'ends_at',a.ends_at)
 into current_assignment from public.fv_assignments a join public.profiles x on x.id=a.profile_id
 where a.revoked_at is null and a.starts_at<=statement_timestamp() and (a.ends_at is null or a.ends_at>statement_timestamp())
 and coalesce(x.is_active,true) and coalesce(x.active,true) order by a.starts_at desc limit 1;
 assigned:=coalesce(current_assignment->>'profile_id'=p->>'id',false);
 return jsonb_build_object('assignment_version',1,'actor',p->>'id','name',p->>'full_name',
  'billing',full_access,'control',full_access or assigned,'read',full_access or assigned,'delegated',assigned,
  'assignment',case when full_access or assigned then current_assignment else null end);
end $$;
revoke all on function public.fv_authority_for(uuid) from public,anon,authenticated;
grant execute on function public.fv_authority_for(uuid) to service_role;

create or replace function public.fv_access()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 return public.fv_authority_for(auth.uid());
end $$;
revoke all on function public.fv_access() from public,anon;
grant execute on function public.fv_access() to authenticated,service_role;

create or replace function public.fv_assignment_manage(action text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb; actor_id uuid; target_id uuid; req uuid; old public.fv_assignments; staff public.profiles;
 start_time timestamptz; end_time timestamptz; note text; result jsonb; saved public.fv_assignment_requests; changed public.fv_assignments;
begin
 -- Share the order mutation lock, then recheck current authority after waiting.
 perform pg_advisory_xact_lock(71620261);
 a:=public.fv_access();
 if not coalesce((a->>'billing')::boolean,false) then raise exception 'Only Admin/Director may assign or revoke Food Vendor responsibility';end if;
 actor_id:=(a->>'actor')::uuid;
 if action='list' then
  return jsonb_build_object('staff',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.full_name,'role',x.role,'designation',to_jsonb(x)->>'designation') order by x.full_name) from public.profiles x where coalesce(x.active,true) and coalesce(x.is_active,true) and x.role in ('Admin','Manager','Nurse','Caregiver','Accounts','Kitchen','STD')),'[]'::jsonb),
   'assignments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.fv_assignments x),'[]'::jsonb),
   'history',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select h.*,u.full_name actor_name from public.fv_assignment_audit h left join public.profiles u on u.id=h.actor order by h.created_at desc limit 200) x),'[]'::jsonb));
 end if;
 if action not in ('assign','revoke') then raise exception 'Unknown assignment action';end if;
 req:=nullif(p->>'request_id','')::uuid;
 if req is null then raise exception 'Request id required';end if;
 select * into saved from public.fv_assignment_requests where id=req;
 if found then
  if saved.actor<>actor_id or saved.payload<>jsonb_build_object('action',action,'p',p-'request_id') then raise exception 'Request id already used for another change';end if;
  return saved.result;
 end if;
 note:=trim(p->>'reason');
 if coalesce(length(note),0)<3 or length(note)>2000 then raise exception 'Enter a reason (3–2000 characters)';end if;
 if action='assign' then
  target_id:=(p->>'profile_id')::uuid;
  select * into staff from public.profiles where id=target_id and coalesce(active,true) and coalesce(is_active,true) and role in ('Admin','Manager','Nurse','Caregiver','Accounts','Kitchen','STD');
  if not found then raise exception 'Select an active staff member';end if;
  start_time:=coalesce(nullif(p->>'starts_at','')::timestamptz,statement_timestamp());
  end_time:=nullif(p->>'ends_at','')::timestamptz;
  if start_time<statement_timestamp() then raise exception 'Use Start now or a future start time; access cannot be backdated';end if;
  if end_time is not null and end_time<=start_time then raise exception 'End must be after start';end if;
  if exists(select 1 from public.fv_assignments where revoked_at is null and starts_at>statement_timestamp()) then raise exception 'Revoke the scheduled assignment before creating another';end if;
  for old in select * from public.fv_assignments where revoked_at is null and (ends_at is null or ends_at>start_time) for update loop
   update public.fv_assignments set ends_at=start_time where id=old.id returning * into changed;
   insert into public.fv_assignment_audit(assignment_id,action,actor,reason,before_data,after_data) values(old.id,'Reassigned',actor_id,note,to_jsonb(old),to_jsonb(changed));
  end loop;
  insert into public.fv_assignments(profile_id,staff_name,starts_at,ends_at,reason,assigned_by) values(target_id,staff.full_name,start_time,end_time,note,actor_id) returning * into changed;
  insert into public.fv_assignment_audit(assignment_id,action,actor,reason,after_data) values(changed.id,'Assigned',actor_id,note,to_jsonb(changed));
 else
  select * into old from public.fv_assignments where id=(p->>'id')::uuid for update;
  if not found then raise exception 'Assignment not found';end if;
  if old.revoked_at is not null then raise exception 'Assignment already revoked';end if;
  update public.fv_assignments set revoked_at=statement_timestamp() where id=old.id returning * into changed;
  insert into public.fv_assignment_audit(assignment_id,action,actor,reason,before_data,after_data) values(old.id,'Revoked',actor_id,note,to_jsonb(old),to_jsonb(changed));
 end if;
 result:=to_jsonb(changed);
 insert into public.fv_assignment_requests values(req,actor_id,jsonb_build_object('action',action,'p',p-'request_id'),result);
 return result;
end $$;
revoke all on function public.fv_assignment_manage(text,jsonb) from public,anon;
grant execute on function public.fv_assignment_manage(text,jsonb) to authenticated;

-- Initial assignment is one-time. Rerunning this migration never reassigns responsibility.
do $$ declare target_id uuid; n integer; row_data public.fv_assignments;
begin
 if not exists(select 1 from public.fv_assignment_audit where action='Initial assignment') then
  select count(*),(array_agg(id))[1] into n,target_id from public.profiles
  where role='STD' and coalesce(active,true) and coalesce(is_active,true) and full_name ~* '\mAkshi\M';
  if n<>1 then raise exception 'Expected exactly one active STD profile named Akshi; found %. Verify the staff profile before applying this migration.',n;end if;
  if exists(select 1 from public.fv_assignments) then raise exception 'Existing assignments require review before initial assignment';end if;
  insert into public.fv_assignments(profile_id,staff_name,reason) select id,full_name,'Initial assignment to Akshi (STD), authorised by Admin; replaces automatic Nursing Manager/Stores access.' from public.profiles where id=target_id returning * into row_data;
  insert into public.fv_assignment_audit(assignment_id,action,reason,after_data) values(row_data.id,'Initial assignment',row_data.reason,to_jsonb(row_data));
 end if;
end $$;

-- Restrict vendor conversations even where old Manager/STD/leave-cover policies still apply.
drop policy if exists fv_named_whatsapp_scope on public.hr_whatsapp_communications;
create policy fv_named_whatsapp_scope on public.hr_whatsapp_communications as restrictive for all to authenticated
 using (not public.wa_food_row(to_jsonb(hr_whatsapp_communications)) or coalesce((public.fv_access()->>'read')::boolean,false))
 with check (not public.wa_food_row(to_jsonb(hr_whatsapp_communications)) or coalesce((public.fv_access()->>'control')::boolean,false));
drop policy if exists fv_named_whatsapp_read on public.hr_whatsapp_communications;
create policy fv_named_whatsapp_read on public.hr_whatsapp_communications for select to authenticated
 using (public.wa_food_row(to_jsonb(hr_whatsapp_communications)) and coalesce((public.fv_access()->>'read')::boolean,false));

-- Preserve patient/family and other clinical WhatsApp permissions while closing vendor paths.
do $$ begin
 if to_regprocedure('public.wa_food_guard_before_named_assignment(uuid,text,text,text)') is null then
  alter function public.wa_food_guard(uuid,text,text,text) rename to wa_food_guard_before_named_assignment;
 end if;
end $$;
revoke all on function public.wa_food_guard_before_named_assignment(uuid,text,text,text) from public,anon,authenticated,service_role;
create or replace function public.wa_food_guard(p_user uuid,p_phone text default null,p_media text default null,p_template text default null)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.fv_authority_for(p_user);
begin
 if a->>'actor' is null then return false;end if;
 if p_media is not null then
  if exists(select 1 from public.hr_whatsapp_communications h where public.wa_food_row(to_jsonb(h)) and h.direction='inbound' and h.message_type in ('image','audio','video','document','sticker') and h.message_payload->h.message_type->>'id'=p_media) then return (a->>'read')::boolean;end if;
 elsif public.wa_food_vendor(p_phone) then
  if p_template in ('samara_patient_admission','samara_family_portal_access','samara_discharge_confirmation','appointment_review_reminder','samara_payment_receipt','samara_bill_reminder') and public.wa_patient_contact(p_phone) then
   return public.wa_food_guard_before_named_assignment(p_user,p_phone,p_media,p_template);
  end if;
  return (a->>'control')::boolean and (p_template is null or p_template='samara_callback_request');
 end if;
 return public.wa_food_guard_before_named_assignment(p_user,p_phone,p_media,p_template);
end $$;
revoke all on function public.wa_food_guard(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wa_food_guard(uuid,text,text,text) to service_role;

-- Push delivery follows the current named responsibility, including expiry/revocation.
create or replace function public.fv_claim_reply_push(p_alert_key text,p_subscription uuid,p_alert_type text,p_event_at timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if not exists(select 1 from public.push_subscriptions s
  where s.id=p_subscription and s.is_active
  and coalesce((public.fv_authority_for(coalesce(s.profile_id,s.user_id))->>'read')::boolean,false)
  and p_event_at>=coalesce(s.notifications_enabled_at,s.created_at)
  and p_event_at between clock_timestamp()-interval '24 hours' and clock_timestamp()+interval '5 minutes') then return false;end if;
 insert into public.fv_reply_push_receipts(alert_key,subscription_id,state) values(p_alert_key,p_subscription,'claimed')
 on conflict(alert_key,subscription_id) do update set state='claimed',claimed_at=clock_timestamp(),retry_after=null,tries=fv_reply_push_receipts.tries+1
 where fv_reply_push_receipts.state='retry' and fv_reply_push_receipts.retry_after<=clock_timestamp() and fv_reply_push_receipts.tries<3;
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.fv_claim_reply_push(text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.fv_claim_reply_push(text,uuid,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
