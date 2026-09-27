-- Samara Care ERP 2.14.73 — Doctor Review / Modify: allow a future Effective From (up to 30 days ahead)
-- Run once in Supabase > SQL Editor (file 154). Safe to run again (it does nothing the second time).
--
-- What it changes (one line inside public.apply_medication_review):
--   before: if v_effective > now() + interval '1 minute' then raise exception 'Future medication effective date/time is not permitted'; end if;
--   after : if v_effective > now() + interval '30 days'  then raise exception 'Medication effective date/time can be at most 30 days ahead'; end if;
-- Everything else in the function is kept exactly as it is:
--   * the Doctor Review date/time must still not be in the future;
--   * the old order is stopped at the effective time (stopped_at = effective time), so it keeps
--     running until then, and the new order starts at the effective time.
-- If the function does not contain the expected line, NOTHING is changed and an error explains why.

do $$
declare
  fn oid;
  def text;
  old_line constant text := 'if v_effective > now() + interval ''1 minute'' then raise exception ''Future medication effective date/time is not permitted''; end if;';
  new_line constant text := 'if v_effective > now() + interval ''30 days'' then raise exception ''Medication effective date/time can be at most 30 days ahead''; end if;';
begin
  select p.oid into fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_medication_review';
  if fn is null then raise exception 'public.apply_medication_review was not found — nothing changed.'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'apply_medication_review') > 1 then
    raise exception 'More than one apply_medication_review exists — nothing changed. Send the list to support.';
  end if;

  def := pg_get_functiondef(fn);
  if position(new_line in def) > 0 then
    raise notice 'Already updated — nothing to do.';
    return;
  end if;
  if position(old_line in def) = 0 then
    raise exception 'Expected line not found in apply_medication_review — nothing changed.';
  end if;

  execute replace(def, old_line, new_line);  -- CREATE OR REPLACE keeps owner, grants and security settings
  raise notice 'apply_medication_review updated: Effective From may now be up to 30 days ahead.';
end $$;

-- Check (should return one row containing "30 days"):
select l.line
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace,
lateral regexp_split_to_table(pg_get_functiondef(p.oid), E'\n') as l(line)
where ns.nspname = 'public' and p.proname = 'apply_medication_review' and l.line ilike '%v_effective > now()%';
