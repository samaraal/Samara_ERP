-- Time-bounded operational duties; permanent employee records remain unchanged.
begin;
create table if not exists public.department_duty_swaps(
 id uuid primary key default gen_random_uuid(),
 std_profile_id uuid not null references public.profiles(id),
 nursing_profile_id uuid not null references public.profiles(id),
 starts_at timestamptz not null, ends_at timestamptz not null,
 reason text not null, std_duties jsonb not null, nursing_duties jsonb not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 cancelled_at timestamptz,cancelled_by uuid references public.profiles(id),cancellation_reason text,
 check(std_profile_id<>nursing_profile_id),check(ends_at>starts_at),check(length(trim(reason))>0)
);
alter table public.department_duty_swaps enable row level security;
revoke all on public.department_duty_swaps from public,anon,authenticated;

create or replace function public.duty_swap_profile(p public.profiles)
returns public.profiles language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.department_duty_swaps%rowtype; duties jsonb;
begin
 select x.* into s from public.department_duty_swaps x
 join public.profiles a on a.id=x.std_profile_id
 join public.profiles b on b.id=x.nursing_profile_id
 where p.id in (x.std_profile_id,x.nursing_profile_id) and x.cancelled_at is null
 and x.starts_at<=statement_timestamp() and x.ends_at>statement_timestamp()
 and coalesce(a.active,true) and coalesce(a.is_active,true) and coalesce(b.active,true) and coalesce(b.is_active,true)
 and jsonb_build_object('role',a.role,'designation',a.designation,'department',a.department)=x.std_duties
 and jsonb_build_object('role',b.role,'designation',b.designation,'department',b.department)=x.nursing_duties
 order by x.starts_at desc limit 1;
 if s.id is null then return p;end if;
 duties:=case when p.id=s.std_profile_id then s.nursing_duties else s.std_duties end;
 p.role:=duties->>'role';p.designation:=duties->>'designation';p.department:=duties->>'department';
 return p;
end $$;
-- security_invoker retains the existing profile row policies.
create or replace view public.duty_profiles with(security_invoker=true) as
 select effective.* from public.profiles p cross join lateral public.duty_swap_profile(p) effective;
revoke all on public.duty_profiles from public,anon,authenticated;
grant select on public.duty_profiles to authenticated,service_role;
revoke all on function public.duty_swap_profile(public.profiles) from public,anon;
grant execute on function public.duty_swap_profile(public.profiles) to authenticated,service_role;

-- Resolve named departmental supervision without rewriting personal leave records.
create or replace function public.duty_responsible_profile_id(p_id uuid)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare original public.profiles%rowtype; effective public.profiles%rowtype; counterpart uuid;
begin
 select * into original from public.profiles where id=p_id;
 if not found then return p_id;end if;
 effective:=public.duty_swap_profile(original);
 if effective.role is not distinct from original.role then return p_id;end if;
 select case when p_id=std_profile_id then nursing_profile_id else std_profile_id end into counterpart
 from public.department_duty_swaps where p_id in(std_profile_id,nursing_profile_id) and cancelled_at is null
 and starts_at<=statement_timestamp() and ends_at>statement_timestamp() limit 1;
 return coalesce(counterpart,p_id);
end $$;
revoke all on function public.duty_responsible_profile_id(uuid) from public,anon;
grant execute on function public.duty_responsible_profile_id(uuid) to authenticated,service_role;

create or replace function public.duty_swap_workspace()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid; manager boolean; entries jsonb; candidates jsonb;
begin
 select id into me from public.profiles where id=auth.uid() and coalesce(active,true) and coalesce(is_active,true);
 if me is null then raise exception 'Active employee login required.';end if;
 manager:=public.stores_return_approval_allowed();
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'std_profile_id',s.std_profile_id,'nursing_profile_id',s.nursing_profile_id,
   'std_name',a.full_name,'nursing_name',b.full_name,'starts_at',s.starts_at,'ends_at',s.ends_at,'reason',s.reason,
   'created_by_name',c.full_name,'cancelled_at',s.cancelled_at,'cancellation_reason',s.cancellation_reason,
   'status',case when s.cancelled_at is not null then 'Cancelled' when s.ends_at<=statement_timestamp() then 'Expired'
   when not coalesce(a.active,true) or not coalesce(a.is_active,true) or not coalesce(b.active,true) or not coalesce(b.is_active,true) then 'Inactive employee'
   when s.starts_at>statement_timestamp() then 'Scheduled' else 'Active' end) order by s.starts_at desc),'[]'::jsonb)
 into entries from public.department_duty_swaps s join public.profiles a on a.id=s.std_profile_id
 join public.profiles b on b.id=s.nursing_profile_id join public.profiles c on c.id=s.created_by
 where manager or me in(s.std_profile_id,s.nursing_profile_id);
 if manager then
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role,'designation',p.designation,'department',p.department) order by p.full_name),'[]'::jsonb)
 into candidates from public.profiles p where coalesce(p.active,true) and coalesce(p.is_active,true)
 and (p.role='STD' or (p.role='Manager' and lower(trim(p.designation)) in ('nurse manager','nursing manager')))
 and not exists(select 1 from public.director_office_positions d where d.position_key='director' and d.assigned_profile_id=p.id);
 end if;
 return jsonb_build_object('can_manage',manager,'assignments',entries,'candidates',coalesce(candidates,'[]'::jsonb),'server_now',statement_timestamp());
end $$;

create or replace function public.duty_swap_context()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare base public.profiles%rowtype; effective public.profiles%rowtype; assignment jsonb; boundary timestamptz;
begin
 select * into base from public.profiles where id=auth.uid();
 if not found or not coalesce(base.active,true) or not coalesce(base.is_active,true) then raise exception 'Active employee login required.';end if;
 effective:=public.duty_swap_profile(base);
 select jsonb_build_object('id',id,'ends_at',ends_at,'starts_at',starts_at,'acting_as',case when base.id=std_profile_id then 'Nursing Manager' else 'STD' end)
 into assignment from public.department_duty_swaps where base.id in(std_profile_id,nursing_profile_id)
 and cancelled_at is null and starts_at<=statement_timestamp() and ends_at>statement_timestamp()
 and effective.role is distinct from base.role limit 1;
 select min(t) into boundary from public.department_duty_swaps s cross join lateral(values(s.starts_at),(s.ends_at)) as b(t)
 where base.id in(s.std_profile_id,s.nursing_profile_id) and s.cancelled_at is null and t>statement_timestamp();
 return jsonb_build_object('profile_id',base.id,'role',effective.role,'designation',effective.designation,'department',effective.department,
 'regular_role',base.role,'regular_designation',base.designation,'regular_department',base.department,
 'assignment',assignment,'acting_for_profile_id',public.duty_responsible_profile_id(base.id),
 'next_change_at',boundary,'server_now',statement_timestamp(),'can_manage',public.stores_return_approval_allowed());
end $$;

create or replace function public.create_department_duty_swap(p_std uuid,p_nursing uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.profiles%rowtype;b public.profiles%rowtype;new_id uuid;
begin
 if not public.stores_return_approval_allowed() then raise exception 'Only Admin/Director may interchange department duties.';end if;
 perform pg_advisory_xact_lock(71620262);
 if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_ends_at<=statement_timestamp()
   or not isfinite(p_starts_at) or not isfinite(p_ends_at) then raise exception 'Select a valid start and future end time.';end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Assignment reason required.';end if;
 select * into a from public.profiles where id=p_std for update;
 select * into b from public.profiles where id=p_nursing for update;
 if a.id is null or b.id is null or a.id=b.id or a.role<>'STD' or b.role<>'Manager'
 or lower(trim(coalesce(b.designation,''))) not in('nurse manager','nursing manager')
 or not coalesce(a.active,true) or not coalesce(a.is_active,true) or not coalesce(b.active,true) or not coalesce(b.is_active,true) then
 raise exception 'Choose an active regular STD and Nursing Manager.';end if;
 if exists(select 1 from public.director_office_positions where position_key='director' and assigned_profile_id in(a.id,b.id)) then raise exception 'Director duties cannot be swapped.';end if;
 if exists(select 1 from public.store_incharge_assignments where status='Active' and effective_from<p_ends_at) then
 raise exception 'Resolve the existing Stores leave handover before scheduling an overlapping department swap.';end if;
 if exists(select 1 from public.department_duty_swaps where cancelled_at is null and starts_at<p_ends_at and ends_at>p_starts_at) then
 raise exception 'Another department swap overlaps this period.';end if;
 insert into public.department_duty_swaps(std_profile_id,nursing_profile_id,starts_at,ends_at,reason,std_duties,nursing_duties,created_by)
 values(a.id,b.id,p_starts_at,p_ends_at,trim(p_reason),jsonb_build_object('role',a.role,'designation',a.designation,'department',a.department),
 jsonb_build_object('role',b.role,'designation',b.designation,'department',b.department),auth.uid()) returning id into new_id;
 insert into public.audit_log(user_id,action,entity,entity_id,details) values(auth.uid(),'Scheduled','Department Duty Swap',new_id::text,
 jsonb_build_object('std',a.id,'nursing_manager',b.id,'starts_at',p_starts_at,'ends_at',p_ends_at,'reason',trim(p_reason)));
 return new_id;
end $$;

create or replace function public.cancel_department_duty_swap(p_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.stores_return_approval_allowed() then raise exception 'Only Admin/Director may end a duty swap.';end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Cancellation reason required.';end if;
 perform pg_advisory_xact_lock(71620262);
 update public.department_duty_swaps set cancelled_at=statement_timestamp(),cancelled_by=auth.uid(),cancellation_reason=trim(p_reason)
 where id=p_id and cancelled_at is null and ends_at>statement_timestamp();
 if not found then raise exception 'This assignment has already ended.';end if;
 insert into public.audit_log(user_id,action,entity,entity_id,details) values(auth.uid(),'Cancelled','Department Duty Swap',p_id::text,jsonb_build_object('reason',trim(p_reason)));
end $$;

create or replace function public.guard_department_duty_conflicts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(71620262);
 if TG_TABLE_NAME='profiles' then
   if (new.role,new.designation,new.department) is distinct from (old.role,old.designation,old.department)
   and exists(select 1 from public.department_duty_swaps where old.id in(std_profile_id,nursing_profile_id) and cancelled_at is null and ends_at>statement_timestamp()) then
     raise exception 'End the temporary department assignment before changing permanent duties.';
   end if;
 elsif new.status='Active' and exists(select 1 from public.department_duty_swaps where cancelled_at is null and ends_at>greatest(statement_timestamp(),new.effective_from)) then
   raise exception 'End the department swap before assigning a Stores leave handover.';
 end if;
 return new;
end $$;
drop trigger if exists department_duty_profile_guard on public.profiles;
create trigger department_duty_profile_guard before update of role,designation,department on public.profiles for each row execute function public.guard_department_duty_conflicts();
drop trigger if exists department_duty_handover_guard on public.store_incharge_assignments;
create trigger department_duty_handover_guard before insert or update on public.store_incharge_assignments for each row execute function public.guard_department_duty_conflicts();

revoke all on function public.guard_department_duty_conflicts() from public,anon,authenticated;
revoke all on function public.duty_swap_workspace(),public.duty_swap_context(),public.create_department_duty_swap(uuid,uuid,timestamptz,timestamptz,text),public.cancel_department_duty_swap(uuid,text) from public,anon;
grant execute on function public.duty_swap_workspace(),public.duty_swap_context(),public.create_department_duty_swap(uuid,uuid,timestamptz,timestamptz,text),public.cancel_department_duty_swap(uuid,text) to authenticated;

-- Keep exact pre-migration definitions for review/recovery. Never expose these backups.
create table if not exists public.duty_swap_permission_backup(kind text,identity text,definition text,primary key(kind,identity));
revoke all on public.duty_swap_permission_backup from public,anon,authenticated,service_role;
alter table public.duty_swap_permission_backup enable row level security;
do $$ declare f record;definition text;changed text;r record;using_sql text;check_sql text;
begin
 for f in select p.oid,p.oid::regprocedure::text identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and p.proname=any(array[
 'current_user_has_role','discharge_review_authorised','samara_current_role','samara_can_manage_finance',
 'complete_patient_discharge','generate_daily_accommodation_charges','decide_bill_charge_request','assign_patient_room','transfer_patient_room',
 'decide_bill_charge_request_v3','close_patient_discharge_accounts_v2','confirm_patient_departure_v2','confirm_patient_departure_v3',
 'consumables_actor','upsert_family_portal_access','set_family_portal_access_status','set_absence_request_decision_meta',
 'decide_bill_charge_request_v4','decide_bill_charge_request_v5','get_absence_people','current_absence_is_management','process_absence_request',
 'approve_patient_discharge_v2','accounts_verify_discharge_refund','approve_bill_charge_request','ensure_discharge_refund_request',
 'samara_guard_duty_duplicate','set_patient_daily_billing','renew_patient_package','can_manage_employee_profiles','current_user_is_nurse_manager',
 'resolve_patient_consumable_discrepancy','receive_consumable_store_stock','reconcile_consumable_store_stock','handover_patient_consumable_indent',
 'resolve_clinical_escalation','stores_actor','spot_assessment_stamp','spot_assessment_staff_access','fv_access','op_trial_access',
 'record_absence_early_return','wa_food_guard','wa_food_only','wa_food_active','enforce_discharge_initiator','fv_submit_order','discharge_management_snapshot'])
 loop
   definition:=pg_get_functiondef(f.oid);
   if definition ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(public[.])?profiles\M' then
     raise exception 'Permission migration needs manual review for profile-writing function %',f.identity;
   end if;
   changed:=regexp_replace(definition,'\mprofiles\M','duty_profiles','g');
   if changed<>definition then
     insert into public.duty_swap_permission_backup values('function',f.identity,definition) on conflict do nothing;
     execute changed;
   end if;
 end loop;
 for r in select * from pg_policies where schemaname='public' and (qual ~ '\mprofiles\M' or with_check ~ '\mprofiles\M') loop
   using_sql:=regexp_replace(r.qual,'\mprofiles\M','duty_profiles','g');
   check_sql:=regexp_replace(r.with_check,'\mprofiles\M','duty_profiles','g');
   definition:=format('alter policy %I on public.%I%s%s',r.policyname,r.tablename,
     case when r.qual is not null then ' using ('||r.qual||')' else '' end,
     case when r.with_check is not null then ' with check ('||r.with_check||')' else '' end);
   insert into public.duty_swap_permission_backup values('policy',r.tablename||'.'||r.policyname,definition) on conflict do nothing;
   execute format('alter policy %I on public.%I%s%s',r.policyname,r.tablename,
     case when using_sql is not null then ' using ('||using_sql||')' else '' end,
     case when check_sql is not null then ' with check ('||check_sql||')' else '' end);
 end loop;
end $$;
-- Employment history must retain permanent target details; change only the caller check.
do $$ declare f record;definition text;changed text;begin
 for f in select p.oid,p.oid::regprocedure::text identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='record_employee_employment_action' loop
  definition:=pg_get_functiondef(f.oid);
  changed:=regexp_replace(definition,'(select[[:space:]]+role[[:space:]]+into[[:space:]]+me_role[[:space:]]+from[[:space:]]+)public[.]profiles','\1public.duty_profiles','i');
  if changed<>definition then
   insert into public.duty_swap_permission_backup values('function',f.identity,definition) on conflict do nothing;
   execute changed;
  elsif definition !~ 'duty_profiles' then raise exception 'Employment permission definition requires review';end if;
 end loop;
end $$;
-- Existing requests keep their original superior and audit identity. Only current authority moves.
do $$ declare f record;definition text;changed text;r record;using_sql text;begin
 for f in select p.oid,p.oid::regprocedure::text identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='process_absence_request' loop
  definition:=pg_get_functiondef(f.oid);
  if definition !~ 'duty_responsible_profile_id' then
   changed:=replace(definition,'r.reporting_superior_id::text','public.duty_responsible_profile_id(r.reporting_superior_id)::text');
   changed:=replace(changed,'public.duty_responsible_profile_id(r.reporting_superior_id)::text<>me.id::text','public.duty_responsible_profile_id(r.reporting_superior_id) is distinct from me.id');
   if changed=definition then raise exception 'Leave supervisor permission definition requires review';end if;
   insert into public.duty_swap_permission_backup values('function',f.identity,definition) on conflict do nothing;
   execute changed;
  end if;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='absence_requests'
 and qual ~ '\mreporting_superior_id\M' and qual !~ 'duty_responsible_profile_id' loop
  insert into public.duty_swap_permission_backup values('policy',r.tablename||'.'||r.policyname,
   format('alter policy %I on public.%I using (%s)',r.policyname,r.tablename,r.qual)) on conflict do nothing;
  using_sql:=regexp_replace(r.qual,'\mreporting_superior_id\M','public.duty_responsible_profile_id(reporting_superior_id)','g');
  execute format('alter policy %I on public.%I using (%s)',r.policyname,r.tablename,using_sql);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
