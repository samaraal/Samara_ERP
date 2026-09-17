-- Named Payments & Vouchers Accounts Manager delegation. Global Admin roles are unchanged.
begin;
create table if not exists public.op_trial_manager_assignment (
 singleton boolean primary key default true check(singleton),
 profile_id uuid not null references public.profiles(id),
 assigned_at timestamptz not null default now()
);
alter table public.op_trial_manager_assignment enable row level security;
revoke all on public.op_trial_manager_assignment from public,anon,authenticated;
do $assignment$
declare target uuid;
begin
 select id into strict target from public.profiles where lower(trim(login_id))='rajaiahboomi' and role='Admin' and coalesce(is_active,true);
 insert into public.op_trial_manager_assignment(singleton,profile_id) values(true,target)
 on conflict(singleton) do update set profile_id=excluded.profile_id,assigned_at=now();
end $assignment$;
create or replace function public.op_trial_access() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p jsonb; director boolean:=false; full_access boolean; manager boolean; accountant boolean; has_manager boolean; delegated boolean:=false; des text;dept text;
begin
 if auth.uid() is null then return null;end if;
 select to_jsonb(x) into p from public.profiles x where x.id=auth.uid();
 if p is null or coalesce(p->>'is_active','true')='false' or coalesce(p->>'active','true')='false' then return null;end if;
 if to_regclass('public.director_office_positions') is not null then
 execute 'select exists(select 1 from public.director_office_positions where position_key=''director'' and assigned_profile_id::text=$1)' into director using p->>'id';end if;
 full_access:=coalesce(p->>'role','')='Admin' or director;
 delegated:=full_access and exists(select 1 from public.op_trial_manager_assignment where profile_id=auth.uid());
 des:=lower(trim(coalesce(p->>'designation','')));dept:=lower(trim(coalesce(p->>'department','')));
 manager:=not full_access and coalesce(p->>'role','') in ('Manager','Accounts') and (des in ('accounts manager','accounting manager','finance manager') or (p->>'role'='Manager' and dept in ('accounts','finance','accounts & finance','accounts and finance')));
 accountant:=coalesce(p->>'role','')='Accounts' and not manager and not full_access;
 if not full_access and not manager and not accountant then return null;end if;
 select exists(select 1 from public.profiles x where coalesce(to_jsonb(x)->>'is_active','true')<>'false' and coalesce(to_jsonb(x)->>'active','true')<>'false' and x.role in ('Manager','Accounts') and (lower(trim(coalesce(to_jsonb(x)->>'designation',''))) in ('accounts manager','accounting manager','finance manager') or (x.role='Manager' and lower(trim(coalesce(to_jsonb(x)->>'department',''))) in ('accounts','finance','accounts & finance','accounts and finance')))) into has_manager;
 has_manager:=has_manager or exists(select 1 from public.op_trial_manager_assignment m join public.profiles x on x.id=m.profile_id where x.role='Admin' and coalesce(to_jsonb(x)->>'is_active','true')<>'false' and coalesce(to_jsonb(x)->>'active','true')<>'false');
 return jsonb_build_object('id',p->>'id','name',coalesce(nullif(p->>'full_name',''),'Authorized user'),'role',case when director then 'Director' when full_access then 'Admin' when manager then 'Accounts Manager' else 'Accountant' end,'full',full_access,'prepare',accountant,'pay',accountant,'verify',manager or delegated,'reconcile',manager or delegated,'manager_delegate',delegated,'fallback',false,'missing_manager',not has_manager);
end $$;
commit;
