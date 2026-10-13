-- Samara ERP 2.16.43 — System Health (automatic fault log)
-- Run ONCE in Supabase → SQL Editor (safe to run again — it only adds what is missing).
--
-- Builds on the existing client_errors table (SQL 137):
--   • detail       — small extra facts about a fault (e.g. which save failed, status code, timing). No Guest data.
--   • resolved_at / resolved_by / resolution_note — Admin marks a fault as fixed on the System Health page.
-- Rules stay the same: any signed-in staff browser can ADD a fault row; only Admin can READ.
-- New: only Admin can mark faults resolved (only the three resolution columns can be changed).
-- Nothing in patient, nursing, medicine or billing tables is touched.

alter table public.client_errors add column if not exists detail jsonb;
alter table public.client_errors add column if not exists resolved_at timestamptz;
alter table public.client_errors add column if not exists resolved_by uuid;
alter table public.client_errors add column if not exists resolution_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_errors_detail_size') then
    alter table public.client_errors add constraint client_errors_detail_size
      check (detail is null or length(detail::text) <= 4000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_errors_note_size') then
    alter table public.client_errors add constraint client_errors_note_size
      check (length(coalesce(resolution_note,'')) <= 500);
  end if;
end $$;

create index if not exists client_errors_kind_created_idx on public.client_errors (kind, created_at desc);

-- Admin may mark faults resolved (column-level: only the resolution columns).
drop policy if exists "client errors admin resolve" on public.client_errors;
create policy "client errors admin resolve" on public.client_errors
  for update to authenticated
  using (public.current_user_has_role(array['Admin']))
  with check (public.current_user_has_role(array['Admin']));

revoke update on public.client_errors from anon, authenticated;
grant update (resolved_at, resolved_by, resolution_note) on public.client_errors to authenticated;

-- Keep faults for 90 days (older rows are removed when this runs; the page also only reads recent rows).
delete from public.client_errors where created_at < now() - interval '90 days';
