-- 2.18.190 fix: discharge_date is trusted only for discharged Guests (for active Guests it can hold the admission date).
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
    -- discharge_date is trusted only once the Guest is discharged (for active Guests it can hold the admission date)
    select per.*, case when coalesce(pt.is_active,true) then null else pt.discharge_date::date end as discharge_d, o.rental_from,
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

select public.generate_equipment_rental_charges();
