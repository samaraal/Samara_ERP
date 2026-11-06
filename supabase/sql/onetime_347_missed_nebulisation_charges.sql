-- ONE-TIME (06-11-2026) — raise nebulisation charges that were given (MAR) but never charged. Admin's instruction.
-- Found by the Care-vs-Billing check: nebulisation sessions (distinct dose times recorded "Given" for inhalation medicines)
-- compared day by day with nebulisation charges in Bills & Charges (not Removed / Rejected).
--   • Mr. S. SWAMINATHAN — every past day with a shortfall (today 06-11 left out: the day is not over).  Samara nebulizer ₹100.
--   • Mrs. SHANTHI.T     — November only (October left as it is, Admin's instruction).                     Own nebulizer ₹25.
--   • Other Guests (discharged) — not raised.
-- One request per day for the missing quantity, status Raised / Pending → Accounts approve as usual.
-- Days where MORE was charged than given are NOT changed here — they are listed in the MIS for Accounts to review.
-- Safe to run again: a day already raised by this script is skipped (marker in remarks).
-- Ran 06-11-2026: 13 requests, 26 sessions, Rs 2,150 (Pending with Accounts).
-- Nursing Procedure charges are normally allowed only from Confirm & Start; this block sets the same session flag.
do $mis347$
begin
perform set_config('samara.nursing_procedure_charge','on',true);
with pt as (
  select id, full_name,
         case when full_name ilike '%swaminathan%' then 'S' else 'H' end as who
    from public.patients where full_name ilike '%swaminathan%' or full_name ilike '%shanthi%'),
s as (
  select o.patient_id, a.scheduled_date d, count(distinct a.scheduled_time) n,
         string_agg(distinct to_char(a.scheduled_time::time,'HH24:MI'), ', ') times,
         max(a.scheduled_time::time) last_t
    from public.medication_administrations a join public.medication_orders o on o.id=a.order_id join pt on pt.id=o.patient_id
   where a.status='Given' and (o.route ilike '%inhal%' or o.medicine_name ilike 'neb%')
   group by 1,2),
c as (
  select b.patient_id, b.charge_date d, sum(b.quantity) q
    from public.bill_charge_requests b join pt on pt.id=b.patient_id
   where coalesce(b.service_name,'')||coalesce(b.description,'') ilike '%nebul%'
     and coalesce(b.status,'')<>'Removed' and coalesce(b.approval_status,'')<>'Rejected'
   group by 1,2),
gap as (
  select pt.id patient_id, pt.who, s.d, s.n, coalesce(c.q,0) charged, s.n-coalesce(c.q,0) missing, s.times, s.last_t
    from s join pt on pt.id=s.patient_id left join c on c.patient_id=s.patient_id and c.d=s.d
   where s.n>coalesce(c.q,0)
     and (s.d < '2026-11-06' or (pt.who='H' and s.d='2026-11-06')))
insert into public.bill_charge_requests(
  patient_id, charge_date, service_datetime, category, service_code, charge_item_code, service_name, description,
  quantity, unit, unit_cost, estimated_amount, requested_amount, billable, bill_available, urgency,
  status, approval_status, remarks, raised_by, raised_by_name, raised_at, updated_at)
select g.patient_id, g.d, ((g.d + g.last_t) at time zone 'Asia/Kolkata'), 'Nursing Procedures',
       case when g.who='S' then 'NEBULIZATION_SAMARA_NEBULIZER' else 'NEBULIZATION_OWN_NEBULIZER' end,
       case when g.who='S' then 'NUR-0001' else 'NUR-0006' end,
       case when g.who='S' then 'Nebulization - Samara Nebulizer' else 'Nebulization - Own Nebulizer' end,
       'Missed nebulisation charge — '||g.missing||' of '||g.n||' sessions given on '||to_char(g.d,'DD-MM-YYYY')||' were not charged (MAR times: '||g.times||')',
       g.missing, 'Service', r.rate, g.missing*r.rate, g.missing*r.rate, true, false, 'Routine',
       'Raised', 'Pending',
       'MIS Care-vs-Billing reconciliation (onetime 347) — raised on Admin instruction 06-11-2026; already charged that day: '||g.charged,
       (select coalesce(auth_user_id,id) from public.profiles where login_id='rajaiahboomi' limit 1),
       'MIS reconciliation (Admin instruction)', now(), now()
  from gap g cross join lateral (select case when g.who='S' then 100 else 25 end::numeric rate) r
 where (g.who='S' or g.d>='2026-11-01')
   and not exists (select 1 from public.bill_charge_requests x where x.patient_id=g.patient_id and x.charge_date=g.d
                    and x.remarks like 'MIS Care-vs-Billing reconciliation (onetime 347)%');
end $mis347$;

-- Follow-up (06-11-2026 21:35): Accounts' approval accepts one session per request at the Charge Master rate
-- ("Approved amount must match the current Admin-fixed tariff"), so each request above with quantity > 1 was split into
-- single-session requests (same date, time, remarks). Result: 26 requests × qty 1, Rs 2,150, all Pending.
do $split347$
declare r public.bill_charge_requests%rowtype; i int; rate numeric;
begin
  perform set_config('samara.nursing_procedure_charge','on',true);
  for r in select * from public.bill_charge_requests
            where remarks like 'MIS Care-vs-Billing reconciliation (onetime 347)%' and quantity>1
              and coalesce(approval_status,'Pending')='Pending' and coalesce(status,'')<>'Removed' for update loop
    rate := r.unit_cost;
    for i in 2..r.quantity::int loop
      insert into public.bill_charge_requests(patient_id,charge_date,service_datetime,category,service_code,charge_item_code,service_name,description,
        quantity,unit,unit_cost,estimated_amount,requested_amount,billable,bill_available,urgency,status,approval_status,remarks,raised_by,raised_by_name,raised_at,updated_at)
      values(r.patient_id,r.charge_date,r.service_datetime,r.category,r.service_code,r.charge_item_code,r.service_name,r.description||' — session '||i||' of '||r.quantity::int,
        1,r.unit,rate,rate,rate,r.billable,r.bill_available,r.urgency,'Raised','Pending',r.remarks,r.raised_by,r.raised_by_name,r.raised_at,now());
    end loop;
    update public.bill_charge_requests set quantity=1, estimated_amount=rate, requested_amount=rate,
           description=description||' — session 1 of '||r.quantity::int, updated_at=now() where id=r.id;
  end loop;
end $split347$;

-- Follow-up 2 (06-11-2026 21:45): the split requests shared one time, so the MIS read them as "Possible duplicate charges".
-- Each request now carries the time of a MAR nebulisation session that day which had no other nebulisation charge.
do $time347$
declare d record; ids uuid[]; times time[]; i int;
begin
  perform set_config('samara.nursing_procedure_charge','on',true);
  for d in select patient_id, charge_date from public.bill_charge_requests
            where remarks like 'MIS Care-vs-Billing reconciliation (onetime 347)%' and coalesce(status,'')<>'Removed' group by 1,2 loop
    select array_agg(id order by created_at,id) into ids from public.bill_charge_requests
     where patient_id=d.patient_id and charge_date=d.charge_date and remarks like 'MIS Care-vs-Billing reconciliation (onetime 347)%' and coalesce(status,'')<>'Removed';
    select array_agg(x.tm order by x.tm desc) into times from (
      select distinct a.scheduled_time::time tm from public.medication_administrations a join public.medication_orders o on o.id=a.order_id
       where o.patient_id=d.patient_id and a.scheduled_date=d.charge_date and a.status='Given' and (o.route ilike '%inhal%' or o.medicine_name ilike 'neb%')
         and not exists (select 1 from public.bill_charge_requests b where b.patient_id=d.patient_id and b.charge_date=d.charge_date
                          and coalesce(b.service_name,'')||coalesce(b.description,'') ilike '%nebul%' and coalesce(b.status,'')<>'Removed' and coalesce(b.approval_status,'')<>'Rejected'
                          and coalesce(b.remarks,'') not like 'MIS Care-vs-Billing reconciliation (onetime 347)%'
                          and (b.service_datetime at time zone 'Asia/Kolkata')::time = a.scheduled_time::time)) x;
    for i in 1..array_length(ids,1) loop
      update public.bill_charge_requests
         set service_datetime = case when times is not null and i<=array_length(times,1) then (d.charge_date + times[i]) at time zone 'Asia/Kolkata'
                                     else service_datetime - make_interval(mins=>i-1) end, updated_at=now()
       where id=ids[i];
    end loop;
  end loop;
end $time347$;
