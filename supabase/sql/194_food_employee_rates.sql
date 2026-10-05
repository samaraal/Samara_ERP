-- Samara ERP v2.15.62
-- Food Vendor: separate Guest (resident) and Employee prices for Breakfast (Tiffin), Lunch and Dinner.
-- Coffee/Tea keeps one price.
--
-- * Existing rates ('Tiffin','Lunch','Dinner') are the GUEST price.
-- * New rate items 'Tiffin (Employee)','Lunch (Employee)','Dinner (Employee)' are the EMPLOYEE price.
--   Until an Employee price exists, employees are charged the Guest price (same as before).
-- * Every receipt charge is priced as  Guest qty x Guest rate + Employee qty x Employee rate,
--   by a trigger on fv_ledger, so fv_rpc (receive) is NOT modified.
-- * fv_save_rate: Admin/Director saves a rate and (optionally) re-prices receipts already entered
--   from the effective date. Receipts corrected by hand (Receipt prices) are never re-priced.
-- * fv_correct_receipt_price: hand correction with separate Guest / Employee price.
-- Run after 104, 178 and 193. Safe to run again.
begin;

create or replace function public.fv_rate_at(p_vendor text, p_item text, p_day date)
returns numeric language sql stable set search_path=public,pg_temp as $$
 select price from public.fv_rates where vendor_id=p_vendor and item=p_item and effective<=p_day
 order by effective desc, created_at desc limit 1
$$;

-- Price one receipt ledger row. p_guest / p_emp override the rate lookup (hand correction).
create or replace function public.fv_priced_receipt(p_vendor text, p_day date, p_data jsonb,
  p_guest numeric default null, p_emp numeric default null, p_use_override boolean default false)
returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare cat text := coalesce(p_data->>'rate_category',
          case when p_data->>'slot' in ('Morning Tea / Coffee','Evening Tea / Coffee') then 'Coffee/Tea' else p_data->>'slot' end);
 r numeric := coalesce((p_data->>'residents')::numeric,0);
 e numeric := coalesce((p_data->>'employees')::numeric,0);
 gp numeric; ep numeric; amt numeric;
begin
 if r=0 and e=0 then r := coalesce((p_data->>'quantity')::numeric,0); end if;
 if p_use_override then
  gp := p_guest; ep := coalesce(p_emp, p_guest);
 else
  gp := public.fv_rate_at(p_vendor, cat, p_day);
  ep := case when cat in ('Tiffin','Lunch','Dinner') then coalesce(public.fv_rate_at(p_vendor, cat||' (Employee)', p_day), gp) else gp end;
 end if;
 if cat not in ('Tiffin','Lunch','Dinner') then ep := gp; end if;
 if (r>0 and gp is null) or (e>0 and ep is null) then amt := null;
 else amt := round(r*coalesce(gp,0) + e*coalesce(ep,0), 2); end if;
 return jsonb_build_object('amount', amt, 'data', p_data || jsonb_build_object(
   'rate_category', cat, 'unit_price', gp, 'employee_unit_price', ep,
   'resident_amount', case when gp is null then null else round(r*gp,2) end,
   'employee_amount', case when ep is null then null else round(e*ep,2) end));
end $$;

create or replace function public.fv_ledger_price_receipt()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare x jsonb;
begin
 if new.kind='Receipt' and new.data ? 'order_id' then
  x := public.fv_priced_receipt(new.vendor_id, new.day, new.data);
  new.amount := (x->>'amount')::numeric;
  new.data := x->'data';
 end if;
 return new;
end $$;
drop trigger if exists fv_ledger_price_receipt on public.fv_ledger;
create trigger fv_ledger_price_receipt before insert on public.fv_ledger
 for each row execute function public.fv_ledger_price_receipt();

create or replace function public.fv_save_rate(p jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb := public.fv_access(); d jsonb := coalesce(p->'data','{}'::jsonb);
 item text := trim(coalesce(d->>'item','')); vendor text := nullif(trim(coalesce(d->>'vendor_id','')),'');
 price numeric := (d->>'price')::numeric; eff date := (d->>'effective')::date; why text := trim(coalesce(d->>'reason',''));
 base text; rid uuid; l public.fv_ledger; x jsonb; n integer := 0; before_total numeric := 0; after_total numeric := 0;
begin
 if not coalesce((a->>'billing')::boolean,false) then raise exception 'Admin/Director access required';end if;
 if item not in ('Tiffin','Lunch','Dinner','Coffee/Tea','Tiffin (Employee)','Lunch (Employee)','Dinner (Employee)') then raise exception 'Select a valid meal category';end if;
 if vendor is null then raise exception 'Select the vendor / place';end if;
 if price is null or price<0 or price>1000000 then raise exception 'Enter a valid price';end if;
 if eff is null then raise exception 'Enter the effective date';end if;
 if why='' then raise exception 'Reason for rate required';end if;
 insert into public.fv_rates(vendor_id,item,effective,price,actor) values(vendor,item,eff,price,(a->>'actor')::uuid) returning id into rid;
 insert into public.fv_events(kind,data,actor) values('Rate',d||jsonb_build_object('rate_id',rid),(a->>'actor')::uuid);
 if coalesce((p->>'reprice')::boolean,false) then
  base := replace(item,' (Employee)','');
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
    jsonb_build_object('vendor_id',vendor,'reason','Re-priced '||n||' receipt(s) from '||to_char(eff,'DD-MM-YYYY')||' after rate change ('||item||'): '||why,
     'repriced',n,'before_total',before_total,'after_total',after_total,'rate_id',rid),(a->>'actor')::uuid);
  end if;
 end if;
 return jsonb_build_object('id',rid,'repriced',n,'before_total',before_total,'after_total',after_total);
end $$;
revoke all on function public.fv_save_rate(jsonb) from public,anon;
grant execute on function public.fv_save_rate(jsonb) to authenticated;

create or replace function public.fv_correct_receipt_price(p_id uuid, p_guest_price numeric, p_employee_price numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb := public.fv_access(); old public.fv_ledger; x jsonb;
begin
 if not coalesce((a->>'billing')::boolean,false) then raise exception 'Admin/Director access required';end if;
 if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Reason required';end if;
 if p_guest_price is null or p_guest_price<0 or p_guest_price>1000000 or (p_employee_price is not null and (p_employee_price<0 or p_employee_price>1000000)) then raise exception 'Invalid price';end if;
 select * into old from public.fv_ledger where id=p_id and kind='Receipt' for update;
 if not found then raise exception 'Receipt charge not found';end if;
 x := public.fv_priced_receipt(old.vendor_id, old.day, old.data, p_guest_price, p_employee_price, true);
 update public.fv_ledger set amount=(x->>'amount')::numeric, data=x->'data' where id=p_id;
 insert into public.fv_events(kind,data,actor) values('Price correction',
  jsonb_build_object('id',p_id,'price',p_guest_price,'employee_price',coalesce(p_employee_price,p_guest_price),'reason',trim(p_reason),'vendor_id',old.vendor_id,'before',to_jsonb(old)),(a->>'actor')::uuid);
 return jsonb_build_object('id',p_id,'amount',(x->>'amount')::numeric);
end $$;
revoke all on function public.fv_correct_receipt_price(uuid,numeric,numeric,text) from public,anon;
grant execute on function public.fv_correct_receipt_price(uuid,numeric,numeric,text) to authenticated;

commit;
