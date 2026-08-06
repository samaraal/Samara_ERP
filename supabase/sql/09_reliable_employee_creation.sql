-- Samara Care ERP V5.5
-- Safe compatibility for employee account creation and recovery.

alter table public.profiles
  add column if not exists active boolean default true;

alter table public.profiles
  add column if not exists is_active boolean default true;

update public.profiles
set active = coalesce(active, is_active, true),
    is_active = coalesce(is_active, active, true);

create unique index if not exists profiles_login_id_lower_unique
  on public.profiles (lower(login_id))
  where login_id is not null and trim(login_id) <> '';

-- Employee IDs are checked in the Edge Function because older data may contain duplicates.
-- This query displays profiles that do not currently match an Authentication user.
select
  p.id,
  p.full_name,
  p.employee_id,
  p.login_id,
  p.role,
  p.active,
  p.is_active,
  case when u.id is null then 'AUTH USER MISSING' else 'CONNECTED' end as authentication_status
from public.profiles p
left join auth.users u on u.id = p.id
order by p.full_name;
