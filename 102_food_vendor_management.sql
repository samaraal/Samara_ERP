-- Food vendor management. Additive migration; does not alter existing clinical tables.
begin;
create table if not exists public.fv_settings(id boolean primary key default true check(id), data jsonb not null);
insert into public.fv_settings values(true,jsonb_build_object('vendor_id',gen_random_uuid(),'vendor_name','Mrs. Yuvashree','phone','918072992457','cutoffs','{}'::jsonb,'approved','{}'::jsonb)) on conflict do nothing;
create table if not exists public.fv_orders(id uuid primary key default gen_random_uuid(),version integer not null default 1,status text not null default 'Draft',data jsonb not null,created_at timestamptz not null default now());
create unique index if not exists fv_order_slot on public.fv_orders((data->>'date'),(data->>'slot'),(data->>'vendor_id'));
create table if not exists public.fv_events(id uuid primary key default gen_random_uuid(),order_id uuid references public.fv_orders(id),kind text not null,data jsonb not null,actor uuid not null,created_at timestamptz not null default now());
create table if not exists public.fv_messages(id uuid primary key default gen_random_uuid(),event_id uuid not null unique references public.fv_events(id),order_id uuid not null references public.fv_orders(id),kind text not null,snapshot jsonb not null,status text not null default 'Pending',provider_id text unique,error text,updated_at timestamptz not null default now());
create table if not exists public.fv_rates(id uuid primary key default gen_random_uuid(),vendor_id text not null,item text not null,effective date not null,price numeric(12,2) not null check(price>=0),actor uuid not null,created_at timestamptz not null default now());
create table if not exists public.fv_ledger(id uuid primary key default gen_random_uuid(),vendor_id text not null,day date not null,kind text not null,amount numeric(14,2),data jsonb not null,actor uuid not null,created_at timestamptz not null default now());
create table if not exists public.fv_requests(id uuid primary key,actor uuid not null,result jsonb not null);
create table if not exists public.fv_provider_status(id text primary key,status text not null,detail text,at timestamptz not null);
-- No direct client access, including to prices. All access goes through checked RPCs.
do $$ declare t text;begin foreach t in array array['fv_settings','fv_orders','fv_events','fv_messages','fv_rates','fv_ledger','fv_requests','fv_provider_status'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
create or replace function public.fv_access() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p jsonb; full_access boolean:=false; delegated boolean:=false; nm boolean; director boolean:=false; des text;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select to_jsonb(x) into p from public.profiles x where x.id=auth.uid() or to_jsonb(x)->>'auth_user_id'=auth.uid()::text limit 1;
 if p is null or coalesce(p->>'is_active',p->>'active','true')='false' then raise exception 'Active profile required';end if;
 if to_regclass('public.director_office_positions') is not null then execute 'select exists(select 1 from public.director_office_positions where position_key=''director'' and assigned_profile_id::text=$1)' into director using p->>'id';end if;
 full_access:=coalesce(p->>'role'='Admin',false) or director;
 if to_regclass('public.store_incharge_assignments') is not null then execute 'select exists(select 1 from public.store_incharge_assignments where status=''Active'' and effective_from<=now() and effective_until>=now())' into delegated;end if;
 des:=trim(regexp_replace(lower(coalesce(nullif(p->>'designation',''),nullif(p->>'employee_designation',''),nullif(p->>'job_title',''),p->>'position','')),'[._ -]+',' ','g'));
 nm:=coalesce(des in ('nurse manager','nursing manager') or (des='' and lower(p->>'department')='nursing' and p->>'role'='Manager'),false);
 return jsonb_build_object('actor',p->>'id','name',coalesce(p->>'full_name','Staff'),'billing',full_access,'control',full_access or (nm and not delegated) or (coalesce(p->>'role'='STD',false) and delegated),'read',full_access or nm or coalesce(p->>'role'='STD',false),'delegated',delegated);
end $$;
create or replace function public.fv_rpc(action text,p jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.fv_access(); cfg jsonb; o public.fv_orders; old jsonb; d jsonb; it jsonb; x jsonb; rec jsonb; result jsonb; eid uuid; mid uuid; oid uuid; rid uuid; i integer; q numeric; r numeric; e numeric; rej numeric; unitprice numeric; total numeric:=0; cut numeric; itemname text; already numeric; startday date; endday date; req uuid; vendor text;
begin
 if not (a->>'read')::boolean then raise exception 'Food vendor access is restricted';end if;
 select data into cfg from public.fv_settings where id;
 if action='load' then
  startday:=coalesce((p->>'from')::date,current_date-31);endday:=coalesce((p->>'to')::date,current_date+7);
  if startday>endday then raise exception 'Invalid date range';end if;
  if (select count(*) from public.fv_orders where (data->>'date')::date between startday and endday)>1000 then raise exception 'Choose a smaller date range (over 1000 orders)';end if;
  return jsonb_build_object('authority',a,'settings',cfg,'orders',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.fv_orders t where (data->>'date')::date between startday and endday),'[]'::jsonb),'events',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.fv_events t where t.order_id in(select id from public.fv_orders where (data->>'date')::date between startday and endday)),'[]'::jsonb),'messages',coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at desc) from public.fv_messages t where t.order_id in(select id from public.fv_orders where (data->>'date')::date between startday and endday)),'[]'::jsonb));
 end if;
 if action='billing' then
  if not (a->>'billing')::boolean then raise exception 'Admin/Director billing access required';end if;
  startday:=(p->>'from')::date;endday:=(p->>'to')::date;vendor:=p->>'vendor_id';
  if startday is null or endday is null or startday>endday then raise exception 'Select a valid period';end if;
  return jsonb_build_object('opening',coalesce((select sum(amount) from public.fv_ledger where vendor_id=vendor and day<startday),0),'unpriced_before',(select count(*) from public.fv_ledger where vendor_id=vendor and day<startday and amount is null),'entries',coalesce((select jsonb_agg(to_jsonb(t) order by day,created_at) from public.fv_ledger t where vendor_id=vendor and day between startday and endday),'[]'::jsonb),'rates',coalesce((select jsonb_agg(to_jsonb(t) order by effective desc,created_at desc) from public.fv_rates t where vendor_id=vendor),'[]'::jsonb),'history',coalesce((select jsonb_agg(to_jsonb(t) order by created_at desc) from public.fv_events t where order_id is null and data->>'vendor_id'=vendor and kind in('Rate','Price correction','Payment','Adjustment')),'[]'::jsonb),'vendors',coalesce((select jsonb_agg(v) from(select distinct data->>'vendor_id' as id,data->>'vendor_name' as name from public.fv_orders union select cfg->>'vendor_id',cfg->>'vendor_name')v),'[]'::jsonb));
 end if;
 if not (a->>'control')::boolean then raise exception 'Only the current in-charge or Admin/Director may make changes';end if;
 -- Serialize mutations: prevent duplicate finalisations, over-receipts and stale edits.
 perform pg_advisory_xact_lock(71620261);
 req:=(p->>'request_id')::uuid;if req is null then raise exception 'Request id required';end if;
 select t.result into result from public.fv_requests t where t.id=req and t.actor=(a->>'actor')::uuid;if found then return result;end if;
 select data into cfg from public.fv_settings where id;
 if action in ('settings','rate','price','payment','adjustment') and not (a->>'billing')::boolean then raise exception 'Admin/Director access required';end if;
 if action='settings' then
  d:=p->'data';if coalesce(length(trim(d->>'vendor_name')),0)<1 or coalesce(d->>'phone','') !~ '^[1-9][0-9]{7,14}$' then raise exception 'Vendor name and international phone are required';end if;
  for x in select value from jsonb_each(coalesce(d->'cutoffs','{}')) loop if x<>'null'::jsonb and ((x#>>'{}')::numeric<0 or (x#>>'{}')::numeric>10080) then raise exception 'Cutoff must be 0–10080 minutes';end if;end loop;
  d:=jsonb_build_object('vendor_id',case when d->>'phone'<>cfg->>'phone' or d->>'vendor_name'<>cfg->>'vendor_name' then gen_random_uuid()::text else cfg->>'vendor_id' end,'vendor_name',trim(d->>'vendor_name'),'phone',d->>'phone','cutoffs',coalesce(d->'cutoffs','{}'),'approved',coalesce(d->'approved','{}'));
  update public.fv_settings set data=d;insert into public.fv_events(kind,data,actor) values('Settings',jsonb_build_object('before',cfg,'after',d),(a->>'actor')::uuid);result:=d;
 elsif action='rate' then
  d:=p->'data';unitprice:=(d->>'price')::numeric;itemname:=trim(d->>'item');
  if unitprice is null or unitprice<0 or unitprice>1000000 or coalesce(itemname,'')='' or nullif(d->>'reason','') is null then raise exception 'Item, valid price and reason required';end if;
  insert into public.fv_rates(vendor_id,item,effective,price,actor) values(d->>'vendor_id',itemname,(d->>'effective')::date,unitprice,(a->>'actor')::uuid) returning id into rid;
  insert into public.fv_events(kind,data,actor) values('Rate',d||jsonb_build_object('rate_id',rid),(a->>'actor')::uuid);result:=jsonb_build_object('id',rid);
 elsif action in('payment','adjustment','price') then
  d:=p->'data';if nullif(trim(d->>'reason'),'') is null then raise exception 'Reason/reference required';end if;
  if action='price' then
   select to_jsonb(t) into old from public.fv_ledger t where id=(d->>'id')::uuid and kind='Receipt' for update;
   if old is null then raise exception 'Receipt charge not found';end if;
   unitprice:=(d->>'price')::numeric;if unitprice is null or unitprice<0 or unitprice>1000000 then raise exception 'Invalid price';end if;
   update public.fv_ledger set amount=round((data->>'quantity')::numeric*unitprice,2),data=data||jsonb_build_object('unit_price',unitprice) where id=(d->>'id')::uuid;
   insert into public.fv_events(kind,data,actor) values('Price correction',d||jsonb_build_object('vendor_id',old->>'vendor_id','before',old),(a->>'actor')::uuid);result:=d;
  else
   q:=(d->>'amount')::numeric;if q is null or q=0 or abs(q)>100000000 or (action='payment' and q<0) then raise exception 'Invalid amount';end if;
   insert into public.fv_ledger(vendor_id,day,kind,amount,data,actor) values(d->>'vendor_id',(d->>'date')::date,initcap(action),case when action='payment' then -q else q end,d,(a->>'actor')::uuid) returning id into rid;
   insert into public.fv_events(kind,data,actor) values(initcap(action),d||jsonb_build_object('ledger_id',rid),(a->>'actor')::uuid);result:=d;
  end if;
 elsif action in('claim','manual','release') then

  select to_jsonb(t) into rec from public.fv_messages t where id=(p->>'id')::uuid for update;if rec is null then raise exception 'Message not found';end if;
  if action='claim' then
   if not coalesce((cfg->'approved'->>(rec->>'kind'))::boolean,false) then raise exception 'Template approval must be confirmed in settings';end if;
   if rec->>'status' not in('Pending','Failed') then raise exception 'Already attempted; check status before sending again';end if;
   update public.fv_messages set status='Sending',error=null,updated_at=now() where id=(p->>'id')::uuid;
  elsif action='manual' then
   if rec->>'status' in('Accepted','Sent','Delivered','Read','Manual confirmed','Superseded') then raise exception 'Already sent; avoid duplicate messages';end if;
   if nullif(p->>'reason','') is null then raise exception 'Manual send confirmation is required';end if;
   update public.fv_messages set status='Manual confirmed',error=p->>'reason',updated_at=now() where id=(p->>'id')::uuid;
   insert into public.fv_events(order_id,kind,data,actor) values((rec->>'order_id')::uuid,'Manual confirmed',jsonb_build_object('message_id',p->>'id','note',p->>'reason'),(a->>'actor')::uuid);
  else
   if not (a->>'billing')::boolean or rec->>'status' not in('Unknown','Sending') or nullif(p->>'reason','') is null then raise exception 'Admin must verify non-delivery and record a reason before retry';end if;
   update public.fv_messages set status='Failed',error=p->>'reason',updated_at=now() where id=(p->>'id')::uuid;
   insert into public.fv_events(order_id,kind,data,actor) values((rec->>'order_id')::uuid,'Retry authorised',p-'request_id',(a->>'actor')::uuid);
  end if;result:=rec;
 else
  oid:=nullif(p->>'id','')::uuid;
  if oid is not null then select * into o from public.fv_orders where id=oid for update;if not found then raise exception 'Order not found';end if;
   if o.version<>coalesce((p->>'version')::integer,-1) then raise exception 'Order changed. Refresh and review before saving';end if;
  end if;
  if action in('save','finalise','modify') then
   if oid is not null and ((action in('save','finalise') and o.status<>'Draft') or (action='modify' and o.status<>'Ordered')) then raise exception 'Order is not editable in this state';end if;
   if action='modify' and oid is null then raise exception 'Existing order required';end if;
   d:=p->'data';if coalesce(d->>'slot','') not in('Tiffin','Morning Tea / Coffee','Lunch','Evening Tea / Coffee','Dinner') or nullif(d->>'date','') is null or nullif(d->>'delivery','') is null then raise exception 'Date, slot and delivery time required';end if;
   perform (d->>'date')::date;perform (d->>'delivery')::time;
   if coalesce(jsonb_typeof(d->'items'),'')<>'array' or jsonb_array_length(d->'items') not between 1 and 20 then raise exception 'Enter 1–20 food items';end if;
   old:=o.data;total:=0;
   for it in select value from jsonb_array_elements(d->'items') loop
    r:=(it->>'residents')::numeric;e:=(it->>'employees')::numeric;
    if nullif(trim(it->>'name'),'') is null or r is null or e is null or r<0 or e<0 or r<>trunc(r) or e<>trunc(e) or r+e>10000 then raise exception 'Item names and whole nonnegative quantities required';end if;total:=total+r+e;
   end loop;
   if total=0 then raise exception 'At least one portion required';end if;
   if (select count(distinct lower(trim(value->>'name'))) from jsonb_array_elements(d->'items'))<>jsonb_array_length(d->'items') then raise exception 'Combine duplicate item names';end if;
   if action='modify' then
    if exists(select 1 from public.fv_messages where order_id=oid and status in('Sending','Unknown')) then raise exception 'Resolve the earlier message outcome before modification';end if;
    cut:=(cfg->'cutoffs'->>(o.data->>'slot'))::numeric;
    if cut is null then raise exception 'Agreed modification cutoff has not been configured';end if;
    if now()>(((o.data->>'date')||' '||(o.data->>'delivery'))::timestamp at time zone 'Asia/Kolkata')-cut*interval '1 minute' then raise exception 'Vendor modification deadline has passed';end if;
    if d->>'date'<>o.data->>'date' or d->>'slot'<>o.data->>'slot' then raise exception 'A revision must keep the same date and meal slot';end if;
    if nullif(trim(p->>'reason'),'') is null then raise exception 'Modification reason required';end if;
   end if;
   d:=jsonb_build_object('date',d->>'date','slot',d->>'slot','delivery',d->>'delivery','items',d->'items','instructions',left(coalesce(d->>'instructions',''),1000),'vendor_id',coalesce(o.data->>'vendor_id',cfg->>'vendor_id'),'vendor_name',coalesce(o.data->>'vendor_name',cfg->>'vendor_name'),'phone',coalesce(o.data->>'phone',cfg->>'phone'));
   if oid is null then insert into public.fv_orders(data,status) values(d,case when action='save' then 'Draft' else 'Ordered' end) returning * into o;oid:=o.id;
   else update public.fv_orders set data=d,version=version+1,status=case when action='save' then 'Draft' else 'Ordered' end where id=oid returning * into o;end if;
   insert into public.fv_events(order_id,kind,data,actor) values(oid,action,jsonb_build_object('before',old,'after',d,'version',o.version,'reason',p->>'reason'),(a->>'actor')::uuid) returning id into eid;
   if action='modify' then update public.fv_messages set status='Superseded' where order_id=oid and status in('Pending','Failed');end if;
   if action<>'save' then insert into public.fv_messages(event_id,order_id,kind,snapshot) values(eid,oid,case when action='modify' then 'modification' else 'order' end,d||jsonb_build_object('id',oid,'version',o.version,'reason',p->>'reason','before',old)) returning id into mid;end if;
  elsif action='receive' then
   if oid is null or o.status not in('Ordered','Partial') then raise exception 'Select an open finalised order';end if;
   d:=p->'data';if coalesce(jsonb_typeof(d->'items'),'')<>'array' or jsonb_array_length(d->'items')<>jsonb_array_length(o.data->'items') then raise exception 'Receipt items must match order';end if;
   if nullif(d->>'received_at','') is null or (d->>'received_at')::timestamptz>now()+interval '5 minutes' or (d->>'received_at')::timestamptz<o.created_at-interval '1 day' then raise exception 'Enter the actual receipt time';end if;
   total:=0;i:=0;
   for it in select value from jsonb_array_elements(d->'items') loop
    r:=(it->>'residents')::numeric;e:=(it->>'employees')::numeric;rej:=(it->>'rejected')::numeric;
    if r is null or e is null or rej is null or r<0 or e<0 or rej<0 or r<>trunc(r) or e<>trunc(e) or rej<>trunc(rej) then raise exception 'Receipt quantities must be whole nonnegative numbers';end if;
    select coalesce(sum((data->'items'->i->>'residents')::numeric),0) into already from public.fv_events where order_id=oid and kind='receive';
    if already+r>(o.data->'items'->i->>'residents')::numeric then raise exception 'Resident receipts exceed order';end if;
    select coalesce(sum((data->'items'->i->>'employees')::numeric),0) into already from public.fv_events where order_id=oid and kind='receive';
    if already+e>(o.data->'items'->i->>'employees')::numeric then raise exception 'Employee receipts exceed order';end if;
    if rej>10000 then raise exception 'Rejected quantity is too large';end if;
    total:=total+r+e+rej;i:=i+1;
   end loop;
   if total=0 then raise exception 'Enter quantities received or rejected';end if;
   if exists(select 1 from jsonb_array_elements(d->'items')t where (t->>'rejected')::numeric>0) and nullif(trim(d->>'remarks'),'') is null then raise exception 'Reason required for rejected food';end if;
   d:=jsonb_build_object('items',d->'items','received_at',(d->>'received_at')::timestamptz,'remarks',left(coalesce(d->>'remarks',''),1000));
   insert into public.fv_events(order_id,kind,data,actor) values(oid,'receive',d,(a->>'actor')::uuid) returning id into eid;
   i:=0;for it in select value from jsonb_array_elements(d->'items') loop
    itemname:=o.data->'items'->i->>'name';q:=(it->>'residents')::numeric+(it->>'employees')::numeric;
    if q>0 then
     select price into unitprice from public.fv_rates where vendor_id=o.data->>'vendor_id' and lower(trim(item))=lower(trim(itemname)) and effective<=(o.data->>'date')::date order by effective desc,created_at desc limit 1;
     insert into public.fv_ledger(vendor_id,day,kind,amount,data,actor) values(o.data->>'vendor_id',(o.data->>'date')::date,'Receipt',round(q*unitprice,2),jsonb_build_object('order_id',oid,'receipt_id',eid,'slot',o.data->>'slot','item',itemname,'quantity',q,'residents',it->'residents','employees',it->'employees','unit_price',unitprice),(a->>'actor')::uuid);
    end if;i:=i+1;
   end loop;
   select coalesce(sum((t->>'residents')::numeric+(t->>'employees')::numeric),0) into total from public.fv_events f cross join lateral jsonb_array_elements(f.data->'items')t where f.order_id=oid and f.kind='receive';
   select sum((t->>'residents')::numeric+(t->>'employees')::numeric) into q from jsonb_array_elements(o.data->'items')t;
   update public.fv_orders set status=case when total=q then 'Received' else 'Partial' end,version=version+1 where id=oid returning * into o;
   insert into public.fv_messages(event_id,order_id,kind,snapshot) values(eid,oid,'receipt',o.data||jsonb_build_object('id',oid,'version',o.version,'receipt',d,'receipt_id',eid,'outstanding',q-total)) returning id into mid;
  elsif action='close' then
   if oid is null or o.status not in('Ordered','Partial') or nullif(trim(p->>'reason'),'') is null then raise exception 'Open order and closure reason required';end if;
   update public.fv_orders set status='Closed',version=version+1 where id=oid returning * into o;insert into public.fv_events(order_id,kind,data,actor) values(oid,'close',jsonb_build_object('reason',p->>'reason'),(a->>'actor')::uuid);
  else raise exception 'Unknown operation';end if;
  result:=jsonb_build_object('order',to_jsonb(o),'message_id',mid);
 end if;
 insert into public.fv_requests(id,actor,result) values(req,(a->>'actor')::uuid,coalesce(result,'{}'));return result;
end $$;
revoke all on function public.fv_access() from public;grant execute on function public.fv_access() to authenticated;
revoke all on function public.fv_rpc(text,jsonb) from public;grant execute on function public.fv_rpc(text,jsonb) to authenticated;
-- Provider state can arrive before the HTTP send response is saved. Retain and reconcile it.
create or replace function public.fv_apply_provider_status(p_id text,p_status text,p_detail text,p_at timestamptz) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare prior text;chosen text;
begin
 if p_status not in ('Accepted','Sent','Delivered','Read','Failed') then return;end if;
 perform pg_advisory_xact_lock(hashtext(p_id));
 select status into prior from public.fv_provider_status where id=p_id;
 chosen:=case when prior='Read' then 'Read' when prior='Delivered' and p_status<>'Read' then 'Delivered' when prior='Failed' and p_status in('Accepted','Sent') then 'Failed' when prior='Sent' and p_status='Accepted' then 'Sent' else p_status end;
 insert into public.fv_provider_status values(p_id,chosen,p_detail,p_at) on conflict(id) do update set status=excluded.status,detail=coalesce(excluded.detail,fv_provider_status.detail),at=greatest(excluded.at,fv_provider_status.at);
 update public.fv_messages set status=chosen,error=case when chosen='Failed' then coalesce(p_detail,'Meta delivery failure') else null end,updated_at=now() where provider_id=p_id and status<>'Manual confirmed';
end $$;
revoke all on function public.fv_apply_provider_status(text,text,text,timestamptz) from public;
grant execute on function public.fv_apply_provider_status(text,text,text,timestamptz) to service_role;
commit;

