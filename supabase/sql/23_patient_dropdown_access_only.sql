-- SAMARA CARE ERP 1.0.21
-- PATIENT DROPDOWN ACCESS-ONLY REPAIR
-- Purpose: allow correctly linked authenticated staff (including Nurse and Caregiver)
-- to pass the existing role-based RLS checks and read active patients.
-- No patient data, clinical records, billing, reports, rooms, documents or UI layouts are altered.

create or replace function public.current_user_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or p.auth_user_id = auth.uid())
      and coalesce(p.active, true) = true
      and coalesce(p.is_active, true) = true
      and lower(trim(p.role)) = any (
        select lower(trim(x)) from unnest(allowed_roles) as x
      )
  );
$$;

revoke all on function public.current_user_has_role(text[]) from public;
grant execute on function public.current_user_has_role(text[]) to authenticated;

-- Re-create only the existing patient read policy so it uses the repaired role checker.
drop policy if exists "authenticated read patients" on public.patients;
create policy "authenticated read patients"
on public.patients
for select
to authenticated
using (
  public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver','Accounts','Kitchen'])
);

-- Verification result: should return true for a logged-in Nurse/Caregiver.
select public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver','Accounts','Kitchen']) as patient_read_access_ready;
