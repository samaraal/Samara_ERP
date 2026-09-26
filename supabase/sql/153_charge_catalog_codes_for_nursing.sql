-- Samara Care ERP 2.14.63
-- Nurses' Bills & Charges dropdown shows the same Charge Master code as
-- Charge Master (e.g. DOC-0001 · General Physician Visit). The safe catalogue
-- for non-finance roles now also returns charge_code. It still never
-- returns the tariff amount. Safe to re-run.

alter table public.charge_tariff_master add column if not exists charge_code text;

drop function if exists public.get_charge_service_catalog();
create function public.get_charge_service_catalog()
returns table(category text, service_name text, is_active boolean, display_order integer, charge_code text)
language sql stable security definer set search_path=public as $$
  select c.category, c.service_name, c.is_active, c.display_order, c.charge_code
  from public.charge_tariff_master c
  where c.is_active=true
  order by c.category, c.service_name;
$$;
revoke all on function public.get_charge_service_catalog() from public, anon;
grant execute on function public.get_charge_service_catalog() to authenticated;

notify pgrst,'reload schema';

select count(*) as active_items, count(charge_code) as items_with_code
from public.charge_tariff_master where is_active;
