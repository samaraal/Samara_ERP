-- SAMARA CARE ERP 2.15.34 — Resident Food Intake: separate BEVERAGE entries.
-- Beverages (Tea, Coffee, Milk, Boost, Horlicks, Fresh Juice) are now recorded on their own,
-- any time of day, as many times as given — no longer one beverage tied to a meal.
-- Old meal records keep their beverage fields (still shown in reports).
-- Run this whole file once in Supabase > SQL Editor. Safe to run again.

create table if not exists public.beverage_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  given_date date not null default current_date,
  given_time time not null,
  given_at timestamptz not null default now(),
  beverage text not null,
  juice_name text,
  quantity_ml integer,
  consumption_status text not null default 'Consumed fully',
  remarks text,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  constraint beverage_records_beverage_check check (beverage in ('Tea','Coffee','Milk','Boost','Horlicks','Fresh Juice')),
  constraint beverage_records_juice_named check (beverage<>'Fresh Juice' or nullif(trim(coalesce(juice_name,'')),'') is not null),
  constraint beverage_records_quantity_check check (quantity_ml is null or (quantity_ml>0 and quantity_ml<=2000))
);
comment on table public.beverage_records is 'Resident beverages (Tea, Coffee, Milk, Boost, Horlicks, Fresh Juice) — one row per serving.';

create index if not exists beverage_records_patient_date_idx on public.beverage_records(patient_id,given_date);
create index if not exists beverage_records_given_at_idx on public.beverage_records(given_at desc);

alter table public.beverage_records enable row level security;
drop policy if exists samara_authenticated_select on public.beverage_records;
create policy samara_authenticated_select on public.beverage_records for select to authenticated using (true);
drop policy if exists samara_authenticated_insert on public.beverage_records;
create policy samara_authenticated_insert on public.beverage_records for insert to authenticated with check (true);
drop policy if exists samara_authenticated_update on public.beverage_records;
create policy samara_authenticated_update on public.beverage_records for update to authenticated using (true) with check (true);
grant select, insert, update on public.beverage_records to authenticated;

notify pgrst, 'reload schema';

-- Check: should show beverage_records_ready = true
select to_regclass('public.beverage_records') is not null as beverage_records_ready;
