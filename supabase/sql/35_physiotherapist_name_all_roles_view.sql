-- Samara Care ERP 1.3.9
-- Add Physiotherapist Name and confirm view access for all authenticated users.

alter table public.physiotherapy_plans
  add column if not exists physiotherapist_name text;

alter table public.physiotherapy_plans enable row level security;

drop policy if exists physiotherapy_plans_authenticated_select on public.physiotherapy_plans;
create policy physiotherapy_plans_authenticated_select
on public.physiotherapy_plans for select
to authenticated
using (true);

notify pgrst, 'reload schema';

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='physiotherapy_plans'
      and column_name='physiotherapist_name'
  ) as physiotherapist_name_ready;
