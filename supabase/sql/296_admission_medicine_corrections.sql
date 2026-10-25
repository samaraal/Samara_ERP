-- 296 — Admission prescription corrections (Edit with reason) — ERP 2.18.133
-- Owner's rule (25-10-2026):
--   * "Modification History" = ONLY changes made after a real Doctor's Review.
--   * The prescription entered at admission is kept separately. A wrong entry made at admission
--     can be corrected with "Edit with reason" — by Nurse, Nursing Manager (Manager) or Admin —
--     within 48 hours of admission. After 48 hours every change goes through Doctor Review.
--   * Corrections never pretend to be a doctor's review; each keeps old → new values, reason, who, when.
-- Also re-marks Ranjith Kumar's 12 entries (22–24 Oct 2026), saved through Doctor Review by mistake,
-- as admission entry corrections. Nothing is deleted. Safe to run more than once.

-- 1. Mark a Doctor Review record as really being an admission-entry correction
alter table public.medication_reviews add column if not exists is_admission_correction boolean not null default false;
alter table public.medication_reviews add column if not exists correction_reason text;

-- 2. Correction log
create table if not exists public.medication_entry_corrections(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  order_id uuid references public.medication_orders(id) on delete set null,
  action text not null check (action in ('Corrected','Added (missed at admission)','Removed (wrong entry)','Re-marked from Doctor Review')),
  medicine_name text,
  old_snapshot jsonb,
  new_snapshot jsonb,
  reason text not null check (length(btrim(reason))>=3),
  review_id uuid,
  corrected_by uuid references public.profiles(id),
  corrected_by_name text,
  corrected_at timestamptz not null default now()
);
create index if not exists medication_entry_corrections_patient on public.medication_entry_corrections(patient_id,corrected_at desc);
alter table public.medication_entry_corrections enable row level security;
drop policy if exists "medication corrections read" on public.medication_entry_corrections;
create policy "medication corrections read" on public.medication_entry_corrections for select to authenticated
  using (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));
-- writes only through the functions below
revoke insert,update,delete on public.medication_entry_corrections from anon,authenticated;
grant select on public.medication_entry_corrections to authenticated;

-- 3. When was the Guest admitted (first admission prescription entry, else the patient record)
create or replace function public.admission_medicine_moment(p_patient uuid) returns timestamptz
language sql stable security definer set search_path=public as $$
  select coalesce(
    (select min(created_at) from public.medication_orders where patient_id=p_patient and change_action='Admission Prescription'),
    (select created_at from public.patients where id=p_patient));
$$;
grant execute on function public.admission_medicine_moment(uuid) to authenticated;

create or replace function public.admission_medicine_correction_open(p_patient uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(now() <= public.admission_medicine_moment(p_patient) + interval '48 hours', false);
$$;
grant execute on function public.admission_medicine_correction_open(uuid) to authenticated;

-- 4. Correct / add / remove an admission medicine entry (with reason)
--    p_action: 'correct' (p_order_id + p_med) | 'add' (p_patient + p_med) | 'remove' (p_order_id)
--    p_med keys: medicine_name, strength, dose, route, frequency, scheduled_times (array of 'HH:MM'),
--                food_instruction, special_instruction
create or replace function public.correct_admission_medicine(p_action text, p_patient uuid, p_order_id uuid, p_med jsonb, p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_old public.medication_orders%rowtype; v_pid uuid; v_id uuid; v_user uuid:=auth.uid(); v_name text; v_new public.medication_orders%rowtype;
begin
  if not public.current_user_has_role(array['Admin','Manager','Nurse']) then raise exception 'Only Nurse, Nursing Manager or Admin can correct admission medicines'; end if;
  if coalesce(length(btrim(p_reason)),0)<3 then raise exception 'Please give the reason for the correction'; end if;
  select full_name into v_name from public.profiles where id=v_user;
  if p_action in ('correct','remove') then
    select * into v_old from public.medication_orders where id=p_order_id for update;
    if not found then raise exception 'Medicine entry not found'; end if;
    v_pid:=v_old.patient_id;
    if v_old.review_id is not null and not exists(select 1 from public.medication_reviews r where r.id=v_old.review_id and r.is_admission_correction) then
      raise exception 'This medicine was changed after a Doctor Review — use Doctor Review / Modify';
    end if;
    if v_old.is_active is false then raise exception 'This medicine entry is no longer active'; end if;
  elsif p_action='add' then
    v_pid:=p_patient;
  else raise exception 'Unknown action %',p_action; end if;
  if v_pid is null then raise exception 'Guest is required'; end if;
  if not public.admission_medicine_correction_open(v_pid) then
    raise exception 'Admission entries can be corrected only within 48 hours of admission. Please use Doctor Review / Modify.';
  end if;
  if p_action in ('correct','add') then
    if coalesce(btrim(p_med->>'medicine_name'),'')='' then raise exception 'Medicine name is required'; end if;
  end if;

  if p_action='correct' then
    update public.medication_orders set
      medicine_name=btrim(p_med->>'medicine_name'),
      strength=nullif(btrim(p_med->>'strength'),''),
      dose=coalesce(nullif(btrim(p_med->>'dose'),''),nullif(btrim(p_med->>'strength'),''),dose),
      route=coalesce(nullif(p_med->>'route',''),route),
      frequency=coalesce(nullif(p_med->>'frequency',''),frequency),
      scheduled_times=case when p_med ? 'scheduled_times' then array(select jsonb_array_elements_text(p_med->'scheduled_times'))::time[] else scheduled_times end,
      food_instruction=case when p_med ? 'food_instruction' then nullif(p_med->>'food_instruction','') else food_instruction end,
      special_instruction=case when p_med ? 'special_instruction' then nullif(p_med->>'special_instruction','') else special_instruction end,
      updated_at=now()
    where id=p_order_id returning * into v_new;
    insert into public.medication_entry_corrections(patient_id,order_id,action,medicine_name,old_snapshot,new_snapshot,reason,corrected_by,corrected_by_name)
    values(v_pid,p_order_id,'Corrected',v_new.medicine_name,to_jsonb(v_old),to_jsonb(v_new),btrim(p_reason),v_user,v_name);
    return p_order_id;
  elsif p_action='remove' then
    update public.medication_orders set is_active=false,status='Removed',stopped_at=now(),change_action='Removed - admission entry error',updated_at=now() where id=p_order_id;
    insert into public.medication_entry_corrections(patient_id,order_id,action,medicine_name,old_snapshot,new_snapshot,reason,corrected_by,corrected_by_name)
    values(v_pid,p_order_id,'Removed (wrong entry)',v_old.medicine_name,to_jsonb(v_old),null,btrim(p_reason),v_user,v_name);
    return p_order_id;
  else
    insert into public.medication_orders(patient_id,prescribed_by_doctor,medicine_name,strength,dose,route,food_instruction,special_instruction,
      scheduled_times,frequency,duration,start_date,is_active,entered_by,verified_by,version_no,effective_from,change_action,status)
    values(v_pid,nullif(btrim(p_med->>'prescribed_by_doctor'),''),btrim(p_med->>'medicine_name'),nullif(btrim(p_med->>'strength'),''),
      coalesce(nullif(btrim(p_med->>'dose'),''),nullif(btrim(p_med->>'strength'),''),'As prescribed'),coalesce(nullif(p_med->>'route',''),'Oral'),
      nullif(p_med->>'food_instruction',''),nullif(p_med->>'special_instruction',''),
      array(select jsonb_array_elements_text(coalesce(p_med->'scheduled_times','[]'::jsonb)))::time[],
      coalesce(nullif(p_med->>'frequency',''),'Once Daily (OD)'),'Long Term',(now() at time zone 'Asia/Kolkata')::date,true,v_user,v_user,1,now(),
      'Admission Prescription','Active')
    returning id into v_id;
    select * into v_new from public.medication_orders where id=v_id;
    insert into public.medication_entry_corrections(patient_id,order_id,action,medicine_name,old_snapshot,new_snapshot,reason,corrected_by,corrected_by_name)
    values(v_pid,v_id,'Added (missed at admission)',v_new.medicine_name,null,to_jsonb(v_new),btrim(p_reason),v_user,v_name);
    return v_id;
  end if;
end $$;
revoke all on function public.correct_admission_medicine(text,uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.correct_admission_medicine(text,uuid,uuid,jsonb,text) to authenticated;

-- 5. Re-mark Ranjith Kumar's 12 entries (22-10 to 24-10-2026) as admission corrections
do $$
declare pid uuid; n int; k int:=0; r record;
begin
  select count(*),min(id::text)::uuid into n,pid from public.patients
   where patient_id='MOG-2026-10-0012' and regexp_replace(lower(full_name),'[^a-z]','','g') like '%ranjithkumar%';
  if n<>1 then raise notice 'Ranjith Kumar (MOG-2026-10-0012) not found exactly once — no entries re-marked.'; return; end if;
  for r in select * from public.medication_reviews
            where patient_id=pid and not is_admission_correction
              and created_at >= '2026-10-22 00:00+05:30' and created_at < '2026-10-24 12:00+05:30'
              and review_type='Routine Doctor Review'
  loop
    update public.medication_reviews set is_admission_correction=true,
      correction_reason='Recorded as Doctor Review by mistake — admission entry corrections (owner, 25-10-2026)',updated_at=now()
     where id=r.id;
    update public.medication_orders set change_action=replace(change_action,'after doctor review','- admission entry correction')
     where review_id=r.id or stopped_by_review_id=r.id;
    insert into public.medication_entry_corrections(patient_id,action,medicine_name,old_snapshot,new_snapshot,reason,review_id,corrected_by,corrected_by_name,corrected_at)
    select pid,'Re-marked from Doctor Review',string_agg(i.action||' '||i.medicine_name,'; ') filter (where i.action<>'Continue'),null,
           jsonb_build_object('review_id',r.id,'entered_by',r.entered_by,'reviewed_at',r.reviewed_at,'changes',jsonb_agg(jsonb_build_object('action',i.action,'medicine',i.medicine_name,'strength',i.strength)) filter (where i.action<>'Continue')),
           'Recorded as Doctor Review by mistake — admission entry corrections (owner, 25-10-2026)',r.id,r.entered_by,(select full_name from public.profiles where id=r.entered_by),r.created_at
      from public.medication_review_items i where i.review_id=r.id
    having not exists(select 1 from public.medication_entry_corrections c where c.review_id=r.id);
    k:=k+1;
  end loop;
  raise notice 'Re-marked % entries for Ranjith Kumar.',k;
end $$;

-- Result
select (select count(*) from public.medication_reviews r join public.patients p on p.id=r.patient_id
         where p.patient_id='MOG-2026-10-0012' and r.is_admission_correction) as remarked_as_corrections,
       (select count(*) from public.medication_reviews r join public.patients p on p.id=r.patient_id
         where p.patient_id='MOG-2026-10-0012' and not r.is_admission_correction) as real_doctor_reviews_left,
       (select count(*) from public.medication_entry_corrections c join public.patients p on p.id=c.patient_id
         where p.patient_id='MOG-2026-10-0012') as correction_log_rows;
