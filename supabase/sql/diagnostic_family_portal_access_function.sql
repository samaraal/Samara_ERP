-- Read-only. Only needed if 148_admission_family_portal_access.sql fails with
-- "expected role-check text not found". Run this and share the result (the
-- function's full definition) so the exact wording of its role check can be
-- confirmed and the patch text corrected.

select pg_get_functiondef(p.oid) as upsert_family_portal_access_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'upsert_family_portal_access';
