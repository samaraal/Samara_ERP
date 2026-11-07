-- ERP 2.19.80 — 24-HOUR CLOCK IN EVERYTHING THE DATABASE WRITES (07-11-2026). Run once; safe to run again.
-- The ERP pages already show 00:00–23:59. Some database functions still build text with AM/PM
-- (to_char ... 'HH12:MI AM'): MIS & Audit findings, Daily Report rows, alert / notification text, WhatsApp
-- texts made in the database. This finds EVERY function in the public schema that formats a time that way
-- — working on the live definitions, so it is right even if a function was changed directly in Supabase —
-- and switches it to the 24-hour clock ('HH24:MI'). Nothing else in any function changes; no data changes.
begin;

do $fix$
declare r record; def text; newdef text; n int := 0;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind in ('f','p')
       and (case when p.prokind in ('f','p') then pg_get_functiondef(p.oid) end) ~* 'HH12'
  loop
    def := pg_get_functiondef(r.oid);
    newdef := def;
    -- 'DD-MM-YYYY HH12:MI AM' / 'HH12:MI AM' / 'DD-MM HH12:MI AM' / 'FMHH12:MI AM' / 'HH12:MI PM' / 'HH12:MIam' …
    newdef := regexp_replace(newdef, '(FM)?HH12:MI(:SS)?\s?(AM|PM|A\.M\.|P\.M\.|am|pm|a\.m\.|p\.m\.)', 'HH24:MI\2', 'g');
    -- a bare hour with AM/PM ('HH12 AM') → 'HH24:00'
    newdef := regexp_replace(newdef, '(FM)?HH12\s?(AM|PM|am|pm)', 'HH24":00"', 'g');
    if newdef <> def then
      execute newdef;
      n := n + 1;
      raise notice '24-hour clock: %(%)', r.proname, r.args;
    end if;
  end loop;
  raise notice '% function(s) switched to the 24-hour clock.', n;
end $fix$;

notify pgrst, 'reload schema';
commit;

-- Check: should list nothing (no function left that writes AM/PM times)
select p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
 where ns.nspname = 'public' and p.prokind in ('f','p')
   and (case when p.prokind in ('f','p') then pg_get_functiondef(p.oid) end) ~* 'HH12';
