-- Samara Care ERP 2.18.139 — Nursing Notes (separate from Shift Handover)
-- Run this whole file once in Supabase > SQL Editor (file 297). Safe to run again.
-- Run AFTER 249 (meal alerts) and 276 (medicine given late).
--
-- Owner's decisions (25-10-2026):
--   * Each Guest gets Nursing Notes written by the nurse during the shift, by typing or by the voice
--     assistant (Tamil / English speech -> simple English, arranged by AI, nurse checks before saving).
--   * Two ways to write, with a switch on the form:  DAR (Focus · Data · Action · Response)  or  Quick note.
--   * MINIMUM 2 notes per Guest per shift (Day 7 AM–7 PM, Night 7 PM–7 AM). A Guest admitted more than
--     6 hours into the shift needs only 1 note in that shift.
--       - nurse reminder 2 hours before the shift ends (5 PM / 5 AM) if fewer notes are recorded,
--       - Managers + Admin / Director escalation 1 hour before the shift ends (6 PM / 6 AM),
--         same register, phone notification and WhatsApp as other clinical escalations,
--       - the escalation closes by itself once the notes are recorded.
--     Alerts start from the first shift that begins AFTER this file is run (no burst of old alerts).
--   * A note with Focus "Fall" or "Incident", or with "Inform Nursing Manager now" ticked, alerts the
--     Nursing Manager + Admin / Director AT ONCE (pop-up, phone notification, WhatsApp).
--   * Notes are never edited or deleted. A correction is added as an Addendum (with reason, who, when).
--   * Notes are INTERNAL: not shown in the Family Portal or the family Daily Report.
--     The doctor's Daily Clinical Report may include them (Edge Function daily-patient-report).
-- Nothing else in the ERP is changed. If the alert function does not look as expected, the alert part
-- is skipped with a clear message and the notes themselves still work.

begin;

-- 1. Notes --------------------------------------------------------------------------------------
create table if not exists public.nursing_notes(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  note_mode text not null default 'DAR' check (note_mode in ('DAR','Quick')),
  focus text not null default 'General condition',
  data_text text,
  action_text text,
  response_text text,
  quick_text text,
  observed_at timestamptz not null default now(),   -- when the nurse saw / did it (late entries allowed within 24 h)
  shift_start timestamptz,                          -- 7 AM / 7 PM start of the shift of observed_at (trigger)
  shift text,                                       -- 'Day Shift (7 AM–7 PM)' / 'Night Shift (7 PM–7 AM)' (trigger)
  is_alert boolean not null default false,          -- Fall / Incident / "Inform Nursing Manager now"
  notify_manager boolean not null default false,
  voice_used boolean not null default false,
  spoken_language text,
  heard_text text,                                  -- what the voice assistant heard (original language)
  recorded_by uuid,
  recorded_by_name text,
  recorded_by_role text,
  created_at timestamptz not null default now(),
  constraint nursing_notes_has_text check (
    length(btrim(coalesce(data_text,'')||coalesce(action_text,'')||coalesce(response_text,'')||coalesce(quick_text,'')))>=3)
);
comment on table public.nursing_notes is 'Nursing Notes per Guest (DAR or quick note). Never edited or deleted; corrections are addenda. Internal — not shown to families.';
create index if not exists nursing_notes_patient_time_idx on public.nursing_notes(patient_id, observed_at desc);
create index if not exists nursing_notes_shift_idx on public.nursing_notes(shift_start, patient_id);

create table if not exists public.nursing_note_addenda(
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.nursing_notes(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  addendum_text text not null check (length(btrim(addendum_text))>=3),
  reason text not null check (length(btrim(reason))>=3),
  added_by uuid,
  added_by_name text,
  added_by_role text,
  created_at timestamptz not null default now()
);
create index if not exists nursing_note_addenda_note_idx on public.nursing_note_addenda(note_id, created_at);
create index if not exists nursing_note_addenda_patient_idx on public.nursing_note_addenda(patient_id, created_at desc);

-- Shift of a moment (India time): start = 7 AM or 7 PM.
create or replace function public.nursing_note_shift_start(p timestamptz)
returns timestamptz language sql stable set search_path=public,pg_temp as $$
  select (case
    when (p at time zone 'Asia/Kolkata')::time>=time '19:00' then (p at time zone 'Asia/Kolkata')::date+time '19:00'
    when (p at time zone 'Asia/Kolkata')::time>=time '07:00' then (p at time zone 'Asia/Kolkata')::date+time '07:00'
    else (p at time zone 'Asia/Kolkata')::date-1+time '19:00' end) at time zone 'Asia/Kolkata'
$$;
grant execute on function public.nursing_note_shift_start(timestamptz) to authenticated, service_role;

-- How many notes a Guest needs in a shift: 2, or 1 when admitted more than 6 hours into that shift.
create or replace function public.nursing_notes_needed(p_patient uuid, p_shift_start timestamptz)
returns int language sql stable security definer set search_path=public,pg_temp as $$
  select case when exists(
    select 1 from public.patients p
     where p.id=p_patient and p.admission_date is not null
       and ((p.admission_date+coalesce(p.admission_time,(p.created_at at time zone 'Asia/Kolkata')::time)) at time zone 'Asia/Kolkata')
           > p_shift_start+interval '6 hours')
  then 1 else 2 end
$$;
grant execute on function public.nursing_notes_needed(uuid,timestamptz) to authenticated, service_role;

create or replace function public.nursing_notes_fill()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.observed_at := coalesce(new.observed_at, now());
  new.shift_start := public.nursing_note_shift_start(new.observed_at);
  new.shift := case when (new.shift_start at time zone 'Asia/Kolkata')::time=time '07:00'
                    then 'Day Shift (7 AM–7 PM)' else 'Night Shift (7 PM–7 AM)' end;
  new.is_alert := coalesce(new.notify_manager,false) or lower(coalesce(new.focus,'')) in ('fall','incident');
  return new;
end $$;
drop trigger if exists nursing_notes_fill on public.nursing_notes;
create trigger nursing_notes_fill before insert on public.nursing_notes
  for each row execute function public.nursing_notes_fill();

-- Notes and addenda can never be changed or removed (only a cascade when a Guest record is deleted).
create or replace function public.nursing_notes_no_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Nursing notes cannot be edited or deleted. Please add an addendum with the reason.';
end $$;
drop trigger if exists nursing_notes_no_update on public.nursing_notes;
create trigger nursing_notes_no_update before update on public.nursing_notes
  for each row execute function public.nursing_notes_no_change();
drop trigger if exists nursing_note_addenda_no_update on public.nursing_note_addenda;
create trigger nursing_note_addenda_no_update before update on public.nursing_note_addenda
  for each row execute function public.nursing_notes_no_change();

-- 2. Who can see / write ------------------------------------------------------------------------
alter table public.nursing_notes enable row level security;
alter table public.nursing_note_addenda enable row level security;
drop policy if exists "nursing notes read" on public.nursing_notes;
create policy "nursing notes read" on public.nursing_notes for select to authenticated
  using (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));
drop policy if exists "nursing note addenda read" on public.nursing_note_addenda;
create policy "nursing note addenda read" on public.nursing_note_addenda for select to authenticated
  using (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));
-- writes only through the two functions below
revoke insert, update, delete on public.nursing_notes, public.nursing_note_addenda from anon, authenticated;
revoke all on public.nursing_notes, public.nursing_note_addenda from anon;
grant select on public.nursing_notes, public.nursing_note_addenda to authenticated;
grant all on public.nursing_notes, public.nursing_note_addenda to service_role;

-- 3. Save a note ----------------------------------------------------------------------------------
create or replace function public.save_nursing_note(
  p_patient uuid, p_mode text, p_focus text, p_data text, p_action text, p_response text, p_quick text,
  p_observed_at timestamptz default null, p_notify boolean default false,
  p_voice_used boolean default false, p_spoken_language text default null, p_heard_text text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_name text; v_role text; v_id uuid; v_at timestamptz:=coalesce(p_observed_at,now());
  v_mode text:=case when p_mode='Quick' then 'Quick' else 'DAR' end;
begin
  if not public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']) then
    raise exception 'Only nursing staff, the Nursing Manager or Admin can write nursing notes.';
  end if;
  select coalesce(nullif(btrim(concat_ws(' ',p.title,p.full_name)),''),p.full_name), p.role into v_name, v_role
    from public.profiles p where p.id=v_user or p.auth_user_id=v_user limit 1;
  if not exists(select 1 from public.patients where id=p_patient and is_active=true) then
    raise exception 'Nursing notes can be written only for a Guest who is currently admitted.';
  end if;
  if v_at > now()+interval '10 minutes' then raise exception 'The note time cannot be in the future.'; end if;
  if v_at < now()-interval '24 hours' then raise exception 'A late note can be entered only within 24 hours. For older events, add an addendum to a note of that day.'; end if;
  if v_mode='DAR' and length(btrim(coalesce(p_data,'')))<3 then
    raise exception 'Please enter the Data (what you observed) for the DAR note.';
  end if;
  if v_mode='Quick' and length(btrim(coalesce(p_quick,'')))<3 then
    raise exception 'Please enter the note.';
  end if;
  insert into public.nursing_notes(patient_id,note_mode,focus,data_text,action_text,response_text,quick_text,observed_at,
      notify_manager,voice_used,spoken_language,heard_text,recorded_by,recorded_by_name,recorded_by_role)
  values(p_patient,v_mode,coalesce(nullif(btrim(p_focus),''),'General condition'),
      case when v_mode='DAR' then nullif(btrim(p_data),'') end,
      case when v_mode='DAR' then nullif(btrim(p_action),'') end,
      case when v_mode='DAR' then nullif(btrim(p_response),'') end,
      case when v_mode='Quick' then nullif(btrim(p_quick),'') end,
      v_at,coalesce(p_notify,false),coalesce(p_voice_used,false),nullif(btrim(coalesce(p_spoken_language,'')),''),
      nullif(btrim(coalesce(p_heard_text,'')),''),v_user,v_name,v_role)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.save_nursing_note(uuid,text,text,text,text,text,text,timestamptz,boolean,boolean,text,text) from public, anon;
grant execute on function public.save_nursing_note(uuid,text,text,text,text,text,text,timestamptz,boolean,boolean,text,text) to authenticated;

-- 4. Add an addendum (correction / additional information) ------------------------------------
create or replace function public.add_nursing_note_addendum(p_note uuid, p_text text, p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_name text; v_role text; v_pid uuid; v_id uuid;
begin
  if not public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']) then
    raise exception 'Only nursing staff, the Nursing Manager or Admin can add an addendum.';
  end if;
  if length(btrim(coalesce(p_text,'')))<3 then raise exception 'Please write the addendum.'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Please give the reason for the addendum.'; end if;
  select patient_id into v_pid from public.nursing_notes where id=p_note;
  if v_pid is null then raise exception 'Nursing note not found.'; end if;
  select coalesce(nullif(btrim(concat_ws(' ',p.title,p.full_name)),''),p.full_name), p.role into v_name, v_role
    from public.profiles p where p.id=v_user or p.auth_user_id=v_user limit 1;
  insert into public.nursing_note_addenda(note_id,patient_id,addendum_text,reason,added_by,added_by_name,added_by_role)
  values(p_note,v_pid,btrim(p_text),btrim(p_reason),v_user,v_name,v_role) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_nursing_note_addendum(uuid,text,text) from public, anon;
grant execute on function public.add_nursing_note_addendum(uuid,text,text) to authenticated;

-- 5. Alerts ---------------------------------------------------------------------------------------
-- 5a. Alerts begin with the first shift that starts after this file is run.
alter table public.clinical_alert_settings add column if not exists nursing_notes_from timestamptz;
update public.clinical_alert_settings
   set nursing_notes_from=public.nursing_note_shift_start(now())+interval '12 hours'
 where nursing_notes_from is null;

-- 5b. "Nursing Notes Due" (fewer than the minimum in this shift) + "Nursing Note Alert" (Fall / Incident /
--     Inform Nursing Manager) in get_current_clinical_alerts.
do $patch$
declare
  def text; updated text; union_old text;
  marker constant text := '/* 2.18.139 nursing notes */';
  boundary constant text := '), allx(';
  block text := $cte$), nn_due as( /* 2.18.139 nursing notes */
   select 'Nursing Notes'::text,nb.id,nb.id,nb.full_name,
     concat('Room ',coalesce(nb.room_no,'—'),case when nb.bed_no is not null then '-'||nb.bed_no else '' end),
     concat('Nursing Notes Due: ',nc.done,' of ',nc.need,' recorded this shift'),
     concat('At least ',nc.need,' nursing note',case when nc.need>1 then 's' else '' end,' per Guest per shift',
            ' · escalates at ',to_char((nsd.shift_start+interval '11 hours') at time zone 'Asia/Kolkata','HH12:MI AM'),' if not recorded'),
     nsd.shift_start+interval '10 hours 30 minutes',
     greatest(0,floor(extract(epoch from(v_now-(nsd.shift_start+interval '10 hours 30 minutes')))/60))::int,
     case when v_now>=nsd.shift_start+interval '11 hours' then 'Urgent' else 'Routine' end,
     'Active'::text,'Nursing Notes'::text,concat('Nursing notes are due for ',nb.full_name)
   from pb nb cross join shiftdata nsd
   cross join lateral (
     select public.nursing_notes_needed(nb.id,nsd.shift_start) as need,
            (select count(*)::int from public.nursing_notes n where n.patient_id=nb.id and n.shift_start=nsd.shift_start) as done
   ) nc
   where v_now>=nsd.shift_start+interval '10 hours'
     and nc.done<nc.need
     and nsd.shift_start>=coalesce((select max(cs.nursing_notes_from) from public.clinical_alert_settings cs where cs.is_active=true),'infinity'::timestamptz)
     and (nb.admission_boundary is null or nb.admission_boundary<=nsd.shift_start+interval '10 hours')
 ), nn_alert as(
   select 'Nursing Note Alert'::text,n.id,n.patient_id,nb.full_name,
     concat('Room ',coalesce(nb.room_no,'—'),case when nb.bed_no is not null then '-'||nb.bed_no else '' end),
     concat('Nursing Note: ',n.focus),
     left(concat_ws(' · ',nullif(btrim(coalesce(n.data_text,n.quick_text,'')),''),nullif(btrim(coalesce(n.action_text,'')),''),
          nullif(concat('by ',n.recorded_by_name),'by ')),300),
     e.due_at,
     greatest(0,floor(extract(epoch from(v_now-e.due_at))/60))::int,
     e.priority,
     'Active'::text,'Nursing Notes'::text,concat('Nursing note alert for ',nb.full_name,': ',n.focus)
   from public.clinical_alert_escalations e
   join public.nursing_notes n on n.id=e.source_id
   join pb nb on nb.id=n.patient_id
   where e.alert_type='Nursing Note Alert' and e.resolved_at is null and e.due_at>v_now-interval '24 hours'
 $cte$;
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position(marker in def) > 0 then
    raise notice 'Nursing Notes alerts already installed — alert function not changed.';
    return;
  end if;
  if position('shiftdata' in def)=0 or position('admission_boundary' in def)=0 then
    raise notice 'The alert function does not have the expected shift section — Nursing Notes alerts NOT installed (notes still work).';
    return;
  end if;
  if (length(def)-length(replace(def,boundary,'')))/length(boundary) <> 1 then
    raise notice 'Alert block boundary not found exactly once — Nursing Notes alerts NOT installed (notes still work).';
    return;
  end if;
  union_old := case when position('union all select * from medlate' in def)>0 then 'union all select * from medlate'
                    else 'union all select * from mealpoor' end;
  if (length(def)-length(replace(def,union_old,'')))/length(union_old) <> 1 then
    raise notice 'Alert list "%" not found exactly once — Nursing Notes alerts NOT installed (notes still work).', union_old;
    return;
  end if;
  updated := replace(def, boundary, block || boundary);
  updated := replace(updated, union_old, union_old || ' union all select * from nn_due union all select * from nn_alert');
  execute updated;  -- CREATE OR REPLACE keeps owner, grants and security settings
  raise notice 'get_current_clinical_alerts updated: Nursing Notes Due + Nursing Note Alert.';
end $patch$;

-- 5c. Escalation processor: a Fall / Incident note is escalated at once by the trigger below, so the
--     30-minute loop leaves it alone. "Nursing Notes Due" uses the normal 30-minute rule
--     (due 5:30 PM / 5:30 AM -> escalated 6 PM / 6 AM).
do $patch$
declare def text;
  line constant text := 'if lower(coalesce(a.alert_type,''''))=''regularisation'' then continue; end if;';
begin
  def := pg_get_functiondef('public.process_clinical_alert_escalations()'::regprocedure);
  if position('2.18.139 nursing note alert' in def) > 0 then return; end if;
  if position(line in def) = 0 then
    raise notice 'Escalation processor line not found — processor unchanged (alerts still work).';
    return;
  end if;
  execute replace(def, line, line || E'\n    if lower(coalesce(a.alert_type,''''))=''nursing note alert'' then continue; end if; -- 2.18.139 nursing note alert');
end $patch$;

-- 5d. After a note is saved: raise the immediate alert; close the shift's "notes due" escalation once enough.
create or replace function public.nursing_notes_after_insert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_done int; v_need int;
begin
  if new.is_alert then
    insert into public.clinical_alert_escalations(
      alert_key,patient_id,alert_type,source_id,due_at,priority,escalated_to_role,escalation_reason)
    values(concat('Nursing Note Alert',':',new.id,':',new.created_at),new.patient_id,'Nursing Note Alert',new.id,new.created_at,
      case when lower(new.focus) in ('fall','incident') then 'Critical' else 'Urgent' end,
      'Manager+Admin',
      left(concat(new.focus,' — ',coalesce(new.data_text,new.quick_text,''),' (by ',coalesce(new.recorded_by_name,'nurse'),')'),400))
    on conflict (alert_key) do nothing;
  end if;

  select count(*)::int into v_done from public.nursing_notes where patient_id=new.patient_id and shift_start=new.shift_start;
  v_need := public.nursing_notes_needed(new.patient_id,new.shift_start);
  if v_done>=v_need then
    update public.clinical_alert_escalations e
       set resolved_at=now(), resolved_by=new.recorded_by, resolution_action='Completed',
           resolution_remarks=concat('Automatically resolved: ',v_done,' nursing note(s) recorded in this shift; last at ',
             to_char(now() at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM'),' IST.'),
           updated_at=now()
     where e.alert_type='Nursing Notes' and e.resolved_at is null and e.patient_id=new.patient_id
       and e.due_at=new.shift_start+interval '10 hours 30 minutes';
  end if;
  return new;
end $$;
revoke all on function public.nursing_notes_after_insert() from public, anon, authenticated;
drop trigger if exists nursing_notes_after_insert on public.nursing_notes;
create trigger nursing_notes_after_insert after insert on public.nursing_notes
  for each row execute function public.nursing_notes_after_insert();

-- 5e. WhatsApp delivery log: allow the immediate nursing-note stage (keeps every stage already allowed).
do $$
declare c record; vals text[] := array[]::text[]; m text[];
begin
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid='public.clinical_whatsapp_escalations'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%stage%' loop
    for m in select regexp_matches(c.def, '([A-Z0-9]+(?:_[A-Z0-9]+)+)', 'g') loop  -- stage names: 30_MIN, VITALS_60_MANAGER …
      vals := vals || m[1];
    end loop;
    execute format('alter table public.clinical_whatsapp_escalations drop constraint %I',c.conname);
  end loop;
  vals := array(select distinct x from unnest(vals || array['30_MIN','60_MIN','VITALS_60_MANAGER','VITALS_90_ADMIN','MEAL_INTAKE_NOW','NOTE_ALERT_NOW']) x);
  execute format('alter table public.clinical_whatsapp_escalations add constraint clinical_whatsapp_escalations_stage_check check (stage = any (%L::text[]))', vals);
end $$;

commit;
notify pgrst,'reload schema';

-- Check: all should be true.
select
  to_regclass('public.nursing_notes') is not null as notes_table_ready,
  to_regclass('public.nursing_note_addenda') is not null as addenda_table_ready,
  strpos(pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure),'2.18.139 nursing notes')>0 as notes_alerts_ready,
  exists(select 1 from pg_trigger where tgname='nursing_notes_after_insert') as notes_trigger_ready,
  (select to_char(max(nursing_notes_from) at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') from public.clinical_alert_settings where is_active=true) as notes_alerts_start_ist;
