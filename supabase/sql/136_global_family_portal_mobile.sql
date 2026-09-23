-- Samara ERP v2.14.05
-- Allow Family Portal mobile numbers to be stored in international format.
-- India-specific 10-digit validation is performed by the ERP before this RPC is called.

begin;

-- Remove only CHECK constraints on family_portal_access that explicitly enforce a 10-digit mobile.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='family_portal_access'
      and c.contype='c'
      and pg_get_constraintdef(c.oid) ilike '%mobile%'
      and pg_get_constraintdef(c.oid) ilike '%10%'
  loop
    execute format('alter table public.family_portal_access drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- Older Samara installations contain this legacy guard inside the RPC itself.
-- Keep the RPC's existing ID/PIN/audit behaviour; remove only that obsolete exception.
do $$
declare
  r record;
  ddl text;
  patched text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='upsert_family_portal_access'
  loop
    ddl := pg_get_functiondef(r.oid);
    patched := regexp_replace(
      ddl,
      'raise\\s+exception\\s+''Mobile number must contain exactly 10 digits\\.''\\s*;',
      'null; -- v2.14.05: international family mobile accepted',
      'gi'
    );
    if patched <> ddl then
      execute patched;
    end if;
  end loop;
end $$;

commit;
