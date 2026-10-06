-- Samara ERP v2.15.69 — Enquiry Register: "Not an enquiry" category + add a WhatsApp chat by hand
--  * A Website / WhatsApp entry that is not an admission enquiry (job seeker, vendor, Guest's family,
--    staff, wrong number, spam…) can be moved to "Not an enquiry" with a category. It leaves the
--    register lists and reminders; it can be restored. WhatsApp never re-creates an enquiry for that number.
--  * enq_add_from_whatsapp: STD / Admin / Manager add any WhatsApp conversation to the register
--    (from Director's Office → Enquiries & Feedback).
-- Run after 196. Safe to run again.
begin;

-- 1. Follow-up now also accepts "Not an enquiry" (needs a category) and restoring from it.
create or replace function public.enq_followup(p_id uuid,p_note text,p_status text default null,p_next_follow_up date default null,p_closed_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles := public.enq_me(); r public.pre_admission_enquiries; v_status text; v_prev text;
begin
 if not public.enq_can_manage() then raise exception 'Only STD, Admin or Manager can update enquiries'; end if;
 if trim(coalesce(p_note,''))='' then raise exception 'Write what was discussed / done'; end if;
 select * into r from public.pre_admission_enquiries where id=p_id for update;
 if r.id is null then raise exception 'Enquiry not found'; end if;
 v_prev := coalesce(r.status,'New');
 v_status := coalesce(nullif(trim(p_status),''),v_prev);
 if v_status not in ('New','Contacted','Visit / Assessment Scheduled','Assessment Scheduled','Estimate Sent','Bed Reserved','Admitted','Converted to Admission','Closed','Not an enquiry') then raise exception 'Invalid status'; end if;
 if v_status in ('Closed','Not an enquiry') and trim(coalesce(p_closed_reason,''))='' then
  raise exception '%', case when v_status='Closed' then 'Select why the enquiry is closed' else 'Select what this message is (job seeker, vendor, family…)' end;
 end if;
 if v_status='New' and v_prev not in ('New','Not an enquiry') then raise exception 'An enquiry cannot go back to New'; end if;
 if v_status='New' and v_prev='New' then v_status:='Contacted'; end if; -- a recorded follow-up means the family was contacted
 update public.pre_admission_enquiries set status=v_status,
  next_follow_up=case when v_status in ('Admitted','Converted to Admission','Closed','Not an enquiry') then null else p_next_follow_up end,
  closed_reason=case when v_status in ('Closed','Not an enquiry') then trim(p_closed_reason) else null end,
  handled_by=me.id,updated_at=now(),last_activity_at=now()
 where id=p_id returning * into r;
 insert into public.enquiry_activity(enquiry_id,kind,note,status_from,status_to,next_follow_up,actor,actor_name)
 values(p_id,case when v_status is distinct from v_prev then 'Status' else 'Follow-up' end,
  trim(p_note)||case when v_status='Closed' then ' — Closed: '||trim(p_closed_reason) when v_status='Not an enquiry' then ' — Not an enquiry: '||trim(p_closed_reason) else '' end,
  v_prev,v_status,r.next_follow_up,me.id,me.full_name);
 return to_jsonb(r);
end $$;

-- 2. WhatsApp: a number marked "Not an enquiry" never becomes an enquiry again; "open" excludes it.
create or replace function public.enq_whatsapp_row(h public.hr_whatsapp_communications,p_backfill boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare k text; txt text; open_id uuid;
begin
 if coalesce(h.direction,'')<>'inbound' or h.career_application_id is not null or h.application_id is not null then return; end if;
 if coalesce(h.source_type,'') !~* '(website|public)' then return; end if;
 k := public.enq_phone_key(coalesce(h.recipient_number,''));
 if k is null or length(k)<10 then return; end if;
 if exists(select 1 from public.pre_admission_enquiries where phone_key=k and status='Not an enquiry') then return; end if;
 txt := lower(coalesce(h.message_content,''));
 select id into open_id from public.pre_admission_enquiries
  where phone_key=k and coalesce(status,'New') not in ('Admitted','Converted to Admission','Closed','Not an enquiry') order by created_at desc limit 1;
 if open_id is not null then
  if not p_backfill and not exists(select 1 from public.enquiry_activity where enquiry_id=open_id and kind='WhatsApp' and created_at>now()-interval '6 hours') then
   insert into public.enquiry_activity(enquiry_id,kind,note) values(open_id,'WhatsApp','New WhatsApp message: '||left(coalesce(h.message_content,''),300));
   update public.pre_admission_enquiries set last_activity_at=now() where id=open_id;
  end if;
  return;
 end if;
 if txt !~* '\y(admission|admit|enquir\w*|inquir\w*|assisted living|tracheost\w*|beds?|rooms?|stay|pricing|prices?|tariff|cost|fees?|charges|packages?|caregiver|physiotherapy|nursing|facility|services?|callback|elder\w*|old age)\y|call back|please call|call me|request a call|our location' then return; end if;
 if txt ~* '\y(payment|receipt|invoice|billing|refund|balance|dues?|paid)\y' then return; end if;
 if exists(select 1 from public.patients p where public.enq_phone_key(p.mobile)=k or public.enq_phone_key(p.attendant_phone)=k) then return; end if;
 if exists(select 1 from public.profiles pr where public.enq_phone_key(pr.mobile)=k) then return; end if;
 if exists(select 1 from public.fv_settings f where f.data::text like '%'||k||'%') then return; end if;
 if exists(select 1 from public.hr_whatsapp_communications x where public.enq_phone_key(x.recipient_number)=k and x.id<>h.id
           and (x.career_application_id is not null or coalesce(x.source_type,'') ~* '(patient|family|employee|hr|food)')) then return; end if;
 insert into public.pre_admission_enquiries(patient_name,family_contact_name,family_contact_phone,special_requirements,source,status,whatsapp_message_id,created_at,updated_at)
 values('Not given',coalesce(nullif(trim(h.contact_name),''),nullif(trim(h.applicant_name),''),'WhatsApp contact'),'+'||regexp_replace(h.recipient_number,'\D','','g'),
  left(coalesce(h.message_content,''),500),'WhatsApp','New',h.id,coalesce(h.created_at,now()),now());
end $$;
revoke all on function public.enq_whatsapp_row(public.hr_whatsapp_communications,boolean) from public, anon, authenticated;

-- 3. Add a WhatsApp conversation to the register by hand (returns the existing open enquiry if there is one).
create or replace function public.enq_add_from_whatsapp(p_phone text,p_name text default null,p_message text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles := public.enq_me(); k text := public.enq_phone_key(p_phone); r public.pre_admission_enquiries;
begin
 if not public.enq_can_manage() then raise exception 'Only STD, Admin or Manager can add enquiries'; end if;
 if k is null or length(k)<10 then raise exception 'Invalid WhatsApp number'; end if;
 select * into r from public.pre_admission_enquiries where phone_key=k and coalesce(status,'New') not in ('Admitted','Converted to Admission','Closed','Not an enquiry') order by created_at desc limit 1;
 if r.id is not null then return to_jsonb(r)||'{"existing":true}'::jsonb; end if;
 insert into public.pre_admission_enquiries(patient_name,family_contact_name,family_contact_phone,special_requirements,source,status,created_by,created_at,updated_at)
 values('Not given',coalesce(nullif(trim(p_name),''),'WhatsApp contact'),'+'||regexp_replace(p_phone,'\D','','g'),nullif(left(trim(coalesce(p_message,'')),500),''),'WhatsApp','New',me.id,now(),now())
 returning * into r;
 return to_jsonb(r);
end $$;
grant execute on function public.enq_followup(uuid,text,text,date,text), public.enq_add_from_whatsapp(text,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
