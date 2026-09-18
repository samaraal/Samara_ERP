begin;
create table if not exists public.fv_cutoff_attempts (
 id uuid primary key,
 actor uuid not null,
 actor_name text not null,
 actor_role text not null,
 order_id uuid,
 operation text not null check(operation in ('save','finalise','modify')),
 supply_date date not null,
 meal_slot text not null,
 deadline timestamptz not null,
 attempted_at timestamptz not null default clock_timestamp(),
 warning text not null
);
create index if not exists fv_cutoff_attempts_recent on public.fv_cutoff_attempts(attempted_at desc);
alter table public.fv_cutoff_attempts enable row level security;
revoke all on public.fv_cutoff_attempts from anon,authenticated;
grant select on public.fv_cutoff_attempts to authenticated;
grant all on public.fv_cutoff_attempts to service_role;
create or replace function public.fv_cutoff_notification_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid())
 and coalesce(p.active,true) and coalesce(p.is_active,true)
 and lower(trim(p.role)) in ('admin','administrator','director'))
$$;
revoke all on function public.fv_cutoff_notification_admin() from public,anon;
grant execute on function public.fv_cutoff_notification_admin() to authenticated;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='fv_cutoff_attempts' and policyname='Admin Director cutoff notifications') then
  create policy "Admin Director cutoff notifications" on public.fv_cutoff_attempts for select to authenticated using(public.fv_cutoff_notification_admin());
 end if;
end $$;

-- An inner subtransaction rolls back the rejected order only. The outer call
-- commits its audit event and returns blocked=true, never an order success.
create or replace function public.fv_submit_order(action text,p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.fv_access(); output jsonb; warning text; source_data jsonb; original_data jsonb;
 request uuid:=(p->>'request_id')::uuid; who uuid:=(a->>'actor')::uuid; prior public.fv_cutoff_attempts; role_name text;
begin
 if action not in ('save','finalise','modify') or action is null then raise exception 'Unsupported food order action';end if;
 if not coalesce((a->>'control')::boolean,false) or not coalesce((a->>'read')::boolean,false) or who is null then raise exception 'Food order access is restricted';end if;
 if request is null then raise exception 'Request id required';end if;
 perform pg_advisory_xact_lock(71620261);
 select * into prior from public.fv_cutoff_attempts where id=request;
 if found then
  if prior.actor<>who then raise exception 'Request id already used';end if;
  return jsonb_build_object('blocked',true,'error',prior.warning,'attempt_id',prior.id);
 end if;
 begin
  if coalesce((p->>'check_only')::boolean,false) then
   perform public.fv_assert_order_cutoff(p->'data');
   if nullif(p->>'id','') is not null then
    select data into original_data from public.fv_orders where id=(p->>'id')::uuid;
    perform public.fv_assert_order_cutoff(original_data);
   end if;
   return jsonb_build_object('allowed',true);
  end if;
  output:=public.fv_rpc(action,p);
  return output;
 exception when raise_exception then
  warning:=sqlerrm;
  if warning not like 'Cutoff passed for %No new orders or modifications are allowed.' then raise;end if;
 end;
 source_data:=p->'data';
 if nullif(p->>'id','') is not null then
  select data into original_data from public.fv_orders where id=(p->>'id')::uuid;
  if public.fv_order_deadline(original_data)<=clock_timestamp() then source_data:=original_data;end if;
 end if;
 select role into role_name from public.profiles where id=who;
 insert into public.fv_cutoff_attempts(id,actor,actor_name,actor_role,order_id,operation,supply_date,meal_slot,deadline,warning)
 values(request,who,coalesce(a->>'name','Staff'),coalesce(role_name,'Staff'),nullif(p->>'id','')::uuid,action,(source_data->>'date')::date,
 case when source_data->>'slot'='Tiffin' then 'Breakfast' else source_data->>'slot' end,public.fv_order_deadline(source_data),warning);
 return jsonb_build_object('blocked',true,'error',warning,'attempt_id',request);
end $$;
revoke all on function public.fv_submit_order(text,jsonb) from public,anon;
grant execute on function public.fv_submit_order(text,jsonb) to authenticated;

create table if not exists public.fv_cutoff_push_receipts(
 attempt_id uuid not null references public.fv_cutoff_attempts(id),
 subscription_id uuid not null references public.push_subscriptions(id),
 state text not null check(state in ('claimed','sent','retry','failed')),
 claimed_at timestamptz not null default clock_timestamp(),
 sent_at timestamptz,
 retry_after timestamptz,
 tries integer not null default 1,
 detail text,
 primary key(attempt_id,subscription_id)
);
alter table public.fv_cutoff_push_receipts enable row level security;
revoke all on public.fv_cutoff_push_receipts from anon,authenticated;
grant all on public.fv_cutoff_push_receipts to service_role;

create or replace function public.fv_claim_cutoff_push(p_attempt uuid,p_subscription uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if not exists(select 1 from public.fv_cutoff_attempts a
 join public.push_subscriptions s on s.id=p_subscription
 join public.profiles p on (p.id=coalesce(s.profile_id,s.user_id) or (s.profile_id is null and p.auth_user_id=s.user_id))
 where a.id=p_attempt and s.is_active and coalesce(p.active,true) and coalesce(p.is_active,true)
 and lower(trim(p.role)) in ('admin','administrator','director')
 and a.attempted_at>=coalesce(s.notifications_enabled_at,s.created_at)
 and a.attempted_at between clock_timestamp()-interval '24 hours' and clock_timestamp()) then return false;end if;
 insert into public.fv_cutoff_push_receipts(attempt_id,subscription_id,state)
 values(p_attempt,p_subscription,'claimed')
 on conflict(attempt_id,subscription_id) do update set state='claimed',claimed_at=clock_timestamp(),retry_after=null,tries=fv_cutoff_push_receipts.tries+1
 where fv_cutoff_push_receipts.state='retry' and fv_cutoff_push_receipts.retry_after<=clock_timestamp() and fv_cutoff_push_receipts.tries<3;
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.fv_claim_cutoff_push(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fv_claim_cutoff_push(uuid,uuid) to service_role;
commit;
