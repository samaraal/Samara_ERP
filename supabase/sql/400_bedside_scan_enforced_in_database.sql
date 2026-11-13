-- Samara ERP SQL 400 (app 2.20.75) — Bedside scan ENFORCED IN THE DATABASE (owner, 13-11-2026):
-- "staff must not be able to enter medication, meals, care etc. for a Guest without scanning at the bedside — not at all".
--
-- Until now the scan was checked only on the phone screen, so an old app version, a computer, a role the screen did
-- not check (e.g. STD for meals) or a network hiccup could still save without a scan. From this SQL:
--   1. Every bed-sticker check that comes back ✅ verified is written down (who, which Guest, when).
--   2. Medication given / not given / withheld, Meals, Beverages, Daily care & procedures and Vitals can be saved for a
--      Guest ONLY if the same login scanned THAT Guest's bed sticker (✅ verified) in the last 15 minutes.
--      Otherwise the database refuses the entry, whichever screen, phone or computer it comes from.
--   3. Exempt (emergency entry): Admin / Director and the Nursing Manager's own login. Automatic system jobs are not affected.
--   4. Bedside mode is set to "QR compulsory". Staff who record meals (STD, Kitchen, Physiotherapist) can now scan bed stickers too.
-- Nothing already saved is changed. Run after 399. Safe to run again.
-- TO SWITCH OFF in an emergency: Admin ▸ Bedside Verification ▸ "QR trial" (the check applies only in "QR compulsory").

begin;

-- 1. scans that verified a Guest's bed
create table if not exists public.bedside_scan_passes(
  id bigserial primary key,
  patient_id uuid not null,
  actor uuid not null,
  room_no text, bed_no text,
  scanned_at timestamptz not null default now()
);
create index if not exists bedside_scan_passes_lookup on public.bedside_scan_passes(actor, patient_id, scanned_at desc);
alter table public.bedside_scan_passes enable row level security;
revoke all on public.bedside_scan_passes from anon, authenticated;
grant all on public.bedside_scan_passes to service_role;

-- 2. who may scan: clinical logins + STD / Kitchen (they record meals)
create or replace function public.bedside_can(p_what text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.profiles p
     where (p.id=auth.uid() or p.auth_user_id=auth.uid())
       and coalesce(p.is_active,true)
       and case p_what
             when 'admin'  then lower(trim(coalesce(p.role,''))) in ('admin','administrator','director')
             when 'manage' then lower(trim(coalesce(p.role,''))) in ('admin','administrator','director','manager')
             when 'record' then lower(trim(coalesce(p.role,''))) in ('admin','administrator','director','manager','nurse','caregiver','std','kitchen','physiotherapist')
             else false end);
$$;

-- 3. the sticker check now remembers a ✅ verified scan
create or replace function public.bedside_check_tag(p_code text, p_patient_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare t record; g record; v_code text; v_res text;
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
  v_res := case when trim(t.room_no)=trim(g.room_no) and upper(trim(t.bed_no))=upper(trim(coalesce(g.bed_no,''))) then 'verified' else 'wrong_bed' end;
  if v_res = 'verified' and auth.uid() is not null then
    insert into public.bedside_scan_passes(patient_id, actor, room_no, bed_no) values (p_patient_id, auth.uid(), t.room_no, t.bed_no);
  end if;
  return jsonb_build_object('result', v_res,
    'scanned_room_no',t.room_no,'scanned_bed_no',t.bed_no,'guest_room_no',g.room_no,'guest_bed_no',g.bed_no);
end $$;
revoke all on function public.bedside_check_tag(text,uuid) from public, anon;
grant execute on function public.bedside_check_tag(text,uuid) to authenticated;

-- 4. the guard on every bedside entry
create or replace function public.bedside_enforce_scan()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles; v_mode text; v_role text; v_des text;
begin
  if auth.uid() is null or new.patient_id is null then return new; end if;          -- system jobs / service
  select mode into v_mode from public.bedside_verify_settings where id = 1;
  if coalesce(v_mode,'off') <> 'qr_required' then return new; end if;
  select * into me from public.profiles where (id = auth.uid() or auth_user_id = auth.uid()) limit 1;
  v_role := lower(trim(coalesce(me.role,'')));
  v_des  := lower(regexp_replace(trim(coalesce(me.designation,'')),'[._-]+',' ','g'));
  if v_role in ('admin','administrator','director') then return new; end if;          -- emergency entry
  if v_des in ('nurse manager','nursing manager') then return new; end if;            -- Nursing Manager's own login
  if exists(select 1 from public.bedside_scan_passes s
             where s.actor = auth.uid() and s.patient_id = new.patient_id
               and s.scanned_at >= now() - interval '15 minutes') then
    return new;
  end if;
  raise exception 'Not saved — scan this Guest''s bed QR at the bedside first. Entries without a bedside scan are not allowed. (Sticker or camera problem? Ask the Nursing Manager to make this entry.)'
    using errcode = 'P0001';
end $$;
revoke all on function public.bedside_enforce_scan() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['medication_administrations','meal_records','beverage_records','care_logs','vital_signs'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists bedside_enforce_scan on public.%I', t);
      execute format('create trigger bedside_enforce_scan before insert on public.%I for each row execute function public.bedside_enforce_scan()', t);
    end if;
  end loop;
end $$;

-- 5. compulsory mode on
update public.bedside_verify_settings set mode='qr_required', updated_at=now(), updated_by_name='Admin (SQL 400)' where id=1 and mode <> 'qr_required';

notify pgrst,'reload schema';
commit;

-- check: mode + the 5 guarded tables
select (select mode from public.bedside_verify_settings where id=1) as mode,
       string_agg(c.relname, ', ' order by c.relname) as guarded_tables
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
 where tg.tgname = 'bedside_enforce_scan' and not tg.tgisinternal;
