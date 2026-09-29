-- Samara Care ERP 2.15.5 — Unfinished Admissions (shared drafts).
-- Every admission in progress is saved on the server as its own draft (AD-0001 …), so it can be
-- continued after any interruption — on the same or another device (desktop, tablet, phone) — and
-- by another Admission staff member / Nursing Manager / Admin (shift change). Several admissions can
-- be in progress at the same time. Documents picked during the draft are kept in storage
-- (patient-documents / admission-drafts/<draft id>/…) and attached to the resident on admission.
-- A draft never creates a patient, occupies a bed, starts billing or triggers clinical alerts.
-- The older one-draft-per-user table (admission_drafts), if present, is copied in once.
-- Safe to run again.
begin;

create sequence if not exists public.samara_admission_draft_seq;
create table if not exists public.admission_draft_forms(
  id uuid primary key default gen_random_uuid(),
  draft_no integer not null default nextval('public.samara_admission_draft_seq'),
  status text not null default 'Open' check (status in ('Open','Completed','Discarded')),
  patient_name text, mobile text, address text, room_no text, admission_type text,
  payload jsonb not null default '{}'::jsonb,
  files jsonb not null default '[]'::jsonb,
  last_field integer,
  linked_patient_id uuid,
  created_by uuid, created_by_name text,
  updated_by uuid, updated_by_name text, updated_device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_by uuid, closed_by_name text, closed_at timestamptz, close_reason text
);
create index if not exists admission_draft_forms_open on public.admission_draft_forms(status,updated_at desc);
alter table public.admission_draft_forms enable row level security;
drop policy if exists admission_draft_forms_read on public.admission_draft_forms;
create policy admission_draft_forms_read on public.admission_draft_forms for select to authenticated using (true);

-- save (create or update) — the id comes from the app so documents can be stored under it at once
create or replace function public.admission_draft_save(p_id uuid, p_payload jsonb, p_files jsonb default null,
  p_last_field integer default null, p_patient_name text default null, p_mobile text default null, p_address text default null,
  p_room_no text default null, p_admission_type text default null, p_linked_patient_id uuid default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; d public.admission_draft_forms;
begin
  select * into a from public.consumables_actor();
  if a.actor_id is null then raise exception 'Please sign in again.'; end if;
  if p_id is null then raise exception 'Draft id is required.'; end if;
  select * into d from public.admission_draft_forms where id=p_id for update;
  if found and d.status<>'Open' then
    raise exception 'This admission draft was already %.', lower(d.status);
  end if;
  insert into public.admission_draft_forms(id,payload,files,last_field,patient_name,mobile,address,room_no,admission_type,linked_patient_id,
                                           created_by,created_by_name,updated_by,updated_by_name,updated_device)
  values(p_id,coalesce(p_payload,'{}'::jsonb),coalesce(p_files,'[]'::jsonb),p_last_field,nullif(trim(coalesce(p_patient_name,'')),''),
         nullif(trim(coalesce(p_mobile,'')),''),nullif(trim(coalesce(p_address,'')),''),nullif(trim(coalesce(p_room_no,'')),''),
         nullif(trim(coalesce(p_admission_type,'')),''),p_linked_patient_id,a.actor_id,a.actor_name,a.actor_id,a.actor_name,nullif(trim(coalesce(p_device,'')),''))
  on conflict (id) do update set
    payload=excluded.payload, files=coalesce(p_files,admission_draft_forms.files), last_field=coalesce(excluded.last_field,admission_draft_forms.last_field),
    patient_name=excluded.patient_name, mobile=excluded.mobile, address=excluded.address, room_no=excluded.room_no,
    admission_type=excluded.admission_type, linked_patient_id=coalesce(excluded.linked_patient_id,admission_draft_forms.linked_patient_id),
    updated_by=a.actor_id, updated_by_name=a.actor_name, updated_device=excluded.updated_device, updated_at=now();
  select * into d from public.admission_draft_forms where id=p_id;
  return jsonb_build_object('success',true,'id',d.id,'draft_no',d.draft_no,'updated_at',d.updated_at);
end $$;
grant execute on function public.admission_draft_save(uuid,jsonb,jsonb,integer,text,text,text,text,text,uuid,text) to authenticated;

-- close a draft: Completed (admission done) or Discarded (with reason)
create or replace function public.admission_draft_close(p_id uuid, p_status text, p_reason text default null, p_patient_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record;
begin
  select * into a from public.consumables_actor();
  if a.actor_id is null then raise exception 'Please sign in again.'; end if;
  if p_status not in ('Completed','Discarded') then raise exception 'Invalid status.'; end if;
  update public.admission_draft_forms
     set status=p_status, close_reason=nullif(trim(coalesce(p_reason,'')),''), linked_patient_id=coalesce(p_patient_id,linked_patient_id),
         closed_by=a.actor_id, closed_by_name=a.actor_name, closed_at=now(), updated_at=now()
   where id=p_id and status='Open';
  return jsonb_build_object('success',true);
end $$;
grant execute on function public.admission_draft_close(uuid,text,text,uuid) to authenticated;

-- one-time copy of the older per-user drafts
do $$
begin
  if to_regclass('public.admission_drafts') is not null then
   begin
    execute $q$
      insert into public.admission_draft_forms(payload,patient_name,mobile,address,created_by,created_by_name,updated_by,updated_by_name,created_at,updated_at)
      select d.draft_payload, d.patient_name, d.mobile, d.address, d.created_by, p.full_name, d.created_by, p.full_name,
             coalesce(d.updated_at,now()), coalesce(d.updated_at,now())
        from public.admission_drafts d
        left join public.profiles p on p.id=d.created_by
       where d.draft_payload is not null
         and not exists(select 1 from public.admission_draft_forms f where f.created_by=d.created_by and f.payload=d.draft_payload)
    $q$;
   exception when others then raise notice 'Older admission drafts were not copied: %', sqlerrm;
   end;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
