-- 333 — Care package fee by Samara's room types (ERP 2.19.43)
--   Samara has Single (Private), Double Sharing and Triple Sharing rooms — no General ward.
--   Care Packages store them as private_fee (Single), twin_fee (Double Sharing), general_fee (Triple Sharing),
--   which is how Admission already charges. renew_patient_package (Package renewal / "Change to Package") treated
--   every non-single room as Double ("Twin"), so a Triple Sharing Guest would have been charged the Double fee.
--   Now: single / private → Single fee · double / twin → Double Sharing fee · triple (anything else) → Triple Sharing fee.
-- Run once in Supabase SQL Editor after 332. Safe to re-run.
begin;
create or replace function public.renew_patient_package(p_patient_id uuid, p_package_id uuid, p_start_date date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  p record;
  pkg record;
  rb record;
  v_start date;
  v_end date;
  v_room_class text;
  v_room_label text;
  v_fee numeric := 0;
  v_source_key text;
  v_description text;
  v_previous_end date;
begin
  if v_actor is null then raise exception 'Authentication is required.'; end if;

  select role into v_role from public.duty_profiles where id=v_actor;
  if coalesce(v_role,'') not in ('Admin','Manager','Accounts') then
    raise exception 'Admin, Manager or Accounts access is required.';
  end if;

  select * into p from public.patients where id=p_patient_id and coalesce(is_active,true)=true;
  if not found then raise exception 'Active patient not found.'; end if;
  v_previous_end := p.package_end_date::date;

  select * into pkg from public.care_packages where id=p_package_id and coalesce(is_active,true)=true;
  if not found then raise exception 'Active care package not found.'; end if;

  v_start := coalesce(
    p_start_date,
    case when p.package_end_date is not null then p.package_end_date::date + 1 else current_date end
  );

  if pkg.duration_unit='Weeks' then
    v_end := v_start + (greatest(pkg.duration_value::int,1)*7 - 1);
  elsif pkg.duration_unit='Months' then
    v_end := (v_start + make_interval(months=>greatest(pkg.duration_value::int,1)))::date - 1;
  else
    v_end := v_start + greatest(pkg.duration_value::int,1) - 1;
  end if;

  select b.* into rb
  from public.room_beds b
  where b.patient_id=p.id
     or (b.room_no=p.room_no and upper(coalesce(b.bed_no,''))=upper(coalesce(p.bed_no,'')))
  order by (b.patient_id=p.id) desc,b.updated_at desc nulls last
  limit 1;

  -- SQL 333: same rule as Admission (Single / Double / Triple Sharing)
  if lower(coalesce(rb.room_type,'')) similar to '%(private|single|separate|deluxe|isolation)%' then
    v_room_class := 'Private'; v_room_label := 'Single (Private)';
    v_fee := coalesce(pkg.private_fee,0);
  elsif lower(coalesce(rb.room_type,'')) similar to '%(twin|double)%' then
    v_room_class := 'Twin'; v_room_label := 'Double Sharing';
    v_fee := coalesce(pkg.twin_fee,0);
  else
    v_room_class := 'General'; v_room_label := 'Triple Sharing';
    v_fee := coalesce(pkg.general_fee,0);
  end if;

  if v_fee<=0 then
    raise exception 'The selected package has no fee configured for % rooms.',v_room_label;
  end if;

  v_source_key := format('PACKAGE_RENEWAL:%s:%s',p.id,v_start);
  v_description := concat_ws(' | ',
    pkg.package_name,
    concat(pkg.duration_value,' ',pkg.duration_unit),
    concat(v_room_label,' accommodation'),
    concat('Coverage: ',v_start,' to ',v_end),
    nullif(pkg.included_services,'')
  );

  insert into public.billing_transactions(
    patient_id,transaction_type,category,amount,payment_mode,description,
    transaction_date,entered_by,auto_generated,source_date,source_type,source_key
  ) values(
    p.id,'Charge','Assisted Living Package',v_fee,'Not applicable',v_description,
    now(),v_actor,false,v_start,'Package Renewal',v_source_key
  )
  on conflict(source_key) where source_key is not null do nothing;

  if not found then
    raise exception 'A package renewal already exists for this patient starting %.',v_start;
  end if;

  update public.patients
  set billing_package=pkg.package_name,
      package_id=pkg.id,
      package_start_date=v_start,
      package_end_date=v_end,
      package_fee=v_fee,
      package_room_class=v_room_class
  where id=p.id;

  insert into public.package_renewal_actions(
    patient_id,action_type,previous_package_end_date,package_id,package_name,
    coverage_start,coverage_end,package_fee,performed_by,notes
  ) values(
    p.id,'Renewed',v_previous_end,pkg.id,pkg.package_name,
    v_start,v_end,v_fee,v_actor,
    case when v_previous_end is null then 'Changed from Daily Fare to package' else 'Renewed from Package Expiry Dashboard' end
  );

  perform public.mark_package_request_completed(p.id,v_previous_end,concat('ERP renewed: ',pkg.package_name));

  return jsonb_build_object(
    'success',true,'patient_id',p.id,'package_name',pkg.package_name,
    'coverage_start',v_start,'coverage_end',v_end,'package_fee',v_fee,
    'room_class',v_room_class,'room_label',v_room_label
  );
end $$;

-- marker so the ERP knows this fix is installed before allowing "Change to Package"
create or replace function public.samara_package_room_rule_v2() returns boolean language sql immutable as $$ select true $$;
grant execute on function public.samara_package_room_rule_v2() to authenticated;

notify pgrst,'reload schema';
commit;
select 'Package fee now follows Single / Double / Triple Sharing' as result;
