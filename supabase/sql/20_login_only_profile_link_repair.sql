-- SAMARA CARE ERP 1.0.18
-- LOGIN-ONLY REPAIR
-- This migration does not alter clinical, patient, employee, billing, report,
-- room, document, dashboard or UI data.

alter table public.profiles add column if not exists auth_user_id uuid;
alter table public.profiles add column if not exists auth_email text;

create unique index if not exists profiles_auth_user_id_unique
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

create or replace function public.get_my_employee_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_login text;
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    return null;
  end if;

  select lower(u.email),
         lower(trim(coalesce(u.raw_user_meta_data ->> 'login_id', split_part(u.email,'@',1))))
    into v_email, v_login
  from auth.users u
  where u.id = v_uid;

  -- First use an existing correct link.
  select p.* into v_profile
  from public.profiles p
  where p.id = v_uid or p.auth_user_id = v_uid
  limit 1;

  -- Repair legacy accounts by matching the stored authentication email,
  -- employee email, Login ID, or the Authentication email prefix.
  if v_profile.id is null then
    select p.* into v_profile
    from public.profiles p
    where (p.auth_email is not null and lower(trim(p.auth_email)) = v_email)
       or (p.employee_email is not null and lower(trim(p.employee_email)) = v_email)
       or (p.login_id is not null and lower(trim(p.login_id)) = v_login)
       or (p.login_id is not null and lower(trim(p.login_id)) = lower(split_part(v_email,'@',1)))
    order by
      case when p.auth_email is not null and lower(trim(p.auth_email)) = v_email then 1
           when p.employee_email is not null and lower(trim(p.employee_email)) = v_email then 2
           else 3 end,
      p.created_at
    limit 1;
  end if;

  if v_profile.id is null then
    return null;
  end if;

  if v_profile.auth_user_id is not null and v_profile.auth_user_id <> v_uid then
    return null;
  end if;

  update public.profiles
     set auth_user_id = v_uid,
         auth_email = coalesce(v_email, auth_email),
         updated_at = now()
   where id = v_profile.id;

  select p.* into v_profile from public.profiles p where p.id = v_profile.id;
  return to_jsonb(v_profile);
end;
$$;

revoke all on function public.get_my_employee_profile() from public;
grant execute on function public.get_my_employee_profile() to authenticated;

-- Also improve Login ID resolution for already-created employee accounts.
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
  select lower(coalesce(u.email,p.auth_email,p.employee_email))
    into v_email
  from public.profiles p
  left join auth.users u
    on u.id = coalesce(p.auth_user_id,p.id)
  where lower(trim(p.login_id)) = v_login
    and coalesce(p.active,true)
    and coalesce(p.is_active,true)
  limit 1;
  return v_email;
end;
$$;

revoke all on function public.resolve_employee_login(text) from public;
grant execute on function public.resolve_employee_login(text) to anon, authenticated;
