-- ONE-TIME FIX (05-11-2026) — remove an unauthorised physiotherapy charge raised by an Admin login (Admin's instruction).
-- Run once in Supabase → SQL Editor. Safe to run again (second run finds nothing).
--
-- Found: Guest JOSEPH A A E FERNANDO, 05-11-2026 — "Regular Physiotherapy Session" raised by hand in Bills & Charges by
--   the Admin login (Dr ChellaBoomi) at 12:45 PM; Accounts (Ramya) returned it at 6:46 PM. It was never billed
--   (no ledger entry). The real session that day (7:00 AM, Dr. Lukkysh Kumar, ₹800) is charged and approved — not touched.
-- What this does (all or nothing; exactly this one request must match):
--   • marks the request Removed (amount 0) so it no longer shows in Bills & Charges, Charge Register or the Return alerts,
--   • writes an audit record with its full details (nothing is lost).
begin;
do $$
declare r public.bill_charge_requests%rowtype;
begin
  select * into r from public.bill_charge_requests
   where id='e8c5a419-85c4-410c-8c8b-c49d29d9317b' for update;
  if not found then raise exception 'Request not found — nothing changed.'; end if;
  if r.status='Removed' then raise notice 'Already removed.'; return; end if;
  if coalesce(r.approval_status,'')<>'Rejected' or r.billing_transaction_id is not null or r.category<>'Physiotherapy' or r.charge_date<>'2026-11-05' then
    raise exception 'Request is not the returned, unbilled physiotherapy charge of 05-11-2026 — nothing changed.';
  end if;
  update public.bill_charge_requests
     set status='Removed', requested_amount=0, estimated_amount=0, approved_amount=0, final_amount=0,
         physio_return_closed_at=now(), physio_return_note='Removed 05-11-2026: unauthorised entry raised by Admin login (Admin instruction)',
         approval_remarks=concat_ws(' · ', approval_remarks, 'Removed 05-11-2026: unauthorised entry raised by Admin login'),
         updated_at=now()
   where id=r.id;
  perform public.record_audit_event('Unauthorised Charge Removed','Bills & Charges',r.id::text,
    jsonb_build_object('reason','Raised by hand by an Admin login (not authorised to raise charges); removed on Admin instruction 05-11-2026','charge_request',to_jsonb(r)),'Success');
  raise notice 'Removed.';
end $$;
commit;

-- Check
select status, approval_status, requested_amount, physio_return_closed_at is not null as alerts_stopped
  from public.bill_charge_requests where id='e8c5a419-85c4-410c-8c8b-c49d29d9317b';
