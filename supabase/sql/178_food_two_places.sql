-- SAMARA CARE ERP 2.15.36 — Food Vendor: two delivery places.
--   Samara Main - Mogappair  (all existing orders, receipts, rates and balance)
--   AppGeo - Saidapet        (new)
-- Each place is its own vendor account: separate orders (one per date + meal per place), WhatsApp,
-- receipt, cancellation, rates, statement and balance. Mrs. Yuvashree supplies both for now; the
-- AppGeo vendor can be changed later in Settings without touching Samara Main.
-- Nothing is deleted. ALL-OR-NOTHING: if the live fv_rpc is not what this script expects, it stops
-- and nothing changes. Run this whole file once in Supabase > SQL Editor. Safe to run again.
begin;

-- 1. Places in settings (main mirrors the existing vendor; AppGeo gets its own account id).
update public.fv_settings set data=data||jsonb_build_object('places',jsonb_build_array(
  jsonb_build_object('key','main','name','Samara Main - Mogappair','vendor_id',data->>'vendor_id','vendor_name',data->>'vendor_name','phone',data->>'phone'),
  jsonb_build_object('key','appgeo','name','AppGeo - Saidapet','vendor_id',gen_random_uuid()::text,'vendor_name',data->>'vendor_name','phone',data->>'phone')))
 where id and jsonb_typeof(data->'places') is distinct from 'array';

-- 2. AppGeo starts with the same current rates as Samara Main (each can be changed separately later).
insert into public.fv_rates(vendor_id,item,effective,price,actor)
select pl->>'vendor_id',r.item,r.effective,r.price,r.actor
from public.fv_settings s
cross join lateral jsonb_array_elements(s.data->'places') pl
join lateral (select distinct on (item) item,effective,price,actor from public.fv_rates
              where vendor_id=s.data->>'vendor_id' order by item,effective desc,created_at desc) r on true
where s.id and pl->>'key'='appgeo'
  and not exists(select 1 from public.fv_rates x where x.vendor_id=pl->>'vendor_id');

-- 3. Existing orders belong to Samara Main.
update public.fv_orders set data=data||jsonb_build_object('place','Samara Main - Mogappair','place_key','main')
 where not (data ? 'place_key');

-- 4. Settings as seen by one request: the chosen place's vendor account (default Samara Main).
create or replace function public.fv_place_cfg(cfg jsonb,p jsonb) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare pl jsonb; k text:=nullif(trim(coalesce(p->>'place','')),'');
begin
 if cfg is null or jsonb_typeof(cfg->'places') is distinct from 'array' then return cfg;end if;
 if k is null or k='main' then
  select value into pl from jsonb_array_elements(cfg->'places') where value->>'key'='main';
  return cfg||jsonb_build_object('place',coalesce(pl->>'name','Samara Main - Mogappair'),'place_key','main');
 end if;
 select value into pl from jsonb_array_elements(cfg->'places') where value->>'key'=k;
 if pl is null then raise exception 'Unknown delivery place: %',k;end if;
 return cfg||jsonb_build_object('vendor_id',pl->>'vendor_id','vendor_name',pl->>'vendor_name','phone',pl->>'phone','place',pl->>'name','place_key',k);
end $$;

-- 5. Saving vendor settings keeps the places; Samara Main's entry follows the main vendor fields.
create or replace function public.fv_merge_settings(old jsonb,new jsonb) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select case when jsonb_typeof(old->'places') is distinct from 'array' then new
  else new||jsonb_build_object('places',(select jsonb_agg(case when value->>'key'='main'
       then value||jsonb_build_object('vendor_id',new->>'vendor_id','vendor_name',new->>'vendor_name','phone',new->>'phone') else value end order by ord)
     from jsonb_array_elements(old->'places') with ordinality t(value,ord))) end
$$;

-- 6. Admin / Director: set the vendor for AppGeo (or another non-main place). Changing the vendor's
--    name or number opens a new account, exactly as for Samara Main (old balance stays on the old one).
create or replace function public.fv_set_place_vendor(p_place text,p_vendor_name text,p_phone text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb:=public.fv_access(); cfg jsonb; pl jsonb; places jsonb; newid text;
begin
 if not coalesce((a->>'billing')::boolean,false) then raise exception 'Admin/Director access required';end if;
 if coalesce(p_place,'') in ('','main') then raise exception 'Change the Samara Main vendor in Vendor & WhatsApp settings';end if;
 if coalesce(length(trim(p_vendor_name)),0)<1 or coalesce(p_phone,'') !~ '^[1-9][0-9]{7,14}$' then raise exception 'Vendor name and international phone are required';end if;
 select data into cfg from public.fv_settings where id for update;
 select value into pl from jsonb_array_elements(cfg->'places') where value->>'key'=p_place;
 if pl is null then raise exception 'Unknown delivery place';end if;
 newid:=case when pl->>'phone'<>p_phone or pl->>'vendor_name'<>trim(p_vendor_name) then gen_random_uuid()::text else pl->>'vendor_id' end;
 select jsonb_agg(case when value->>'key'=p_place then value||jsonb_build_object('vendor_id',newid,'vendor_name',trim(p_vendor_name),'phone',p_phone) else value end order by ord)
   into places from jsonb_array_elements(cfg->'places') with ordinality t(value,ord);
 update public.fv_settings set data=data||jsonb_build_object('places',places) where id;
 insert into public.fv_events(kind,data,actor) values('Settings',jsonb_build_object('place',p_place,'before',pl,'after',pl||jsonb_build_object('vendor_id',newid,'vendor_name',trim(p_vendor_name),'phone',p_phone)),(a->>'actor')::uuid);
 return jsonb_build_object('place',p_place,'vendor_id',newid,'new_account',newid<>pl->>'vendor_id');
end $$;
revoke all on function public.fv_set_place_vendor(text,text,text) from public,anon;
grant execute on function public.fv_set_place_vendor(text,text,text) to authenticated;
revoke all on function public.fv_place_cfg(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.fv_merge_settings(jsonb,jsonb) from public,anon,authenticated;

-- 7. Patch the live fv_rpc: per-place settings, place stored on each order, places kept on save.
do $patch$
declare src text:=pg_get_functiondef('public.fv_rpc(text,jsonb)'::regprocedure); updated text;
 cfg_old text:='select data into cfg from public.fv_settings where id;';
 cfg_new text:='select public.fv_place_cfg(data,p) into cfg from public.fv_settings where id;';
 build_old text:='''phone'',coalesce(o.data->>''phone'',cfg->>''phone''))';
 build_new text:='''phone'',coalesce(o.data->>''phone'',cfg->>''phone''),''place'',coalesce(o.data->>''place'',cfg->>''place''),''place_key'',coalesce(o.data->>''place_key'',cfg->>''place_key''))';
 save_old text:='update public.fv_settings set data=d where id=true;';
 save_old2 text:='update public.fv_settings set data=d;';
 save_new text:='update public.fv_settings set data=public.fv_merge_settings(data,d) where id=true;';
begin
 if position('fv_place_cfg' in src)>0 then raise notice 'fv_rpc already has places';return;end if;
 if position(cfg_old in src)=0 or position(build_old in src)=0 or (position(save_old in src)=0 and position(save_old2 in src)=0) then
  raise exception 'Two-places migration stopped: unexpected current fv_rpc definition. Nothing was changed.';
 end if;
 updated:=replace(src,cfg_old,cfg_new);
 updated:=replace(updated,build_old,build_new);
 updated:=replace(replace(updated,save_old,save_new),save_old2,save_new);
 execute updated;
end $patch$;

-- 8. One open order per date + meal + place (each place has its own vendor account).
drop index if exists public.fv_order_slot;
create unique index fv_order_slot on public.fv_orders((data->>'date'),(data->>'slot'),(data->>'vendor_id'),(coalesce(data->>'place_key','main'))) where status <> 'Closed';

commit;
notify pgrst, 'reload schema';

-- Check: two places, each with its own vendor account; existing orders on Samara Main.
select p->>'name' as place, p->>'vendor_name' as vendor, p->>'phone' as phone, p->>'vendor_id' as account,
       (select count(*) from public.fv_orders o where coalesce(o.data->>'place_key','main')=p->>'key') as orders,
       (select count(*) from public.fv_rates r where r.vendor_id=p->>'vendor_id') as rates
from public.fv_settings s, jsonb_array_elements(s.data->'places') p where s.id;
