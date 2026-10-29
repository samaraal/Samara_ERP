-- ERP 2.19.17 — REPEAT CHECK: the same service for the same Guest within 60 minutes needs a reason (29-10-2026).
-- Run once in Supabase SQL Editor. Safe to run again.
--
-- Found 29-10-2026: "Blood Glucose Monitoring" for one Guest was requested, approved and started twice (5:40 AM and
--   5:52 AM), so it was charged twice. A genuine re-check is possible (e.g. low sugar re-checked after 15 minutes), so a
--   repeat is not forbidden — it now needs a reason, which Accounts and the MIS can see:
--   1. Approval Requests → Confirm & Start: if the same procedure was already started for the Guest in the last
--      60 minutes, Start stops with "REPEAT CHECK: … done at 5:40 AM by …". The app then asks the nurse why it is
--      being done again; with a reason it starts, without one it does not.
--   2. Bills & Charges (raised directly): same rule for the same item within 60 minutes.
--   Not affected: physiotherapy (its own session rules), equipment rental, outside bills, Accounts corrections.
begin;

alter table public.nursing_procedure_requests add column if not exists repeat_reason text;
alter table public.bill_charge_requests add column if not exists repeat_reason text;

-- 1. Approval Requests: Start ------------------------------------------------------------------------------------------
create or replace function public.guard_procedure_repeat_start()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $f$
declare prev record; v_at timestamptz := coalesce(new.started_at, now());
begin
  if new.status = 'Started' and old.status is distinct from 'Started'
     and coalesce(new.category,'Nursing Procedures') <> 'Biomedical Equipment'
     and nullif(trim(coalesce(new.repeat_reason,'')),'') is null then
    select r.started_at, r.started_by_name into prev
      from public.nursing_procedure_requests r
     where r.patient_id = new.patient_id and r.id <> new.id and r.status = 'Started'
       and (coalesce(r.procedure_code,'') = coalesce(new.procedure_code,'~')
            or lower(trim(r.procedure_name)) = lower(trim(new.procedure_name)))
       and lower(trim(r.procedure_name)) <> 'others'
       and r.started_at > v_at - interval '60 minutes' and r.started_at <= v_at + interval '5 minutes'
     order by r.started_at desc limit 1;
    if found then
      raise exception 'REPEAT CHECK: % was already done for this Guest at % by % (% min ago). If it is really being done again, give the reason.',
        new.procedure_name, to_char(prev.started_at at time zone 'Asia/Kolkata','HH12:MI AM'), coalesce(prev.started_by_name,'staff'),
        greatest(0, round(extract(epoch from (v_at - prev.started_at))/60))::int;
    end if;
  end if;
  return new;
end $f$;
revoke all on function public.guard_procedure_repeat_start() from public, anon, authenticated;
drop trigger if exists trg_procedure_repeat_start on public.nursing_procedure_requests;
create trigger trg_procedure_repeat_start before update on public.nursing_procedure_requests
  for each row execute function public.guard_procedure_repeat_start();

-- the nurse's reason for a genuine repeat (only before it is started)
create or replace function public.set_procedure_repeat_reason(p_request_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
begin
  if auth.uid() is null or not public.current_user_has_role(array['Nurse','Manager','Admin']) then
    raise exception 'Only Nursing / Manager / Admin can record a repeat reason';
  end if;
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'Write the reason (at least 5 characters)'; end if;
  -- the reason also goes into the remarks, so it is printed on the charge Accounts approves
  update public.nursing_procedure_requests
     set repeat_reason = left(trim(p_reason),300),
         remarks = case when lower(trim(procedure_name)) in ('others','other') then remarks
                        else concat_ws(' · ', nullif(remarks,''), 'Repeat: '||left(trim(p_reason),200)) end,
         updated_at = now()
   where id = p_request_id and status in ('Requested','Approved');
  if not found then raise exception 'This request is not waiting to start'; end if;
  return jsonb_build_object('success',true);
end $f$;
revoke all on function public.set_procedure_repeat_reason(uuid,text) from public, anon;
grant execute on function public.set_procedure_repeat_reason(uuid,text) to authenticated;

-- 2. Bills & Charges raised directly ------------------------------------------------------------------------------------
create or replace function public.guard_charge_repeat()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $f$
declare prev record; v_at timestamptz := coalesce(new.service_datetime, new.raised_at, now());
begin
  if coalesce(current_setting('samara.nursing_procedure_charge',true),'') = 'on'   -- Approval Requests path (checked above) / corrections
     or new.physiotherapy_session_id is not null or new.outside_paid_by is not null
     or coalesce(new.status,'') = 'Cancelled' or new.category = 'Biomedical Equipment'
     or nullif(trim(coalesce(new.repeat_reason,'')),'') is not null then
    return new;
  end if;
  select coalesce(b.service_datetime,b.raised_at,b.created_at) as at, b.raised_by_name into prev
    from public.bill_charge_requests b
   where b.patient_id = new.patient_id
     and coalesce(b.approval_status,'Pending') <> 'Rejected' and coalesce(b.status,'') <> 'Cancelled'
     and coalesce(nullif(b.charge_item_code,''), b.store_item_id::text, lower(trim(b.service_name)))
       = coalesce(nullif(new.charge_item_code,''), new.store_item_id::text, lower(trim(new.service_name)))
     and lower(trim(coalesce(new.service_name,''))) not in ('others','other')
     and coalesce(b.service_datetime,b.raised_at,b.created_at) between v_at - interval '60 minutes' and v_at + interval '60 minutes'
   order by abs(extract(epoch from (coalesce(b.service_datetime,b.raised_at,b.created_at) - v_at))) limit 1;
  if found then
    raise exception 'REPEAT CHECK: % was already charged for this Guest at % by %. If it is really a second time, give the reason.',
      coalesce(new.service_name,'This item'), to_char(prev.at at time zone 'Asia/Kolkata','DD-MM HH12:MI AM'), coalesce(prev.raised_by_name,'staff');
  end if;
  return new;
end $f$;
revoke all on function public.guard_charge_repeat() from public, anon, authenticated;
drop trigger if exists trg_charge_repeat on public.bill_charge_requests;
create trigger trg_charge_repeat before insert on public.bill_charge_requests
  for each row execute function public.guard_charge_repeat();

notify pgrst, 'reload schema';
commit;

-- Check: the two guards are in place
select tgname, tgrelid::regclass from pg_trigger where tgname in ('trg_procedure_repeat_start','trg_charge_repeat');
