-- ONE-TIME FIX (29-10-2026) — Mr. RANJITHKUMAR (Room 108-A): physiotherapy charged ₹800 instead of the agreed ₹500.
-- Run once in Supabase → SQL Editor. Safe to run again (the second run finds nothing to correct and changes nothing).
--
-- Cause: two Guest physiotherapy rates were saved for him — ₹500 from 21-10-2026 ("as agreed") and ₹800 from
--   22-10-2026 ("agreed"). The newer one applies from its date, so every session from 23-10-2026 was raised and
--   approved at ₹800. Admin (Boomi) confirmed 29-10-2026: the agreed rate is ₹500 per session.
-- What this does (all or nothing — if anything does not match, nothing is changed):
--   1. The 22-10-2026 rate is corrected to ₹500 (kept in history with a note, so future sessions are ₹500).
--   2. Every physiotherapy charge raised on that rate: rate, requested and approved amount → ₹500.
--   3. The matching entries in his bill (ledger) → ₹500, with a correction note. Total bill reduces by ₹300 per session.
--   4. Session billing rate → ₹500. An audit event is recorded.
begin;

do $$
declare
  v_patient uuid; v_rate uuid; v_n int; v_posted int; v_total numeric;
begin
  select id into v_patient from public.patients where full_name ilike '%ranjithkumar%';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Expected exactly one Guest named RANJITHKUMAR, found %', v_n; end if;

  select id into v_rate from public.patient_physio_rates
   where patient_id = v_patient and effective_from = date '2026-10-22' and amount = 800;
  if v_rate is null then
    raise notice 'Nothing to correct: no ₹800 rate from 22-10-2026 (already fixed?)';
    return;
  end if;

  -- the session-linked charge guard fixes rate/price once raised; lifted only inside this transaction
  alter table public.bill_charge_requests disable trigger patient_physio_charge_guard;

  -- 3. bill (ledger) entries of the approved charges
  update public.billing_transactions t
     set amount = 500,
         description = t.description || ' · Rate corrected ₹800 → ₹500 on 29-10-2026 (agreed Guest rate; ₹800 entered by mistake)'
    from public.bill_charge_requests b
   where b.billing_transaction_id = t.id and b.patient_physio_rate_id = v_rate and t.amount = 800;
  get diagnostics v_posted = row_count;

  -- 2. the charge requests themselves
  update public.bill_charge_requests b
     set unit_cost = 500, estimated_amount = 500, requested_amount = 500,
         approved_amount = case when b.approved_amount is not null then 500 end,
         final_amount    = case when b.final_amount    is not null then 500 end,
         approval_remarks = concat_ws(' · ', b.approval_remarks, 'Rate corrected ₹800 → ₹500 on 29-10-2026'),
         updated_at = now()
   where b.patient_physio_rate_id = v_rate and b.unit_cost = 800;
  get diagnostics v_n = row_count;

  alter table public.bill_charge_requests enable trigger patient_physio_charge_guard;

  -- 4. sessions
  update public.physiotherapy_sessions s set billing_rate = 500, updated_at = now()
    from public.bill_charge_requests b
   where b.physiotherapy_session_id = s.id and b.patient_physio_rate_id = v_rate and s.billing_rate = 800;

  -- 1. the rate itself (future sessions → ₹500)
  update public.patient_physio_rates
     set amount = 500,
         notes = notes || ' · Corrected to ₹500 on 29-10-2026: ₹800 was entered by mistake (agreed rate ₹500, Admin)'
   where id = v_rate;

  v_total := (800 - 500) * v_n;
  perform public.record_audit_event('Physiotherapy Rate Corrected','Physiotherapy',v_patient::text,
    jsonb_build_object('rate_id',v_rate,'from',800,'to',500,'charges_corrected',v_n,'bill_entries_corrected',v_posted,'bill_reduced_by',v_total),'Success');
  raise notice 'Corrected % charge(s), % bill entr(ies); bill reduced by ₹%', v_n, v_posted, v_total;
end $$;

commit;

-- Check: his physiotherapy charges and bill entries now
select to_char(b.service_datetime at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI') as session, b.unit_cost as rate,
       b.approved_amount, t.amount as in_bill, b.approval_status
  from public.bill_charge_requests b join public.patients p on p.id = b.patient_id
  left join public.billing_transactions t on t.id = b.billing_transaction_id
 where p.full_name ilike '%ranjithkumar%' and b.category = 'Physiotherapy'
 order by b.service_datetime;
