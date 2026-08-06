-- Samara Care ERP 1.3.30
-- Physiotherapy session plan_id / order_id compatibility repair

alter table public.physiotherapy_sessions
  add column if not exists plan_id uuid;

alter table public.physiotherapy_sessions
  add column if not exists order_id uuid;

-- Synchronise historical rows whichever identifier was previously used.
update public.physiotherapy_sessions
set plan_id=coalesce(plan_id,order_id),
    order_id=coalesce(order_id,plan_id)
where plan_id is null or order_id is null;

-- Prevent duplicate daily session records for the same physiotherapy plan.
create unique index if not exists physiotherapy_sessions_order_date_unique
  on public.physiotherapy_sessions(order_id,session_date)
  where order_id is not null;

create unique index if not exists physiotherapy_sessions_plan_date_unique
  on public.physiotherapy_sessions(plan_id,session_date)
  where plan_id is not null;

notify pgrst, 'reload schema';

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='physiotherapy_sessions'
      and column_name='plan_id'
  ) as plan_id_ready,
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='physiotherapy_sessions'
      and column_name='order_id'
  ) as order_id_ready;
