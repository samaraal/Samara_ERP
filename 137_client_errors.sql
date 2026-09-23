-- Samara ERP v2.14.15 — client error log
-- Run ONCE in Supabase → SQL Editor, BEFORE uploading the v2.14.15 files.
-- Safe to run again (it only creates what is missing).
--
-- Stores errors that happen in staff browsers (page crashes, failed actions),
-- so the administrator can see which page broke, for whom, and when.
-- Any logged-in user (or the login screen) can ADD a row; only Admin can READ.
-- Nobody can edit rows from the app.

create extension if not exists pgcrypto;

create table if not exists public.client_errors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  app_version text,
  page        text,
  kind        text,
  message     text,
  stack       text,
  url         text,
  user_agent  text,
  constraint client_errors_size_limits check (
    length(coalesce(app_version,'')) <= 40 and
    length(coalesce(page,''))        <= 200 and
    length(coalesce(kind,''))        <= 60 and
    length(coalesce(message,''))     <= 2000 and
    length(coalesce(stack,''))       <= 8000 and
    length(coalesce(url,''))         <= 500 and
    length(coalesce(user_agent,''))  <= 500
  )
);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists "client errors insert" on public.client_errors;
create policy "client errors insert" on public.client_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "client errors admin read" on public.client_errors;
create policy "client errors admin read" on public.client_errors
  for select to authenticated
  using (public.current_user_has_role(array['Admin']));

grant insert on public.client_errors to anon, authenticated;
grant select on public.client_errors to authenticated;

-- Handy view for the administrator: latest errors with the staff name.
create or replace view public.client_errors_recent
with (security_invoker = true) as
select e.created_at, p.full_name as staff_name, p.role, e.page, e.kind, e.message, e.app_version, e.url, e.id
from public.client_errors e
left join public.profiles p on p.id = e.user_id
order by e.created_at desc;

grant select on public.client_errors_recent to authenticated;
