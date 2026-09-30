-- SAMARA CARE ERP 2.15.20 — one-tap calling of a Guest's relatives from the Guest's Overview.
-- Returns ONLY the active family contacts (name, relationship, mobile) of ONE Guest, to
-- Admin, Manager, Nurse and Accounts. No PIN, e-mail or portal login details are returned.
-- Read-only. Run once in Supabase > SQL Editor. Safe to run again.

create or replace function public.guest_call_contacts(p_patient uuid)
returns table(relative_name text, relationship text, mobile text, primary_contact boolean)
language sql stable security definer set search_path=public as $$
  select f.relative_name::text, f.relationship::text, f.mobile::text, coalesce(f.primary_contact,false)
  from public.family_portal_access f
  where f.patient_id = p_patient
    and coalesce(f.is_active,true)
    and nullif(trim(coalesce(f.mobile,'')),'') is not null
    and public.current_user_has_role(array['Admin','Manager','Nurse','Accounts'])
  order by coalesce(f.primary_contact,false) desc, f.created_at
$$;

revoke all on function public.guest_call_contacts(uuid) from public, anon;
grant execute on function public.guest_call_contacts(uuid) to authenticated;

-- Check: should show call_contacts_ready = true
select to_regprocedure('public.guest_call_contacts(uuid)') is not null as call_contacts_ready;
