-- 345 — A Cancelled / Removed charge request is never "awaiting Accounts" — ERP 2.19.68
-- Run once in Supabase > SQL Editor. Safe to run more than once.
--
-- Found 05-11-2026 (Mr. JOSEPH A A E FERNANDO): Discharge Approval showed "1 charge request(s) awaiting Accounts".
-- It was the duplicate Blood Glucose Monitoring of 29-10-2026 that was CANCELLED (onetime 322): approved, but its
-- ledger entry was removed, so the discharge checks counted it as "approved but not posted" = unresolved.
-- That wrongly blocked a discount, Accounts clearance and "Allow Departure – Dues Pending".
-- Fix: the three discharge checks skip requests whose status is Cancelled or Removed.
do $patch$
declare fn text; def text; n int := 0;
  anchor text := 'coalesce(r.approval_status,''Pending'')<>''Rejected''';
  repl   text := 'coalesce(r.approval_status,''Pending'')<>''Rejected'' and coalesce(r.status,'''') not in (''Cancelled'',''Removed'') /*345*/';
begin
  foreach fn in array array['public.discharge_management_snapshot(uuid)','public.samara_assert_discharge_financial_ready(uuid)','public.allow_discharge_with_dues(uuid,text)'] loop
    if to_regprocedure(fn) is null then raise notice '% not found — skipped', fn; continue; end if;
    def := pg_get_functiondef(fn::regprocedure);
    if strpos(def, '/*345*/') > 0 then continue; end if;
    if strpos(def, anchor) = 0 then raise notice '% : check text not found — skipped', fn; continue; end if;
    execute replace(def, anchor, repl); n := n + 1;
  end loop;
  raise notice 'Discharge checks updated: %', n;
end $patch$;
notify pgrst, 'reload schema';

-- Check: requests that still count as awaiting Accounts for Guests with an open discharge.
select concat_ws(' ',p.title,p.full_name) as guest, r.service_name, r.charge_date, r.approval_status, r.status
  from public.bill_charge_requests r join public.patients p on p.id=r.patient_id
  join public.patient_discharges d on d.patient_id=r.patient_id and d.status<>'Completed'
 where coalesce(r.approval_status,'Pending')<>'Rejected' and coalesce(r.status,'') not in ('Cancelled','Removed')
   and (coalesce(r.approval_status,'Pending') not in ('Approved','Partially Approved')
        or not exists(select 1 from public.billing_transactions t where t.id=r.billing_transaction_id));
