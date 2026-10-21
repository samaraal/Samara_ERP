-- ERP 2.18.63 — Outside Samara Nursing: "Start a New Procedure" with Source and Approval (run once in Supabase SQL Editor).
-- Adds a small list of STARTED procedures. Billing, invoices and payments are unchanged:
--   Start  : nurse records patient, procedure, place, SOURCE (who asked for it) and WHO APPROVED it (+ how, optional photo).
--            Not blocked — Admin still reviews the charge before any invoice.
--   Finish : the existing "completed procedure" entry (outside_nursing 'visit', with used items) is saved and linked to the
--            start in the SAME transaction.
--   Cancel : procedure not done — kept with the reason (never deleted).
-- Nurses (and the Nursing Manager in Nurse mode, SQL 266) start / finish; Admin and Manager can cancel too.
-- Safe to run again.
begin;

create table if not exists public.outside_nursing_starts (
  id uuid primary key,
  patient_id uuid not null references public.outside_nursing_patients,
  procedure_name text not null check (length(trim(procedure_name))>0),
  location text not null default 'At Samara' check (location in ('At Samara','Home / outside visit')),
  source text not null check (source in ('Doctor''s prescription','Family request','Hospital referral','Director / Admin')),
  source_detail text not null default '',
  approved_by text not null check (length(trim(approved_by))>0),
  approved_via text not null check (approved_via in ('Phone call','WhatsApp','Written','In person')),
  proof_image text check (proof_image is null or (proof_image like 'data:image/%' and length(proof_image)<=700000)),
  notes text not null default '',
  status text not null default 'Started' check (status in ('Started','Finished','Cancelled')),
  started_by uuid not null,
  started_by_name text not null default '',
  started_at timestamptz not null default now(),
  visit_id uuid references public.outside_nursing_visits,
  finished_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text not null default ''
);
create index if not exists outside_nursing_starts_status on public.outside_nursing_starts(status,started_at);
create unique index if not exists outside_nursing_starts_visit on public.outside_nursing_starts(visit_id) where visit_id is not null;
alter table public.outside_nursing_starts enable row level security;
revoke all on public.outside_nursing_starts from anon,authenticated;

create or replace function public.outside_nursing_start(p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  s public.outside_nursing_starts%rowtype;
  sid uuid; pid uuid; vid uuid; me_name text; visit jsonb; proof text;
begin
  if auth.uid() is null or not public.current_user_has_role(array['Admin','Accounts','Nurse','Manager']) then
    raise exception 'Nursing services access required';
  end if;
  select coalesce(nullif(trim(concat_ws(' ',p.title,p.full_name)),''),'Staff') into me_name
    from public.profiles p where p.id=auth.uid() or p.auth_user_id=auth.uid() limit 1;

  if p_action='list' then
    return coalesce((select jsonb_agg(to_jsonb(x)-'proof_image'||jsonb_build_object('has_proof',x.proof_image is not null) order by x.started_at desc)
      from public.outside_nursing_starts x where x.status='Started' or x.started_at>now()-interval '120 days'),'[]'::jsonb);
  end if;

  if p_action='proof' then
    select * into s from public.outside_nursing_starts where id=nullif(p_data->>'id','')::uuid;
    if not found then raise exception 'Record not found'; end if;
    return jsonb_build_object('proof_image',s.proof_image);
  end if;

  if p_action='start' then
    if not public.current_user_has_role(array['Nurse']) then raise exception 'Only nurses can start an outside procedure'; end if;
    sid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
    if exists(select 1 from public.outside_nursing_starts where id=sid) then return jsonb_build_object('id',sid,'already',true); end if;
    -- new outside patient in the same step (existing 'patient' action keeps its own checks)
    if p_data ? 'new_patient' and jsonb_typeof(p_data->'new_patient')='object' then
      pid:=coalesce(nullif(p_data->'new_patient'->>'id','')::uuid,gen_random_uuid());
      perform public.outside_nursing('patient',(p_data->'new_patient')||jsonb_build_object('id',pid));
    else
      pid:=nullif(p_data->>'patient_id','')::uuid;
    end if;
    if pid is null or not exists(select 1 from public.outside_nursing_patients where id=pid) then raise exception 'Choose the patient'; end if;
    if nullif(trim(p_data->>'procedure_name'),'') is null then raise exception 'Enter the procedure'; end if;
    if nullif(trim(p_data->>'approved_by'),'') is null then raise exception 'Enter who approved this procedure'; end if;
    proof:=nullif(p_data->>'proof_image','');
    insert into public.outside_nursing_starts(id,patient_id,procedure_name,location,source,source_detail,approved_by,approved_via,proof_image,notes,started_by,started_by_name)
    values(sid,pid,trim(p_data->>'procedure_name'),coalesce(nullif(p_data->>'location',''),'At Samara'),p_data->>'source',trim(coalesce(p_data->>'source_detail','')),
      trim(p_data->>'approved_by'),p_data->>'approved_via',proof,trim(coalesce(p_data->>'notes','')),auth.uid(),coalesce(me_name,'Staff'));
    perform public.record_audit_event('Outside procedure started','Outside Nursing',sid::text,
      jsonb_build_object('procedure',trim(p_data->>'procedure_name'),'source',p_data->>'source','approved_by',trim(p_data->>'approved_by'),'approved_via',p_data->>'approved_via'),'Success');
    return jsonb_build_object('id',sid,'patient_id',pid);
  end if;

  if p_action='finish' then
    sid:=nullif(p_data->>'start_id','')::uuid;
    select * into s from public.outside_nursing_starts where id=sid for update;
    if not found then raise exception 'Started procedure not found'; end if;
    if s.status='Finished' then return jsonb_build_object('id',s.id,'visit_id',s.visit_id,'already',true); end if;
    if s.status<>'Started' then raise exception 'This procedure was cancelled'; end if;
    visit:=coalesce(p_data->'visit','{}'::jsonb)||jsonb_build_object('patient_id',s.patient_id);
    vid:=coalesce(nullif(visit->>'id','')::uuid,gen_random_uuid());
    visit:=visit||jsonb_build_object('id',vid);
    -- the existing completed-procedure entry, with all its checks (nurse only, items, duplicates, dates)
    perform public.outside_nursing('visit',visit);
    if not exists(select 1 from public.outside_nursing_visits where id=vid) then raise exception 'The completed procedure could not be saved'; end if;
    update public.outside_nursing_starts set status='Finished',visit_id=vid,finished_at=now() where id=s.id;
    perform public.record_audit_event('Outside procedure finished','Outside Nursing',s.id::text,jsonb_build_object('visit_id',vid),'Success');
    return jsonb_build_object('id',s.id,'visit_id',vid);
  end if;

  if p_action='cancel' then
    sid:=nullif(p_data->>'id','')::uuid;
    select * into s from public.outside_nursing_starts where id=sid for update;
    if not found then raise exception 'Started procedure not found'; end if;
    if s.status<>'Started' then raise exception 'Only a started procedure can be cancelled'; end if;
    if s.started_by<>auth.uid() and not public.current_user_has_role(array['Admin','Manager']) then
      raise exception 'Only the nurse who started it, the Nursing Manager or Admin can cancel';
    end if;
    if length(trim(coalesce(p_data->>'reason','')))<5 then raise exception 'Enter the reason (why the procedure was not done)'; end if;
    update public.outside_nursing_starts set status='Cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=trim(p_data->>'reason') where id=s.id;
    perform public.record_audit_event('Outside procedure cancelled','Outside Nursing',s.id::text,jsonb_build_object('reason',trim(p_data->>'reason')),'Success');
    return jsonb_build_object('id',s.id,'status','Cancelled');
  end if;

  raise exception 'Unknown action %',p_action;
end $$;
revoke all on function public.outside_nursing_start(text,jsonb) from public,anon;
grant execute on function public.outside_nursing_start(text,jsonb) to authenticated;

notify pgrst,'reload schema';
select 'outside_nursing_start ready' as result;
commit;
