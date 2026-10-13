-- Only per-user request counts are stored. No audio, transcript or translation.
create table if not exists public.talk_to_guest_budget (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null
);
alter table public.talk_to_guest_budget enable row level security;
revoke all on public.talk_to_guest_budget from anon, authenticated;
create or replace function public.talk_to_guest_take_budget(staff_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare used integer;
begin
  insert into public.talk_to_guest_budget(user_id,window_start,requests)
  values(staff_id,date_trunc('minute',now()),1)
  on conflict(user_id) do update set
    requests=case when talk_to_guest_budget.window_start=date_trunc('minute',now()) then talk_to_guest_budget.requests+1 else 1 end,
    window_start=date_trunc('minute',now())
  returning requests into used;
  return used<=30;
end;
$$;
revoke all on function public.talk_to_guest_take_budget(uuid) from public,anon,authenticated;
grant execute on function public.talk_to_guest_take_budget(uuid) to service_role;
