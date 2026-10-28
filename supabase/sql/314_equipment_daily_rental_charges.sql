-- ERP 2.18.190 — Automatic DAILY RENTAL charge for issued equipment (Air Bed With Motor, Air Mattress) (28-10-2026).
-- Run once in Supabase SQL Editor. Safe to run again.
--
-- Why: equipment issued to a Guest (Approval Requests → Started) was only recorded in the equipment register; the
--   charge had to be raised by hand in Bills & Charges and never was (no equipment charge since opening), and the
--   Air Bed / Air Mattress had no Charge Master rate at all.
-- What:
--   1. Charge Master: "Air Bed With Motor" and "Air Mattress" (Biomedical Equipment) — ₹250 / ₹200 per day;
--      Admin / Director can change the rate in Charge Master. Equipment items are linked to their Charge Master code.
--   2. Equipment items get a "Daily rental" switch — ON only for Air Bed With Motor and Air Mattress.
--   3. generate_equipment_rental_charges(): ONE charge per Guest per equipment type per calendar day (IST) while it is
--      with the Guest — the issue day AND the return day are both charged (decided 28-10-2026). Locked by a unique key
--      (Guest + equipment type + date): two shifts, two nurses or a same-day swap can never charge twice.
--      Stops on return or on the Guest's discharge date. Days not yet charged (e.g. price entered later) are caught up.
--   4. Runs every hour at :40 (cron), so a newly issued piece is charged the same day.
--   5. Manual Bills & Charges requests for a daily-rental item are blocked (it is automatic now).
--   6. Charging starts from 28-10-2026 by default; an earlier start for a specific Guest is set in
--      equipment_rental_start_overrides (only where approved).
begin;

-- 1. Charge Master items — daily rate fixed by Boomi on 28-10-2026: Air Bed With Motor ₹250, Air Mattress ₹200 per day
--    (Admin / Director can change it later in Charge Master; a rate already set there is never overwritten) --
do $$
declare v_name text; v_next int; v_code text; v_rate numeric;
begin
  foreach v_name in array array['Air Bed With Motor','Air Mattress'] loop
    v_rate := case v_name when 'Air Bed With Motor' then 250 else 200 end;
    if not exists(select 1 from public.charge_tariff_master where category='Biomedical Equipment' and lower(trim(service_name))=lower(v_name)) then
      select coalesce(max(nullif(regexp_replace(charge_code,'\D','','g'),'')::int),0)+1 into v_next
        from public.charge_tariff_master where charge_code ~ '^BIO-[0-9]+$';
      v_code := 'BIO-'||lpad(v_next::text,4,'0');
      insert into public.charge_tariff_master(category,charge_code,service_name,amount,is_active,display_order,handling_fee_type,handling_fee_value,requires_nm_approval)
      values('Biomedical Equipment',v_code,v_name,v_rate,true,100,'None',0,false);
    else
      update public.charge_tariff_master set amount=v_rate
       where category='Biomedical Equipment' and lower(trim(service_name))=lower(v_name) and amount is null;
    end if;
  end loop;
end $$;

-- 2. Daily rental switch on equipment items + link to Charge Master code ----------------------------------------
alter table public.biomedical_equipment_items add column if not exists daily_rental boolean not null default false;
update public.biomedical_equipment_items i
   set daily_rental = true,
       charge_code = coalesce(i.charge_code,(select c.charge_code from public.charge_tariff_master c
                                              where c.category='Biomedical Equipment' and lower(trim(c.service_name))=lower(trim(i.item_name)) limit 1))
 where lower(trim(i.item_name)) in ('air bed with motor','air mattress');

-- 3. Settings and approved earlier starts ------------------------------------------------------------------------
create table if not exists public.equipment_rental_settings(
  id int primary key default 1 check (id=1),
  charge_from date not null,
  updated_at timestamptz not null default now()
);
insert into public.equipment_rental_settings(id,charge_from) values(1,date '2026-10-28') on conflict (id) do nothing;

create table if not exists public.equipment_rental_start_overrides(
  patient_id uuid not null references public.patients(id) on delete cascade,
  item_id uuid not null references public.biomedical_equipment_items(id) on delete cascade,
  rental_from date not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key(patient_id,item_id)
);
alter table public.equipment_rental_settings enable row level security;
alter table public.equipment_rental_start_overrides enable row level security;
revoke all on public.equipment_rental_settings, public.equipment_rental_start_overrides from anon, authenticated;
grant select on public.equipment_rental_settings, public.equipment_rental_start_overrides to authenticated;
drop policy if exists equipment_rental_settings_read on public.equipment_rental_settings;
create policy equipment_rental_settings_read on public.equipment_rental_settings for select to authenticated using (true);
drop policy if exists equipment_rental_overrides_read on public.equipment_rental_start_overrides;
create policy equipment_rental_overrides_read on public.equipment_rental_start_overrides for select to authenticated using (true);

-- Rental periods (IST dates) from the equipment register: each "Issued" until the next "Returned" / re-issue of that
-- piece; still "In Use" → open until today. A piece in use with no "Issued" row uses its issued_at.
create or replace function public.equipment_rental_periods()
returns table(equipment_id uuid, asset_no text, item_id uuid, item_name text, patient_id uuid, start_d date, end_d date)
language sql stable security definer set search_path=public,pg_temp as $$
  with mv as (
    select m.equipment_id, m.action, m.patient_id, m.moved_at,
           lead(m.moved_at) over (partition by m.equipment_id order by m.moved_at) as next_at
      from public.biomedical_equipment_movements m
     where m.action in ('Issued','Returned')
  ), issued as (
    select mv.equipment_id, mv.patient_id, mv.moved_at as from_at, mv.next_at as to_at
      from mv where mv.action='Issued' and mv.patient_id is not null
    union all
    select e.id, e.current_patient_id, e.issued_at, null
      from public.biomedical_equipment e
     where e.status='In Use' and e.current_patient_id is not null and e.issued_at is not null
       and not exists(select 1 from public.biomedical_equipment_movements m
                       where m.equipment_id=e.id and m.action='Issued' and m.patient_id=e.current_patient_id and m.moved_at>=e.issued_at-interval '5 minutes')
  )
  select e.id, e.asset_no, i.id, i.item_name, s.patient_id,
         (s.from_at at time zone 'Asia/Kolkata')::date,
         coalesce((s.to_at at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date)
    from issued s
    join public.biomedical_equipment e on e.id=s.equipment_id
    join public.biomedical_equipment_items i on i.id=e.item_id and i.daily_rental
$$;
revoke all on function public.equipment_rental_periods() from public, anon;
grant execute on function public.equipment_rental_periods() to authenticated;

-- 4. The generator ------------------------------------------------------------------------------------------------
create or replace function public.generate_equipment_rental_charges(p_upto date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_upto date := coalesce(p_upto,(now() at time zone 'Asia/Kolkata')::date);
  v_from date; r record; d date; v_rate numeric; v_name text; v_created int:=0; v_no_rate int:=0; v_first date; v_last date;
begin
  if auth.uid() is not null and not exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid())
       and coalesce(p.is_active,true) and lower(trim(p.role)) in ('admin','administrator','director','accounts')) then
    raise exception 'Only Admin / Director / Accounts can run equipment rental charges.';
  end if;
  select charge_from into v_from from public.equipment_rental_settings where id=1;
  for r in
    select per.*, pt.discharge_date::date as discharge_d, o.rental_from,
           row_number() over (partition by per.patient_id, per.item_id order by per.start_d) as period_no
      from public.equipment_rental_periods() per
      join public.patients pt on pt.id=per.patient_id and (coalesce(pt.is_active,true) or pt.discharge_date is not null)
      left join public.equipment_rental_start_overrides o on o.patient_id=per.patient_id and o.item_id=per.item_id
  loop
    select c.amount, c.service_name into v_rate, v_name
      from public.biomedical_equipment_items i
      join public.charge_tariff_master c on c.category='Biomedical Equipment' and c.is_active
       and (c.charge_code=i.charge_code or (i.charge_code is null and lower(trim(c.service_name))=lower(trim(i.item_name))))
     where i.id=r.item_id limit 1;
    if v_rate is null or v_rate<=0 then v_no_rate:=v_no_rate+1; continue; end if;
    -- an approved earlier start moves the first charged day back for that Guest + equipment type only
    v_first := case when r.rental_from is not null and r.period_no=1 then r.rental_from
                    else greatest(r.start_d, coalesce(least(r.rental_from, v_from), v_from)) end;
    v_last  := least(r.end_d, v_upto, coalesce(r.discharge_d, r.end_d));
    d := v_first;
    while d <= v_last loop
      insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,
             transaction_date,entered_by,auto_generated,source_date,source_type,source_key)
      values(r.patient_id,'Charge','Biomedical Equipment',v_rate,'Not applicable',
             format('%s — daily rental for %s (%s)', coalesce(v_name,r.item_name), to_char(d,'DD-MM-YYYY'), r.asset_no),
             (d::text||' 00:00:00+00')::timestamptz, null, true, d, 'Equipment Daily Rental',
             format('BME-RENT:%s:%s:%s', r.patient_id, r.item_id, d))
      on conflict (source_key) where source_key is not null do nothing;
      if found then v_created:=v_created+1; end if;
      d := d + 1;
    end loop;
  end loop;
  return jsonb_build_object('success',true,'charges_created',v_created,'periods_without_rate',v_no_rate,'upto',v_upto);
end $$;
revoke all on function public.generate_equipment_rental_charges(date) from public, anon;
grant execute on function public.generate_equipment_rental_charges(date) to authenticated;

-- 5. Manual Bills & Charges entries for a daily-rental item are blocked (no double billing) -------------------------
create or replace function public.block_manual_daily_rental_charge()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.category='Biomedical Equipment' and exists(
       select 1 from public.biomedical_equipment_items i
        where i.daily_rental and (new.description ilike '%'||i.item_name||'%'
              or (i.charge_code is not null and new.description ilike '%'||i.charge_code||'%'))) then
    raise exception 'This equipment is charged automatically every day while it is with the Guest. Please do not raise it in Bills & Charges.';
  end if;
  return new;
end $$;
drop trigger if exists trg_block_manual_daily_rental on public.bill_charge_requests;
create trigger trg_block_manual_daily_rental before insert on public.bill_charge_requests
  for each row execute function public.block_manual_daily_rental_charge();

-- 6. Every hour at :40 ----------------------------------------------------------------------------------------------
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname='samara-equipment-daily-rental';
  perform cron.schedule('samara-equipment-daily-rental','40 * * * *','select public.generate_equipment_rental_charges()');
end $$;

-- Approved earlier start (Boomi, 28-10-2026): S. Swaminathan (MOG-2026-10-0013) — Air Bed With Motor from 23-10-2026.
-- (Air Mattress: charged from its issue day, 28-10-2026. MOG-2026-10-0009: discharged — not charged.)
insert into public.equipment_rental_start_overrides(patient_id,item_id,rental_from,reason)
select p.id, i.id, date '2026-10-23', 'Air bed in use from 23-10-2026; request entered late (approved by Boomi 28-10-2026)'
  from public.patients p, public.biomedical_equipment_items i
 where p.patient_id='MOG-2026-10-0013' and lower(trim(i.item_name))='air bed with motor'
on conflict (patient_id,item_id) do update set rental_from=excluded.rental_from, reason=excluded.reason;

-- First run now (charges up to today; the hourly job keeps it current).
select public.generate_equipment_rental_charges();

notify pgrst, 'reload schema';
commit;

-- Check
select c.charge_code, c.service_name, c.amount as daily_rate
  from public.charge_tariff_master c where c.category='Biomedical Equipment' and lower(c.service_name) in ('air bed with motor','air mattress');
select p.patient_id, t.category, count(*) as days, sum(t.amount) as total, min(t.source_date) as from_date, max(t.source_date) as to_date, split_part(t.description,' —',1) as item
  from public.billing_transactions t join public.patients p on p.id=t.patient_id
 where t.source_type='Equipment Daily Rental' group by 1,2,7 order by 1,7;
