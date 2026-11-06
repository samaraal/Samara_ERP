-- ONE-TIME FIX (06-11-2026) — reverse 2 nebulisation charges with no MAR session (Admin's instruction).
-- Guest Mr. S. SWAMINATHAN, 06-11-2026: 6 nebulisation charges approved and posted, only 4 sessions given in the MAR
-- (09:00, 10:00, 14:00, 21:00). The charges at 06:40 (Miss Saranya S) and 18:46 (Mrs. Sobana Mannathan) match no session.
-- What this does (all or nothing; exactly these 2 must match):
--   • removes both from the Guest's bill (ledger entry deleted),
--   • keeps the Bills & Charges requests for the record, marked Cancelled with the reason (amount 0),
--   • marks any linked Approval Request Cancelled, and writes an audit record with full details.
begin;
do $$
declare r public.bill_charge_requests%rowtype; v_bt jsonb; n int;
begin
  select count(*) into n from public.bill_charge_requests
   where id::text like any(array['af68bbc2%','c602c068%']) and coalesce(status,'')<>'Cancelled';
  if n=0 then raise notice 'Already reversed.'; return; end if;
  if n<>2 then raise exception 'Expected 2 charges, found % — nothing changed.', n; end if;
  for r in select * from public.bill_charge_requests where id::text like any(array['af68bbc2%','c602c068%']) for update loop
    if r.charge_date<>'2026-11-06' or coalesce(r.service_name,'') not ilike '%nebul%' then
      raise exception 'Charge % is not a 06-11-2026 nebulisation — nothing changed.', r.id; end if;
    select to_jsonb(t) into v_bt from public.billing_transactions t where t.id=r.billing_transaction_id;
    update public.bill_charge_requests
       set status='Cancelled', approved_amount=0, final_amount=0, billing_transaction_id=null,
           approval_remarks=concat_ws(' · ', approval_remarks, 'Cancelled 06-11-2026: no matching nebulisation session in the MAR (Admin instruction)'),
           updated_at=now()
     where id=r.id;
    if r.billing_transaction_id is not null then delete from public.billing_transactions where id=r.billing_transaction_id; end if;
    update public.nursing_procedure_requests
       set status='Cancelled', decision_remarks=concat_ws(' · ', decision_remarks, 'Cancelled 06-11-2026: charge reversed — no matching MAR session (Admin)'), updated_at=now()
     where charge_request_id=r.id;
    perform public.record_audit_event('Charge Reversed','Bills & Charges',r.id::text,
      jsonb_build_object('reason','Nebulisation charged with no matching MAR session on 06-11-2026; reversed on Admin instruction','charge_request',to_jsonb(r),'ledger_entry_removed',v_bt),'Success');
  end loop;
  raise notice 'Reversed 2 charges.';
end $$;
commit;
