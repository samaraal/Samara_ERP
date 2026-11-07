-- Samara Care ERP 2.19.85 — Family Portal showed the wrong Outstanding / Advance Balance (07-11-2026)
-- Run once in Supabase > SQL Editor. Safe to run again.
--
-- Problem: the Family Portal read only the LATEST 100 ledger entries of a Guest (family_portal_dashboard:
-- "... from public.billing_transactions where patient_id=v_patient order by transaction_date desc limit 100").
-- For Guests with more than 100 entries, the older charges were left out, so the portal added up too little:
--   SHANTHI.T          226 entries — true Outstanding ₹325,    portal showed "Advance Balance ₹17,726"
--   S. SWAMINATHAN     214 entries — true Outstanding ₹18,983, portal showed "Advance Balance ₹5,262"
--   JOSEPH A A E FERNANDO (discharged) 104 entries — true ₹0,  portal showed "Advance Balance ₹9,000"
-- Because the portal thought nothing was due, the family's "Pay Outstanding" button was switched off.
-- (Online payment itself was never wrong: Razorpay reads the full ledger on the server.)
-- Fix: the portal now receives the Guest's FULL ledger, so Total Charges, Payments, Outstanding / Advance Balance,
-- the bill list, the PDF statement and the Pay button all match the ERP. Nothing else in the function changes.

do $$
declare f record; def text; newdef text; n int:=0;
  old_txt text:='from public.billing_transactions where patient_id=v_patient order by transaction_date desc limit 100)';
  new_txt text:='from public.billing_transactions where patient_id=v_patient order by transaction_date desc)';
begin
  for f in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace
            where s.nspname='public' and p.prokind='f' and p.proname like 'family_portal%' loop
    def:=pg_get_functiondef(f.oid);
    if position(old_txt in def)>0 then
      newdef:=replace(def,old_txt,new_txt);
      execute newdef;
      n:=n+1;
    end if;
  end loop;
  raise notice 'Family Portal billing: % function(s) now read the full ledger.', n;
end $$;

notify pgrst,'reload schema';

-- Check: should be false (no Family Portal function still cuts the ledger at 100 entries)
select exists(
  select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='public' and p.proname like 'family_portal%' and p.prokind='f'
     and pg_get_functiondef(p.oid) like '%billing_transactions where patient_id=v_patient order by transaction_date desc limit 100%'
) as still_limited;
