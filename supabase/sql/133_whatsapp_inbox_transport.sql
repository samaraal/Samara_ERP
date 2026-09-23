begin;
-- Existing senders add richer descriptions after the transport records acceptance.
-- Enrich that one record without overwriting delivery/read status or creating duplicates.
create or replace function public.wa_enrich_transport_record()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing public.hr_whatsapp_communications;
begin
 if new.provider_message_id is null or coalesce(new.message_payload->>'inbox_transport','false')='true' then return new; end if;
 select * into existing from public.hr_whatsapp_communications where provider_message_id=new.provider_message_id for update;
 if not found or coalesce(existing.message_payload->>'inbox_transport','false')<>'true' then return new; end if;
 update public.hr_whatsapp_communications set
   status=case when existing.status='Read' or new.status='Read' then 'Read'
     when existing.status='Delivered' or new.status='Delivered' then 'Delivered'
     when new.status='Failed' then 'Failed'
     when existing.status='Sent' or new.status='Sent' then 'Sent'
     else existing.status end,
   delivered_at=coalesce(existing.delivered_at,new.delivered_at),
   read_at=coalesce(existing.read_at,new.read_at),failed_at=coalesce(existing.failed_at,new.failed_at),
   error_message=coalesce(new.error_message,existing.error_message),
   career_application_id=coalesce(new.career_application_id,existing.career_application_id),
   application_id=coalesce(new.application_id,existing.application_id),
   applicant_name=coalesce(new.applicant_name,existing.applicant_name),
   communication_type=coalesce(nullif(new.communication_type,''),existing.communication_type),
   template_name=coalesce(new.template_name,existing.template_name),
   message_type=coalesce(new.message_type,existing.message_type),
   message_content=case when existing.message_payload->>'secret_values_hidden'='true' then existing.message_content else coalesce(nullif(new.message_content,''),existing.message_content) end,
   message_payload=case when existing.message_payload->>'secret_values_hidden'='true' then existing.message_payload else coalesce(existing.message_payload,'{}'::jsonb)||coalesce(new.message_payload,'{}'::jsonb) end,
   contact_name=coalesce(new.contact_name,existing.contact_name),
   source_type=coalesce(new.source_type,existing.source_type),
   sent_by=coalesce(new.sent_by,existing.sent_by),sent_by_name=coalesce(new.sent_by_name,existing.sent_by_name)
 where id=existing.id;
 return null;
end $$;
create or replace trigger wa_enrich_transport_before_insert before insert on public.hr_whatsapp_communications
for each row execute function public.wa_enrich_transport_record();
revoke all on function public.wa_enrich_transport_record() from public,anon,authenticated;
-- Paginate in the UI; the RPC retains exactly the same vendor/role restrictions.
create or replace function public.wa_food_inbox()
returns setof public.hr_whatsapp_communications language sql stable security invoker set search_path=public,pg_temp as $$
 select * from hr_whatsapp_communications h where wa_food_active() and wa_food_row(to_jsonb(h)) order by created_at desc,id desc
$$;
commit;
