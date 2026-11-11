-- READ ONLY — every ACTIVE Guest: nebulisation sessions given in the MAR vs nebulisation charges, day by day.
-- After SQL 374 the Family Portal shows exactly the MAR sessions, so "portal_shows" = mar_sessions.
-- difference > 0 → given but not charged · difference < 0 → charged more than given (Accounts to review).
with s as (
  select o.patient_id, a.scheduled_date d, count(distinct a.scheduled_time::time) n
    from public.medication_administrations a join public.medication_orders o on o.id=a.order_id
   where a.status='Given' and public.samara_is_nebulisation(o.route,o.medicine_name) group by 1,2),
c as (
  select b.patient_id, b.charge_date d, sum(b.quantity) q
    from public.bill_charge_requests b
   where coalesce(b.service_name,'')||coalesce(b.description,'') ilike '%nebul%'
     and coalesce(b.status,'') not in ('Removed','Cancelled','Rejected') and coalesce(b.approval_status,'')<>'Rejected' group by 1,2)
select p.full_name guest, p.nebulizer_type, coalesce(s.d,c.d) as service_day, coalesce(s.n,0) mar_sessions_portal_shows, coalesce(c.q,0) charged,
       coalesce(s.n,0)-coalesce(c.q,0) difference
  from public.patients p
  join (s full join c on c.patient_id=s.patient_id and c.d=s.d) on p.id=coalesce(s.patient_id,c.patient_id)
 where coalesce(p.is_active,true) and coalesce(p.admission_status,'')<>'Discharged'
 order by guest, service_day desc;
