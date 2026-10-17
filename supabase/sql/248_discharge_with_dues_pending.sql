-- ERP 2.17.9 — Emergency discharge with dues pending.
-- Admin / Director may allow a Guest to depart while an amount is still outstanding (e.g. emergency
-- transfer to hospital). The balance is NOT discounted or changed: it stays in the Patient Ledger and
-- Family Portal as due. The nurse completes Final Discharge as usual (room / bed released). When the
-- family pays the full amount, the dues are marked Settled automatically. Families get the existing
-- "samara_bill_reminder" WhatsApp every 3 days (Edge Function discharge-dues-reminder-dispatch).
-- Safe to run more than once.
begin;

-- 1. Dues fields on the discharge record
alter table public.patient_discharges
  add column if not exists dues_status text,                 -- null | 'Pending' | 'Settled'
  add column if not exists dues_amount numeric(12,2),        -- outstanding when departure was allowed
  add column if not exists dues_reason text,
  add column if not exists dues_approved_by uuid,
  add column if not exists dues_approved_by_name text,
  add column if not exists dues_approved_at timestamptz,
  add column if not exists dues_settled_at timestamptz,
  add column if not exists dues_reminders_paused boolean not null default false,
  add column if not exists dues_last_reminder_at timestamptz,
  add column if not exists dues_reminder_count integer not null default 0;

create table if not exists public.discharge_dues_settings(
  id integer primary key default 1 check (id=1),
  reminders_enabled boolean not null default true,
  reminder_every_days integer not null default 3 check (reminder_every_days between 1 and 30),
  send_from_hour integer not null default 10 check (send_from_hour between 0 and 23),  -- IST
  send_to_hour integer not null default 18 check (send_to_hour between 1 and 24),      -- IST
  updated_at timestamptz not null default now()
);
insert into public.discharge_dues_settings(id) values(1) on conflict (id) do nothing;
alter table public.discharge_dues_settings enable row level security;
drop policy if exists discharge_dues_settings_read on public.discharge_dues_settings;
create policy discharge_dues_settings_read on public.discharge_dues_settings for select to authenticated using (true);

-- 2. Who is calling (Admin or the assigned Director)
create or replace function public.samara_dues_actor()
returns table(profile_id uuid, role text, full_name text, is_director boolean)
language sql stable security definer set search_path=public as $$
  select p.id, p.role, coalesce(nullif(trim(p.full_name),''),p.login_id,'Admin'),
         exists(select 1 from public.director_office_positions d where d.position_key='director' and d.assigned_profile_id=p.id)
  from public.duty_profiles p where p.id=auth.uid() or p.auth_user_id=auth.uid() limit 1;
$$;
revoke all on function public.samara_dues_actor() from public, anon;
grant execute on function public.samara_dues_actor() to authenticated;

create or replace function public.samara_patient_balance(p_patient_id uuid)
returns numeric language sql stable security definer set search_path=public as $$
  select coalesce(sum(case when transaction_type in ('Charge','Refund') then amount
    when transaction_type in ('Payment','Advance','Discount') then -amount else 0 end),0)
  from public.billing_transactions where patient_id=p_patient_id;
$$;
revoke all on function public.samara_patient_balance(uuid) from public, anon, authenticated;

-- Family contact for dues messages: active primary Family Portal contact first, then the Patient File.
create or replace function public.samara_dues_family_contact(p_patient_id uuid)
returns table(family_name text, family_phone text)
language sql stable security definer set search_path=public as $$
  select coalesce((select nullif(trim(f.relative_name),'') from public.family_portal_access f
                    where f.patient_id=p.id and f.is_active and nullif(trim(f.mobile),'') is not null
                    order by f.primary_contact desc nulls last, f.created_at limit 1),
                  nullif(trim(p.attendant_name),''),'Family Member'),
         coalesce((select nullif(trim(f.mobile),'') from public.family_portal_access f
                    where f.patient_id=p.id and f.is_active and nullif(trim(f.mobile),'') is not null
                    order by f.primary_contact desc nulls last, f.created_at limit 1),
                  nullif(trim(p.attendant_phone),''),nullif(trim(p.mobile),''))
  from public.patients p where p.id=p_patient_id;
$$;
revoke all on function public.samara_dues_family_contact(uuid) from public, anon, authenticated;

-- 3. Clearance guard: a departure allowed with dues pending skips the zero-balance check only.
create or replace function public.samara_guard_financial_clearance()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.dues_status='Pending' then return new; end if;   -- 2.17.9: allowed by Admin / Director
  if (new.accounts_status='Cleared' and old.accounts_status is distinct from 'Cleared')
     or (new.status='Completed' and old.status is distinct from 'Completed') then
    perform public.samara_assert_discharge_financial_ready(new.patient_id);
  end if;
  return new;
end $$;
revoke all on function public.samara_guard_financial_clearance() from public,anon,authenticated;

-- New financial activity before departure still invalidates the clearance (and the dues permission,
-- so Admin / Director allows it again on the new amount). After departure nothing is reset.
create or replace function public.samara_financial_activity_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_patient uuid;
begin
  if TG_OP='UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'A financial record cannot be moved to another patient.';
  end if;
  if TG_OP='DELETE' then v_patient:=old.patient_id; else v_patient:=new.patient_id; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_patient::text,105));
  update public.patient_discharges set accounts_status='Pending',billing_clearance_status='Pending',
    status='Management Approved',accounts_cleared_at=null,accounts_cleared_by=null,
    accounts_cleared_by_name=null,updated_at=now(),
    dues_status=null,dues_amount=null,dues_approved_by=null,dues_approved_by_name=null,dues_approved_at=null,
    accounts_remarks=concat_ws(' | ',accounts_remarks,
      case when dues_status='Pending' then 'Financial activity changed after departure with dues was allowed; Admin / Director must allow it again on the new amount.'
      else 'Financial activity changed after clearance; Accounts recheck required.' end)
    where patient_id=v_patient and accounts_status='Cleared' and status<>'Completed';
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.samara_financial_activity_guard() from public,anon,authenticated;

-- 4. Admin / Director: allow departure with dues pending
create or replace function public.allow_discharge_with_dues(p_discharge_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a record; v_d public.patient_discharges%rowtype; v_patient uuid; v_count integer; v_balance numeric;
begin
  select * into a from public.samara_dues_actor();
  if a.profile_id is null or not (a.role='Admin' or a.is_director) then
    raise exception 'Only Admin or the Director may allow departure with dues pending.';
  end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Enter the reason (e.g. emergency transfer to hospital).'; end if;
  select patient_id into v_patient from public.patient_discharges where id=p_discharge_id;
  if v_patient is null then raise exception 'Discharge request not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_patient::text,105));
  select * into v_d from public.patient_discharges where id=p_discharge_id for update;
  if v_d.status='Completed' then raise exception 'This discharge is already completed.'; end if;
  if v_d.management_status is distinct from 'Approved' then raise exception 'Management approval is required first.'; end if;
  if v_d.discount_request_status='Pending' then raise exception 'A discount request is pending. Decide it first.'; end if;
  -- Every charge must be posted so the dues amount is final and correct.
  select count(*) into v_count from public.bill_charge_requests r
  where r.patient_id=v_patient and coalesce(r.approval_status,'Pending')<>'Rejected'
    and (coalesce(r.approval_status,'Pending') not in ('Approved','Partially Approved')
      or not exists(select 1 from public.billing_transactions t
        where t.id=r.billing_transaction_id and t.patient_id=r.patient_id
          and t.transaction_type='Charge' and t.amount=r.final_amount));
  if v_count>0 then
    raise exception '% unresolved charge request(s). Accounts must resolve them first so the dues amount is final.',v_count;
  end if;
  v_balance:=round(public.samara_patient_balance(v_patient),2);
  if v_balance<=0.009 then
    raise exception 'There is no outstanding amount. Use the normal Accounts clearance.';
  end if;
  update public.patient_discharges set
    dues_status='Pending', dues_amount=v_balance, dues_reason=trim(p_reason),
    dues_approved_by=a.profile_id, dues_approved_by_name=a.full_name, dues_approved_at=now(),
    dues_settled_at=null, dues_last_reminder_at=null, dues_reminder_count=0, dues_reminders_paused=false,
    billing_clearance_status='Cleared', accounts_status='Cleared',
    accounts_cleared_by=a.profile_id, accounts_cleared_by_name=a.full_name, accounts_cleared_at=now(),
    accounts_remarks='Departure allowed with dues pending: '||trim(p_reason),
    final_outstanding=v_balance,
    status='Accounts Cleared - Awaiting Patient Departure', updated_at=now()
  where id=p_discharge_id;
  insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,actor_name,details)
  values(p_discharge_id,'Departure allowed with dues pending',a.profile_id,a.full_name,
    jsonb_build_object('dues_amount',v_balance,'reason',trim(p_reason)));
  return jsonb_build_object('discharge_id',p_discharge_id,'dues_amount',v_balance,'allowed_by',a.full_name,
    'next_action','Nurse to complete Final Discharge');
end $$;
revoke all on function public.allow_discharge_with_dues(uuid,text) from public, anon;
grant execute on function public.allow_discharge_with_dues(uuid,text) to authenticated;

-- 5. Automatic "Settled" when the family pays (after departure)
create or replace function public.samara_discharge_dues_settle()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_patient uuid; v_balance numeric; r record;
begin
  if TG_OP='DELETE' then v_patient:=old.patient_id; else v_patient:=new.patient_id; end if;
  for r in select id,dues_status from public.patient_discharges
           where patient_id=v_patient and status='Completed' and dues_status in ('Pending','Settled') loop
    v_balance:=round(public.samara_patient_balance(v_patient),2);
    if r.dues_status='Pending' and v_balance<=0.009 then
      update public.patient_discharges set dues_status='Settled',dues_settled_at=now(),final_outstanding=0,updated_at=now() where id=r.id;
      insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,actor_name,details)
      values(r.id,'Dues settled',auth.uid(),null,jsonb_build_object('balance',v_balance));
    elsif r.dues_status='Settled' and v_balance>0.009 then
      update public.patient_discharges set dues_status='Pending',dues_settled_at=null,final_outstanding=v_balance,updated_at=now() where id=r.id;
      insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,actor_name,details)
      values(r.id,'Dues reopened',auth.uid(),null,jsonb_build_object('balance',v_balance));
    elsif r.dues_status='Pending' then
      update public.patient_discharges set final_outstanding=v_balance,updated_at=now() where id=r.id;
    end if;
  end loop;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.samara_discharge_dues_settle() from public,anon,authenticated;
drop trigger if exists samara_discharge_dues_settle on public.billing_transactions;
create trigger samara_discharge_dues_settle after insert or update or delete on public.billing_transactions
  for each row execute function public.samara_discharge_dues_settle();

-- 6. Register of discharged Guests with dues (Admin, Director, Accounts)
create or replace function public.discharged_dues_register()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a record;
begin
  select * into a from public.samara_dues_actor();
  if a.profile_id is null or not (a.role in ('Admin','Accounts') or a.is_director) then
    raise exception 'Only Admin, Director or Accounts may view discharged dues.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'discharge_id',d.id,'patient_id',d.patient_id,'patient_code',p.patient_id,'guest_name',p.full_name,
    'family_name',(select c.family_name from public.samara_dues_family_contact(d.patient_id) c),
    'family_phone',(select c.family_phone from public.samara_dues_family_contact(d.patient_id) c),
    'is_trial',coalesce(p.is_trial,false),'discharge_type',d.discharge_type,
    'departed_at',coalesce(d.actual_departure_at,d.completed_at),'status',d.status,
    'dues_status',d.dues_status,'dues_amount',d.dues_amount,'current_balance',round(public.samara_patient_balance(d.patient_id),2),
    'dues_reason',d.dues_reason,'approved_by',d.dues_approved_by_name,'approved_at',d.dues_approved_at,
    'settled_at',d.dues_settled_at,'reminders_paused',d.dues_reminders_paused,
    'last_reminder_at',d.dues_last_reminder_at,'reminder_count',d.dues_reminder_count)
    order by d.dues_status desc, d.dues_approved_at desc)
    from public.patient_discharges d join public.patients p on p.id=d.patient_id
    where d.dues_status in ('Pending','Settled')),'[]'::jsonb);
end $$;
revoke all on function public.discharged_dues_register() from public, anon;
grant execute on function public.discharged_dues_register() to authenticated;

-- Pause / resume reminders, and record a manual reminder (Admin, Director, Accounts)
create or replace function public.set_discharge_dues_reminders(p_discharge_id uuid, p_paused boolean)
returns void language plpgsql security definer set search_path=public as $$
declare a record;
begin
  select * into a from public.samara_dues_actor();
  if a.profile_id is null or not (a.role in ('Admin','Accounts') or a.is_director) then raise exception 'Not allowed.'; end if;
  update public.patient_discharges set dues_reminders_paused=coalesce(p_paused,false),updated_at=now()
   where id=p_discharge_id and dues_status='Pending';
  if not found then raise exception 'No pending dues for this discharge.'; end if;
  insert into public.discharge_workflow_events(discharge_id,event_type,actor_id,actor_name,details)
  values(p_discharge_id,case when p_paused then 'Dues reminders paused' else 'Dues reminders resumed' end,a.profile_id,a.full_name,'{}'::jsonb);
end $$;
revoke all on function public.set_discharge_dues_reminders(uuid,boolean) from public, anon;
grant execute on function public.set_discharge_dues_reminders(uuid,boolean) to authenticated;

create or replace function public.record_discharge_dues_reminder(p_discharge_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare a record;
begin
  select * into a from public.samara_dues_actor();
  if a.profile_id is null or not (a.role in ('Admin','Accounts') or a.is_director) then raise exception 'Not allowed.'; end if;
  update public.patient_discharges set dues_last_reminder_at=now(),dues_reminder_count=dues_reminder_count+1,updated_at=now()
   where id=p_discharge_id and dues_status='Pending';
end $$;
revoke all on function public.record_discharge_dues_reminder(uuid) from public, anon;
grant execute on function public.record_discharge_dues_reminder(uuid) to authenticated;

-- 7. Rows due for the automatic WhatsApp reminder (service role only — used by the Edge Function)
create or replace function public.discharge_dues_reminder_rows()
returns table(discharge_id uuid, patient_id uuid, guest_name text, family_name text, family_phone text, balance numeric)
language sql stable security definer set search_path=public as $$
  select d.id, d.patient_id, p.full_name, c.family_name, c.family_phone, round(public.samara_patient_balance(d.patient_id),2)
  from public.patient_discharges d
  join public.patients p on p.id=d.patient_id
  cross join lateral public.samara_dues_family_contact(d.patient_id) c
  cross join public.discharge_dues_settings s
  where s.id=1 and s.reminders_enabled
    and d.status='Completed' and d.dues_status='Pending' and not d.dues_reminders_paused
    and not coalesce(p.is_trial,false)
    and c.family_phone is not null
    and coalesce(d.dues_last_reminder_at, coalesce(d.actual_departure_at,d.completed_at,d.dues_approved_at))
        < now() - make_interval(days=>s.reminder_every_days) + interval '30 minutes'
    and extract(hour from now() at time zone 'Asia/Kolkata') >= s.send_from_hour
    and extract(hour from now() at time zone 'Asia/Kolkata') <  s.send_to_hour
    and public.samara_patient_balance(d.patient_id) > 0.009;
$$;
revoke all on function public.discharge_dues_reminder_rows() from public, anon, authenticated;
grant execute on function public.discharge_dues_reminder_rows() to service_role;

-- 8. Run the reminder dispatch every hour (copies URL + secret header of the clinical push job)
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; dues reminder job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/discharge-dues-reminder-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-discharge-dues-reminder';
  perform cron.schedule('samara-discharge-dues-reminder', '7 * * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: new function, settings and the hourly job
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and proname in ('allow_discharge_with_dues','discharged_dues_register','discharge_dues_reminder_rows');
select * from public.discharge_dues_settings;
select jobname, schedule from cron.job where jobname='samara-discharge-dues-reminder';
