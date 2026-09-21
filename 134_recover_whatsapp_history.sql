begin;
-- Recover only documented sends/failures. Never send messages or infer delivery.
with history as (
 select 'patient_communications' source,id::text source_id,recipient_number phone,provider_message_id provider,
   communication_type kind,template_name template,status,message_preview content,recipient_name contact,
   'Patient / Family' scope,error_message error,coalesce(sent_at,created_at) happened,
   jsonb_build_object('patient_id',patient_id,'report_date',report_date) payload
 from patient_communications where lower(method)='whatsapp'
 union all
 select 'clinical_whatsapp_escalations',id::text,recipient_number,meta_message_id,
   'Clinical Escalation',template_name,status,
   concat_ws(E'\n',patient_name,room_label,alert_type,alert_title,'Stage: '||stage),recipient_name,
   'Patient / Family · Clinical',error_text,coalesce(sent_at,attempted_at,created_at),jsonb_build_object('patient_id',patient_id,'alert_key',alert_key)
 from clinical_whatsapp_escalations
 union all
 select 'package_renewal_notifications',id::text,recipient_number,provider_message_id,
   'Package Renewal',template_name,status,'Package renewal notice; package end date: '||package_end_date::text,null,
   'Patient / Family',error_message,coalesce(sent_at,created_at),jsonb_build_object('patient_id',patient_id)
 from package_renewal_notifications
 union all
 select 'whatsapp_daily_payable_log',id::text,recipient_phone,meta_message_id,
   'Daily Payable Reminder','samara_bill_reminder',status,'Recorded amount: INR '||amount::text||'; statement date: '||statement_date::text,null,
   'Patient / Family · Accounts',error_message,coalesce(sent_at,attempted_at,created_at),jsonb_build_object('patient_id',patient_id)
 from whatsapp_daily_payable_log
 union all
 select 'fv_messages',id::text,snapshot->>'phone',provider_id,
   'Food '||kind,'samara_food_'||kind,status,public.fv_inbox_text(kind,snapshot),snapshot->>'vendor_name',
   'Food Vendor',error,updated_at,jsonb_build_object('food_order_id',order_id)
 from fv_messages
 union all
 select 'notification_queue',id::text,recipient,provider_message_id,
   'WhatsApp Notification',null,status,message,null,'WhatsApp',error_message,coalesce(sent_at,created_at),'{}'::jsonb
 from notification_queue where channel='WhatsApp'
 union all
 select 'audit_log',id::text,details->>'recipient',details->>'provider_message_id',
   'WhatsApp Send · Recovered',details->>'template_name','Accepted',
   'Recovered from sender audit. Original message content and delivery status were not retained.',null,'WhatsApp',null,created_at,'{}'::jsonb
 from audit_log where action='WhatsApp Sent' and entity='WhatsApp'
), candidates as (
 select *,regexp_replace(coalesce(phone,''),'[^0-9]','','g') digits from history
 where nullif(provider,'') is not null or status in ('Failed','Unknown')
), inserted as (
 insert into hr_whatsapp_communications(recipient_number,provider_message_id,communication_type,template_name,status,direction,message_type,message_content,message_payload,contact_name,source_type,error_message,sent_at,failed_at,created_at,updated_at)
 select case when length(digits)=10 then '91'||digits else digits end,nullif(provider,''),coalesce(kind,'WhatsApp')||' · Recovered',template,
   case when status in ('Read','Delivered','Failed','Unknown') then status else 'Accepted' end,
   'outbound',case when template is null then 'text' else 'template' end,
   case when template ~* '(otp|auth|portal_access|password|pin)' then 'Authentication / portal access message. Secret values are hidden.' else coalesce(nullif(content,''),'Original message content was not retained.') end,
   payload||jsonb_build_object('recovered_source',source,'recovered_source_id',source_id),contact,scope,error,
   case when nullif(provider,'') is not null and status not in ('Failed','Unknown') then happened end,
   case when status='Failed' then happened end,coalesce(happened,now()),now()
 from candidates c where length(digits) between 8 and 15
 and not exists(select 1 from hr_whatsapp_communications h where
   (nullif(c.provider,'') is not null and h.provider_message_id=c.provider)
   or (h.message_payload->>'recovered_source'=c.source and h.message_payload->>'recovered_source_id'=c.source_id)
   or (c.source='audit_log' and h.message_payload->>'recovered_from_audit'=c.source_id))
 on conflict(provider_message_id) do nothing returning id
)
select count(*) as recovered_records from inserted;
commit;
