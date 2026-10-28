-- Samara Care ERP — ONE-TIME: duplicate Sun Surgicals receipts (29-10-2026, asked by Boomi: "cross check with the ERP data and complete")
--
-- Why: while Supabase was slow (28/29-10-2026 night, and on earlier evenings), "Receive into stock" was pressed again and
--   again because no "Saved" appeared — every press was saved. Checked against bills SSI/10244/26-27 (28-Oct) and
--   SSI/9678/26-27 (15-Oct) and the ERP's own history:
--   * IV SET: bill 9678 (10 sets) was received correctly on 19-10-2026 18:49 WITH its invoice, before the 20-10-2026
--     physical count (shelf 9). Since then 15 more receipts of 10 (23-10 … 29-10, no other IV set bill) + "JMS IV SET" 10
--     were entered; only 2 were used (indent CI-00307). → void the 16 repeats, merge JMS IV SET into IV SET: 9 − 2 = 7.
--   * FRES NS 100 ML (PANTA) 25 = the same 25 bottles as "Normal Saline 100 ML" 25 (the name nurses indent) → void the
--     duplicate under the new name.
--   * FRIENDS ADULT DIAPER XL 12 packets = the same diapers as "Adult Diapers" 120 pieces (nurses issue pieces) → void
--     the packet entry.
--   * ABS.COTTON second packet (invoice typed as "180" = the rate): the 15-Oct cotton was already in the 20-10 count → void.
--   * Same-product duplicate names merged into the item nurses already use (history moves, nothing deleted):
--     JMS IV SET→IV SET, FRES NS 100 ML (PANTA)→Normal Saline 100 ML, FRIENDS ADULT DIAPER XL→Adult Diapers,
--     ABS.COTTON IP 400/300GMS→COTTON 400, LOX 2% JELLY 30GMS→2% LOX GEL.
--   * Kept (correct): 3M Micropore 1+11 = 12 rolls (1 box), Gloves 500, Underpads 100, Adult Diapers 120, NS 100 ml 25.
-- Nothing is deleted: wrong receipts and their ledger lines are VOIDED with a reason (stock view and Net Profit already
-- ignore voided rows); merged items are switched off and labelled. Audit in store_physical_verifications DUP-29102026.
-- Run once in Supabase SQL Editor. p_apply=false = preview only. Safe to run again (does nothing the second time).

create or replace function public.samara_fix_sun_duplicates_29102026(p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare
  c_vno constant text := 'DUP-29102026';
  c_reason constant text := 'Duplicate receipt — entered again while the ERP was slow (checked against bills SSI/10244 & SSI/9678, 29-10-2026)';
  v_pv uuid; rep jsonb := '[]'::jsonb; r record; m record; t record; v_ids jsonb; v_moved jsonb; v_cnt int; v_dis text[]; v_trg text;
  v_void uuid[];
begin
  if exists(select 1 from public.store_physical_verifications where verification_no=c_vno) then
    return jsonb_build_object('status','already applied');
  end if;

  -- 1. receipts to void
  select coalesce(array_agg(x.id),'{}') into v_void from (
    select q.id from public.consumable_store_receipts q join public.consumable_store_items i on i.id=q.item_id
     where q.voided_at is null and (
       (i.item_code='CON-0072' and q.created_at > timestamptz '2026-10-20 16:00+05:30')      -- IV SET repeats
    or (i.item_code='CON-0127')                                                               -- JMS IV SET (bill 9678 already in)
    or (i.item_code='PHA-0095')                                                               -- FRES NS 100 ML = Normal Saline 100 ML
    or (i.item_code='CON-0126')                                                               -- FRIENDS DIAPER XL packets = Adult Diapers pcs
    or (i.item_code='CON-0123' and trim(coalesce(q.invoice_no,''))='180'))                    -- second cotton packet
  ) x;

  for r in select i.item_code, i.item_name, count(*) n, sum(rc.quantity) q
             from public.consumable_store_receipts rc join public.consumable_store_items i on i.id=rc.item_id
            where rc.id = any(v_void) group by 1,2 order by 1 loop
    rep := rep||jsonb_build_object('action','VOID receipts','item',r.item_code||' '||r.item_name,'receipts',r.n,'qty',r.q);
  end loop;
  for r in select k.item_code kc, k.item_name kn, d.item_code dc, d.item_name dn
             from (values ('CON-0127','CON-0072'),('PHA-0095','PHA-0010'),('CON-0126','CON-0001'),('CON-0123','CON-0112'),('PHA-0096','PHA-0020')) v(dc,kc)
             join public.consumable_store_items d on d.item_code=v.dc join public.consumable_store_items k on k.item_code=v.kc loop
    rep := rep||jsonb_build_object('action','MERGE','item',r.dc||' '||r.dn,'into',r.kc||' '||r.kn);
  end loop;

  if not p_apply then
    -- balance after = current balance minus the voided receipt quantities, merged into the kept item
    for r in select k.item_code, k.item_name,
                    (select coalesce(sum(l.qty_in-l.qty_out),0) from public.consumable_store_ledger l
                      where l.voided_at is null and l.item_id in (select id from public.consumable_store_items where item_code in (k.item_code) or item_code in
                        (select dc from (values ('CON-0127','CON-0072'),('PHA-0095','PHA-0010'),('CON-0126','CON-0001'),('CON-0123','CON-0112'),('PHA-0096','PHA-0020')) v(dc,kc) where kc=k.item_code))
                        and not exists(select 1 from public.consumable_store_receipts rc where rc.id=l.receipt_id and rc.id=any(v_void))) after_qty
               from public.consumable_store_items k where k.item_code in ('CON-0072','PHA-0010','CON-0001','CON-0112','PHA-0020') loop
      rep := rep||jsonb_build_object('action','BALANCE AFTER','item',r.item_code||' '||r.item_name,'qty',r.after_qty);
    end loop;
    return jsonb_build_object('status','PREVIEW — nothing changed','voids',cardinality(v_void),'report',rep);
  end if;

  insert into public.store_physical_verifications(verification_no,section,count_at,notes)
  values(c_vno,'Consumables & Pharmacy',now(),'Duplicate Sun Surgicals receipts voided and same-product names merged — Boomi, 29-10-2026')
  returning id into v_pv;
  insert into public.store_item_snapshots(verification_id,item,balance)
  select v_pv, to_jsonb(i), (select coalesce(sum(l.qty_in)-sum(l.qty_out),0) from public.consumable_store_ledger l where l.item_id=i.id and l.voided_at is null)
    from public.consumable_store_items i
   where i.item_code in ('CON-0072','CON-0127','PHA-0010','PHA-0095','CON-0001','CON-0126','CON-0112','CON-0123','PHA-0020','PHA-0096');

  -- 2. void receipts + their ledger lines (ledger linked by receipt_id, or by the receipt number in the reference)
  update public.consumable_store_ledger l set voided_at=now(), void_reason=c_reason
   where l.voided_at is null and (l.receipt_id = any(v_void)
      or exists(select 1 from public.consumable_store_receipts rc where rc.id=any(v_void) and rc.receipt_no is not null
                  and l.item_id=rc.item_id and l.movement_type='Vendor Receipt' and l.reference_text like 'SR-'||lpad(rc.receipt_no::text,5,'0')||'%'));
  update public.consumable_store_receipts set voided_at=now(), void_reason=c_reason where id=any(v_void);
  insert into public.store_physical_verification_lines(verification_id,item_id,item_code,item_name,action,adjustment,note)
  select v_pv, i.id, i.item_code, i.item_name, 'Duplicate receipt voided', -rc.quantity,
         coalesce('SR-'||lpad(rc.receipt_no::text,5,'0'),'')||' · '||to_char(rc.created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI')||' · inv '||coalesce(nullif(rc.invoice_no,''),'—')
    from public.consumable_store_receipts rc join public.consumable_store_items i on i.id=rc.item_id where rc.id=any(v_void);

  -- 3. merges (same method as the 20-10-2026 physical verification)
  create temp table fx_cols(tbl text, col text) on commit drop;
  insert into fx_cols
  select distinct cl.relname::text, a.attname::text
    from pg_constraint con join pg_class cl on cl.oid=con.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
    join pg_attribute a on a.attrelid=con.conrelid and a.attnum=con.conkey[1]
   where con.contype='f' and con.confrelid='public.consumable_store_items'::regclass and ns.nspname='public' and cardinality(con.conkey)=1;
  insert into fx_cols
  select x.t, x.c from (values ('consumable_store_ledger','item_id'),('consumable_store_receipts','item_id'),('store_mrp_reviews','item_id'),
     ('patient_consumable_indents','store_item_id'),('bill_charge_requests','store_item_id'),('patient_item_consumption','store_item_id'),
     ('housekeeping_indents','store_item_id')) x(t,c)
   where exists(select 1 from information_schema.columns ic where ic.table_schema='public' and ic.table_name=x.t and ic.column_name=x.c and ic.data_type='uuid')
     and not exists(select 1 from fx_cols p where p.tbl=x.t and p.col=x.c);
  delete from fx_cols where tbl in ('consumable_store_items','store_stock_reset_items','store_item_merges','store_physical_verification_lines','store_item_snapshots');

  for m in select d.id drop_id, d.item_code drop_code, d.item_name drop_name, d.charge_rate drop_rate,
                  k.id keep_id, k.item_code keep_code, k.item_name keep_name, k.charge_rate keep_rate
             from (values ('CON-0127','CON-0072'),('PHA-0095','PHA-0010'),('CON-0126','CON-0001'),('CON-0123','CON-0112'),('PHA-0096','PHA-0020')) v(dc,kc)
             join public.consumable_store_items d on d.item_code=v.dc join public.consumable_store_items k on k.item_code=v.kc
            where coalesce(d.active,true) loop
    v_moved := '{}'::jsonb; v_cnt := 0;
    for t in select * from fx_cols order by tbl, col loop
      v_dis := array(select tg.tgname::text from pg_trigger tg where tg.tgrelid=('public.'||quote_ident(t.tbl))::regclass and not tg.tgisinternal and tg.tgenabled<>'D');
      foreach v_trg in array v_dis loop execute format('alter table public.%I disable trigger %I', t.tbl, v_trg); end loop;
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.tbl and column_name='id') then
        execute format('with u as (update public.%I set %I=$1 where %I=$2 returning id) select coalesce(jsonb_agg(id),''[]''::jsonb) from u', t.tbl, t.col, t.col)
          into v_ids using m.keep_id, m.drop_id;
      else
        execute format('with u as (update public.%I set %I=$1 where %I=$2 returning 1) select to_jsonb(count(*)) from u', t.tbl, t.col, t.col)
          into v_ids using m.keep_id, m.drop_id;
      end if;
      if t.tbl='patient_consumable_indents' and jsonb_typeof(v_ids)='array'
         and exists(select 1 from information_schema.columns where table_schema='public' and table_name='patient_consumable_indents' and column_name='item_name') then
        execute 'update public.patient_consumable_indents set item_name=$1 where id in (select (jsonb_array_elements_text($2))::uuid)' using m.keep_name, v_ids;
      elsif t.tbl='bill_charge_requests' then
        execute 'update public.bill_charge_requests set store_item_id=$1, service_name=$2, charge_item_code=$3
                  where (store_item_id=$1 and id in (select (jsonb_array_elements_text($5))::uuid) or charge_item_code=$4)
                    and coalesce(approval_status,''Pending'')=''Pending'''
          using m.keep_id, m.keep_name, m.keep_code, m.drop_code, case when jsonb_typeof(v_ids)='array' then v_ids else '[]'::jsonb end;
      end if;
      foreach v_trg in array v_dis loop execute format('alter table public.%I enable trigger %I', t.tbl, v_trg); end loop;
      if jsonb_typeof(v_ids)='array' and jsonb_array_length(v_ids)>0 then v_moved := v_moved||jsonb_build_object(t.tbl||'.'||t.col, v_ids); v_cnt := v_cnt+jsonb_array_length(v_ids);
      elsif jsonb_typeof(v_ids)='number' and v_ids::text<>'0' then v_moved := v_moved||jsonb_build_object(t.tbl||'.'||t.col, v_ids); v_cnt := v_cnt+(v_ids::text)::int;
      end if;
    end loop;
    update public.consumable_store_items set active=false, item_name=left(item_name,80)||' [merged into '||m.keep_code||']' where id=m.drop_id;
    update public.charge_tariff_master set is_active=false
     where lower(trim(service_name))=lower(trim(m.drop_name)) and lower(trim(service_name))<>lower(trim(m.keep_name))
       and category in ('Consumables','Pharmacy & Basic Supplies','Pharmacy');
    if m.keep_rate is null and m.drop_rate is not null and m.drop_rate>0 then
      update public.consumable_store_items set charge_rate=m.drop_rate where id=m.keep_id;
    end if;
    insert into public.store_item_merges(verification_id,keep_item_id,keep_code,keep_name,merged_item_id,merged_code,merged_name,moved_rows)
    values(v_pv,m.keep_id,m.keep_code,m.keep_name,m.drop_id,m.drop_code,m.drop_name,v_moved);
    rep := rep||jsonb_build_object('action','MERGED','item',m.drop_code||' '||m.drop_name,'into',m.keep_code||' '||m.keep_name,'records_moved',v_cnt);
  end loop;

  -- 4. the kept 29-10 receipts carry the bill details (invoice; unit cost only where it was blank)
  update public.consumable_store_receipts q set invoice_no='SSI/10244/26-27', invoice_date=date '2026-10-28',
         unit_cost=coalesce(q.unit_cost, case i.item_code when 'PHA-0010' then 12 when 'CON-0001' then 28 when 'CON-0006' then 19 when 'CON-0124' then round(445/12.0,2) end)
    from public.consumable_store_items i
   where i.id=q.item_id and q.voided_at is null and nullif(trim(coalesce(q.invoice_no,'')),'') is null
     and i.item_code in ('PHA-0010','CON-0001','CON-0006','CON-0124')
     and q.created_at between timestamptz '2026-10-29 00:00+05:30' and timestamptz '2026-10-29 01:00+05:30';

  return jsonb_build_object('status','APPLIED','verification',c_vno,'voids',cardinality(v_void),'report',rep);
end $fn$;
revoke all on function public.samara_fix_sun_duplicates_29102026(boolean) from public, anon, authenticated;

-- PREVIEW (changes nothing):
select public.samara_fix_sun_duplicates_29102026(false);
-- APPLY:
-- select public.samara_fix_sun_duplicates_29102026(true);

-- APPLIED 29-10-2026 02:14 IST (19 receipts voided; merges: JMS IV SET, ABS.COTTON, LOX 2% JELLY. FRES NS 100 ML and FRIENDS DIAPER XL
-- were already switched off by the Nursing Manager at 00:19/00:25, so only their duplicate receipts were voided).
-- Follow-up: IV SET, COTTON 400 and 2% LOX GEL had been switched off ("Remove Item", 29-10 00:14-00:23) and now hold the
-- merged stock, so they were switched back on:
-- update public.consumable_store_items set active=true where item_code in (CON-0072,CON-0112,PHA-0020) and active=false;
-- Result: IV SET 7 · COTTON 400 2 · 2% LOX GEL 3 · Adult Diapers 123 · Normal Saline 100 ML 25 (all active).
