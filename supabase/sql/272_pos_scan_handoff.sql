-- ERP 2.18.69 — HDFC swipe machine: "Scan with phone" from the laptop.
-- The laptop asks for a one-time scan link (QR). The SAME staff member opens it on their phone (signed in to the ERP),
-- scans the machine screen; the verified scan is linked to that link and appears on the laptop by itself.
-- A link: belongs to the person who made it, works only for that person, expires in 10 minutes, carries ONE verified scan.
-- Run once in Supabase SQL Editor (after SQL 271). Safe to run again.
begin;

create table if not exists public.pos_scan_handoffs(
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes',
  scan_id uuid references public.pos_screen_scans(id),
  linked_at timestamptz
);
create index if not exists pos_scan_handoffs_creator_idx on public.pos_scan_handoffs(created_by, created_at desc);
alter table public.pos_scan_handoffs enable row level security;
drop policy if exists pos_scan_handoffs_own_read on public.pos_scan_handoffs;
create policy pos_scan_handoffs_own_read on public.pos_scan_handoffs for select to authenticated using (created_by=auth.uid());
-- writes only through the functions below and the pos-screen-scan Edge Function (service role)

create or replace function public.create_pos_scan_handoff()
returns table(id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare v_role text; v_token text;
begin
  select role into v_role from public.profiles where id=auth.uid() and coalesce(is_active,true);
  if v_role is null or v_role not in ('Admin','Manager','Accounts') then
    raise exception 'Only Admin, Manager or Accounts can record swipe machine payments.';
  end if;
  v_token := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  return query insert into public.pos_scan_handoffs(token,created_by) values(v_token,auth.uid())
    returning pos_scan_handoffs.id, pos_scan_handoffs.token, pos_scan_handoffs.expires_at;
end $$;
revoke all on function public.create_pos_scan_handoff() from public, anon;
grant execute on function public.create_pos_scan_handoff() to authenticated;

-- For the phone: is this link usable by me right now?
create or replace function public.check_pos_scan_handoff(p_token text)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  select * into r from public.pos_scan_handoffs where token=p_token;
  if not found then return 'not_found'; end if;
  if r.created_by<>auth.uid() then return 'other_user'; end if;
  if r.scan_id is not null then return 'used'; end if;
  if r.expires_at<now() then return 'expired'; end if;
  return 'ok';
end $$;
revoke all on function public.check_pos_scan_handoff(text) from public, anon;
grant execute on function public.check_pos_scan_handoff(text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check
select (select count(*) from pg_proc where proname in ('create_pos_scan_handoff','check_pos_scan_handoff')) as functions,
       to_regclass('public.pos_scan_handoffs') is not null as handoff_table;
