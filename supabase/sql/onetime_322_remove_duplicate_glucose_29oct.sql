-- ONE-TIME FIX (30-10-2026) — duplicate "Blood Glucose Monitoring" on 29-10-2026 (Admin approved removal).
-- Run once in Supabase → SQL Editor. Safe to run again (second run finds nothing).
--
-- Found: for one Guest, Blood Glucose Monitoring was requested, approved and started at 5:40 AM and again at 5:52 AM
--   (both by Mrs. Sobana Mannathan) and both charges were approved. The 5:52 AM one is the duplicate.
-- What this does (all or nothing; exactly one charge must match or nothing changes):
--   • removes that charge from the Guest's bill (ledger entry deleted),
--   • keeps the Bills & Charges request for the record, marked Cancelled with the reason (amount 0),
--   • marks the 5:52 AM Approval Request Cancelled with the same reason, so it does not count as done,
--   • writes an audit record with the full details.
begin;
do $$
declare r record; n int; v_bt jsonb;
begin
  select count(*) into n from public.bill_charge_requests b
   where b.service_name='Blood Glucose Monitoring' and b.charge_item_code='NUR-0005'
     and b.service_datetime between timestamptz '2026-10-29 00:22:40+00' and timestamptz '2026-10-29 00:22:50+00'
     and coalesce(b.status,'') <> 'Cancelled';
  if n = 0 then raise notice 'Nothing to remove (already done).'; return; end if;
  if n <> 1 then raise exception 'Expected exactly one matching charge, found % — nothing changed.', n; end if;

  select b.* into r from public.bill_charge_requests b
   where b.service_name='Blood Glucose Monitoring' and b.charge_item_code='NUR-0005'
     and b.service_datetime between timestamptz '2026-10-29 00:22:40+00' and timestamptz '2026-10-29 00:22:50+00'
     and coalesce(b.status,'') <> 'Cancelled';

  -- the earlier (5:40 AM) charge for the same Guest must exist, otherwise this is not a duplicate
  if not exists(select 1 from public.bill_charge_requests b where b.patient_id=r.patient_id and b.charge_item_code='NUR-0005'
                  and b.service_datetime between r.service_datetime - interval '20 minutes' and r.service_datetime - interval '1 minute'
                  and coalesce(b.approval_status,'Pending') <> 'Rejected' and coalesce(b.status,'') <> 'Cancelled') then
    raise exception 'No earlier Blood Glucose Monitoring charge found within 20 minutes — nothing changed.';
  end if;

  select to_jsonb(t) into v_bt from public.billing_transactions t where t.id = r.billing_transaction_id;
  update public.bill_charge_requests
     set status='Cancelled', approved_amount=0, final_amount=0, billing_transaction_id=null,
         approval_remarks=concat_ws(' · ', approval_remarks, 'Cancelled 30-10-2026: duplicate of the 5:40 AM Blood Glucose Monitoring (Admin)'),
         updated_at=now()
   where id=r.id;
  if r.billing_transaction_id is not null then
    delete from public.billing_transactions where id=r.billing_transaction_id;
  end if;
  update public.nursing_procedure_requests
     set status='Cancelled', decision_remarks=concat_ws(' · ', decision_remarks, 'Cancelled 30-10-2026: duplicate of the 5:40 AM check (Admin)'), updated_at=now()
   where charge_request_id=r.id;

  perform public.record_audit_event('Duplicate Charge Removed','Bills & Charges',r.id::text,
    jsonb_build_object('reason','Blood Glucose Monitoring done/charged twice within 12 minutes on 29-10-2026; 5:52 AM entry removed (Admin approved 30-10-2026)',
                       'charge_request',to_jsonb(r),'ledger_entry_removed',v_bt),'Success');
  raise notice 'Removed the 5:52 AM duplicate (₹%).', coalesce((v_bt->>'amount'),'0');
end $$;
commit;

-- Check: that Guest's Blood Glucose Monitoring on 29-10 (the 5:52 AM one now Cancelled)
select to_char(b.service_datetime at time zone 'Asia/Kolkata','DD-MM HH12:MI AM') as at, b.status, b.approval_status,
       coalesce(b.approved_amount,b.final_amount) as amount, b.billing_transaction_id is not null as in_bill
  from public.bill_charge_requests b
 where b.charge_item_code='NUR-0005' and b.charge_date='2026-10-29'
   and b.patient_id=(select patient_id from public.bill_charge_requests where service_datetime between timestamptz '2026-10-29 00:22:40+00' and timestamptz '2026-10-29 00:22:50+00' and charge_item_code='NUR-0005' limit 1)
 order by b.service_datetime;
