-- Samara Care ERP 2.15.85 · SQL 203 — WhatsApp Inbox shows food messages with the template actually sent.
-- Run once in Supabase > SQL Editor. Safe to run again. Changes NO message and sends nothing.
--
-- Problem: the food-whatsapp Edge Function sends the simplified *_v2 templates and records them in the
-- WhatsApp Inbox. A moment later the fv_messages trigger (SQL 111) overwrote that Inbox row with the OLD
-- template name (samara_food_order / _modification / _receipt), so the Inbox showed the new values inside
-- the old wording ("Date and meal: 5:30 PM"). The vendor received the correct _v2 message; only the
-- ERP's copy was mislabelled.
-- Fix: the trigger keeps the template name / text already recorded by the sender and only adds its details.

begin;

create or replace function public.fv_sync_whatsapp_inbox()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if nullif(new.provider_id,'') is null then return new;end if;
 insert into public.hr_whatsapp_communications as h
 (recipient_number,communication_type,template_name,status,provider_message_id,error_message,direction,message_type,message_content,message_payload,contact_name,source_type,sent_at,created_at,updated_at,delivered_at,read_at,failed_at)
 values(new.snapshot->>'phone',case new.kind when 'receipt' then 'Food Delivery Acknowledgment' when 'modification' then 'Food Order Modification' else 'Food Order' end,'samara_food_'||new.kind,new.status,new.provider_id,new.error,'outbound','template',public.fv_inbox_text(new.kind,new.snapshot),jsonb_build_object('food_message_id',new.id,'food_order_id',new.order_id,'snapshot',new.snapshot,'header_image','https://samaraassistedliving.com/assets/samara-logo.png'),new.snapshot->>'vendor_name','Food Vendor',new.updated_at,new.updated_at,new.updated_at,case when new.status='Delivered' then new.updated_at end,case when new.status='Read' then new.updated_at end,case when new.status='Failed' then new.updated_at end)
 on conflict(provider_message_id) do update set
 status=case when h.status='Read' then 'Read' when h.status='Delivered' and excluded.status in('Accepted','Sent') then h.status when h.status='Sent' and excluded.status='Accepted' then h.status else excluded.status end,
 error_message=excluded.error_message,
 -- 2.15.85: keep what the sender recorded (the real template, e.g. samara_food_order_v2, and its values)
 template_name=coalesce(nullif(h.template_name,''),excluded.template_name),
 message_content=case when coalesce(h.template_name,'') like '%\_v2' then h.message_content else excluded.message_content end,
 message_payload=coalesce(h.message_payload,'{}'::jsonb)||(excluded.message_payload-'body_params'),
 communication_type=excluded.communication_type,contact_name=excluded.contact_name,source_type=excluded.source_type,
 updated_at=greatest(h.updated_at,excluded.updated_at),delivered_at=coalesce(h.delivered_at,excluded.delivered_at),read_at=coalesce(h.read_at,excluded.read_at),failed_at=coalesce(h.failed_at,excluded.failed_at);
 return new;
end $$;
revoke all on function public.fv_sync_whatsapp_inbox() from public,anon,authenticated;

-- Repair Inbox rows already mislabelled: the _v2 values start with "<date> – <meal>" in value 2,
-- the old templates start with "FOOD-…" there.
update public.hr_whatsapp_communications
   set template_name=template_name||'_v2', updated_at=now()
 where template_name in ('samara_food_order','samara_food_modification','samara_food_receipt')
   and message_payload->'body_params'->>1 like '% – %'
   and created_at > now() - interval '30 days';

commit;

-- Check: today's food messages with the template now shown in the Inbox
select created_at, template_name, status, message_payload->'body_params'->>1 as value_2
  from public.hr_whatsapp_communications
 where template_name like 'samara_food%' and created_at > now() - interval '2 days'
 order by created_at desc;
