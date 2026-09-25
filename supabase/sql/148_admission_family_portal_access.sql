-- Samara ERP v2.14.56
-- The Admissions page already lets Admin, Manager and the two named Admission
-- Delegates (Jaya, Saranya) complete a patient admission -- see the identical
-- check already enforced client-side before this RPC is even called:
--   "Only Admin, Nursing Manager, Jaya or Saranya can complete patient admission."
-- But Family Portal Access -- now a mandatory step of every admission -- was
-- still gated inside upsert_family_portal_access() to Admin/Manager only, so an
-- Admission Delegate could get all the way through room/bed allotment and then
-- fail at the very last step with:
--   "Existing patient admission resumed, but document or care setup failed:
--    Only Admin or Manager can manage Family Portal access."
-- This lets the same people already trusted to complete an admission also set
-- Family Portal access while doing so. Nothing else about the RPC changes.

begin;

create or replace function public.admission_delegate_profile(p_profile public.profiles)
returns boolean
language sql stable
as $$
  select lower(regexp_replace(coalesce(p_profile.login_id,''),'[^a-zA-Z0-9]','','g')) in ('jaya','saranya')
      or lower(regexp_replace(coalesce(p_profile.full_name,''),'[^a-zA-Z0-9]','','g')) in ('jaya','saranya');
$$;

-- Live-patch the existing upsert_family_portal_access() role check in place, the
-- same safe way earlier releases patched assign_patient_room() (v2.14.35) and
-- upsert_family_portal_access()'s own mobile-length guard (v2.14.05): read the
-- live function body, replace only the known exception text, and fail loudly
-- (changing nothing) if that exact text is not found rather than guessing.
do $$
declare
  r record;
  ddl text;
  patched text;
  found_any boolean := false;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_family_portal_access'
  loop
    found_any := true;
    ddl := pg_get_functiondef(r.oid);
    if position('admission_delegate_profile' in ddl) > 0 then
      continue; -- already patched
    end if;
    patched := regexp_replace(
      ddl,
      'raise\s+exception\s+''Only Admin or Manager can manage Family Portal access\.?''\s*;',
      'if not exists (select 1 from public.profiles pr where (pr.id=auth.uid() or pr.auth_user_id=auth.uid()) and public.admission_delegate_profile(pr)) then raise exception ''Only Admin, Manager, Jaya or Saranya can manage Family Portal access.''; end if;',
      'i'
    );
    if patched = ddl then
      raise exception 'upsert_family_portal_access: expected role-check text not found -- nothing changed. Run diagnostic_family_portal_access_function.sql and share the output so the patch text can be corrected.';
    end if;
    execute patched;
  end loop;
  if not found_any then
    raise exception 'Function public.upsert_family_portal_access not found -- nothing changed.';
  end if;
end
$$;

notify pgrst,'reload schema';
commit;

-- Verify: should now return true.
select position('admission_delegate_profile' in pg_get_functiondef(p.oid)) > 0 as admission_delegate_fix_installed
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'upsert_family_portal_access';
