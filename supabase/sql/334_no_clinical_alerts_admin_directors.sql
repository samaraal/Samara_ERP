-- ERP 2.19.48 (02-11-2026): Admin / Directors no longer receive clinical alert phone notifications.
-- Withheld medicine dose push now goes to Nurses and Managers only (Admin / Administrator / Director removed).
-- Live-patches public.withheld_dose_claim_push in place (only the role list changes), so any other
-- live edits to this function are kept. Safe to run more than once.

do $patch$
declare
  def text;
  old_list constant text := $q$in ('nurse','manager','admin','administrator','director')$q$;
  new_list constant text := $q$in ('nurse','manager')$q$;
begin
  select pg_get_functiondef('public.withheld_dose_claim_push(text,uuid)'::regprocedure) into def;
  if position(new_list in def) > 0 and position(old_list in def) = 0 then
    raise notice 'withheld_dose_claim_push already patched — nothing to do.';
    return;
  end if;
  if position(old_list in def) = 0 then
    raise exception 'withheld_dose_claim_push role list not found — function differs from SQL 210. Nothing changed; send the function text for review.';
  end if;
  execute replace(def, old_list, new_list);
  raise notice 'withheld_dose_claim_push patched: Nurses + Managers only.';
end
$patch$;

-- Check (should show the new role list):
-- select pg_get_functiondef('public.withheld_dose_claim_push(text,uuid)'::regprocedure);
