-- SAMARA CARE ERP V6.1
-- Login ID authentication compatibility for existing and new employees.

alter table public.profiles
  add column if not exists auth_email text;

-- Link every existing profile to its actual Supabase Authentication email.
update public.profiles p
set auth_email = lower(u.email)
from auth.users u
where u.id = p.id
  and u.email is not null
  and (p.auth_email is null or lower(p.auth_email) is distinct from lower(u.email));

create unique index if not exists profiles_auth_email_unique
on public.profiles (lower(auth_email))
where auth_email is not null;

-- Anonymous login resolver. Returns only the internal authentication email
-- for an enabled employee Login ID. Password verification remains with Supabase Auth.
create or replace function public.resolve_employee_login(p_login_id text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(coalesce(p.auth_email, u.email))
  from public.profiles p
  left join auth.users u on u.id = p.id
  where lower(trim(p.login_id)) = lower(trim(p_login_id))
    and coalesce(p.is_active, p.active, true) = true
    and coalesce(p.active, p.is_active, true) = true
  limit 1;
$$;

revoke all on function public.resolve_employee_login(text) from public;
grant execute on function public.resolve_employee_login(text) to anon, authenticated;

-- Keep auth_email synchronized when an Authentication user email changes.
create or replace function public.sync_profile_auth_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.profiles
  set auth_email = lower(new.email)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_profile_auth_email_trigger on auth.users;
create trigger sync_profile_auth_email_trigger
after insert or update of email on auth.users
for each row execute function public.sync_profile_auth_email();

-- Verification report.
select
  p.full_name,
  p.login_id,
  p.role,
  p.active,
  p.is_active,
  p.auth_email,
  u.email as authentication_email,
  case
    when u.id is null then 'AUTH USER MISSING'
    when lower(coalesce(p.auth_email,'')) <> lower(coalesce(u.email,'')) then 'EMAIL LINK MISMATCH'
    when coalesce(p.active,p.is_active,true) is not true or coalesce(p.is_active,p.active,true) is not true then 'DISABLED'
    else 'READY'
  end as login_status
from public.profiles p
left join auth.users u on u.id = p.id
order by p.full_name;
