-- ERP 2.16.13 — Keep Ramya off the Duty Roster (login and all her other pages stay as they are).
-- Safe to run more than once. Run the whole file in Supabase → SQL Editor.

create table if not exists public.duty_roster_exclusions (
  profile_id uuid primary key,
  reason text,
  added_at timestamptz not null default now()
);
alter table public.duty_roster_exclusions enable row level security;
drop policy if exists duty_roster_exclusions_select on public.duty_roster_exclusions;
create policy duty_roster_exclusions_select on public.duty_roster_exclusions for select to authenticated using (true);
-- No insert / update / delete policy: the list is changed only from the SQL Editor.

do $$
declare n int; v record;
begin
  select count(*) into n from public.profiles where full_name ~* '\mramya\M';
  if n <> 1 then
    raise exception 'Expected exactly ONE employee named Ramya, found %: %. Nothing was changed — send this message to Claude.',
      n, coalesce((select string_agg(coalesce(employee_id,'no ID')||' · '||full_name||' · '||coalesce(role,''), ' | ') from public.profiles where full_name ~* '\mramya\M'),'none');
  end if;
  select id, full_name, employee_id into v from public.profiles where full_name ~* '\mramya\M';
  insert into public.duty_roster_exclusions(profile_id, reason) values (v.id::uuid, 'Not on duty roster (login kept) — 11-10-2026')
    on conflict (profile_id) do nothing;
  -- Her duties from today onward are cancelled so they leave the roster and On Duty Today.
  update public.duty_assignments set status = 'Cancelled', updated_at = now(), status_updated_at = now(), status_updated_by_name = 'Admin (Duty Roster exclusion)'
   where employee_id::text = v.id::text
     and duty_date >= (now() at time zone 'Asia/Kolkata')::date
     and coalesce(status,'') <> 'Cancelled';
  get diagnostics n = row_count;
  raise notice 'Ramya (% · %) removed from the Duty Roster. Future duties cancelled: %', v.full_name, coalesce(v.employee_id,'no ID'), n;
end $$;

-- To put her back on the roster later:
--   delete from public.duty_roster_exclusions where profile_id = (select id from public.profiles where full_name ~* '\mramya\M');
