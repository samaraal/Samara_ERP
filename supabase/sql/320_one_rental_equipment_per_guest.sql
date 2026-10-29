-- ERP 2.19.17 — ONE daily-rental bed equipment per Guest (29-10-2026). Run once in Supabase SQL Editor. Safe to run again.
--
-- Found: Mr. S. SWAMINATHAN (MOG-2026-10-0013) had the Air Bed With Motor (BME-009-02, issued 25-10) AND an Air Mattress
--   (BME-010-01, issued 28-10 7:30 PM) at the same time, so both daily rentals were charged on 28-10 and 29-10
--   (Air Mattress ₹200 × 2 = ₹400 extra). Both pieces were returned just after midnight on 29-10.
-- Fix:
--   1. Prevent: a Guest can have only ONE daily-rental item (Air Bed With Motor / Air Mattress) In Use at a time.
--      Starting / issuing a second one is refused: "return BME-… first".
--   2. Charging: even if two such items overlap on a day (e.g. a swap), only ONE rental is charged per Guest per day —
--      the higher-rate item; and a day already charged for one item is never charged again for another.
--   3. Correct Mr. Swaminathan: remove the two Air Mattress rental charges (28-10, 29-10 = ₹400). An audit record keeps
--      the details. The Air Bed With Motor charges stay.
begin;

-- 1. Only one daily-rental item in use per Guest ----------------------------------------------------------------------
create or replace function public.guard_one_rental_bed_per_guest()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $f$
declare other record;
begin
  if new.status = 'In Use' and new.current_patient_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'In Use' or old.current_patient_id is distinct from new.current_patient_id)
     and exists(select 1 from public.biomedical_equipment_items i where i.id = new.item_id and i.daily_rental) then
    select e.asset_no, i.item_name into other
      from public.biomedical_equipment e join public.biomedical_equipment_items i on i.id = e.item_id and i.daily_rental
     where e.current_patient_id = new.current_patient_id and e.status = 'In Use' and e.id <> new.id
     limit 1;
    if found then
      raise exception 'This Guest already has % (%) in use — it is charged every day. Return it first, then start this one.',
        other.asset_no, other.item_name;
    end if;
  end if;
  return new;
end $f$;
revoke all on function public.guard_one_rental_bed_per_guest() from public, anon, authenticated;
drop trigger if exists trg_one_rental_bed_per_guest on public.biomedical_equipment;
create trigger trg_one_rental_bed_per_guest before insert or update on public.biomedical_equipment
  for each row execute function public.guard_one_rental_bed_per_guest();

-- 2. Generator: one rental per Guest per day (higher rate wins; a day already charged is not charged again) -----------
create or replace function public.generate_equipment_rental_charges(p_upto date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare
  v_upto date := coalesce(p_upto,(now() at time zone 'Asia/Kolkata')::date);
  v_from date; v_created int := 0; v_no_rate int := 0;
begin
  if auth.uid() is not null and not exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid())
       and coalesce(p.is_active,true) and lower(trim(p.role)) in ('admin','administrator','director','accounts')) then
    raise exception 'Only Admin / Director / Accounts can run equipment rental charges.';
  end if;
  select charge_from into v_from from public.equipment_rental_settings where id=1;

  with per as (
    -- discharge_date is trusted only once the Guest is discharged (for active Guests it can hold the admission date)
    select per.*, case when coalesce(pt.is_active,true) then null else pt.discharge_date::date end as discharge_d, o.rental_from,
           row_number() over (partition by per.patient_id, per.item_id order by per.start_d) as period_no
      from public.equipment_rental_periods() per
      join public.patients pt on pt.id=per.patient_id and (coalesce(pt.is_active,true) or pt.discharge_date is not null)
      left join public.equipment_rental_start_overrides o on o.patient_id=per.patient_id and o.item_id=per.item_id
  ), rated as (
    select per.*, r.amount as rate, r.service_name
      from per
      left join lateral (select c.amount, c.service_name
                           from public.biomedical_equipment_items i
                           join public.charge_tariff_master c on c.category='Biomedical Equipment' and c.is_active
                            and (c.charge_code=i.charge_code or (i.charge_code is null and lower(trim(c.service_name))=lower(trim(i.item_name))))
                          where i.id=per.item_id limit 1) r on true
  ), days as (
    select rated.*, gs::date as d
      from rated,
           generate_series(case when rated.rental_from is not null and rated.period_no=1 then rated.rental_from
                                else greatest(rated.start_d, coalesce(least(rated.rental_from, v_from), v_from)) end,
                           least(rated.end_d, v_upto, coalesce(rated.discharge_d, rated.end_d)), interval '1 day') gs
     where coalesce(rated.rate,0) > 0
  ), best as (
    select distinct on (days.patient_id, days.d) days.*
      from days order by days.patient_id, days.d, days.rate desc, days.item_id
  ), ins as (
    insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,
           transaction_date,entered_by,auto_generated,source_date,source_type,source_key)
    select b.patient_id,'Charge','Biomedical Equipment',b.rate,'Not applicable',
           format('%s — daily rental for %s (%s)', coalesce(b.service_name,b.item_name), to_char(b.d,'DD-MM-YYYY'), b.asset_no),
           (b.d::text||' 00:00:00+00')::timestamptz, null, true, b.d, 'Equipment Daily Rental',
           format('BME-RENT:%s:%s:%s', b.patient_id, b.item_id, b.d)
      from best b
     where not exists(select 1 from public.billing_transactions t
                       where t.patient_id=b.patient_id and t.source_type='Equipment Daily Rental' and t.source_date=b.d)
    on conflict (source_key) where source_key is not null do nothing
    returning 1
  )
  select count(*) into v_created from ins;

  select count(*) into v_no_rate from public.equipment_rental_periods() per
   where not exists(select 1 from public.biomedical_equipment_items i
                      join public.charge_tariff_master c on c.category='Biomedical Equipment' and c.is_active and coalesce(c.amount,0)>0
                       and (c.charge_code=i.charge_code or (i.charge_code is null and lower(trim(c.service_name))=lower(trim(i.item_name))))
                     where i.id=per.item_id);
  return jsonb_build_object('success',true,'charges_created',v_created,'periods_without_rate',v_no_rate,'upto',v_upto);
end $f$;
revoke all on function public.generate_equipment_rental_charges(date) from public, anon;
grant execute on function public.generate_equipment_rental_charges(date) to authenticated;

-- 3. Correct Mr. S. Swaminathan: remove the overlapping Air Mattress rental charges (28-10 and 29-10) ----------------
do $$
declare v_pid uuid; v_rows jsonb; v_n int;
begin
  select id into v_pid from public.patients where patient_id='MOG-2026-10-0013';
  if v_pid is null then raise notice 'MOG-2026-10-0013 not found — nothing corrected.'; return; end if;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb), count(*) into v_rows, v_n
    from public.billing_transactions t
   where t.patient_id=v_pid and t.source_type='Equipment Daily Rental' and t.description ilike 'Air Mattress%'
     and t.source_date in (date '2026-10-28', date '2026-10-29')
     and exists(select 1 from public.billing_transactions b where b.patient_id=v_pid and b.source_type='Equipment Daily Rental'
                 and b.source_date=t.source_date and b.description ilike 'Air Bed With Motor%');
  if v_n = 0 then raise notice 'Nothing to correct (already done).'; return; end if;
  delete from public.billing_transactions t
   where t.id in (select (x->>'id')::uuid from jsonb_array_elements(v_rows) x);
  perform public.record_audit_event('Equipment Rental Double Charge Removed','Biomedical Equipment',v_pid::text,
    jsonb_build_object('reason','Air Mattress (BME-010-01) issued while Air Bed With Motor (BME-009-02) was in use — only one rental charged per day (Admin, 29-10-2026)',
                       'removed',v_rows),'Success');
  raise notice 'Removed % Air Mattress charge(s) for MOG-2026-10-0013.', v_n;
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: Mr. Swaminathan's equipment rental charges now (one per day)
select t.source_date, t.amount, t.description
  from public.billing_transactions t join public.patients p on p.id=t.patient_id
 where p.patient_id='MOG-2026-10-0013' and t.source_type='Equipment Daily Rental'
 order by t.source_date, t.description;
