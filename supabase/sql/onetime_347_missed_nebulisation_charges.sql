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
