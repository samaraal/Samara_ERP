-- Samara ERP v2.15.67 — Samara Enquiry Register
--  * One register for every admission enquiry: Website and Family Portal (already automatic),
--    WhatsApp (now automatic) and manual Walk-in / Phone entries by Akshi (STD), Admin or Manager.
--  * Enquiry number, assignment (default person chosen by Admin), follow-up date, status, closing reason
--    and a dated activity timeline (who did what).
--  * enquiry_alerts(): reminders for the assigned person (new enquiry, follow-up due) and Admin
--    escalation when a New enquiry is untouched for 24 hours.
-- Uses the existing table pre_admission_enquiries (the Website / Family Portal keep writing to it unchanged).
-- Run after 195. Safe to run again.
begin;

-- 1. Extra columns on the existing enquiry table (all optional, so the Website form keeps working).
alter table public.pre_admission_enquiries add column if not exists enquiry_no text;
alter table public.pre_admission_enquiries add column if not exists website_age integer;
alter table public.pre_admission_enquiries add column if not exists care_type text;
alter table public.pre_admission_enquiries add column if not exists contact_relation text;
alter table public.pre_admission_enquiries add column if not exists how_heard text;
alter table public.pre_admission_enquiries add column if not exists assigned_to uuid references public.profiles(id);
alter table public.pre_admission_enquiries add column if not exists next_follow_up date;
alter table public.pre_admission_enquiries add column if not exists closed_reason text;
alter table public.pre_admission_enquiries add column if not exists phone_key text;
alter table public.pre_admission_enquiries add column if not exists created_by uuid references public.profiles(id);
alter table public.pre_admission_enquiries add column if not exists last_activity_at timestamptz;
alter table public.pre_admission_enquiries add column if not exists whatsapp_message_id uuid;

create sequence if not exists public.enquiry_no_seq;
create unique index if not exists pre_admission_enquiries_enquiry_no on public.pre_admission_enquiries(enquiry_no);
create index if not exists pre_admission_enquiries_phone_key on public.pre_admission_enquiries(phone_key);
create index if not exists pre_admission_enquiries_assigned on public.pre_admission_enquiries(assigned_to,status);

-- 2. Settings (default person for new enquiries) and activity timeline.
create table if not exists public.enquiry_settings(
 id boolean primary key default true check(id),
 default_assignee uuid references public.profiles(id),
 alerts_from timestamptz not null default now(),
 updated_by uuid, updated_at timestamptz not null default now()
);
insert into public.enquiry_settings(id) values(true) on conflict do nothing;

create table if not exists public.enquiry_activity(
 id uuid primary key default gen_random_uuid(),
 enquiry_id uuid not null references public.pre_admission_enquiries(id) on delete cascade,
 kind text not null,                -- Created, Follow-up, Status, Assigned, Edited, WhatsApp
 note text,
 status_from text, status_to text,
 next_follow_up date,
 actor uuid references public.profiles(id),
 actor_name text,
 created_at timestamptz not null default now()
);
create index if not exists enquiry_activity_enquiry on public.enquiry_activity(enquiry_id,created_at);
alter table public.enquiry_activity enable row level security;
alter table public.enquiry_settings enable row level security;
drop policy if exists "staff read enquiry activity" on public.enquiry_activity;
create policy "staff read enquiry activity" on public.enquiry_activity for select to authenticated using (true);
drop policy if exists "staff read enquiry settings" on public.enquiry_settings;
create policy "staff read enquiry settings" on public.enquiry_settings for select to authenticated using (true);

-- 3. Helpers.
create or replace function public.enq_phone_key(v text) returns text language sql immutable as $$
 select nullif(right(regexp_replace(coalesce(v,''),'\D','','g'),10),'')
$$;

create or replace function public.enq_me() returns public.profiles language sql stable security definer set search_path=public,pg_temp as $$
 select * from public.profiles where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(is_active,true) limit 1
$$;

create or replace function public.enq_can_manage() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select role in ('Admin','Manager','STD') from public.enq_me()),false)
$$;

-- 4. Number, phone key and default assignee on every new enquiry (Website, Family Portal, WhatsApp, manual).
create or replace function public.enq_before_insert() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.enquiry_no is null then new.enquiry_no := 'ENQ-'||lpad(nextval('public.enquiry_no_seq')::text,5,'0'); end if;
 new.phone_key := public.enq_phone_key(new.family_contact_phone);
 if new.assigned_to is null then select default_assignee into new.assigned_to from public.enquiry_settings where id; end if;
 if new.status is null then new.status := 'New'; end if;
 if new.last_activity_at is null then new.last_activity_at := coalesce(new.created_at,now()); end if;
 return new;
end $$;
drop trigger if exists enq_before_insert on public.pre_admission_enquiries;
create trigger enq_before_insert before insert on public.pre_admission_enquiries for each row execute function public.enq_before_insert();

create or replace function public.enq_after_insert() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.enquiry_activity(enquiry_id,kind,note,status_to,actor,actor_name,created_at)
 values(new.id,'Created','Enquiry received from '||coalesce(nullif(new.source,''),'Website'),new.status,new.created_by,
  (select full_name from public.profiles where id=new.created_by),coalesce(new.created_at,now()));
 return new;
end $$;
drop trigger if exists enq_after_insert on public.pre_admission_enquiries;
create trigger enq_after_insert after insert on public.pre_admission_enquiries for each row execute function public.enq_after_insert();

create or replace function public.enq_before_update() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.family_contact_phone is distinct from old.family_contact_phone then new.phone_key := public.enq_phone_key(new.family_contact_phone); end if;
 return new;
end $$;
drop trigger if exists enq_before_update on public.pre_admission_enquiries;
create trigger enq_before_update before update on public.pre_admission_enquiries for each row execute function public.enq_before_update();

-- Number and key for enquiries already in the table (oldest first).
do $$ declare r record; begin
 for r in select id from public.pre_admission_enquiries where enquiry_no is null order by created_at, id loop
  update public.pre_admission_enquiries set enquiry_no='ENQ-'||lpad(nextval('public.enquiry_no_seq')::text,5,'0') where id=r.id;
 end loop;
end $$;
update public.pre_admission_enquiries set phone_key=public.enq_phone_key(family_contact_phone) where phone_key is null;
update public.pre_admission_enquiries set last_activity_at=coalesce(updated_at,created_at) where last_activity_at is null;
insert into public.enquiry_activity(enquiry_id,kind,note,status_to,created_at)
select e.id,'Created','Enquiry received from '||coalesce(nullif(e.source,''),'Website'),coalesce(e.status,'New'),e.created_at
from public.pre_admission_enquiries e where not exists(select 1 from public.enquiry_activity a where a.enquiry_id=e.id);

-- 5. Save a manual enquiry (new) or edit any enquiry's details.
create or replace function public.enq_save(p jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles := public.enq_me(); rid uuid := nullif(p->>'id','')::uuid; r public.pre_admission_enquiries;
 v_name text := trim(coalesce(p->>'patient_name','')); v_contact text := trim(coalesce(p->>'family_contact_name',''));
 v_phone text := trim(coalesce(p->>'family_contact_phone','')); v_source text := trim(coalesce(p->>'source',''));
begin
 if not public.enq_can_manage() then raise exception 'Only STD, Admin or Manager can add or edit enquiries'; end if;
 if v_name='' then raise exception 'Enter the Guest name (or "Not given")'; end if;
 if v_contact='' then raise exception 'Enter the contact person name'; end if;
 if public.enq_phone_key(v_phone) is null or length(public.enq_phone_key(v_phone))<10 then raise exception 'Enter a valid 10-digit mobile number'; end if;
 if rid is null then
  if v_source not in ('Walk-in','Phone call','Reference / Doctor','Hospital referral','Other') then raise exception 'Select how the enquiry came'; end if;
  insert into public.pre_admission_enquiries(patient_name,website_age,family_contact_name,family_contact_phone,contact_relation,current_location,
   care_type,bed_preference,expected_admission_date,special_requirements,how_heard,source,status,next_follow_up,assigned_to,created_by,created_at,updated_at)
  values(v_name,nullif(p->>'age','')::integer,v_contact,v_phone,nullif(trim(p->>'contact_relation'),''),nullif(trim(p->>'current_location'),''),
   nullif(trim(p->>'care_type'),''),nullif(trim(p->>'bed_preference'),''),nullif(p->>'expected_admission_date','')::date,nullif(trim(p->>'special_requirements'),''),
   nullif(trim(p->>'how_heard'),''),v_source,'New',nullif(p->>'next_follow_up','')::date,nullif(p->>'assigned_to','')::uuid,me.id,now(),now())
  returning * into r;
 else
  update public.pre_admission_enquiries set patient_name=v_name,website_age=nullif(p->>'age','')::integer,family_contact_name=v_contact,family_contact_phone=v_phone,
   contact_relation=nullif(trim(p->>'contact_relation'),''),current_location=nullif(trim(p->>'current_location'),''),care_type=nullif(trim(p->>'care_type'),''),
   bed_preference=nullif(trim(p->>'bed_preference'),''),expected_admission_date=nullif(p->>'expected_admission_date','')::date,
   special_requirements=nullif(trim(p->>'special_requirements'),''),how_heard=nullif(trim(p->>'how_heard'),''),updated_at=now(),last_activity_at=now()
  where id=rid returning * into r;
  if r.id is null then raise exception 'Enquiry not found'; end if;
  insert into public.enquiry_activity(enquiry_id,kind,note,actor,actor_name) values(r.id,'Edited','Details edited',me.id,me.full_name);
 end if;
 return to_jsonb(r);
end $$;

-- 6. Follow-up: note (required), optional status change, next follow-up date, closing reason.
create or replace function public.enq_followup(p_id uuid,p_note text,p_status text default null,p_next_follow_up date default null,p_closed_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles := public.enq_me(); r public.pre_admission_enquiries; v_status text;
begin
 if not public.enq_can_manage() then raise exception 'Only STD, Admin or Manager can update enquiries'; end if;
 if trim(coalesce(p_note,''))='' then raise exception 'Write what was discussed / done'; end if;
 select * into r from public.pre_admission_enquiries where id=p_id for update;
 if r.id is null then raise exception 'Enquiry not found'; end if;
 v_status := coalesce(nullif(trim(p_status),''),r.status,'New');
 if v_status not in ('New','Contacted','Visit / Assessment Scheduled','Assessment Scheduled','Estimate Sent','Bed Reserved','Admitted','Converted to Admission','Closed') then raise exception 'Invalid status'; end if;
 if v_status='Closed' and trim(coalesce(p_closed_reason,''))='' then raise exception 'Select why the enquiry is closed'; end if;
 if v_status='New' and r.status is distinct from 'New' then raise exception 'An enquiry cannot go back to New'; end if;
 if v_status='New' then v_status:='Contacted'; end if; -- any recorded follow-up means the family was contacted
 update public.pre_admission_enquiries set status=v_status,next_follow_up=case when v_status in ('Admitted','Converted to Admission','Closed') then null else p_next_follow_up end,
  closed_reason=case when v_status='Closed' then trim(p_closed_reason) else null end,handled_by=me.id,updated_at=now(),last_activity_at=now()
 where id=p_id returning * into r;
 insert into public.enquiry_activity(enquiry_id,kind,note,status_from,status_to,next_follow_up,actor,actor_name)
 values(p_id,case when v_status is distinct from (select status_to from public.enquiry_activity where enquiry_id=p_id and status_to is not null order by created_at desc limit 1) then 'Status' else 'Follow-up' end,
  trim(p_note)||case when v_status='Closed' then ' — Closed: '||trim(p_closed_reason) else '' end,
  (select status_to from public.enquiry_activity where enquiry_id=p_id and status_to is not null order by created_at desc limit 1),v_status,r.next_follow_up,me.id,me.full_name);
 return to_jsonb(r);
end $$;

-- 7. Reassign one enquiry; Admin sets the default person for new enquiries.
create or replace function public.enq_assign(p_id uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles := public.enq_me(); r public.pre_admission_enquiries; who text;
begin
 if not public.enq_can_manage() then raise exception 'Only STD, Admin or Manager can assign enquiries'; end if;
 select full_name into who from public.profiles where id=p_user and coalesce(is_active,true) and role in ('Admin','Manager','STD');
 if who is null then raise exception 'Choose an active STD, Admin or Manager'; end if;
 update public.pre_admission_enquiries set assigned_to=p_user,updated_at=now() where id=p_id returning * into r;
 if r.id is null then raise exception 'Enquiry not found'; end if;
 insert into public.enquiry_activity(enquiry_id,kind,note,actor,actor_name) values(p_id,'Assigned','Assigned to '||who,me.id,me.full_name);
 return to_jsonb(r);
end $$;

create or replace function public.enq_set_default_assignee(p_user uuid,p_assign_open boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles := public.enq_me(); who text; n integer := 0;
begin
 if coalesce(me.role,'')<>'Admin' then raise exception 'Only Admin can choose the default person'; end if;
 select full_name into who from public.profiles where id=p_user and coalesce(is_active,true) and role in ('Admin','Manager','STD');
 if who is null then raise exception 'Choose an active STD, Admin or Manager'; end if;
 update public.enquiry_settings set default_assignee=p_user,updated_by=me.id,updated_at=now() where id;
 if p_assign_open then
  with u as (update public.pre_admission_enquiries set assigned_to=p_user,updated_at=now()
   where assigned_to is null and coalesce(status,'New') not in ('Admitted','Converted to Admission','Closed') returning id)
  insert into public.enquiry_activity(enquiry_id,kind,note,actor,actor_name) select id,'Assigned','Assigned to '||who,me.id,me.full_name from u;
  get diagnostics n = row_count;
 end if;
 return jsonb_build_object('default_assignee',p_user,'name',who,'assigned_now',n);
end $$;

-- 8. Reminders for the Notifications page.
create or replace function public.enquiry_alerts() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me public.profiles := public.enq_me(); cfg public.enquiry_settings; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
 if me.id is null or me.role not in ('Admin','Manager','STD') then return '[]'::jsonb; end if;
 select * into cfg from public.enquiry_settings where id;
 return coalesce((select jsonb_agg(x order by x->>'sort') from (
  -- assigned to me: new and not yet followed up
  select jsonb_build_object('alert','New enquiry','sort','1'||e.created_at::text,'id',e.id,'enquiry_no',e.enquiry_no,'guest',e.patient_name,'contact',e.family_contact_name,'phone',e.family_contact_phone,'source',e.source,'at',e.created_at) x
  from public.pre_admission_enquiries e
  where e.assigned_to=me.id and coalesce(e.status,'New')='New' and e.created_at>=cfg.alerts_from - interval '14 days'
  union all
  -- assigned to me: follow-up due today or overdue
  select jsonb_build_object('alert','Follow-up due','sort','2'||e.next_follow_up::text,'id',e.id,'enquiry_no',e.enquiry_no,'guest',e.patient_name,'contact',e.family_contact_name,'phone',e.family_contact_phone,'source',e.source,'due',e.next_follow_up,'at',e.last_activity_at)
  from public.pre_admission_enquiries e
  where e.assigned_to=me.id and e.next_follow_up<=today and coalesce(e.status,'New') not in ('Admitted','Converted to Admission','Closed')
  union all
  -- Admin: New enquiry untouched for 24 hours (or nobody assigned)
  select jsonb_build_object('alert',case when e.assigned_to is null then 'Not assigned' else 'Untouched 24 h' end,'sort','0'||e.created_at::text,'id',e.id,'enquiry_no',e.enquiry_no,'guest',e.patient_name,'contact',e.family_contact_name,'phone',e.family_contact_phone,'source',e.source,'at',e.created_at,
   'assigned_name',(select full_name from public.profiles where id=e.assigned_to))
  from public.pre_admission_enquiries e
  where me.role='Admin' and coalesce(e.status,'New')='New' and e.created_at>=cfg.alerts_from
   and (e.assigned_to is null or e.created_at<now()-interval '24 hours')
   and not exists(select 1 from public.enquiry_activity a where a.enquiry_id=e.id and a.actor is not null and a.kind in ('Follow-up','Status'))
 ) s),'[]'::jsonb);
end $$;

-- 9. WhatsApp: a new inbound chat about admission / services becomes an enquiry automatically.
--    Skips applicants, staff, Guests' families, the food vendor and known payment conversations.
--    Never blocks the WhatsApp webhook: any problem here is swallowed.
create or replace function public.enq_whatsapp_row(h public.hr_whatsapp_communications,p_backfill boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare k text; txt text; open_id uuid;
begin
 if coalesce(h.direction,'')<>'inbound' or h.career_application_id is not null or h.application_id is not null then return; end if;
 if coalesce(h.source_type,'') !~* '(website|public)' then return; end if;
 k := public.enq_phone_key(coalesce(h.recipient_number,''));
 if k is null or length(k)<10 then return; end if;
 txt := lower(coalesce(h.message_content,''));
 -- already an open enquiry for this number: just note the new message (at most every 6 hours)
 select id into open_id from public.pre_admission_enquiries
  where phone_key=k and coalesce(status,'New') not in ('Admitted','Converted to Admission','Closed') order by created_at desc limit 1;
 if open_id is not null then
  if not p_backfill and not exists(select 1 from public.enquiry_activity where enquiry_id=open_id and kind='WhatsApp' and created_at>now()-interval '6 hours') then
   insert into public.enquiry_activity(enquiry_id,kind,note) values(open_id,'WhatsApp','New WhatsApp message: '||left(coalesce(h.message_content,''),300));
   update public.pre_admission_enquiries set last_activity_at=now() where id=open_id;
  end if;
  return;
 end if;
 if txt !~* '\y(admission|admit|enquir\w*|inquir\w*|assisted living|tracheost\w*|beds?|rooms?|stay|pricing|prices?|tariff|cost|fees?|charges|packages?|caregiver|physiotherapy|nursing|facility|services?|callback|elder\w*|old age)\y|call back|please call|call me|request a call|our location' then return; end if;
 if txt ~* '\y(payment|receipt|invoice|billing|refund|balance|dues?|paid)\y' then return; end if;
 -- known numbers are not new enquiries
 if exists(select 1 from public.patients p where public.enq_phone_key(p.mobile)=k or public.enq_phone_key(p.attendant_phone)=k) then return; end if;
 if exists(select 1 from public.profiles pr where public.enq_phone_key(pr.mobile)=k) then return; end if;
 if exists(select 1 from public.fv_settings f where f.data::text like '%'||k||'%') then return; end if;
 if exists(select 1 from public.hr_whatsapp_communications x where public.enq_phone_key(x.recipient_number)=k and x.id<>h.id
           and (x.career_application_id is not null or coalesce(x.source_type,'') ~* '(patient|family|employee|hr|food)')) then return; end if;
 insert into public.pre_admission_enquiries(patient_name,family_contact_name,family_contact_phone,special_requirements,source,status,whatsapp_message_id,created_at,updated_at)
 values('Not given',coalesce(nullif(trim(h.contact_name),''),nullif(trim(h.applicant_name),''),'WhatsApp contact'),'+'||regexp_replace(h.recipient_number,'\D','','g'),
  left(coalesce(h.message_content,''),500),'WhatsApp','New',h.id,coalesce(h.created_at,now()),now());
end $$;

create or replace function public.enq_from_whatsapp() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 begin
  perform public.enq_whatsapp_row(new,false);
 exception when others then
  raise warning 'enq_from_whatsapp skipped: %',sqlerrm;
 end;
 return new;
end $$;
drop trigger if exists enq_from_whatsapp on public.hr_whatsapp_communications;
create trigger enq_from_whatsapp after insert on public.hr_whatsapp_communications for each row execute function public.enq_from_whatsapp();

-- WhatsApp enquiries from the last 14 days, so the register starts complete (oldest messages first).
do $$ declare r public.hr_whatsapp_communications; begin
 for r in select * from public.hr_whatsapp_communications
  where direction='inbound' and created_at>now()-interval '14 days' order by created_at loop
  begin perform public.enq_whatsapp_row(r,true);
  exception when others then raise warning 'WhatsApp backfill skipped one message: %',sqlerrm; end;
 end loop;
end $$;

grant execute on function public.enq_save(jsonb), public.enq_followup(uuid,text,text,date,text), public.enq_assign(uuid,uuid),
 public.enq_set_default_assignee(uuid,boolean), public.enquiry_alerts(), public.enq_can_manage() to authenticated;
revoke all on function public.enq_from_whatsapp(), public.enq_whatsapp_row(public.hr_whatsapp_communications,boolean), public.enq_before_insert(), public.enq_after_insert() from public, anon, authenticated;

notify pgrst,'reload schema';
commit;
