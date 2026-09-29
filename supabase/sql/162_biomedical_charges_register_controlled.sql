-- Samara Care ERP 2.14.99 — Biomedical Equipment charges are controlled by the equipment register.
-- Decision (29-09-2026, option A): Biomedical Equipment is charged from Bills & Charges only — a nurse can charge
-- only equipment issued to that resident in the Biomedical Equipment register (quantity = days) — so it must never
-- be routed through Approval Requests. This switches approval routing OFF for it and keeps it OFF.
-- Safe to run again.
begin;
insert into public.charge_category_settings(category,requires_approval)
values ('Biomedical Equipment',false)
on conflict (category) do update set requires_approval=false, updated_at=now();

alter table public.charge_category_settings drop constraint if exists charge_category_settings_not_stock;
alter table public.charge_category_settings add constraint charge_category_settings_not_stock
  check (requires_approval = false or category not in ('Consumables','Pharmacy','Pharmacy & Basic Supplies','Housekeeping & General','Kitchen / Food Stores','Biomedical Equipment'));
notify pgrst,'reload schema';
commit;

select category, requires_approval from public.charge_category_settings where category='Biomedical Equipment';
