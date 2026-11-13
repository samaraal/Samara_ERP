-- Samara ERP SQL 401 (13-11-2026) — already applied from the dashboard.
-- Machine numbers with NO name in easy TimePro (3–20 appeared blank on 13-11) were matched to "a Duty Roster person"
-- because an empty name compared as the same person → pop-up "new on machine, not linked".
-- Now a blank TimePro name never matches a Duty Roster person → "Not an employee", no pop-up (owner's rule, SQL 398).
do $do$
declare d text; o text := 'public.samara_same_person(u.tp_name, q.full_name)) as tp_matches_roster';
begin
  d := pg_get_functiondef('public.biometric_register_rows()'::regprocedure);
  if position(o in d) = 0 then raise notice 'already patched'; return; end if;
  d := replace(d, o, 'public.samara_same_person(u.tp_name, q.full_name)) and nullif(trim(coalesce(u.tp_name,'''')),'''') is not null as tp_matches_roster');
  execute d;
end $do$;
revoke all on function public.biometric_register_rows() from public, anon, authenticated;
