-- 341 — Admin / Directors cannot raise Bills & Charges — ERP 2.19.65
-- Run once in Supabase > SQL Editor. Safe to run more than once.
--
-- Owner's rule (05-11-2026): Admin / Director logins must not raise charges. Nurses / Nursing Manager (and Accounts)
-- raise them from Bills & Charges; Accounts approve.
-- Blocks only a charge an Admin login types in directly (Bills & Charges → Raise Bill / Charge, or Correct & Resubmit).
-- Automatic charges made by the ERP's own database functions are NOT affected, even when an Admin's action sets them
-- off — e.g. room rent, equipment rental, a physiotherapy session charge sent again after Admin approves a correction
-- or fixes a Guest rate, outside bills, nursing procedures.

create or replace function public.block_admin_direct_charge() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  -- current_user is 'authenticated' only for a direct insert from the app; ERP functions run as their owner.
  if current_user = 'authenticated' and exists(
       select 1 from public.profiles p
        where (p.id = auth.uid() or p.auth_user_id = auth.uid())
          and lower(trim(coalesce(p.role,''))) in ('admin','administrator','director')) then
    raise exception 'Admin / Directors do not raise charges. Ask the nurse or Nursing Manager to raise it from Bills & Charges.';
  end if;
  return new;
end $$;
revoke all on function public.block_admin_direct_charge() from public, anon, authenticated;
drop trigger if exists block_admin_direct_charge on public.bill_charge_requests;
create trigger block_admin_direct_charge before insert on public.bill_charge_requests
  for each row execute function public.block_admin_direct_charge();

-- Check: the trigger is in place.
select tgname from pg_trigger where tgname = 'block_admin_direct_charge';
