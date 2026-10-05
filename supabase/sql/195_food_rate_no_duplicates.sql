-- Samara ERP v2.15.63
-- Food Vendor rates: one rate per place (vendor) + meal category + effective date.
--  * Removes existing duplicates (keeps the LATEST saved row for that date, which is the one in use).
--  * Unique index stops duplicates for good.
--  * fv_save_rate: same price again for the same date -> refused ("already saved");
--    a different price for the same date -> that date's rate is CORRECTED (old price kept in history).
-- Run after 194. Safe to run again.
begin;

-- 1. Remove duplicates, keeping the most recently saved row per vendor + item + effective date.
with ranked as (
 select id, row_number() over (partition by vendor_id,item,effective order by created_at desc, id desc) rn
 from public.fv_rates
)
delete from public.fv_rates r using ranked x where r.id=x.id and x.rn>1;

-- 2. Never again.
create unique index if not exists fv_rates_one_per_day on public.fv_rates(vendor_id,item,effective);

-- 3. Save rate: refuse exact duplicates, correct a same-date rate in place.
create or replace function public.fv_save_rate(p jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb := public.fv_access(); d jsonb := coalesce(p->'data','{}'::jsonb);
 v_item text := trim(coalesce(d->>'item','')); vendor text := nullif(trim(coalesce(d->>'vendor_id','')),'');
 v_price numeric := (d->>'price')::numeric; eff date := (d->>'effective')::date; why text := trim(coalesce(d->>'reason',''));
 base text; rid uuid; existing public.fv_rates; l public.fv_ledger; x jsonb; n integer := 0; before_total numeric := 0; after_total numeric := 0; corrected boolean := false;
begin
 if not coalesce((a->>'billing')::boolean,false) then raise exception 'Admin/Director access required';end if;
 if v_item not in ('Tiffin','Lunch','Dinner','Coffee/Tea','Tiffin (Employee)','Lunch (Employee)','Dinner (Employee)') then raise exception 'Select a valid meal category';end if;
 if vendor is null then raise exception 'Select the vendor / place';end if;
 if v_price is null or v_price<0 or v_price>1000000 then raise exception 'Enter a valid price';end if;
 if eff is null then raise exception 'Enter the effective date';end if;
 if why='' then raise exception 'Reason for rate required';end if;
 select * into existing from public.fv_rates where vendor_id=vendor and fv_rates.item=v_item and effective=eff for update;
 if found then
  if existing.price=v_price then
   raise exception 'This rate is already saved (same meal, price and effective date). Nothing was added.';
  end if;
  update public.fv_rates set price=v_price, actor=(a->>'actor')::uuid, created_at=now() where id=existing.id returning id into rid;
  corrected := true;
  insert into public.fv_events(kind,data,actor) values('Rate',d||jsonb_build_object('rate_id',rid,'corrected_from',existing.price),(a->>'actor')::uuid);
 else
  insert into public.fv_rates(vendor_id,item,effective,price,actor) values(vendor,v_item,eff,v_price,(a->>'actor')::uuid) returning id into rid;
  insert into public.fv_events(kind,data,actor) values('Rate',d||jsonb_build_object('rate_id',rid),(a->>'actor')::uuid);
 end if;
 if coalesce((p->>'reprice')::boolean,false) then
  base := replace(v_item,' (Employee)','');
  for l in select * from public.fv_ledger t
    where t.vendor_id=vendor and t.kind='Receipt' and t.day>=eff
     and coalesce(t.data->>'rate_category',t.data->>'slot')=base
     and not exists(select 1 from public.fv_events ev where ev.kind='Price correction' and ev.data->>'id'=t.id::text)
    for update
  loop
   x := public.fv_priced_receipt(l.vendor_id, l.day, l.data);
   if (x->>'amount')::numeric is distinct from l.amount then
    before_total := before_total + coalesce(l.amount,0); after_total := after_total + coalesce((x->>'amount')::numeric,0);
    update public.fv_ledger set amount=(x->>'amount')::numeric, data=x->'data' where id=l.id;
    n := n+1;
   end if;
  end loop;
  if n>0 then
   insert into public.fv_events(kind,data,actor) values('Price correction',
    jsonb_build_object('vendor_id',vendor,'reason','Re-priced '||n||' receipt(s) from '||to_char(eff,'DD-MM-YYYY')||' after rate change ('||v_item||'): '||why,
     'repriced',n,'before_total',before_total,'after_total',after_total,'rate_id',rid),(a->>'actor')::uuid);
  end if;
 end if;
 return jsonb_build_object('id',rid,'corrected',corrected,'repriced',n,'before_total',before_total,'after_total',after_total);
end $$;
revoke all on function public.fv_save_rate(jsonb) from public,anon;
grant execute on function public.fv_save_rate(jsonb) to authenticated;

commit;
