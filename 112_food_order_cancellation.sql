-- Full cancellation uses the existing approved samara_food_modification template.
-- Original quantities are retained in immutable event/message snapshots.
begin;
create or replace function public.fv_cancel_order(p jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.fv_access(); cfg jsonb; o public.fv_orders; d jsonb; result jsonb; req uuid; eid uuid; mid uuid; why text; cut numeric;
begin
 if not coalesce((a->>'control')::boolean,false) then raise exception 'Only the current in-charge or Admin/Director may cancel orders';end if;
 perform pg_advisory_xact_lock(71620261);
 req:=(p->>'request_id')::uuid;if req is null then raise exception 'Request id required';end if;
 select t.result into result from public.fv_requests t where t.id=req and t.actor=(a->>'actor')::uuid;if found then return result;end if;
 select * into o from public.fv_orders where id=(p->>'id')::uuid for update;
 if not found or o.status<>'Ordered' then raise exception 'Only an open order with no recorded delivery can be fully cancelled';end if;
 if o.version<>coalesce((p->>'version')::integer,-1) then raise exception 'Order changed. Refresh and review before cancelling';end if;
 if exists(select 1 from public.fv_events where order_id=o.id and kind='receive') then raise exception 'A delivery is already recorded; full cancellation is not allowed';end if;
 if exists(select 1 from public.fv_messages where order_id=o.id and status in('Sending','Unknown')) then raise exception 'Resolve the earlier WhatsApp outcome before cancelling';end if;
 why:=trim(coalesce(p->>'reason',''));if length(why) not between 1 and 500 then raise exception 'Enter a cancellation reason of 1 to 500 characters';end if;
 select data into cfg from public.fv_settings where id;
 if not coalesce((cfg->'approved'->>'modification')::boolean,false) then raise exception 'Confirm approval of samara_food_modification in Settings';end if;
 cut:=(cfg->'cutoffs'->>(o.data->>'slot'))::numeric;
 if cut is not null and now()>(((o.data->>'date')||' '||(o.data->>'delivery'))::timestamp at time zone 'Asia/Kolkata')-cut*interval '1 minute' then raise exception 'The agreed vendor modification deadline has passed';end if;
 d:=o.data||jsonb_build_object('items',(select jsonb_agg(x||'{"residents":0,"employees":0}'::jsonb order by n) from jsonb_array_elements(o.data->'items') with ordinality t(x,n)), 'instructions','FULL CANCELLATION - Do not prepare or deliver this order. Please acknowledge cancellation. Reason: '||why);
 insert into public.fv_events(order_id,kind,data,actor) values(o.id,'cancel',jsonb_build_object('before',o.data,'after',d,'version',o.version+1,'reason',why),(a->>'actor')::uuid) returning id into eid;
 update public.fv_messages set status='Superseded' where order_id=o.id and status in('Pending','Failed');
 insert into public.fv_messages(event_id,order_id,kind,snapshot) values(eid,o.id,'modification',d||jsonb_build_object('id',o.id,'version',o.version+1,'reason','FULL CANCELLATION - '||why,'before',o.data,'cancellation',true)) returning id into mid;
 update public.fv_orders set status='Cancellation pending',version=version+1,data=data||jsonb_build_object('cancellation_message_id',mid,'cancellation_reason',why) where id=o.id returning * into o;
 result:=jsonb_build_object('order',to_jsonb(o),'message_id',mid);
 insert into public.fv_requests(id,actor,result) values(req,(a->>'actor')::uuid,result);
 return result;
end $$;
revoke all on function public.fv_cancel_order(jsonb) from public,anon;
grant execute on function public.fv_cancel_order(jsonb) to authenticated;

create or replace function public.fv_finish_cancellation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare changed uuid;
begin
 if new.snapshot->>'cancellation'='true' and new.status in('Accepted','Sent','Delivered','Read','Manual confirmed') then
  update public.fv_orders set status='Closed',version=version+1,data=data||jsonb_build_object('items',new.snapshot->'items','instructions',new.snapshot->>'instructions','cancelled',true,'cancellation_notified_at',now()) where id=new.order_id and status='Cancellation pending' and data->>'cancellation_message_id'=new.id::text returning id into changed;
  if changed is not null then
   insert into public.fv_events(order_id,kind,data,actor) select changed,'cancel_sent',jsonb_build_object('message_id',new.id,'provider_id',new.provider_id,'reason',new.snapshot->>'reason'),actor from public.fv_events where id=new.event_id;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.fv_finish_cancellation() from public,anon,authenticated;
create or replace trigger fv_cancellation_sent after update of status,provider_id on public.fv_messages for each row execute function public.fv_finish_cancellation();
commit;
