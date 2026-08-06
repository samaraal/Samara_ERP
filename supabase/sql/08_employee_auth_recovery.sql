-- Samara Care ERP V5.4
-- Employee authentication status, active-column compatibility and account recovery support.

alter table public.profiles
  add column if not exists active boolean not null default true;

alter table public.profiles
  add column if not exists is_active boolean not null default true;

update public.profiles
set active = coalesce(is_active, active, true),
    is_active = coalesce(is_active, active, true);

create or replace function public.sync_profile_active_columns()
returns trigger
language plpgsql
as $$
begin
  if new.is_active is distinct from old.is_active then
    new.active := new.is_active;
  elsif new.active is distinct from old.active then
    new.is_active := new.active;
  else
    new.active := coalesce(new.active, new.is_active, true);
    new.is_active := coalesce(new.is_active, new.active, true);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_active_columns_trigger on public.profiles;
create trigger sync_profile_active_columns_trigger
before update on public.profiles
for each row execute function public.sync_profile_active_columns();

update auth.users
set banned_until = null
where id in (select id from public.profiles where coalesce(is_active, active, true) = true);

select
  p.full_name,
  p.login_id,
  p.role,
  p.active,
  p.is_active,
  case when u.id is null then 'MISSING AUTH USER'
       when u.banned_until is not null and u.banned_until > now() then 'BLOCKED'
       when u.email_confirmed_at is null then 'UNCONFIRMED'
       else 'CONNECTED'
  end as authentication_status,
  u.last_sign_in_at
from public.profiles p
left join auth.users u on u.id = p.id
order by p.full_name;
