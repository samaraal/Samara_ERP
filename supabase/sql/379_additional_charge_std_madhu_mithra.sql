-- ERP 2.20.43 — (1) ADDITIONAL CHARGE: a staff member keeps her own role and also holds another role (Madhu Mithra:
-- Manager + STD, from 12-11-2026, because the STD Akshi left without notice). (2) Akshi's STD duties handed to her:
-- Kitchen / Food Stores cash, Food Management, Enquiry Register default person and open enquiries.
-- (3) my_biometric_linked(): the Return to Duty card is shown only to staff without a machine number (and the
-- Nursing Manager during a Stores handover). Needs SQL 130, 183, 186, 196, 239, 242, 339. Run once; safe to run again.
begin;

create table if not exists public.staff_additional_charges(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  role text not null,
  designation text,
  department text,
  starts_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.profiles(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  ended_by uuid references public.profiles(id),
  end_reason text
);
create unique index if not exists staff_additional_charges_one on public.staff_additional_charges(profile_id, role) where ended_at is null;
alter table public.staff_additional_charges enable row level security;
revoke all on public.staff_additional_charges from anon, authenticated;
grant all on public.staff_additional_charges to service_role;

create or replace function public.samara_has_extra_role(p_profile uuid, p_role text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.staff_additional_charges s join public.profiles p on p.id = s.profile_id
                 where (p.id = p_profile or p.auth_user_id = p_profile) and s.role = p_role and s.ended_at is null
                   and s.starts_at <= statement_timestamp() and coalesce(p.is_active,true) and coalesce(p.active,true))
$$;
revoke all on function public.samara_has_extra_role(uuid,text) from public, anon;
grant execute on function public.samara_has_extra_role(uuid,text) to authenticated, service_role;

-- every role check that reads duty_permission_profiles (row policies, current_user_has_role) now sees the extra role
create or replace function public.department_permission_profiles(p public.profiles)
returns setof public.profiles language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.department_leave_covers%rowtype;q public.profiles%rowtype;duties jsonb;x record;
begin
 q:=public.duty_swap_profile(p);return next q;c:=public.active_department_leave_cover(p.id);
 if c.id is not null then
  duties:=case when c.absent_duties->>'role'=q.role then c.cover_duties else c.absent_duties end;
  p.role:=duties->>'role';p.designation:=duties->>'designation';p.department:=duties->>'department';return next p;
 end if;
 -- 2.20.43: standing Additional Charge (e.g. Manager also holding STD) — one extra role row each
 for x in select * from public.staff_additional_charges s where s.profile_id=q.id and s.ended_at is null and s.starts_at<=statement_timestamp() and s.role is distinct from q.role loop
  p.role:=x.role;p.designation:=coalesce(x.designation,p.designation);p.department:=coalesce(x.department,p.department);return next p;
 end loop;
 return;
end $$;
create or replace function public.duty_swap_context()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;c public.department_leave_covers%rowtype;boundary timestamptz;roles jsonb;
begin
 result:=public.duty_training_context();c:=public.active_department_leave_cover(auth.uid());
 select jsonb_agg(distinct role) into roles from public.duty_permission_profiles where id=auth.uid();
 select min(starts_at) into boundary from public.department_leave_covers where auth.uid() in(absent_profile_id,cover_profile_id) and ended_at is null and starts_at>statement_timestamp();
 if boundary is not null and (result->>'next_change_at' is null or boundary<(result->>'next_change_at')::timestamptz) then result:=result||jsonb_build_object('next_change_at',boundary);end if;
 return result||jsonb_build_object('roles',roles,'additional_duties',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'covering_role',s.role,'covering_designation',coalesce(s.designation,s.role),'since',s.starts_at,'reason',s.reason) order by s.starts_at),'[]'::jsonb) from public.staff_additional_charges s join public.profiles me on me.id=s.profile_id where (me.id=auth.uid() or me.auth_user_id=auth.uid()) and s.ended_at is null and s.starts_at<=statement_timestamp()),'leave_cover',case when c.id is null then null else jsonb_build_object('id',c.id,'absent_profile_id',c.absent_profile_id,'covering_role',c.absent_duties->>'role','covering_designation',c.absent_duties->>'designation','expected_return_at',c.expected_return_at,'starts_at',c.starts_at) end);
end $$;


-- WhatsApp Inbox: full STD inbox
create or replace function public.wa_std_inbox_active(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p
 where (p.id=p_user or p.auth_user_id=p_user) and p.role='STD'
 and coalesce(p.is_active,true) and coalesce(p.active,true)) or public.samara_has_extra_role(p_user,'STD')
$$;

-- Housekeeping & General indents: STD requests / receives / uses
do $$ declare def text; n int; begin
  select pg_get_functiondef('public.housekeeping_permissions()'::regprocedure) into def;
  if position('samara_has_extra_role' in def) > 0 then return; end if;
  n := (length(def) - length(replace(def, 'a.actor_role in (''STD'',''Housekeeping'')', ''))) / length('a.actor_role in (''STD'',''Housekeeping'')');
  if n = 0 then raise notice 'housekeeping_permissions: STD check not in the expected form — not changed'; return; end if;
  execute replace(def, 'a.actor_role in (''STD'',''Housekeeping'')', '(a.actor_role in (''STD'',''Housekeeping'') or public.samara_has_extra_role(a.actor_id,''STD''))');
end $$;

-- Return to Duty card: is this staff member on the biometric machine?
create or replace function public.my_biometric_linked()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.attendance_device_users u join public.profiles p on p.id = u.employee_id
                 where not coalesce(u.ignore,false) and (p.id = auth.uid() or p.auth_user_id = auth.uid()))
$$;
revoke all on function public.my_biometric_linked() from public, anon;
grant execute on function public.my_biometric_linked() to authenticated;

-- ---------- Madhu Mithra: additional charge of STD, Akshi's duties handed over ----------
do $$
declare m public.profiles; ak public.profiles; adm public.profiles; n int;
begin
  select count(*) into n from public.profiles where full_name ~* '^\s*madhu\s*mithra\s*$' and coalesce(is_active,true);
  if n <> 1 then raise exception 'Expected exactly one active Madhu Mithra; found %', n; end if;
  select * into m from public.profiles where full_name ~* '^\s*madhu\s*mithra\s*$' and coalesce(is_active,true);
  select * into ak from public.profiles where role = 'STD' and full_name ~* '\mAkshi\M' order by created_at desc limit 1;
  select * into adm from public.profiles where role = 'Admin' and coalesce(is_active,true) order by created_at limit 1;

  insert into public.staff_additional_charges(profile_id, role, designation, department, reason, created_by, created_by_name)
  values (m.id, 'STD', coalesce(nullif(ak.designation,''), 'STD'), coalesce(nullif(ak.department,''), m.department),
          'Additional charge of STD from 12-11-2026 — the STD (Akshi) left without notice on 11-11-2026. Authorised by Admin.', adm.id, 'Admin')
  on conflict (profile_id, role) where ended_at is null do nothing;

  -- Food Management (food-vendor orders / receipts / WhatsApp)
  if not exists(select 1 from public.fv_assignments where profile_id = m.id and revoked_at is null and (ends_at is null or ends_at > now())) then
    update public.fv_assignments set revoked_at = now() where revoked_at is null and ak.id is not null and profile_id = ak.id;
    insert into public.fv_assignments(profile_id, staff_name, reason, assigned_by)
    values (m.id, m.full_name, 'Additional charge of STD (Akshi left without notice) — Food Management moved to Madhu Mithra on 12-11-2026.', adm.id);
  end if;

  -- Enquiry Register: default person + open enquiries that were Akshi's
  update public.enquiry_settings set default_assignee = m.id, updated_by = adm.id, updated_at = now()
   where id and (default_assignee is null or default_assignee = ak.id);
  if ak.id is not null then
    with u as (update public.pre_admission_enquiries set assigned_to = m.id, updated_at = now()
                where assigned_to = ak.id and coalesce(status,'New') not in ('Admitted','Converted to Admission','Closed') returning id)
    insert into public.enquiry_activity(enquiry_id, kind, note, actor, actor_name)
    select id, 'Assigned', 'Assigned to ' || m.full_name || ' (additional charge of STD; Akshi left)', adm.id, 'Admin' from u;
  end if;

  -- Kitchen / Food Stores cash in-charge
  if ak.id is not null and exists(select 1 from public.kitchen_wallet where id = 1 and (primary_staff = ak.id or custodian = ak.id)) then
    update public.kitchen_wallet set primary_staff = case when primary_staff = ak.id then m.id else primary_staff end,
                                     custodian = case when custodian = ak.id then m.id else custodian end where id = 1;
    insert into public.kitchen_audit(action, actor, actor_name, details)
    values ('Primary in-charge changed (STD left without notice)', adm.id, 'Admin',
            jsonb_build_object('from', ak.id, 'from_name', ak.full_name, 'to', m.id, 'to_name', m.full_name,
                               'note', 'Akshi left on 11-11-2026 without handing over; cash in hand to be counted and reconciled by Admin.'));
  end if;
end $$;

notify pgrst, 'reload schema';
commit;

select p.full_name, s.role, s.designation, s.starts_at from public.staff_additional_charges s join public.profiles p on p.id = s.profile_id where s.ended_at is null;
