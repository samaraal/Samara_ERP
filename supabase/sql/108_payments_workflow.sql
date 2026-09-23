-- Strict Accountant -> Accounts Manager -> Admin/Director -> Accountant workflow.
-- Existing records and independent-review checks remain intact.
begin;
create or replace function public.op_trial_access() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p jsonb; director boolean:=false; full_access boolean; manager boolean; accountant boolean; has_manager boolean; des text;dept text;
begin
 if auth.uid() is null then return null;end if;
 select to_jsonb(x) into p from public.profiles x where x.id=auth.uid();
 if p is null or coalesce(p->>'is_active','true')='false' or coalesce(p->>'active','true')='false' then return null;end if;
 if to_regclass('public.director_office_positions') is not null then
 execute 'select exists(select 1 from public.director_office_positions where position_key=''director'' and assigned_profile_id::text=$1)' into director using p->>'id';end if;
 full_access:=coalesce(p->>'role','')='Admin' or director;
 des:=lower(trim(coalesce(p->>'designation','')));dept:=lower(trim(coalesce(p->>'department','')));
 manager:=not full_access and coalesce(p->>'role','') in ('Manager','Accounts') and (des in ('accounts manager','accounting manager','finance manager') or (p->>'role'='Manager' and dept in ('accounts','finance','accounts & finance','accounts and finance')));
 accountant:=coalesce(p->>'role','')='Accounts' and not manager and not full_access;
 if not full_access and not manager and not accountant then return null;end if;
 select exists(select 1 from public.profiles x where coalesce(to_jsonb(x)->>'is_active','true')<>'false' and coalesce(to_jsonb(x)->>'active','true')<>'false' and x.role in ('Manager','Accounts') and (lower(trim(coalesce(to_jsonb(x)->>'designation',''))) in ('accounts manager','accounting manager','finance manager') or (x.role='Manager' and lower(trim(coalesce(to_jsonb(x)->>'department',''))) in ('accounts','finance','accounts & finance','accounts and finance')))) into has_manager;
 return jsonb_build_object('id',p->>'id','name',coalesce(nullif(p->>'full_name',''),'Authorized user'),'role',case when director then 'Director' when full_access then 'Admin' when manager then 'Accounts Manager' else 'Accountant' end,'full',full_access,'prepare',accountant,'pay',accountant,'verify',manager,'reconcile',manager,'fallback',false,'missing_manager',not has_manager);
end $$;
create or replace function public.op_trial_file_allowed(path text,writing boolean) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.op_trial_access();rid uuid;begin
 if a is null then return false;end if;
 begin rid:=split_part(path,'/',1)::uuid;exception when invalid_text_representation then return false;end;
 if writing then return ((a->>'prepare')::boolean or (a->>'pay')::boolean or (a->>'full')::boolean) and (public.op_trial_can_read(rid) or not exists(select 1 from public.op_trial_requests where id=rid));end if;
 return public.op_trial_can_read(rid);
end $$;
do $migration$
begin
 execute replace(pg_get_functiondef('public.op_trial_rpc(text,jsonb)'::regprocedure), 'Only Accountant or Admin/Director may prepare requests', 'Only the Accountant may prepare requests');
end $migration$;
commit;
