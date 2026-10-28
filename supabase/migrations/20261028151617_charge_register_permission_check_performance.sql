-- Applied through Supabase as migration 20261028151617.
-- Cache row-independent role checks once per statement. Keep every existing
-- policy, role list, command, grant, and WITH CHECK rule unchanged.
alter policy bill_charge_authorised_select on public.bill_charge_requests
  using ((select public.current_user_has_role(array['Admin','Manager','Nurse','Accounts'])));
alter policy charge_tariff_finance_select on public.charge_tariff_master
  using ((select public.current_user_has_role(array['Admin','Accounts'])));
alter policy charge_tariff_admin_write on public.charge_tariff_master
  using ((select public.current_user_has_role(array['Admin'])));
alter policy consumable_store_items_read on public.consumable_store_items
  using ((select public.current_user_has_role(array['Admin','Manager','Nurse','Accounts'])));
alter policy diagnostics_read on public.diagnostic_services
  using ((select public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver','Accounts'])));
alter policy diagnostics_write on public.diagnostic_services
  using ((select public.current_user_has_role(array['Admin','Manager','Nurse','Accounts'])));
alter policy charge_category_settings_admin_write on public.charge_category_settings
  using ((select public.current_user_has_role(array['Admin'])));
