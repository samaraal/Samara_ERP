-- Samara ERP v2.14.57
-- Food Vendor Management: track the vendor's actual reply to an order --
-- Acknowledged / Returned / Modification Requested -- separately from Meta's
-- delivered/read status, which only confirms WhatsApp received the message,
-- never that the vendor agreed to it (the app already says this in a few places).
--
-- Two ways this gets recorded, additively -- neither touches how orders are sent:
--  1. Immediately, on ANY message: staff tap Acknowledged / Returned / Modification
--     Requested in Messages after checking the vendor's WhatsApp reply themselves.
--     No Meta approval needed -- works the moment this migration runs.
--  2. Automatically, once a new WhatsApp quick-reply-button template
--     (samara_food_confirm_request) is approved by Meta: staff send a "Request
--     WhatsApp Confirmation" message for an order, the vendor taps a button on
--     their phone, and the ERP updates itself via the existing WhatsApp webhook.
--     Until that template is approved, the same request can be sent manually
--     (same pattern already used for samara_food_order/modification/receipt) and
--     staff record the reply with option 1 above.
-- samara_food_order / samara_food_modification / samara_food_receipt, fv_rpc,
-- fv_access and fv_apply_provider_status are not modified by this migration.

begin;

alter table public.fv_messages
  add column if not exists vendor_reply_status text,
  add column if not exists vendor_reply_at timestamptz,
  add column if not exists vendor_reply_note text,
  add column if not exists vendor_reply_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='fv_messages_vendor_reply_status_check') then
    alter table public.fv_messages add constraint fv_messages_vendor_reply_status_check
      check (vendor_reply_status is null or vendor_reply_status in ('Acknowledged','Returned','Modification Requested'));
  end if;
  if not exists (select 1 from pg_constraint where conname='fv_messages_vendor_reply_source_check') then
    alter table public.fv_messages add constraint fv_messages_vendor_reply_source_check
      check (vendor_reply_source is null or vendor_reply_source in ('Manual','WhatsApp Button'));
  end if;
end $$;

-- 1. Staff record what the vendor said, after checking WhatsApp themselves.
create or replace function public.fv_set_vendor_reply(p_message_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.fv_access(); rec public.fv_messages;
begin
  if not (a->>'control')::boolean then raise exception 'Only the current in-charge or Admin/Director may record a vendor reply';end if;
  if p_status is not null and p_status not in ('Acknowledged','Returned','Modification Requested') then
    raise exception 'Status must be Acknowledged, Returned or Modification Requested';
  end if;
  select * into rec from public.fv_messages where id=p_message_id for update;
  if not found then raise exception 'Message not found';end if;
  update public.fv_messages set
    vendor_reply_status=p_status,
    vendor_reply_at=case when p_status is null then null else now() end,
    vendor_reply_note=nullif(trim(coalesce(p_note,'')),''),
    vendor_reply_source=case when p_status is null then null else 'Manual' end,
    updated_at=now()
  where id=p_message_id
  returning * into rec;
  return to_jsonb(rec);
end $$;
revoke all on function public.fv_set_vendor_reply(uuid,text,text) from public;
grant execute on function public.fv_set_vendor_reply(uuid,text,text) to authenticated;

-- 2a. Staff request a trackable WhatsApp confirmation for an order (creates a new
-- fv_messages row of kind 'confirm_request', sent the same way order/modification/
-- receipt messages already are -- via the API once approved, manually until then).
create or replace function public.fv_create_confirm_request(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.fv_access(); o public.fv_orders; eid uuid; mid uuid; snap jsonb;
begin
  if not (a->>'control')::boolean then raise exception 'Only the current in-charge or Admin/Director may request a WhatsApp confirmation';end if;
  select * into o from public.fv_orders where id=p_order_id;
  if not found then raise exception 'Order not found';end if;
  snap:=o.data||jsonb_build_object('id',o.id,'version',o.version);
  insert into public.fv_events(order_id,kind,data,actor) values(p_order_id,'confirm_request',jsonb_build_object('order_id',p_order_id),(a->>'actor')::uuid) returning id into eid;
  insert into public.fv_messages(event_id,order_id,kind,snapshot) values(eid,p_order_id,'confirm_request',snap) returning id into mid;
  return jsonb_build_object('message_id',mid);
end $$;
revoke all on function public.fv_create_confirm_request(uuid) from public;
grant execute on function public.fv_create_confirm_request(uuid) to authenticated;

-- 2b. Called only by the WhatsApp webhook (service role) once Meta relays the
-- vendor's tap on a quick-reply button, matched to the exact message the vendor
-- replied to via Meta's own message id (fv_messages.provider_id).
-- Returns true only when p_provider_message_id actually matched a Food Vendor
-- message, so the caller (the shared WhatsApp webhook) can tell a genuine Food
-- Vendor button tap apart from an unrelated inbound reply and not silently
-- swallow the latter.
create or replace function public.fv_apply_vendor_button_reply(p_provider_message_id text, p_status text, p_button_text text, p_at timestamptz default now())
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare matched integer;
begin
  if p_status not in ('Acknowledged','Returned','Modification Requested') then return false;end if;
  update public.fv_messages set
    vendor_reply_status=p_status,
    vendor_reply_at=coalesce(p_at,now()),
    vendor_reply_note=p_button_text,
    vendor_reply_source='WhatsApp Button',
    updated_at=now()
  where provider_id=p_provider_message_id;
  get diagnostics matched=row_count;
  return matched>0;
end $$;
revoke all on function public.fv_apply_vendor_button_reply(text,text,text,timestamptz) from public;
grant execute on function public.fv_apply_vendor_button_reply(text,text,text,timestamptz) to service_role;

notify pgrst,'reload schema';
commit;
