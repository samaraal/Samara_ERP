-- ERP 2.19.94 — BEDSIDE VERIFICATION for ALL bedside tasks (09-11-2026). Run AFTER 363. Safe to run again.
--
-- Extends the QR trial (SQL 363) from "Administer now" medicines to every bedside entry:
--   medicines (full MAR form too), Nursing Procedures, Daily Care, Vital Signs, Meals, Beverages.
-- Changes ONLY the 363 bedside table (adds 2 columns) and adds 1 new function. Nothing else in the ERP is touched.
-- Old rows become task_kind 'medicine' (they all were). The 363 function keeps working unchanged.
--
-- TO UNDO (only if ever needed):
--   drop function if exists public.bedside_record_task_check(text,uuid,uuid,date,text,text,text,text,text);
--   alter table public.bedside_dose_checks drop column if exists task_label, drop column if exists task_kind;

begin;

alter table public.bedside_dose_checks add column if not exists task_kind text not null default 'medicine';
alter table public.bedside_dose_checks add column if not exists task_label text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='bedside_dose_checks_task_kind_check') then
    alter table public.bedside_dose_checks add constraint bedside_dose_checks_task_kind_check
      check (task_kind in ('medicine','procedure','care','vitals','meal','beverage'));
  end if;
end $$;
create index if not exists bedside_dose_checks_kind_idx on public.bedside_dose_checks(task_kind, scheduled_date);

-- Called right AFTER any bedside entry is saved. Result worked out here, never trusted from the phone.
create or replace function public.bedside_record_task_check(
  p_kind text, p_patient_id uuid, p_ref_id uuid, p_date date, p_time text, p_label text,
  p_code text default null, p_reason text default null, p_method text default 'qr')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mode text; v_name text; v_uid uuid; chk jsonb; t record; v_code text; v_row public.bedside_dose_checks; v_kind text;
begin
  select mode into v_mode from public.bedside_verify_settings where id=1;
  if coalesce(v_mode,'off')='off' then return jsonb_build_object('skipped','off'); end if;
  if not public.bedside_can('record') then raise exception 'Not allowed.'; end if;
  v_kind := case when p_kind in ('medicine','procedure','care','vitals','meal','beverage') then p_kind else 'care' end;
  select coalesce(nullif(full_name,''),'Staff'), coalesce(auth_user_id,id) into v_name, v_uid
    from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if nullif(trim(coalesce(p_code,'')),'') is null then
    insert into public.bedside_dose_checks(task_kind,task_label,order_id,patient_id,scheduled_date,scheduled_time,result,reason,method,guest_room_no,guest_bed_no,recorded_by,recorded_by_name)
    select v_kind,left(nullif(trim(coalesce(p_label,'')),''),200),p_ref_id,p_patient_id,coalesce(p_date,(now() at time zone 'Asia/Kolkata')::date),
           left(coalesce(nullif(p_time,''),to_char(now() at time zone 'Asia/Kolkata','HH24:MI')),5),'not_scanned',nullif(trim(coalesce(p_reason,'')),''),'none',p.room_no,p.bed_no,v_uid,v_name
      from public.patients p where p.id=p_patient_id
    returning * into v_row;
  else
    chk := public.bedside_check_tag(p_code, p_patient_id);
    v_code := upper(trim(regexp_replace(p_code,'^SAMARA-BED:','','i')));
    select id into t from public.bedside_bed_tags where tag_code=v_code and is_active limit 1;
    insert into public.bedside_dose_checks(task_kind,task_label,order_id,patient_id,scheduled_date,scheduled_time,result,reason,method,tag_id,scanned_room_no,scanned_bed_no,guest_room_no,guest_bed_no,recorded_by,recorded_by_name)
    values (v_kind,left(nullif(trim(coalesce(p_label,'')),''),200),p_ref_id,p_patient_id,coalesce(p_date,(now() at time zone 'Asia/Kolkata')::date),
            left(coalesce(nullif(p_time,''),to_char(now() at time zone 'Asia/Kolkata','HH24:MI')),5),chk->>'result',nullif(trim(coalesce(p_reason,'')),''),
            case when p_method in ('qr','nfc') then p_method else 'qr' end,t.id,chk->>'scanned_room_no',chk->>'scanned_bed_no',chk->>'guest_room_no',chk->>'guest_bed_no',v_uid,v_name)
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end $$;
revoke all on function public.bedside_record_task_check(text,uuid,uuid,date,text,text,text,text,text) from public, anon;
grant execute on function public.bedside_record_task_check(text,uuid,uuid,date,text,text,text,text,text) to authenticated;

commit;
