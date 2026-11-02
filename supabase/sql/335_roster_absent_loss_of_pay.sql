-- 335 — Duty Roster "Absent" = loss of pay in Payroll (ERP 2.19.50)
--   A roster day marked Absent (status or shift 'Absent') is no longer counted as a day worked,
--   so Payroll treats it as loss of pay automatically. Payroll also shows the Absent count.
-- Live-patches public.samara_payroll_rpc in place (only the roster-days lines change), so any other
-- live edits to the function are kept. Run once in Supabase SQL Editor. Safe to re-run.

do $patch$
declare
  def text;
  -- the "days worked" test (from SQL 331)
  old_days constant text := $q$coalesce(d.status,'') not in ('Cancelled','Rejected')
                             and not (coalesce(d.is_weekly_off,false)$q$;
  new_days constant text := $q$coalesce(d.status,'') not in ('Cancelled','Rejected','Absent') and coalesce(d.shift,'') <> 'Absent'
                             and not (coalesce(d.is_weekly_off,false)$q$;
  old_entries constant text := $q$'roster_entries', (select count(*) from public.duty_assignments d$q$;
  new_entries constant text := $q$'roster_absent', (select count(distinct d.duty_date) from public.duty_assignments d
                           where d.employee_id in (pr.id, pr.auth_user_id) and d.duty_date between greatest(v_month, coalesce(pr.date_of_joining, (pr.created_at at time zone 'Asia/Kolkata')::date)) and v_end
                             and (d.status = 'Absent' or d.shift = 'Absent')),
          'roster_entries', (select count(*) from public.duty_assignments d$q$;
begin
  select pg_get_functiondef('public.samara_payroll_rpc(text,jsonb)'::regprocedure) into def;
  if position($q$'roster_absent'$q$ in def) > 0 then
    raise notice 'samara_payroll_rpc already patched for Absent — nothing to do.';
    return;
  end if;
  if position(old_days in def) = 0 or position(old_entries in def) = 0 then
    raise exception 'samara_payroll_rpc differs from SQL 331 — nothing changed. Send the function text for review.';
  end if;
  def := replace(def, old_days, new_days);
  def := replace(def, old_entries, new_entries);
  execute def;
  raise notice 'samara_payroll_rpc patched: Absent days are loss of pay.';
end
$patch$;

notify pgrst, 'reload schema';
select 'Duty Roster Absent days now count as loss of pay in Payroll' as result;
