-- ERP 2.19.93 — BEDSIDE VERIFICATION (MAR) — QR TRIAL, later NFC (09-11-2026). Safe to run again.
--
-- WHAT THIS DOES
--   Adds 3 NEW tables and a few NEW functions only. Nothing that already exists is changed:
--   no existing table, column, policy, trigger or function is altered or replaced.
--     * bedside_verify_settings  – one row: mode 'off' (default) / 'qr_trial' / 'nfc'.
--     * bedside_bed_tags         – one sticker code per bed (QR now, NFC later).
--     * bedside_dose_checks      – one record per dose: Bed verified / Wrong bed / Unknown sticker / Not scanned.
--   The MAR save itself (medication_administrations) is NOT touched. The scan record is written separately,
--   after the dose is saved, so a scan problem can never stop or change a dose entry.
--
-- AFTER RUNNING: the feature stays OFF until Admin opens  ADMIN → Bedside Verification  and turns on "QR trial".
--
-- TO UNDO COMPLETELY (only if ever needed):
--   drop function if exists public.bedside_record_dose_check(uuid,uuid,date,text,text,text,text);
--   drop function if exists public.bedside_check_tag(text,uuid);
--   drop function if exists public.bedside_tag_issue(uuid,text);
--   drop function if exists public.bedside_tag_deactivate(uuid);
--   drop function if exists public.set_bedside_verify_settings(text);
--   drop function if exists public.bedside_can(text);
--   drop table if exists public.bedside_dose_checks; drop table if exists public.bedside_bed_tags; drop table if exists public.bedside_verify_settings;

begin;

-- ── who may do what (reads the caller's own profile only) ──────────────────────────────────────────────
-- 'admin'   : Admin / Administrator / Director
-- 'manage'  : Admin + Manager (Nursing Manager) — issue / replace bed stickers
-- 'record'  : clinical logins — Admin, Manager, Nurse, Caregiver — record a scan with a dose
create or replace function public.bedside_can(p_what text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.profiles p
     where (p.id=auth.uid() or p.auth_user_id=auth.uid())
       and coalesce(p.is_active,true)
       and case p_what
             when 'admin'  then lower(trim(coalesce(p.role,''))) in ('admin','administrator','director')
             when 'manage' then lower(trim(coalesce(p.role,''))) in ('admin','administrator','director','manager')
             when 'record' then lower(trim(coalesce(p.role,''))) in ('admin','administrator','director','manager','nurse','caregiver')
             else false end);
$$;
revoke all on function public.bedside_can(text) from public, anon;
grant execute on function public.bedside_can(text) to authenticated;

-- ── settings (single row) ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.bedside_verify_settings(
  id integer primary key default 1 check (id = 1),
  mode text not null default 'off' check (mode in ('off','qr_trial','nfc')),
  updated_at timestamptz not null default now(),
  updated_by_name text
);
insert into public.bedside_verify_settings(id) values (1) on conflict (id) do nothing;
alter table public.bedside_verify_settings enable row level security;
revoke all on public.bedside_verify_settings from anon, authenticated;
grant select on public.bedside_verify_settings to authenticated;
grant all on public.bedside_verify_settings to service_role;
drop policy if exists bedside_verify_settings_read on public.bedside_verify_settings;
create policy bedside_verify_settings_read on public.bedside_verify_settings for select to authenticated using (true);

create or replace function public.set_bedside_verify_settings(p_mode text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text;
begin
  if not public.bedside_can('admin') then raise exception 'Only Admin / Director can change Bedside Verification.'; end if;
  if p_mode not in ('off','qr_trial','nfc') then raise exception 'Unknown mode %', p_mode; end if;
  select coalesce(nullif(full_name,''),'Admin') into v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  update public.bedside_verify_settings set mode=p_mode, updated_at=now(), updated_by_name=v_name where id=1;
  return (select to_jsonb(s) from public.bedside_verify_settings s where id=1);
end $$;
revoke all on function public.set_bedside_verify_settings(text) from public, anon;
grant execute on function public.set_bedside_verify_settings(text) to authenticated;

-- ── bed stickers ───────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.bedside_bed_tags(
  id uuid primary key default gen_random_uuid(),
  room_bed_id uuid not null references public.room_beds(id) on delete cascade,
  room_no text not null,
  bed_no text not null,
  tag_kind text not null default 'qr' check (tag_kind in ('qr','nfc')),
  tag_code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by_name text,
  deactivated_at timestamptz,
  deactivated_by_name text
);
create index if not exists bedside_bed_tags_bed_idx on public.bedside_bed_tags(room_bed_id) where is_active;
alter table public.bedside_bed_tags enable row level security;
revoke all on public.bedside_bed_tags from anon, authenticated;
grant select on public.bedside_bed_tags to authenticated;
grant all on public.bedside_bed_tags to service_role;
drop policy if exists bedside_bed_tags_read on public.bedside_bed_tags;
create policy bedside_bed_tags_read on public.bedside_bed_tags for select to authenticated using (public.bedside_can('manage'));

-- Issue (or replace) the sticker code for one bed. The old code for that bed stops working.
create or replace function public.bedside_tag_issue(p_room_bed_id uuid, p_kind text default 'qr')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text; b record; v_code text; v_row public.bedside_bed_tags;
begin
  if not public.bedside_can('manage') then raise exception 'Only Admin / Nursing Manager can issue bed stickers.'; end if;
  if coalesce(p_kind,'qr') not in ('qr','nfc') then raise exception 'Unknown sticker type %', p_kind; end if;
  select id, room_no, bed_no into b from public.room_beds where id=p_room_bed_id;
  if b.id is null then raise exception 'Bed not found.'; end if;
  select coalesce(nullif(full_name,''),'Staff') into v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  update public.bedside_bed_tags set is_active=false, deactivated_at=now(), deactivated_by_name=v_name
   where room_bed_id=b.id and tag_kind=coalesce(p_kind,'qr') and is_active;
  v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into public.bedside_bed_tags(room_bed_id, room_no, bed_no, tag_kind, tag_code, created_by_name)
  values (b.id, b.room_no, b.bed_no, coalesce(p_kind,'qr'), v_code, v_name) returning * into v_row;
  return to_jsonb(v_row);
end $$;
revoke all on function public.bedside_tag_issue(uuid,text) from public, anon;
grant execute on function public.bedside_tag_issue(uuid,text) to authenticated;

create or replace function public.bedside_tag_deactivate(p_tag_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text;
begin
  if not public.bedside_can('manage') then raise exception 'Only Admin / Nursing Manager can remove bed stickers.'; end if;
  select coalesce(nullif(full_name,''),'Staff') into v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  update public.bedside_bed_tags set is_active=false, deactivated_at=now(), deactivated_by_name=v_name where id=p_tag_id and is_active;
end $$;
revoke all on function public.bedside_tag_deactivate(uuid) from public, anon;
grant execute on function public.bedside_tag_deactivate(uuid) to authenticated;

-- ── helper: does a scanned code belong to this Guest's bed? (read-only, used for the on-screen tick) ─────
-- Returns result: verified / wrong_bed / unknown_tag / no_bed (Guest has no room/bed on record)
create or replace function public.bedside_check_tag(p_code text, p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t record; g record; v_code text;
begin
  if not public.bedside_can('record') then raise exception 'Not allowed.'; end if;
  v_code := upper(trim(regexp_replace(coalesce(p_code,''),'^SAMARA-BED:','','i')));
  select room_no, bed_no into g from public.patients where id=p_patient_id;
  select room_no, bed_no into t from public.bedside_bed_tags where tag_code=v_code and is_active limit 1;
  if t.room_no is null then
    return jsonb_build_object('result','unknown_tag','guest_room_no',g.room_no,'guest_bed_no',g.bed_no);
  end if;
  if coalesce(g.room_no,'')='' then
    return jsonb_build_object('result','no_bed','scanned_room_no',t.room_no,'scanned_bed_no',t.bed_no);
  end if;
  return jsonb_build_object(
    'result', case when trim(t.room_no)=trim(g.room_no) and upper(trim(t.bed_no))=upper(trim(coalesce(g.bed_no,''))) then 'verified' else 'wrong_bed' end,
    'scanned_room_no',t.room_no,'scanned_bed_no',t.bed_no,'guest_room_no',g.room_no,'guest_bed_no',g.bed_no);
end $$;
revoke all on function public.bedside_check_tag(text,uuid) from public, anon;
grant execute on function public.bedside_check_tag(text,uuid) to authenticated;

-- ── one record per dose ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.bedside_dose_checks(
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  patient_id uuid not null,
  scheduled_date date not null,
  scheduled_time text not null,
  result text not null check (result in ('verified','wrong_bed','unknown_tag','no_bed','not_scanned')),
  reason text,
  method text not null default 'qr' check (method in ('qr','nfc','none')),
  tag_id uuid,
  scanned_room_no text,
  scanned_bed_no text,
  guest_room_no text,
  guest_bed_no text,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists bedside_dose_checks_day_idx on public.bedside_dose_checks(scheduled_date);
create index if not exists bedside_dose_checks_dose_idx on public.bedside_dose_checks(order_id, scheduled_date, scheduled_time);
alter table public.bedside_dose_checks enable row level security;
revoke all on public.bedside_dose_checks from anon, authenticated;
grant select on public.bedside_dose_checks to authenticated;
grant all on public.bedside_dose_checks to service_role;
drop policy if exists bedside_dose_checks_read on public.bedside_dose_checks;
create policy bedside_dose_checks_read on public.bedside_dose_checks for select to authenticated using (public.bedside_can('manage'));

-- Called by the MAR right AFTER a dose is saved. The result is worked out here (not trusted from the phone).
create or replace function public.bedside_record_dose_check(
  p_order_id uuid, p_patient_id uuid, p_scheduled_date date, p_scheduled_time text,
  p_code text default null, p_reason text default null, p_method text default 'qr')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mode text; v_name text; v_uid uuid; chk jsonb; t record; v_code text; v_row public.bedside_dose_checks;
begin
  select mode into v_mode from public.bedside_verify_settings where id=1;
  if coalesce(v_mode,'off')='off' then return jsonb_build_object('skipped','off'); end if;
  if not public.bedside_can('record') then raise exception 'Not allowed.'; end if;
  select coalesce(nullif(full_name,''),'Staff'), coalesce(auth_user_id,id) into v_name, v_uid
    from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if nullif(trim(coalesce(p_code,'')),'') is null then
    insert into public.bedside_dose_checks(order_id,patient_id,scheduled_date,scheduled_time,result,reason,method,guest_room_no,guest_bed_no,recorded_by,recorded_by_name)
    select p_order_id,p_patient_id,p_scheduled_date,left(coalesce(p_scheduled_time,''),5),'not_scanned',nullif(trim(coalesce(p_reason,'')),''),'none',p.room_no,p.bed_no,v_uid,v_name
      from public.patients p where p.id=p_patient_id
    returning * into v_row;
  else
    chk := public.bedside_check_tag(p_code, p_patient_id);
    v_code := upper(trim(regexp_replace(p_code,'^SAMARA-BED:','','i')));
    select id into t from public.bedside_bed_tags where tag_code=v_code and is_active limit 1;
    insert into public.bedside_dose_checks(order_id,patient_id,scheduled_date,scheduled_time,result,reason,method,tag_id,scanned_room_no,scanned_bed_no,guest_room_no,guest_bed_no,recorded_by,recorded_by_name)
    values (p_order_id,p_patient_id,p_scheduled_date,left(coalesce(p_scheduled_time,''),5),chk->>'result',nullif(trim(coalesce(p_reason,'')),''),
            case when p_method in ('qr','nfc') then p_method else 'qr' end,t.id,chk->>'scanned_room_no',chk->>'scanned_bed_no',chk->>'guest_room_no',chk->>'guest_bed_no',v_uid,v_name)
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end $$;
revoke all on function public.bedside_record_dose_check(uuid,uuid,date,text,text,text,text) from public, anon;
grant execute on function public.bedside_record_dose_check(uuid,uuid,date,text,text,text,text) to authenticated;

commit;
