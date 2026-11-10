-- 368 — Half-day leave and Permission rules (ERP 2.19.98, Admin 10-11-2026)
--   Half-day leave : one date only; that date counts 0.5 worked + 0.5 leave in Payroll
--                    (casual leave paid, other leave unpaid) — whatever order the roster / leave were entered.
--   Permission     : at most 2 hours each; 2 permissions a month are free;
--                    every approved permission beyond the 2nd in a month = 0.5 day loss of pay.
-- 1) checks on absence_requests (new / changed requests only — old records are untouched)
-- 2) live-patches public.samara_payroll_rpc in place (same safe method as SQL 335), so other live edits are kept.
-- Run once in Supabase SQL Editor after 335. Safe to re-run.

-- 1) Request checks --------------------------------------------------------------------------
create or replace function public.samara_absence_request_rules()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_from time; v_to time; v_mins int;
begin
  if new.request_type = 'Permission' then
    if nullif(btrim(coalesce(new.permission_from::text,'')),'') is null or nullif(btrim(coalesce(new.permission_to::text,'')),'') is null then
      raise exception 'Enter the permission From and To time.';
    end if;
    v_from := new.permission_from::text::time; v_to := new.permission_to::text::time;
    v_mins := (extract(epoch from (v_to - v_from))/60)::int;
    if v_mins <= 0 then v_mins := v_mins + 1440; end if;           -- crosses midnight (night shift)
    if v_mins > 120 then
      raise exception 'Permission can be at most 2 hours (this one is % h % min). For longer, apply for half-day leave.', v_mins/60, v_mins%60;
    end if;
  elsif new.request_type = 'Leave' and coalesce(new.shift_part,'') ilike '%half%' then
    if new.from_date is distinct from new.to_date then
      raise exception 'Half-day leave is for one date only. Apply a separate request for each date.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists samara_absence_request_rules on public.absence_requests;
create trigger samara_absence_request_rules
  before insert or update of request_type, permission_from, permission_to, shift_part, from_date, to_date
  on public.absence_requests
  for each row execute function public.samara_absence_request_rules();

-- 2) Payroll ----------------------------------------------------------------------------------
do $patch$
declare
  def text;
  -- days worked / weekly offs: leave out EVERY approved leave date (full or half); halves are added back as 0.5 below
  old_leave constant text := $q$and d.duty_date between l.from_date and l.to_date and coalesce(l.shift_part,'') not ilike '%half%')$q$;
  new_leave constant text := $q$and d.duty_date between l.from_date and l.to_date)$q$;
  old_entries constant text := $q$'roster_entries', (select count(*) from public.duty_assignments d$q$;
  new_entries constant text := $q$'roster_half', (select count(distinct g::date) from public.absence_requests l
                             cross join lateral generate_series(greatest(l.from_date, v_month, coalesce(pr.date_of_joining, (pr.created_at at time zone 'Asia/Kolkata')::date)),
                                                                least(l.to_date, v_end), interval '1 day') g
                           where l.employee_id in (pr.id, pr.auth_user_id) and l.status='approved' and l.request_type='Leave'
                             and coalesce(l.shift_part,'') ilike '%half%'
                             and not exists(select 1 from public.duty_assignments d where d.employee_id in (pr.id, pr.auth_user_id) and d.duty_date=g::date
                                              and coalesce(d.status,'') not in ('Cancelled','Rejected')
                                              and (coalesce(d.is_weekly_off,false) or d.shift in ('Weekly Off','Absent') or d.status in ('Weekly Off','Absent')))),
          'perm_count', (select count(*) from public.absence_requests l
                           where l.employee_id in (pr.id, pr.auth_user_id) and l.status='approved' and l.request_type='Permission'
                             and l.permission_date between greatest(v_month, coalesce(pr.date_of_joining, (pr.created_at at time zone 'Asia/Kolkata')::date)) and v_end),
          'roster_entries', (select count(*) from public.duty_assignments d$q$;
  old_paid constant text := $q$v_paid := least(v_avail, v_dw + least(v_wo,4) + v_clp);$q$;
  new_paid constant text := $q$v_paid := greatest(0, least(v_avail, v_dw + least(v_wo,4) + v_clp) - least(15, greatest(coalesce((p->>'permission_lop')::numeric,0),0)));$q$;
begin
  select pg_get_functiondef('public.samara_payroll_rpc(text,jsonb)'::regprocedure) into def;
  if position($q$'roster_half'$q$ in def) > 0 then
    raise notice 'samara_payroll_rpc already patched for half-day / permission — nothing to do.';
    return;
  end if;
  if position(old_leave in def) = 0 or position(old_entries in def) = 0 or position(old_paid in def) = 0 then
    raise exception 'samara_payroll_rpc differs from SQL 331/335 — nothing changed. Send the function text for review.';
  end if;
  def := replace(def, old_leave, new_leave);
  def := replace(def, old_entries, new_entries);
  def := replace(def, old_paid, new_paid);
  execute def;
  raise notice 'samara_payroll_rpc patched: half-day leave = 0.5 worked + 0.5 leave; permissions beyond 2 a month = 0.5 day loss of pay each.';
end
$patch$;

notify pgrst, 'reload schema';
select 'Half-day leave and Permission rules are active' as result;
