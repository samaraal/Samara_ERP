-- Once-per-employee, assignment and India-calendar-day login notice.
begin;
create table if not exists public.department_duty_notice_receipts(
 profile_id uuid not null references public.profiles(id),
 assignment_id uuid not null references public.department_duty_swaps(id),
 notice_date date not null,
 displayed_at timestamptz not null default statement_timestamp(),
 primary key(profile_id,assignment_id,notice_date)
);
alter table public.department_duty_notice_receipts enable row level security;
revoke all on public.department_duty_notice_receipts from public,anon,authenticated;

create or replace function public.claim_department_duty_notice()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles%rowtype;s public.department_duty_swaps%rowtype;
 today date:=(statement_timestamp() at time zone 'Asia/Kolkata')::date;claimed integer;
begin
 select * into me from public.profiles where id=auth.uid() and coalesce(active,true) and coalesce(is_active,true);
 if not found then raise exception 'Active employee login required.';end if;
 select x.* into s from public.department_duty_swaps x
 join public.profiles a on a.id=x.std_profile_id join public.profiles b on b.id=x.nursing_profile_id
 where me.id in(x.std_profile_id,x.nursing_profile_id) and x.cancelled_at is null
 and x.ends_at>statement_timestamp() and (x.starts_at at time zone 'Asia/Kolkata')::date<=today
 and coalesce(a.active,true) and coalesce(a.is_active,true) and coalesce(b.active,true) and coalesce(b.is_active,true)
 and jsonb_build_object('role',a.role,'designation',a.designation,'department',a.department)=x.std_duties
 and jsonb_build_object('role',b.role,'designation',b.designation,'department',b.department)=x.nursing_duties
 order by x.starts_at limit 1;
 if not found then return null;end if;
 insert into public.department_duty_notice_receipts(profile_id,assignment_id,notice_date)
 values(me.id,s.id,today) on conflict do nothing;
 get diagnostics claimed=row_count;
 if claimed=0 then return null;end if;
 return jsonb_build_object('id',s.id,'profile_id',me.id,'name',me.full_name,'notice_date',today,
 'acting_as',case when me.id=s.std_profile_id then 'Nursing Manager' else 'STD' end,
 'starts_at',s.starts_at,'ends_at',s.ends_at,'upcoming',s.starts_at>statement_timestamp());
end $$;
revoke all on function public.claim_department_duty_notice() from public,anon;
grant execute on function public.claim_department_duty_notice() to authenticated;
notify pgrst,'reload schema';
commit;
