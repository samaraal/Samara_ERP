-- Samara Care ERP V5.3: restore employee access and require active profiles
-- Run once in Supabase SQL Editor.

-- Restore all existing employee profiles as active.
update public.profiles
set is_active = true,
    updated_at = now()
where is_active is distinct from true;

-- Remove any authentication ban previously applied by the employee toggle function.
-- This permits the restored employees to sign in again with their existing passwords.
update auth.users
set banned_until = null,
    updated_at = now()
where id in (select id from public.profiles where is_active = true);

-- Keep role names in the supported set. Review any exceptional records manually.
update public.profiles
set role = 'Caregiver', updated_at = now()
where role is null
   or role not in ('Admin','Manager','Nurse','Caregiver','Accounts','Kitchen');
