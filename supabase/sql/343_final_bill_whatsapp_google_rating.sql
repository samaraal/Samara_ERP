-- 343 — Final Bill PDF on WhatsApp with the discharge messages + Google Rating request after discharge — ERP 2.19.67
-- Run once in Supabase > SQL Editor. Safe to run more than once.
--
-- A. FINAL BILL
--    When Accounts complete the discharge clearance (or Admin / Director allow departure with dues), the ERP saves a
--    copy of the Final Bill exactly as the ERP shows it (same item lines, Qty × Rate, totals, amount in words).
--    When the nurse completes the final discharge, the Edge Function "final-bill" turns that copy into a PDF and
--    sends it to the family on WhatsApp right after the Discharge Summary (template samara_final_bill).
--    If any charge / payment changes later, the clearance reopens (existing rule) and the copy is saved again.
-- B. GOOGLE RATING
--    2 days after departure (10 AM–7 PM), the family gets one WhatsApp asking for a Google rating, with a button
--    that opens Samara's Google review page (template samara_google_review, Marketing).
--    Not sent for: Trial Guests, "Death / Expiry", "Transfer to Hospital", discharges before this file is run.
--    Same request for every other family (Google does not allow asking only happy families).
--    Nothing is sent until Admin ticks "template approved" (Settings → Google rating request) after Meta approves it.

begin;

-- ---------- A. Final Bill copy + WhatsApp status ----------
alter table public.patient_discharges add column if not exists final_bill_snapshot jsonb;
alter table public.patient_discharges add column if not exists final_bill_snapshot_at timestamptz;
alter table public.patient_discharges add column if not exists final_bill_snapshot_by_name text;
alter table public.patient_discharges add column if not exists final_bill_storage_path text;
alter table public.patient_discharges add column if not exists final_bill_whatsapp_status text;
alter table public.patient_discharges add column if not exists final_bill_whatsapp_message_id text;
alter table public.patient_discharges add column if not exists final_bill_whatsapp_sent_at timestamptz;
alter table public.patient_discharges add column if not exists final_bill_whatsapp_error text;

create or replace function public.save_final_bill_snapshot(p_discharge_id uuid, p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text; v_role text;
begin
  select coalesce(nullif(full_name,''),'Accounts'), lower(trim(coalesce(role,''))) into v_name, v_role
    from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if auth.uid() is null or coalesce(v_role,'') not in ('admin','administrator','director','accounts') then
    raise exception 'Only Accounts or Admin / Director can save the Final Bill'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or jsonb_typeof(p_snapshot->'charges')<>'array' then
    raise exception 'Final Bill details are missing'; end if;
  update public.patient_discharges
     set final_bill_snapshot=p_snapshot, final_bill_snapshot_at=now(), final_bill_snapshot_by_name=v_name
   where id=p_discharge_id;
  if not found then raise exception 'Discharge record not found'; end if;
  return jsonb_build_object('saved',true,'at',now());
end $$;
revoke all on function public.save_final_bill_snapshot(uuid,jsonb) from public, anon;
grant execute on function public.save_final_bill_snapshot(uuid,jsonb) to authenticated;

-- ---------- B. Google rating request ----------
create table if not exists public.google_review_settings(
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  template_approved boolean not null default false,
  template_name text not null default 'samara_google_review',
  delay_days integer not null default 2 check (delay_days between 0 and 30),
  review_link text not null default 'https://g.page/r/CXoUtxcNGKqfEAI/review',
  start_from date not null default (now() at time zone 'Asia/Kolkata')::date,
  updated_at timestamptz not null default now(),
  updated_by_name text
);
insert into public.google_review_settings(id) values (1) on conflict (id) do nothing;
alter table public.google_review_settings enable row level security;
revoke all on public.google_review_settings from anon, authenticated;
grant select on public.google_review_settings to authenticated;
grant all on public.google_review_settings to service_role;
drop policy if exists google_review_settings_read on public.google_review_settings;
create policy google_review_settings_read on public.google_review_settings for select to authenticated using (true);

create table if not exists public.google_review_requests(
  discharge_id uuid primary key references public.patient_discharges(id) on delete cascade,
  patient_id uuid,
  recipient_number text,
  recipient_name text,
  status text not null default 'Sending',
  provider_message_id text,
  error text,
  tries integer not null default 1,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.google_review_requests enable row level security;
revoke all on public.google_review_requests from anon, authenticated;
grant select on public.google_review_requests to authenticated;
grant all on public.google_review_requests to service_role;
drop policy if exists google_review_requests_read on public.google_review_requests;
create policy google_review_requests_read on public.google_review_requests for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid())
                and lower(trim(coalesce(p.role,''))) in ('admin','administrator','director','manager','accounts')));

-- Admin / Director: change the settings.
create or replace function public.set_google_review_settings(p_enabled boolean, p_template_approved boolean, p_delay_days integer default null, p_review_link text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text;
begin
  select coalesce(nullif(full_name,''),'Admin') into v_name from public.profiles
   where (id=auth.uid() or auth_user_id=auth.uid()) and lower(trim(coalesce(role,''))) in ('admin','administrator','director') limit 1;
  if v_name is null then raise exception 'Only Admin / Director can change the Google rating request'; end if;
  if p_review_link is not null and p_review_link !~ '^https://' then raise exception 'The review link must start with https://'; end if;
  update public.google_review_settings set enabled=coalesce(p_enabled,enabled), template_approved=coalesce(p_template_approved,template_approved),
         delay_days=coalesce(p_delay_days,delay_days), review_link=coalesce(nullif(trim(p_review_link),''),review_link),
         updated_at=now(), updated_by_name=v_name where id=1;
  return (select to_jsonb(s) from public.google_review_settings s where id=1);
end $$;
revoke all on function public.set_google_review_settings(boolean,boolean,integer,text) from public, anon;
grant execute on function public.set_google_review_settings(boolean,boolean,integer,text) to authenticated;

-- Families due for the rating request now (used only by the Edge Function, service role).
create or replace function public.google_review_due_rows() returns table(
  discharge_id uuid, patient_id uuid, guest_name text, family_name text, family_phone text)
language sql stable security definer set search_path=public,pg_temp as $$
  with s as (select * from public.google_review_settings where id=1)
  select d.id, p.id,
         nullif(trim(concat_ws(' ',p.title,p.full_name)),''),
         coalesce(nullif(trim(d.received_by_name),''), nullif(trim(p.attendant_name),''), nullif(trim(d.relative_name),''), 'Family Member'),
         coalesce(nullif(regexp_replace(coalesce(p.attendant_phone,''),'\D','','g'),''),
                  nullif(regexp_replace(coalesce(d.received_by_contact,''),'\D','','g'),''),
                  nullif(regexp_replace(coalesce(d.relative_contact,''),'\D','','g'),''),
                  (select nullif(regexp_replace(coalesce(f.mobile,''),'\D','','g'),'') from public.family_portal_access f
                    where f.patient_id=p.id and coalesce(f.is_active,true) order by f.primary_contact desc nulls last limit 1))
    from public.patient_discharges d
    join public.patients p on p.id=d.patient_id
    cross join s
   where s.enabled and s.template_approved
     and lower(coalesce(d.status,''))='completed'
     and not coalesce(p.is_trial,false)
     and coalesce(d.discharge_type,'') not in ('Death / Expiry','Transfer to Hospital')
     and coalesce(d.actual_departure_at,d.final_departure_at,d.completed_at) is not null
     and (coalesce(d.actual_departure_at,d.final_departure_at,d.completed_at) at time zone 'Asia/Kolkata')::date >= s.start_from
     and (coalesce(d.actual_departure_at,d.final_departure_at,d.completed_at) at time zone 'Asia/Kolkata')::date
         <= (now() at time zone 'Asia/Kolkata')::date - s.delay_days
     and not exists(select 1 from public.google_review_requests g where g.discharge_id=d.id and (g.status<>'Failed' or g.tries>=3))
$$;
revoke all on function public.google_review_due_rows() from public, anon, authenticated;
grant execute on function public.google_review_due_rows() to service_role;

-- Run the dispatch hourly (copies the URL + secret header of the existing clinical push job, as SQL 301 does).
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; Google rating job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/google-review-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-google-review-dispatch';
  perform cron.schedule('samara-google-review-dispatch', '23 * * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check
select enabled, template_approved, delay_days, review_link, start_from from public.google_review_settings;
select jobname, schedule from cron.job where jobname = 'samara-google-review-dispatch';
