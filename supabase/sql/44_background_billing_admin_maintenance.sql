-- Samara Care ERP 1.3.21
-- Background automatic daily billing and Admin-only System Maintenance

create table if not exists public.daily_billing_runs (
  id uuid primary key default gen_random_uuid(),
  charge_date date not null,
  run_type text not null default 'Automatic',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  triggered_by uuid,
  room_charges_created integer not null default 0,
  nursing_charges_created integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  status text not null default 'Started',
  details jsonb not null default '{}'::jsonb
);

create index if not exists daily_billing_runs_date_idx
  on public.daily_billing_runs(charge_date desc,started_at desc);

alter table public.daily_billing_runs enable row level security;

drop policy if exists daily_billing_runs_admin_select on public.daily_billing_runs;
create policy daily_billing_runs_admin_select
on public.daily_billing_runs for select
to authenticated
using (public.current_user_has_role(array['Admin']));

create or replace function public.run_daily_billing_automation(
  p_charge_date date default current_date,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  rec record;
  v_run_id uuid;
  v_run_type text:=case when p_force then 'Admin Rerun' else 'Automatic' end;
  v_room_rate numeric;
  v_nursing_rate numeric;
  v_room_created integer:=0;
  v_nursing_created integer:=0;
  v_skipped integer:=0;
  v_errors integer:=0;
  v_room_type text;
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_charge_date>current_date then
    raise exception 'Future daily charges are not permitted.';
  end if;

  insert into public.daily_billing_runs(charge_date,run_type,triggered_by,status)
  values(p_charge_date,v_run_type,auth.uid(),'Started')
  returning id into v_run_id;

  for rec in
    select distinct on (p.id)
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
    order by p.id,rb.updated_at desc nulls last
  loop
    begin
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
      get diagnostics v_inserted=row_count;
      if v_inserted=1 then v_room_created:=v_room_created+1; else v_skipped:=v_skipped+1; end if;

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
      get diagnostics v_inserted=row_count;
      if v_inserted=1 then v_nursing_created:=v_nursing_created+1; else v_skipped:=v_skipped+1; end if;

    exception when others then
      v_errors:=v_errors+1;
    end;
  end loop;

  update public.daily_billing_runs
  set completed_at=now(),
      room_charges_created=v_room_created,
      nursing_charges_created=v_nursing_created,
      skipped_count=v_skipped,
      error_count=v_errors,
      status=case when v_errors>0 then 'Completed with Errors' else 'Completed' end,
      details=jsonb_build_object(
        'room_charges_created',v_room_created,
        'nursing_charges_created',v_nursing_created,
        'skipped_count',v_skipped,
        'error_count',v_errors
      )
  where id=v_run_id;

  return jsonb_build_object(
    'success',true,
    'run_id',v_run_id,
    'charge_date',p_charge_date,
    'run_type',v_run_type,
    'room_charges_created',v_room_created,
    'nursing_charges_created',v_nursing_created,
    'skipped_count',v_skipped,
    'error_count',v_errors
  );
exception when others then
  if v_run_id is not null then
    update public.daily_billing_runs
    set completed_at=now(),status='Failed',error_count=1,
        details=jsonb_build_object('error',sqlerrm)
    where id=v_run_id;
  end if;
  raise;
end;
$$;

grant execute on function public.run_daily_billing_automation(date,boolean) to authenticated;

notify pgrst, 'reload schema';

select
  to_regclass('public.daily_billing_runs') is not null as billing_run_history_ready,
  exists(select 1 from pg_proc where proname='run_daily_billing_automation') as background_billing_ready;
