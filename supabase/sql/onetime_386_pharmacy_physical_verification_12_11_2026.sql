-- Samara Care ERP — PHARMACY PHYSICAL VERIFICATION 12-11-2026 (Boomi) · run ONCE in Supabase SQL Editor
-- Source: "Pharmacy — Stock Report (Remaining Quantity)" printed 12-11-2026 01:45 PM with shelf count and MRP in pencil.
--   • every item brought to the shelf count (no ERP movement after 01:45 PM): extra -> Opening Stock, less -> Unknown Usage
--     (never charged to any Guest)
--   • Guest charge rate = pencil MRP (per piece); MRP kept per item. Bifilac ₹14/capsule, Budecort ₹25/respule,
--     Duolin ₹25/respule, Emeset 4 mg ₹5/tablet stay as they are (pencil figures were pack prices). Montek LC unchanged.
--   • removed from Stores: INJ.PHENERGAN (PHA-0093), RESOURCE DIABETIC (PHA-0094)
-- One transaction; stops without changes if a code / name does not match; cannot be applied twice.
begin;
alter table public.consumable_store_items add column if not exists mrp numeric;
do $pv$
declare
  c_vno constant text := 'PV-PHA-12-11-2026'; c_label constant text := 'Physical Verification 12-11-2026';
  v_pv uuid; v_actor uuid; v_actor_name text; r record; v_bal numeric; v_diff numeric; v_led uuid; v_bad text := '';
begin
  if exists(select 1 from public.store_physical_verifications where verification_no=c_vno) then raise exception '% was already applied. Nothing done.', c_vno; end if;
  select p.id, coalesce(nullif(p.full_name,''),'Admin') into v_actor, v_actor_name from public.profiles p where p.role='Admin' and coalesce(p.is_active,true) order by p.created_at nulls last limit 1;
  v_actor_name := coalesce(v_actor_name,'Admin')||' (Physical Verification)';
  create temp table pv(code text primary key, name_check text, shelf numeric, rate numeric) on commit drop;
  insert into pv values
     ('PHA-0020','lox',2,34.58),
     ('PHA-0075','dextrose',2,24.51),
     ('PHA-0074','adrenaline',2,13.14),
     ('PHA-0060','asthalin',5,8.8),
     ('PHA-0053','atropine',2,7.32),
     ('PHA-0092','betadine',1,103),
     ('PHA-0003','bifilac',10,null),
     ('PHA-0088','budecort',5,null),
     ('PHA-0083','deriphylline',2,10.51),
     ('PHA-0025','dexa',2,10.87),
     ('PHA-0079','dns',7,43),
     ('PHA-0016','dolo',10,2.13),
     ('PHA-0019','duolin',3,null),
     ('PHA-0062','easy fix',5,48),
     ('PHA-0024','emeset',10,null),
     ('PHA-0028','emeset 2ml',3,13.57),
     ('PHA-0056','fevastin',1,20.15),
     ('PHA-0058','frusemide',2,6.69),
     ('PHA-0017','hcort',2,47.82),
     ('PHA-0070','levipil',1,122.9),
     ('PHA-0035','montek',8,null),
     ('PHA-0010','normal saline 100',18,21),
     ('PHA-0044','normal saline 500',15,37),
     ('PHA-0008','pan 40',2,53.9),
     ('PHA-0032','para 1gm',1,578),
     ('PHA-0022','pheniramine',2,5.9),
     ('PHA-0014','rl 500',10,60),
     ('PHA-0089','water for injection',93,2.6),
     ('PHA-0093','phenergan',0,null),('PHA-0094','resource',0,null);
  for r in select s.*, i.id, i.item_name from pv s left join public.consumable_store_items i on i.item_code=s.code loop
    if r.id is null then v_bad := v_bad||r.code||' not found; ';
    elsif position(replace(r.name_check,' ','') in regexp_replace(lower(r.item_name),'[^a-z0-9]','','g'))=0 then v_bad := v_bad||r.code||' is "'||r.item_name||'"; ';
    end if;
  end loop;
  if v_bad<>'' then raise exception 'STOPPED — the ERP item list does not match the count sheet: %', v_bad; end if;

  insert into public.store_physical_verifications(verification_no,section,count_at,applied_by,applied_by_name,notes)
  values(c_vno,'Pharmacy',now(),v_actor,v_actor_name,'Pencil count + MRP on the Pharmacy Stock Report printed 12-11-2026 01:45 PM (Boomi)') returning id into v_pv;
  insert into public.store_item_snapshots(verification_id,item,balance)
  select v_pv, to_jsonb(i), (select coalesce(sum(l.qty_in),0)-coalesce(sum(l.qty_out),0) from public.consumable_store_ledger l where l.item_id=i.id and l.voided_at is null)
    from public.consumable_store_items i where i.item_category='Pharmacy';

  update public.consumable_store_items i set charge_rate=s.rate, mrp=s.rate from pv s where s.code=i.item_code and s.rate is not null;

  for r in select s.*, i.id, i.item_name from pv s join public.consumable_store_items i on i.item_code=s.code order by s.code loop
    select coalesce(sum(qty_in),0)-coalesce(sum(qty_out),0) into v_bal from public.consumable_store_ledger where item_id=r.id and voided_at is null;
    v_diff := r.shelf-v_bal; v_led := null;
    if v_diff<>0 then
      insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
      values(r.id, case when v_diff>0 then 'Adjustment In' else 'Adjustment Out' end, greatest(v_diff,0), greatest(-v_diff,0), r.shelf,
        case when r.code in ('PHA-0093','PHA-0094') then 'Removed from Stores – '||c_label when v_diff>0 then 'Opening Stock – '||c_label else 'Unknown Usage – '||c_label end,
        'Shelf count '||r.shelf||' · ERP '||v_bal||case when v_diff<0 then ' · not charged to any Guest' else '' end, v_actor, v_actor_name)
      returning id into v_led;
    end if;
    insert into public.store_physical_verification_lines(verification_id,item_id,item_code,item_name,action,erp_at_count,moved_since_count,shelf_count,adjustment,ledger_id,note)
    values(v_pv,r.id,r.code,r.item_name,
      case when r.code in ('PHA-0093','PHA-0094') then 'Removed from Stores' when v_diff>0 then 'Opening Stock' when v_diff<0 then 'Unknown Usage' else 'Matches' end,
      v_bal,0,r.shelf,v_diff,v_led, case when r.rate is not null then 'rate ₹'||r.rate else null end);
  end loop;
  update public.consumable_store_items set active=false where item_code in ('PHA-0093','PHA-0094');
end $pv$;
commit;

select l.item_code, l.item_name, l.action, l.erp_at_count as erp, l.shelf_count as shelf, i.charge_rate as charge
  from public.store_physical_verification_lines l join public.store_physical_verifications v on v.id=l.verification_id
  left join public.consumable_store_items i on i.id=l.item_id
 where v.verification_no='PV-PHA-12-11-2026' order by l.item_code;
