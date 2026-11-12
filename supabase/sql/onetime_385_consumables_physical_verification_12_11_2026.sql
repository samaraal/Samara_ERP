-- Samara Care ERP — CONSUMABLES PHYSICAL VERIFICATION 12-11-2026 (Boomi)  · run ONCE in Supabase SQL Editor
-- Source: "Consumables — Stock Report (Remaining Quantity)" printed 12-11-2026 01:43 PM with the shelf count and MRP
-- written in pencil, and Boomi's decisions of 12-11-2026:
--   • every item: ERP brought to the shelf count (counted after the 3:50 PM issues; Nebulizer Mask Adult counted before its
--     3:51 PM issue, so it stays 2). Extra -> "Opening Stock – Physical Verification 12-11-2026"; less -> "Unknown Usage – …"
--     (Adjustment Out, never charged to any Guest)
--   • Guest charge rate = pencil MRP, except Bed Pan: MRP ₹50, chargeable ₹350. MRP is now also kept per item (new column mrp).
--   • 3M Micropore 1530 split: 1 inch (CON-0124) 12 rolls ₹278 · 3 inch (CON-0091 switched back on) 4 rolls ₹139
--   • Examination Gloves: 20 issued to the Kitchen (Department Issue; added to Kitchen / Food Stores stock)
--   • Resource Diabetic Vanilla (CON-0120): removed from Stores. High concentration Mask: KEPT (2).
--   • Airway 2 (9cm) (CON-0076) switched back on (1, ₹151)
--   • General use, not charged to Guests (₹0, stock unchanged): COTTON 400, Dynaplast, Lancets
--   • New item: Apron — 8 Nos, MRP ₹100
-- Every rate change is logged in Charge Master rate history; it applies to new charges only (old bills unchanged).
-- One transaction: if any code / name does not match, NOTHING is changed. Cannot be applied twice.
begin;
alter table public.consumable_store_items add column if not exists mrp numeric;

do $pv$
declare
  c_vno constant text := 'PV-CON-12-11-2026';
  c_label constant text := 'Physical Verification 12-11-2026';
  v_pv uuid; v_actor uuid; v_actor_name text; r record; v_bal numeric; v_diff numeric; v_led uuid; v_bad text := '';
  v_code text; v_new uuid; v_k uuid;
begin
  if exists(select 1 from public.store_physical_verifications where verification_no=c_vno) then
    raise exception '% was already applied. Nothing done.', c_vno;
  end if;
  select p.id, coalesce(nullif(p.full_name,''),'Admin') into v_actor, v_actor_name
    from public.profiles p where p.role='Admin' and coalesce(p.is_active,true) order by p.created_at nulls last limit 1;
  v_actor_name := coalesce(v_actor_name,'Admin')||' (Physical Verification)';

  create temp table pv(code text primary key, name_check text, shelf numeric, rate numeric, mrp numeric) on commit drop;
  insert into pv values
     ('CON-0103','3',4,null,150),
     ('CON-0104','3',8,287,287),
     ('CON-0124','micropore',12,null,278),
     ('CON-0001','adult diaper',80,92,92),
     ('CON-0076','airway',1,151,151),
     ('CON-0021','alcohol swab',70,3,3),
     ('CON-0106','bain',1,null,3542),
     ('CON-0011','bed pan',2,null,50),
     ('CON-0112','cotton',null,0,null),
     ('CON-0025','digital thermometer',10,195,195),
     ('CON-0113','dispen',2,85,85),
     ('CON-0122','disposable gown',16,600,600),
     ('CON-0008','disposable syringe',15,9.45,9.45),
     ('CON-0070','disposable syringe',17,11.25,11.25),
     ('CON-0017','disposable syringe',20,14.63,14.63),
     ('CON-0084','dynaplast',null,0,null),
     ('CON-0114','easy bath',16,null,364),
     ('CON-0085','ecg lead',20,null,null),
     ('CON-0010','examination glove',1000,null,15),
     ('CON-0063','feeding syringe',12,194,194),
     ('CON-0086','foley',1,null,168),
     ('CON-0087','foley',1,null,164),
     ('CON-0088','gauze',19,null,55),
     ('CON-0065','glucostrip',93,15,15),
     ('CON-0033','hand sanitizer',6,667,667),
     ('CON-0074','high concentration',2,null,null),
     ('CON-0068','insulin syringe',31,11.5,11.5),
     ('CON-0072','iv set',6,275,275),
     ('CON-0090','k 90',2,90,90),
     ('CON-0009','kidney tray',12,null,null),
     ('CON-0050','lancet',null,0,null),
     ('CON-0048','nebulizer mask',2,545,545),
     ('CON-0118','nebulizer',2,585,585),
     ('CON-0125','nitrile',500,null,25),
     ('CON-0034','oxygen mask',1,361,361),
     ('CON-0057','oxygen nasal',1,null,395),
     ('CON-0075','ryle',5,86,86),
     ('CON-0101','ryle',4,86,86),
     ('CON-0042','scalp vein',1,null,25),
     ('CON-0121','sputum',1,null,null),
     ('CON-0060','sterile dressing',4,160,160),
     ('CON-0092','sterile glove',11,null,97),
     ('CON-0093','sterile glove',11,null,91),
     ('CON-0094','sterile glove',9,null,91),
     ('CON-0041','suction catheter',61,null,100),
     ('CON-0052','suction catheter',50,null,100),
     ('CON-0028','surgical mask',100,null,10),
     ('CON-0119','tissue',16,48,48),
     ('CON-0105','trach',1,null,566),
     ('CON-0107','tracheostomy',1,null,2043),
     ('CON-0108','tracheostomy',1,null,2043),
     ('CON-0006','underpad',60,72,72),
     ('CON-0089','urinal can',2,40,40),
     ('CON-0095','urobag',1,379,379),
     ('CON-0102','vacuum',3,597,597),
     ('CON-0023','venflon 18',2,null,523),
     ('CON-0030','venflon 20',8,353,353),
     ('CON-0047','venflon 22',19,353,353),
     ('CON-0091','micropore',4,139,139);

  for r in select s.*, i.id, i.item_name from pv s left join public.consumable_store_items i on i.item_code=s.code loop
    if r.id is null then v_bad := v_bad||r.code||' not found; ';
    elsif position(r.name_check in regexp_replace(lower(r.item_name),'[^a-z0-9 ]','','g'))=0
      and position(replace(r.name_check,' ','') in regexp_replace(lower(r.item_name),'[^a-z0-9]','','g'))=0 then
      v_bad := v_bad||r.code||' is "'||r.item_name||'"; ';
    end if;
  end loop;
  if not exists(select 1 from public.consumable_store_items where item_code='CON-0120' and lower(item_name) like '%resource%') then v_bad := v_bad||'CON-0120 not Resource; '; end if;
  if v_bad<>'' then raise exception 'STOPPED — the ERP item list does not match the count sheet: %', v_bad; end if;

  insert into public.store_physical_verifications(verification_no,section,count_at,applied_by,applied_by_name,notes)
  values(c_vno,'Consumables',now(),v_actor,v_actor_name,
    'Pencil count + MRP on the Stock Report printed 12-11-2026 01:43 PM; Micropore split, gloves to Kitchen, Resource Diabetic removed, Apron added (Boomi)')
  returning id into v_pv;
  insert into public.store_item_snapshots(verification_id,item,balance)
  select v_pv, to_jsonb(i), (select coalesce(sum(l.qty_in),0)-coalesce(sum(l.qty_out),0) from public.consumable_store_ledger l where l.item_id=i.id and l.voided_at is null)
    from public.consumable_store_items i where coalesce(i.item_category,'Consumables')='Consumables';

  -- switched back on / renamed
  update public.consumable_store_items set active=true where item_code in ('CON-0076','CON-0091');
  update public.consumable_store_items set item_name='3M Micropore 1530 - 1 inch' where item_code='CON-0124';
  update public.consumable_store_items set item_name='3M Micropore 1530 - 3 inch' where item_code='CON-0091';

  -- rates (Guest charge) and MRP
  update public.consumable_store_items i set charge_rate=s.rate from pv s where s.code=i.item_code and s.rate is not null and i.charge_rate is distinct from s.rate;
  update public.consumable_store_items i set mrp=s.mrp from pv s where s.code=i.item_code and s.mrp is not null;
  update public.consumable_store_items set charge_rate=350, mrp=50 where item_code='CON-0011';   -- Bed Pan: MRP 50, chargeable 350

  -- Examination Gloves: 20 to the Kitchen
  select id into v_k from public.consumable_store_items where item_code='CON-0010';
  select coalesce(sum(qty_in),0)-coalesce(sum(qty_out),0) into v_bal from public.consumable_store_ledger where item_id=v_k and voided_at is null;
  insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
  values(v_k,'Department Issue',0,20,v_bal-20,'Issued to Kitchen – '||c_label,'20 Nos allotted to the Kitchen (Boomi)',v_actor,v_actor_name);
  insert into public.kitchen_stock(name,unit,quantity) values('Examination Gloves','Nos',0) on conflict (name,unit) do nothing;
  update public.kitchen_stock set quantity=quantity+20 where name='Examination Gloves' and unit='Nos' returning id into v_new;
  insert into public.kitchen_stock_moves(item_id,quantity,kind,reason,actor) values(v_new,20,'Received from Stores','From Consumables (CON-0010) – '||c_label,v_actor);

  -- shelf count
  for r in select s.*, i.id, i.item_name from pv s join public.consumable_store_items i on i.item_code=s.code where s.shelf is not null order by s.code loop
    select coalesce(sum(qty_in),0)-coalesce(sum(qty_out),0) into v_bal from public.consumable_store_ledger where item_id=r.id and voided_at is null;
    v_diff := r.shelf-v_bal; v_led := null;
    if v_diff<>0 then
      insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
      values(r.id, case when v_diff>0 then 'Adjustment In' else 'Adjustment Out' end, greatest(v_diff,0), greatest(-v_diff,0), r.shelf,
        case when v_diff>0 then 'Opening Stock – '||c_label else 'Unknown Usage – '||c_label end,
        'Shelf count '||r.shelf||' · ERP '||v_bal||case when v_diff<0 then ' · not charged to any Guest' else '' end,
        v_actor, v_actor_name)
      returning id into v_led;
    end if;
    insert into public.store_physical_verification_lines(verification_id,item_id,item_code,item_name,action,erp_at_count,moved_since_count,shelf_count,adjustment,ledger_id,note)
    values(v_pv,r.id,r.code,r.item_name, case when v_diff>0 then 'Opening Stock' when v_diff<0 then 'Unknown Usage' else 'Matches' end,
      v_bal,0,r.shelf,v_diff,v_led, case when r.rate is not null then 'rate ₹'||r.rate else null end);
  end loop;

  -- general use (not charged; stock unchanged)
  insert into public.store_physical_verification_lines(verification_id,item_id,item_code,item_name,action,note)
  select v_pv,i.id,i.item_code,i.item_name,'General use — not charged to Guests','stock unchanged' from public.consumable_store_items i where i.item_code in ('CON-0112','CON-0084','CON-0050');

  -- Resource Diabetic Vanilla: removed from Stores
  select id, item_name into r from public.consumable_store_items where item_code='CON-0120';
  select coalesce(sum(qty_in),0)-coalesce(sum(qty_out),0) into v_bal from public.consumable_store_ledger where item_id=r.id and voided_at is null;
  v_led := null;
  if v_bal<>0 then
    insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
    values(r.id,case when v_bal>0 then 'Adjustment Out' else 'Adjustment In' end,greatest(-v_bal,0),greatest(v_bal,0),0,'Removed from Stores – '||c_label,'Not a consumable item (Boomi) · not charged to any Guest',v_actor,v_actor_name)
    returning id into v_led;
  end if;
  update public.consumable_store_items set active=false where id=r.id;
  insert into public.store_physical_verification_lines(verification_id,item_id,item_code,item_name,action,erp_at_count,shelf_count,adjustment,ledger_id)
  values(v_pv,r.id,'CON-0120',r.item_name,'Removed from Stores',v_bal,0,-v_bal,v_led);

  -- new item: Apron
  if not exists(select 1 from public.consumable_store_items where lower(trim(item_name))='apron' and coalesce(item_category,'Consumables')='Consumables') then
    perform setval('public.samara_consumable_code_seq', greatest((select max(substring(item_code from 5)::int) from public.consumable_store_items where item_code ~ '^CON-[0-9]+$'), (select last_value from public.samara_consumable_code_seq)));
    v_code := 'CON-'||lpad(nextval('public.samara_consumable_code_seq')::text,4,'0');
    insert into public.consumable_store_items(item_name,unit,active,item_category,charge_rate,mrp,item_code)
    values('Apron','Nos',true,'Consumables',100,100,v_code) returning id into v_new;
    insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
    values(v_new,'Adjustment In',8,0,8,'Opening Stock – '||c_label,'New item, shelf count 8',v_actor,v_actor_name) returning id into v_led;
    insert into public.store_physical_verification_lines(verification_id,item_id,item_code,item_name,action,erp_at_count,shelf_count,adjustment,ledger_id,note)
    values(v_pv,v_new,v_code,'Apron','New item · Opening Stock',0,8,8,v_led,'rate ₹100');
  end if;
end $pv$;
commit;

-- result
select l.item_code, l.item_name, l.action, l.erp_at_count as erp, l.shelf_count as shelf, l.adjustment, l.note,
       i.charge_rate as charge, i.mrp
  from public.store_physical_verification_lines l join public.store_physical_verifications v on v.id=l.verification_id
  left join public.consumable_store_items i on i.id=l.item_id
 where v.verification_no='PV-CON-12-11-2026' and (l.action<>'Matches' or l.note is not null) order by l.item_code;
