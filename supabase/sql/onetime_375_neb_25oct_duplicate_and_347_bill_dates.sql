-- ONE-TIME FIX (11-11-2026) — Admin's instruction, after the nebulisation check (MAR vs Family Portal vs bill).
-- 1. Mr. S. SWAMINATHAN, 25-10-2026: 4 nebulisations given in the MAR, 5 charged (the 6 AM session was started more than
--    once). One charge is reversed: removed from the bill (ledger entry deleted), the Bills & Charges request kept for the
--    record as Cancelled (amount 0) with the reason, any linked Approval Request marked Cancelled, audit record written.
--    Only runs if that day still has exactly 5 charges and 4 MAR sessions; otherwise nothing is changed.
-- 2. The missed-nebulisation charges raised by the 06-11 correction (onetime 347 — Mr. S. Swaminathan and Mrs. Shanthi.T)
--    were posted in the bill on the day Accounts approved them (06/07-11). Each bill line now carries the date and time
--    of the nebulisation it is for (its MAR session), so the Family Portal bill shows it on the right day.
--    Amounts are unchanged — only the date shown on those bill lines.
-- Safe to run again (each part checks whether it was already done).

begin;

do $neb25$
declare v_pid uuid; n_ch int; n_mar int; r public.bill_charge_requests%rowtype; v_bt jsonb;
begin
  select id into v_pid from public.patients where full_name ilike '%swaminathan%' limit 1;
  if v_pid is null then raise exception 'Guest not found — nothing changed.'; end if;
  if exists (select 1 from public.bill_charge_requests where patient_id=v_pid and charge_date='2026-10-25'
              and approval_remarks like '%onetime 375%') then
    raise notice 'Part 1 already done.'; return;
  end if;
  select count(*) into n_ch from public.bill_charge_requests
   where patient_id=v_pid and charge_date='2026-10-25' and coalesce(service_name,'') ilike '%nebul%'
     and coalesce(status,'') not in ('Cancelled','Removed','Rejected');
  select count(distinct a.scheduled_time::time) into n_mar
    from public.medication_administrations a join public.medication_orders o on o.id=a.order_id
   where o.patient_id=v_pid and a.scheduled_date='2026-10-25' and a.status='Given' and public.samara_is_nebulisation(o.route,o.medicine_name);
  if n_ch<>5 or n_mar<>4 then raise exception 'Expected 5 charges / 4 MAR sessions on 25-10-2026, found % / % — nothing changed.', n_ch, n_mar; end if;

  -- the extra one: a charge at the same minute as another one that day (the repeated 6 AM start), else the latest raised
  select b.* into r from public.bill_charge_requests b
   where b.patient_id=v_pid and b.charge_date='2026-10-25' and coalesce(b.service_name,'') ilike '%nebul%'
     and coalesce(b.status,'') not in ('Cancelled','Removed','Rejected')
   order by (exists (select 1 from public.bill_charge_requests x where x.patient_id=b.patient_id and x.id<>b.id
                      and x.charge_date=b.charge_date and coalesce(x.service_name,'') ilike '%nebul%'
                      and coalesce(x.status,'') not in ('Cancelled','Removed','Rejected')
                      and date_trunc('minute',coalesce(x.service_datetime,x.raised_at))=date_trunc('minute',coalesce(b.service_datetime,b.raised_at))
                      and (x.created_at, x.id) < (b.created_at, b.id))) desc,
            b.created_at desc
   limit 1 for update;

  select to_jsonb(t) into v_bt from public.billing_transactions t where t.id=r.billing_transaction_id;
  perform set_config('samara.nursing_procedure_charge','on',true);
  update public.bill_charge_requests
     set status='Cancelled', approved_amount=0, final_amount=0, billing_transaction_id=null,
         approval_remarks=concat_ws(' · ', approval_remarks, 'Cancelled 11-11-2026 (onetime 375): 25-10-2026 had 4 nebulisations in the MAR but 5 charges — duplicate reversed (Admin instruction)'),
         updated_at=now()
   where id=r.id;
  if r.billing_transaction_id is not null then delete from public.billing_transactions where id=r.billing_transaction_id; end if;
  update public.nursing_procedure_requests
     set status='Cancelled', decision_remarks=concat_ws(' · ', decision_remarks, 'Cancelled 11-11-2026: duplicate nebulisation charge reversed (Admin)'), updated_at=now()
   where charge_request_id=r.id;
  perform set_config('samara.nursing_procedure_charge','',true);
  perform public.record_audit_event('Charge Reversed','Bills & Charges',r.id::text,
    jsonb_build_object('reason','Duplicate nebulisation charge on 25-10-2026 (4 given in MAR, 5 charged); reversed on Admin instruction','charge_request',to_jsonb(r),'ledger_entry_removed',v_bt),'Success');
  raise notice 'Part 1: reversed charge % (Rs %).', r.id, coalesce((v_bt->>'amount')::numeric, r.final_amount);
end $neb25$;

do $dates347$
declare n int;
begin
  update public.billing_transactions t
     set transaction_date = coalesce(b.service_datetime, (b.charge_date + time '12:00') at time zone 'Asia/Kolkata')
    from public.bill_charge_requests b
   where b.billing_transaction_id = t.id
     and b.remarks like 'MIS Care-vs-Billing reconciliation (onetime 347)%'
     and coalesce(b.status,'') not in ('Cancelled','Removed','Rejected')
     and (t.transaction_date at time zone 'Asia/Kolkata')::date <> b.charge_date;
  get diagnostics n = row_count;
  raise notice 'Part 2: % bill line(s) moved to their nebulisation date.', n;
end $dates347$;

commit;

-- Check: Mr. S. Swaminathan — nebulisations given vs charged vs bill lines, per day (all three columns should now match)
with p as (select id from public.patients where full_name ilike '%swaminathan%' limit 1),
mar as (select a.scheduled_date d, count(distinct a.scheduled_time::time) n
          from public.medication_administrations a join public.medication_orders o on o.id=a.order_id join p on p.id=o.patient_id
         where a.status='Given' and public.samara_is_nebulisation(o.route,o.medicine_name) group by 1),
req as (select b.charge_date d, count(*) n from public.bill_charge_requests b join p on p.id=b.patient_id
         where coalesce(b.service_name,'') ilike '%nebul%' and coalesce(b.status,'') not in ('Cancelled','Removed','Rejected') group by 1),
led as (select (t.transaction_date at time zone 'Asia/Kolkata')::date d, count(*) n, sum(t.amount) amt
          from public.billing_transactions t join p on p.id=t.patient_id
         where t.transaction_type='Charge' and t.description ilike '%nebul%' group by 1),
days as (select d from mar union select d from req union select d from led)
select days.d as service_day, mar.n given_in_mar, req.n charged, led.n bill_lines_on_this_day, led.amt
  from days left join mar using(d) left join req using(d) left join led using(d)
union all
select null, (select sum(n) from mar), (select sum(n) from req), (select sum(n) from led), (select sum(amt) from led)
order by 1 desc nulls first;
