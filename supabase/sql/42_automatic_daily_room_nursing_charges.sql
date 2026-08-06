-- Samara Care ERP 1.3.18
-- Automatic daily room rent and nursing charges

alter table public.billing_transactions
  add column if not exists auto_generated boolean not null default false;

alter table public.billing_transactions
  add column if not exists source_date date;

alter table public.billing_transactions
  add column if not exists source_type text;

alter table public.billing_transactions
  add column if not exists source_key text;

create unique index if not exists billing_transactions_source_key_unique
  on public.billing_transactions(source_key)
  where source_key is not null;

create or replace function public.generate_daily_accommodation_charges(
  p_charge_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  rec record;
  v_room_rate numeric;
  v_nursing_rate numeric;
  v_room_created integer:=0;
  v_nursing_created integer:=0;
  v_room_type text;
begin
  select role into v_role
  from public.profiles
  where id=auth.uid() or auth_user_id=auth.uid()
  limit 1;

  if v_role not in ('Admin','Manager','Accounts') then
    raise exception 'Only Admin, Manager or Accounts can generate accommodation charges.';
  end if;

  if p_charge_date>current_date then
    raise exception 'Future daily charges are not permitted.';
  end if;

  for rec in
    select
      p.id as patient_id,
      p.full_name,
      p.patient_id as patient_code,
      p.admission_date,
      p.discharge_date,
      p.room_no,
      p.bed_no,
      coalesce(rb.room_type,'Twin Sharing') as room_type
    from public.patients p
    left join public.room_beds rb
      on rb.patient_id=p.id
      or (
        rb.room_no=p.room_no
        and upper(coalesce(rb.bed_no,''))=upper(coalesce(p.bed_no,''))
      )
    where p.is_active=true
      and p.room_no is not null
      and p.bed_no is not null
      and coalesce(p.admission_date,p_charge_date)<=p_charge_date
      and (p.discharge_date is null or p.discharge_date>=p_charge_date)
  loop
    v_room_type:=lower(coalesce(rec.room_type,''));

    if v_room_type like '%single%'
       or v_room_type like '%separate%'
       or v_room_type like '%private%' then
      v_room_rate:=3000;
      v_nursing_rate:=1000;
      v_room_type:='Single / Separate';
    elsif v_room_type like '%general%'
       or v_room_type like '%ward%'
       or v_room_type like '%dorm%' then
      v_room_rate:=1800;
      v_nursing_rate:=750;
      v_room_type:='General';
    else
      v_room_rate:=2000;
      v_nursing_rate:=800;
      v_room_type:='Twin Sharing';
    end if;

    insert into public.billing_transactions(
      patient_id,transaction_type,category,amount,payment_mode,description,
      transaction_date,entered_by,auto_generated,source_date,source_type,source_key
    )
    values(
      rec.patient_id,'Charge','Room Charges',v_room_rate,'Not applicable',
      format('Automatic room rent for %s (%s, Room %s-%s)',
        to_char(p_charge_date,'DD-MM-YYYY'),v_room_type,rec.room_no,rec.bed_no),
      p_charge_date::timestamptz,auth.uid(),true,p_charge_date,'Daily Room Charge',
      format('ROOM:%s:%s',rec.patient_id,p_charge_date)
    )
    on conflict (source_key) where source_key is not null do nothing;

    if found then v_room_created:=v_room_created+1; end if;

    insert into public.billing_transactions(
      patient_id,transaction_type,category,amount,payment_mode,description,
      transaction_date,entered_by,auto_generated,source_date,source_type,source_key
    )
    values(
      rec.patient_id,'Charge','Nursing Charges',v_nursing_rate,'Not applicable',
      format('Automatic nursing charge for %s (%s accommodation)',
        to_char(p_charge_date,'DD-MM-YYYY'),v_room_type),
      p_charge_date::timestamptz,auth.uid(),true,p_charge_date,'Daily Nursing Charge',
      format('NURSING:%s:%s',rec.patient_id,p_charge_date)
    )
    on conflict (source_key) where source_key is not null do nothing;

    if found then v_nursing_created:=v_nursing_created+1; end if;
  end loop;

  return jsonb_build_object(
    'success',true,
    'charge_date',p_charge_date,
    'room_charges_created',v_room_created,
    'nursing_charges_created',v_nursing_created
  );
end;
$$;

grant execute on function public.generate_daily_accommodation_charges(date) to authenticated;

notify pgrst, 'reload schema';

select
  exists(select 1 from pg_proc where proname='generate_daily_accommodation_charges') as generator_ready,
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='billing_transactions' and column_name='source_key'
  ) as duplicate_protection_ready;
