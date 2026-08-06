-- Samara Care ERP V6.2 - Stable authentication foundation
-- This migration keeps existing employee profile IDs and links them to Supabase Auth users.

alter table public.profiles
  add column if not exists auth_user_id uuid;

create unique index if not exists profiles_auth_user_id_unique
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

alter table public.profiles
  add column if not exists auth_email text;

alter table public.profiles
  add column if not exists active boolean default true;

alter table public.profiles
  add column if not exists is_active boolean default true;

-- Link profiles that already use the same UUID as auth.users.
update public.profiles p
set auth_user_id = u.id,
    auth_email = lower(u.email)
from auth.users u
where p.id = u.id
  and (p.auth_user_id is null or p.auth_email is null);

-- Link by an already stored authentication email.
update public.profiles p
set auth_user_id = u.id,
    auth_email = lower(u.email)
from auth.users u
where p.auth_user_id is null
  and p.auth_email is not null
  and lower(p.auth_email) = lower(u.email);

-- Link legacy accounts by metadata Login ID or email prefix.
update public.profiles p
set auth_user_id = u.id,
    auth_email = lower(u.email)
from auth.users u
where p.auth_user_id is null
  and lower(trim(p.login_id)) = lower(coalesce(u.raw_user_meta_data ->> 'login_id', split_part(u.email, '@', 1)));

-- Employee creation is handled by the protected admin-users Edge Function.
-- Remove old auth triggers that attempted a second insert into profiles.
do $$
declare r record;
begin
  for r in
    select t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and not t.tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', r.tgname);
  end loop;
end $$;

create or replace function public.resolve_employee_login(p_login_id text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_login text := lower(trim(p_login_id));
  v_email text;
begin
  select lower(u.email)
  into v_email
  from public.profiles p
  join auth.users u
    on u.id = coalesce(p.auth_user_id, p.id)
  where lower(trim(p.login_id)) = v_login
    and coalesce(p.active, true)
    and coalesce(p.is_active, true)
  limit 1;
  return v_email;
end;
$$;

revoke all on function public.resolve_employee_login(text) from public;
grant execute on function public.resolve_employee_login(text) to anon, authenticated;

-- Diagnostic view for Admin checks.
create or replace view public.employee_auth_diagnostics as
select
  p.id as profile_id,
  p.auth_user_id,
  p.full_name,
  p.login_id,
  p.role,
  p.active,
  p.is_active,
  p.auth_email,
  u.email as actual_auth_email,
  u.last_sign_in_at,
  case
    when p.auth_user_id is null then 'AUTH USER MISSING'
    when u.id is null then 'AUTH LINK BROKEN'
    when not coalesce(p.active, true) or not coalesce(p.is_active, true) then 'DISABLED'
    else 'READY'
  end as authentication_status
from public.profiles p
left join auth.users u on u.id = p.auth_user_id;

select * from public.employee_auth_diagnostics order by full_name;
