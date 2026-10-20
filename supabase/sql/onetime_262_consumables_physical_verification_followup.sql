-- Samara Care ERP — CONSUMABLES PHYSICAL VERIFICATION 20-10-2026, FOLLOW-UP (Boomi, 20-10-2026 evening)
-- From Boomi's handwritten notes on the "Consumables — Stock Report" printed 20-10-2026 04:48 PM:
--   CON-0101 Ryle's / NG Tubes-16       shelf 5  -> switched back ON, Opening Stock +5
--   CON-0112 COTTON 400                 shelf 1  -> Opening Stock +1
--   CON-0111 NASOPHARYNGEAL AIRWAY 7    Remove   -> switched off (balance 0)
--   CON-0116 BD Q-Syte Single Extension Remove   -> switched off (balance 0)
--   CON-0117 Crepe Bandage - 6 cm       Remove   -> switched off (balance 0)
--   CON-0078 cotton roll 50 g           Remove   -> already removed in PV-CON-20-10-2026 (no change)
-- Logged as PV-CON-20-10-2026-B in store_physical_verifications / _lines. One transaction; cannot run twice.
begin;
do $$
declare
  c_vno constant text := 'PV-CON-20-10-2026-B';
  c_label constant text := 'Physical Verification 20-10-2026';
  v_pv uuid; v_actor uuid; v_actor_name text; r record; v_bal numeric; v_diff numeric; v_led uuid; v_bad text := '';
begin
  if exists(select 1 from public.store_physical_verifications where verification_no=c_vno) then
    raise exception '% was already applied. Nothing done.', c_vno;
  end if;
  select p.id, coalesce(nullif(p.full_name,''),'Admin') into v_actor, v_actor_name
    from public.profiles p where p.role='Admin' and coalesce(p.is_active,true) order by p.created_at nulls last limit 1;
  v_actor_name := coalesce(v_actor_name,'Admin')||' (Physical Verification)';

  create temp table pv_b(code text primary key, name_check text, shelf numeric, act text) on commit drop;
  insert into pv_b values ('CON-0101','ryle',5,'restore'),('CON-0112','cotton 400',1,'count'),
    ('CON-0111','nasopharyngeal',0,'remove'),('CON-0116','bd q',0,'remove'),('CON-0117','crepe bandage',0,'remove');
  for r in select b.*, i.id, i.item_name from pv_b b left join public.consumable_store_items i on i.item_code=b.code loop
    if r.id is null then v_bad := v_bad||r.code||' not found; ';
    elsif position(r.name_check in lower(r.item_name))=0 and position(replace(r.name_check,' ','') in regexp_replace(lower(r.item_name),'[^a-z0-9]','','g'))=0 then
      v_bad := v_bad||r.code||' is "'||r.item_name||'"; ';
    end if;
  end loop;
  if v_bad<>'' then raise exception 'STOPPED — %', v_bad; end if;

  insert into public.store_physical_verifications(verification_no,section,count_at,applied_by,applied_by_name,notes)
  values(c_vno,'Consumables',timestamptz '2026-10-20 16:48:00+05:30',v_actor,v_actor_name,
    'Follow-up: handwritten notes on the Stock Report printed 20-10-2026 04:48 PM')
  returning id into v_pv;

  update public.consumable_store_items set active=true where item_code='CON-0101';

  for r in select b.*, i.id, i.item_name from pv_b b join public.consumable_store_items i on i.item_code=b.code order by b.code loop
    select coalesce(sum(qty_in),0)-coalesce(sum(qty_out),0) into v_bal from public.consumable_store_ledger where item_id=r.id and voided_at is null;
    v_diff := r.shelf-v_bal; v_led := null;
    if v_diff<>0 then
      insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
      values(r.id, case when v_diff>0 then 'Adjustment In' else 'Adjustment Out' end, greatest(v_diff,0), greatest(-v_diff,0), r.shelf,
        case when r.act='remove' then 'Removed from Stores – '||c_label when v_diff>0 then 'Opening Stock – '||c_label else 'Unknown Usage – '||c_label end,
        'Shelf count '||r.shelf||' (recount on 04:48 PM report) · ERP '||v_bal||case when v_diff<0 then ' · not charged to any Guest' else '' end,
        v_actor, v_actor_name)
      returning id into v_led;
    end if;
    insert into public.store_physical_verification_lines(verification_id,item_id,item_code,item_name,action,erp_at_count,moved_since_count,shelf_count,adjustment,ledger_id)
    values(v_pv,r.id,r.code,r.item_name,
      case when r.act='remove' then 'Removed from Stores' when r.act='restore' then 'Restored to Stores · Opening Stock'
           when v_diff>0 then 'Opening Stock' when v_diff<0 then 'Unknown Usage' else 'Matches' end,
      v_bal,0,r.shelf,v_diff,v_led);
  end loop;

  update public.consumable_store_items set active=false where item_code in ('CON-0111','CON-0116','CON-0117');
end $$;
commit;

-- check: should list 0101 active 5, 0112 active 1, 0111/0116/0117 inactive 0
select i.item_code, i.item_name, i.active, coalesce(sum(l.qty_in-l.qty_out) filter (where l.voided_at is null),0) as balance
  from public.consumable_store_items i left join public.consumable_store_ledger l on l.item_id=i.id
 where i.item_code in ('CON-0101','CON-0112','CON-0111','CON-0116','CON-0117','CON-0078') group by 1,2,3 order by 1;
