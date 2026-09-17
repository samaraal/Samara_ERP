-- Mirror API-accepted food messages into the existing WhatsApp inbox.
-- No network calls, resends, permission changes, or pending-message updates.
begin;
create or replace function public.fv_inbox_items(items jsonb, category text)
returns text language sql immutable set search_path=public,pg_temp as $$
 select coalesce(string_agg(coalesce(x->>'name','Item')||': '||case when category='total' then (coalesce((x->>'residents')::numeric,0)+coalesce((x->>'employees')::numeric,0))::text else coalesce(x->>category,'0') end,'; ' order by n),'None') from jsonb_array_elements(coalesce(items,'[]')) with ordinality a(x,n)
$$;
create or replace function public.fv_inbox_text(kind text,s jsonb)
returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare t text; lines jsonb;
begin
 t:='Dear '||coalesce(s->>'vendor_name','Vendor')||E',\n';
 t:=t||case kind when 'order' then 'Please arrange the following food order for Samara Assisted Living.' when 'modification' then 'Please use this revised food order for Samara Assisted Living in place of the earlier version.' else 'Samara Assisted Living has recorded a food delivery against your order.' end;
 t:=t||E'\n\nOrder: FOOD-'||upper(left(s->>'id',8))||case when kind='modification' then ' / Revision '||coalesce(s->>'version','') when kind='receipt' then ' / Receipt '||left(s->>'receipt_id',8) else '' end||E'\nDate and meal: '||coalesce(s->>'date','')||' / '||coalesce(s->>'slot','');
 if kind='receipt' then
  select jsonb_agg(x||jsonb_build_object('name',s->'items'->(n::int-1)->>'name') order by n) into lines from jsonb_array_elements(s->'receipt'->'items') with ordinality a(x,n);
  t:=t||E'\nReceived at: '||coalesce(s->'receipt'->>'received_at','')||E'\nOrdered quantities: '||public.fv_inbox_items(s->'items','total')||E'\nAccepted this delivery: Residents: '||public.fv_inbox_items(lines,'residents')||'; Employees: '||public.fv_inbox_items(lines,'employees')||E'\nRejected this delivery: '||public.fv_inbox_items(lines,'rejected')||E'\nOutstanding quantities: '||coalesce(s->>'outstanding','0')||' portions'||E'\nRemarks / instructions: '||coalesce(nullif(s->'receipt'->>'remarks',''),'None')||E'\n\nPlease review any discrepancy and acknowledge.';
 else
  t:=t||E'\nDelivery time: '||coalesce(s->>'delivery','');
  if kind='modification' then t:=t||E'\nPrevious quantities: '||public.fv_inbox_items(s->'before'->'items','total')||E'\nPrevious delivery: '||coalesce(s->'before'->>'delivery','')||E'\nReason: '||coalesce(s->>'reason','');end if;
  t:=t||E'\nResident quantities: '||public.fv_inbox_items(s->'items','residents')||E'\nEmployee quantities: '||public.fv_inbox_items(s->'items','employees')||E'\nTotal quantities: '||public.fv_inbox_items(s->'items','total')||E'\nOther requests / instructions: '||coalesce(nullif(s->>'instructions',''),'None')||E'\n\nPlease acknowledge '||case when kind='modification' then 'the revised quantities.' else 'this order.' end;
 end if;
 return t||E'\nThank you, Samara Assisted Living.';
end $$;
create or replace function public.fv_sync_whatsapp_inbox()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if nullif(new.provider_id,'') is null then return new;end if;
 insert into public.hr_whatsapp_communications as h
 (recipient_number,communication_type,template_name,status,provider_message_id,error_message,direction,message_type,message_content,message_payload,contact_name,source_type,sent_at,created_at,updated_at,delivered_at,read_at,failed_at)
 values(new.snapshot->>'phone',case new.kind when 'receipt' then 'Food Delivery Acknowledgment' when 'modification' then 'Food Order Modification' else 'Food Order' end,'samara_food_'||new.kind,new.status,new.provider_id,new.error,'outbound','template',public.fv_inbox_text(new.kind,new.snapshot),jsonb_build_object('food_message_id',new.id,'food_order_id',new.order_id,'snapshot',new.snapshot,'header_image','https://samaraassistedliving.com/assets/samara-logo.png'),new.snapshot->>'vendor_name','Food Vendor',new.updated_at,new.updated_at,new.updated_at,case when new.status='Delivered' then new.updated_at end,case when new.status='Read' then new.updated_at end,case when new.status='Failed' then new.updated_at end)
 on conflict(provider_message_id) do update set
 status=case when h.status='Read' then 'Read' when h.status='Delivered' and excluded.status in('Accepted','Sent') then h.status when h.status='Sent' and excluded.status='Accepted' then h.status else excluded.status end,
 error_message=excluded.error_message,message_content=excluded.message_content,message_payload=excluded.message_payload,communication_type=excluded.communication_type,template_name=excluded.template_name,contact_name=excluded.contact_name,source_type=excluded.source_type,
 updated_at=greatest(h.updated_at,excluded.updated_at),delivered_at=coalesce(h.delivered_at,excluded.delivered_at),read_at=coalesce(h.read_at,excluded.read_at),failed_at=coalesce(h.failed_at,excluded.failed_at);
 return new;
end $$;
revoke all on function public.fv_inbox_items(jsonb,text),public.fv_inbox_text(text,jsonb),public.fv_sync_whatsapp_inbox() from public,anon,authenticated;
create or replace trigger fv_whatsapp_inbox_sync after insert or update of provider_id,status,error on public.fv_messages for each row execute function public.fv_sync_whatsapp_inbox();
-- Populate accepted history, preserving provider IDs and avoiding duplicate sends.
update public.fv_messages set status=status where provider_id is not null;
commit;
