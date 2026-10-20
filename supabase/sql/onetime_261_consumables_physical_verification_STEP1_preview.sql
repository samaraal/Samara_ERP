-- Samara Care ERP — CONSUMABLES PHYSICAL VERIFICATION 20-10-2026 (Boomi)
-- STEP 1 of 2: installs the correction and shows a PREVIEW. NOTHING IS CHANGED by this step.
--
-- Source: "Consumables — Current Stock" printed 20-10-2026 03:14 PM IST (75 items) with the shelf count
-- written by hand, plus Boomi's decisions of 20-10-2026:
--   MERGE (history moves to the kept code; the other code is switched off, never deleted)
--     CON-0072 IV SET               <- CON-0100 IV Sets                  shelf 9
--     CON-0076 Airway 2 (9cm)       <- CON-0109 AIRWAY SIZE 2 (9CM)      shelf 1
--     CON-0102 Vacuum suck suction  <- CON-0096 Vaccu suck suction set   shelf 4
--     CON-0080 Catheter Tip Syringe <- CON-0110 CATHETER TIP SYRINGE     shelf 0  (spelling of 0080 corrected)
--     CON-0047 VENFLON 22G          <- CON-0115 Venflon Pro Safety 22G   shelf 20 (same product)
--     CON-0091 Micropore Tape 3 in  <- CON-0043 Micropore Adhesive Tape  shelf 1
--   REMOVE FROM STORES (switched off; any balance written off as "Removed from Stores")
--     CON-0024 Sterile Gauze Pads 2x2, CON-0101 Ryle's / NG Tubes-16, CON-0037 Cotton Rolls 1, CON-0078 cotton roll 50 g
--   MOVE
--     CON-0081 INJ.Avil      -> Pharmacy section (gets a PHA- code if it has no history)
--     CON-0097 Pulse Oximeter -> Biomedical Equipment (switched off in Consumables, added to Equipment items)
--   KEEP  Digital Thermometer in Consumables (shelf 10). Suction Catheter 10 Fr = 0 (the 57 is 14 Fr).
--   EVERY OTHER ITEM: ERP brought to the shelf count —
--     extra on the shelf  -> "Opening Stock – Physical Verification 20-10-2026"   (Adjustment In)
--     less on the shelf   -> "Unknown Usage – Physical Verification 20-10-2026"   (Adjustment Out, never charged to any Guest)
--
-- Anything that moved in the ERP AFTER 03:14 PM (an indent handed over, a return…) is kept: the correction is
-- (shelf count − ERP balance at 03:14 PM), so later movements are not erased.
-- Names, codes, Charge Master rates, Guest bills, Patient Ledger and Family Portal are not changed.
-- Pending (not yet approved) charge requests of a merged item are pointed to the kept item.
--
-- Run in Supabase → SQL Editor. Then read the preview table. Safe to run again.

begin;

-- 1. Audit tables ---------------------------------------------------------------------------------
create table if not exists public.store_physical_verifications(
  id uuid primary key default gen_random_uuid(),
  verification_no text unique not null,
  section text not null,
  count_at timestamptz not null,
  applied_at timestamptz not null default now(),
  applied_by uuid, applied_by_name text,
  notes text
);
create table if not exists public.store_physical_verification_lines(
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.store_physical_verifications(id),
  item_id uuid, item_code text, item_name text,
  action text not null,
  erp_at_count numeric, moved_since_count numeric, shelf_count numeric, adjustment numeric,
  ledger_id uuid, note text,
  created_at timestamptz not null default now()
);
create table if not exists public.store_item_merges(
  id uuid primary key default gen_random_uuid(),
  verification_id uuid references public.store_physical_verifications(id),
  keep_item_id uuid not null, keep_code text, keep_name text,
  merged_item_id uuid not null, merged_code text, merged_name text,
  moved_rows jsonb not null default '{}'::jsonb,   -- "table.column": [row ids]  (for audit / undo)
  merged_at timestamptz not null default now()
);
create table if not exists public.store_item_snapshots(
  id uuid primary key default gen_random_uuid(),
  verification_id uuid references public.store_physical_verifications(id),
  item jsonb not null, balance numeric,
  created_at timestamptz not null default now()
);
alter table public.store_physical_verifications enable row level security;
alter table public.store_physical_verification_lines enable row level security;
alter table public.store_item_merges enable row level security;
alter table public.store_item_snapshots enable row level security;
drop policy if exists store_pv_read on public.store_physical_verifications;
create policy store_pv_read on public.store_physical_verifications for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)));
drop policy if exists store_pv_lines_read on public.store_physical_verification_lines;
create policy store_pv_lines_read on public.store_physical_verification_lines for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)));
drop policy if exists store_item_merges_read on public.store_item_merges;
create policy store_item_merges_read on public.store_item_merges for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)));
revoke insert, update, delete on public.store_physical_verifications, public.store_physical_verification_lines,
  public.store_item_merges, public.store_item_snapshots from anon, authenticated;
revoke select on public.store_item_snapshots from anon, authenticated;
grant select on public.store_physical_verifications, public.store_physical_verification_lines, public.store_item_merges to authenticated;

-- 2. The correction (SQL Editor only — not callable from the app) -------------------------------------
create or replace function public.samara_pv_consumables_20102026(p_apply boolean default false)
returns table(seq int, item_code text, item_name text, action text, erp_at_count numeric, moved_since_count numeric,
              shelf_count numeric, adjustment numeric, note text)
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
#variable_conflict use_column
declare
  c_vno   constant text := 'PV-CON-20-10-2026';
  c_label constant text := 'Physical Verification 20-10-2026';
  c_count constant timestamptz := timestamptz '2026-10-20 15:14:00+05:30';
  v_pv uuid; v_actor uuid; v_actor_name text;
  rep jsonb := '[]'::jsonb; n int := 0;
  r record; m record; k record; d record; t record; trg record;
  v_bal numeric; v_since numeric; v_erp numeric; v_diff numeric; v_led uuid; v_ids jsonb; v_moved jsonb; v_cnt int;
  v_has_hist boolean; v_code text; v_bad text := '';
  v_disabled text[];
begin
  if exists(select 1 from public.store_physical_verifications where verification_no=c_vno) then
    raise exception 'Physical Verification % was already applied on %. Nothing done.', c_vno,
      (select to_char(applied_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') from public.store_physical_verifications where verification_no=c_vno);
  end if;

  begin  -- everything below is undone automatically in preview mode -------------------------------
    select p.id, coalesce(nullif(p.full_name,''),'Admin') into v_actor, v_actor_name
      from public.profiles p where p.role='Admin' and coalesce(p.is_active,true) order by p.created_at nulls last limit 1;
    v_actor_name := coalesce(v_actor_name,'Admin')||' (Physical Verification)';

    -- 2a. The sheet: code, first letters of the name (safety check), shelf count, what to do -------
    create temp table pv_sheet(code text primary key, name_check text, shelf numeric, act text, keep_code text) on commit drop;
    insert into pv_sheet values
     ('CON-0001','adult diaper',35,'count',null),('CON-0006','underpad',35,'count',null),('CON-0008','disposable syringe',20,'count',null),
     ('CON-0009','kidney tray',12,'count',null),('CON-0010','examination glove',680,'count',null),('CON-0011','bed pan',3,'count',null),
     ('CON-0017','disposable syringe',30,'count',null),('CON-0019','disposable syringe',0,'count',null),('CON-0021','alcohol swab',84,'count',null),
     ('CON-0023','venflon 18',4,'count',null),('CON-0024','sterile gauze',0,'remove',null),('CON-0025','digital thermometer',10,'count',null),
     ('CON-0026','suction catheter',0,'count',null),('CON-0028','surgical mask',60,'count',null),('CON-0030','venflon 20',10,'count',null),
     ('CON-0033','hand sanitizer',9,'count',null),('CON-0034','oxygen mask',1,'count',null),('CON-0037','cotton roll',0,'remove',null),
     ('CON-0038','crepe bandage',0,'count',null),('CON-0041','suction catheter',63,'count',null),('CON-0042','scalp vein',2,'count',null),
     ('CON-0043','micropore',null,'merge','CON-0091'),('CON-0046','needle',0,'count',null),('CON-0047','venflon 22',20,'count',null),
     ('CON-0048','nebulizer mask',4,'count',null),('CON-0050','lancet',100,'count',null),('CON-0052','suction catheter',57,'count',null),
     ('CON-0057','oxygen nasal',1,'count',null),('CON-0060','sterile dressing',5,'count',null),('CON-0063','feeding syringe',6,'count',null),
     ('CON-0065','glucostrip',4,'count',null),('CON-0066','disposable syringe',0,'count',null),('CON-0068','insulin syringe',3,'count',null),
     ('CON-0069','sterile gauze',0,'count',null),('CON-0070','disposable syringe',3,'count',null),('CON-0072','iv set',9,'count',null),
     ('CON-0074','high concentration',2,'count',null),('CON-0075','ryle',5,'count',null),('CON-0076','airway',1,'count',null),
     ('CON-0078','cotton roll',0,'remove',null),('CON-0080','catheter tip',0,'count',null),('CON-0081','inj',0,'to_pharmacy',null),
     ('CON-0084','dynaplast',1,'count',null),('CON-0085','ecg lead',6,'count',null),('CON-0086','foley',2,'count',null),
     ('CON-0087','foley',2,'count',null),('CON-0088','gauze',28,'count',null),('CON-0089','urinal can',2,'count',null),
     ('CON-0090','k 90',2,'count',null),('CON-0091','micropore',1,'count',null),('CON-0092','sterile glove',11,'count',null),
     ('CON-0093','sterile glove',11,'count',null),('CON-0094','sterile glove',10,'count',null),('CON-0095','urobag',2,'count',null),
     ('CON-0096','vac',null,'merge','CON-0102'),('CON-0097','pulse oxi',0,'to_biomedical',null),('CON-0100','iv set',null,'merge','CON-0072'),
     ('CON-0101','ryle',0,'remove',null),('CON-0102','vacuum',4,'count',null),('CON-0103','3',4,'count',null),
     ('CON-0104','3',10,'count',null),('CON-0105','trach',1,'count',null),('CON-0106','bain',1,'count',null),
     ('CON-0107','tracheostomy',1,'count',null),('CON-0108','tracheostomy',1,'count',null),('CON-0109','airway',null,'merge','CON-0076'),
     ('CON-0110','catheter tip',null,'merge','CON-0080'),('CON-0111','nasopharyngeal',0,'count',null),('CON-0112','cotton',0,'count',null),
     ('CON-0113','dispen',2,'count',null),('CON-0114','easy bath',23,'count',null),('CON-0115','venflon',null,'merge','CON-0047'),
     ('CON-0116','bd q',0,'count',null),('CON-0117','crepe bandage',0,'count',null),('CON-0118','nebulizer',2,'count',null);

    -- 2b. Safety: every code must exist with the expected name, else STOP (nothing changed) --------
    for r in select s.*, i.id, i.item_name, i.item_category from pv_sheet s left join public.consumable_store_items i on i.item_code=s.code loop
      if r.id is null then v_bad := v_bad||r.code||' not found; ';
      elsif position(r.name_check in regexp_replace(lower(r.item_name),'[^a-z0-9 ]','','g'))=0
            and position(replace(r.name_check,' ','') in regexp_replace(lower(r.item_name),'[^a-z0-9]','','g'))=0 then
        v_bad := v_bad||r.code||' is "'||r.item_name||'"; ';
      elsif coalesce(r.item_category,'Consumables')<>'Consumables' then v_bad := v_bad||r.code||' is in '||r.item_category||'; ';
      end if;
    end loop;
    if v_bad<>'' then raise exception 'STOPPED — the ERP item list does not match the count sheet: %', v_bad; end if;

    insert into public.store_physical_verifications(verification_no,section,count_at,applied_by,applied_by_name,notes)
    values(c_vno,'Consumables',c_count,v_actor,v_actor_name,'Shelf count on the printed Current Stock list of 20-10-2026 03:14 PM; merges, removals and moves as decided by Boomi')
    returning id into v_pv;

    -- snapshot of every Consumables item + balance before anything changes
    insert into public.store_item_snapshots(verification_id,item,balance)
    select v_pv, to_jsonb(i), (select coalesce(sum(l.qty_in),0)-coalesce(sum(l.qty_out),0) from public.consumable_store_ledger l where l.item_id=i.id and l.voided_at is null)
      from public.consumable_store_items i where coalesce(i.item_category,'Consumables')='Consumables';

    -- 2c. MERGES: move every record of the duplicate onto the kept item ---------------------------
    create temp table pv_cols(tbl text, col text) on commit drop;
    insert into pv_cols
    select distinct cl.relname::text, a.attname::text
      from pg_constraint con
      join pg_class cl on cl.oid=con.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
      join pg_attribute a on a.attrelid=con.conrelid and a.attnum=con.conkey[1]
     where con.contype='f' and con.confrelid='public.consumable_store_items'::regclass and ns.nspname='public' and cardinality(con.conkey)=1;
    insert into pv_cols
    select x.t, x.c from (values ('consumable_store_ledger','item_id'),('consumable_store_receipts','item_id'),('store_mrp_reviews','item_id'),
       ('patient_consumable_indents','store_item_id'),('bill_charge_requests','store_item_id'),('patient_item_consumption','store_item_id'),
       ('housekeeping_indents','store_item_id')) x(t,c)
     where exists(select 1 from information_schema.columns ic where ic.table_schema='public' and ic.table_name=x.t and ic.column_name=x.c and ic.data_type='uuid')
       and not exists(select 1 from pv_cols p where p.tbl=x.t and p.col=x.c);
    delete from pv_cols where tbl in ('consumable_store_items','store_stock_reset_items','store_item_merges','store_physical_verification_lines','store_item_snapshots');

    for m in select s.code as drop_code, s.keep_code, di.id as drop_id, di.item_name as drop_name, di.charge_rate as drop_rate,
                    ki.id as keep_id, ki.item_name as keep_name, ki.charge_rate as keep_rate
               from pv_sheet s join public.consumable_store_items di on di.item_code=s.code join public.consumable_store_items ki on ki.item_code=s.keep_code
              where s.act='merge' order by s.code loop
      v_moved := '{}'::jsonb; v_cnt := 0;
      for t in select * from pv_cols order by tbl, col loop
        -- re-pointing only: switch off this table's own triggers for the moment so nothing is re-posted
        v_disabled := array(select tg.tgname::text from pg_trigger tg where tg.tgrelid=('public.'||quote_ident(t.tbl))::regclass and not tg.tgisinternal and tg.tgenabled<>'D');
        foreach v_code in array v_disabled loop execute format('alter table public.%I disable trigger %I', t.tbl, v_code); end loop;
        if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.tbl and column_name='id') then
          execute format('with u as (update public.%I set %I=$1 where %I=$2 returning id) select coalesce(jsonb_agg(id),''[]''::jsonb) from u', t.tbl, t.col, t.col)
            into v_ids using m.keep_id, m.drop_id;
        else
          execute format('with u as (update public.%I set %I=$1 where %I=$2 returning 1) select to_jsonb(count(*)) from u', t.tbl, t.col, t.col)
            into v_ids using m.keep_id, m.drop_id;
        end if;
        -- same quiet window: internal registers show the kept item's name; not-yet-approved charge requests go to the kept code
        if t.tbl='patient_consumable_indents' and t.col='store_item_id' and jsonb_typeof(v_ids)='array'
           and exists(select 1 from information_schema.columns where table_schema='public' and table_name='patient_consumable_indents' and column_name='item_name') then
          execute 'update public.patient_consumable_indents set item_name=$1 where id in (select (jsonb_array_elements_text($2))::uuid)' using m.keep_name, v_ids;
        elsif t.tbl='housekeeping_indents' and t.col='store_item_id' and jsonb_typeof(v_ids)='array' then
          execute 'update public.housekeeping_indents set item_name=$1 where id in (select (jsonb_array_elements_text($2))::uuid)' using m.keep_name, v_ids;
        elsif t.tbl='bill_charge_requests' and t.col='store_item_id' then
          execute 'update public.bill_charge_requests set store_item_id=$1, service_name=$2, charge_item_code=$3
                    where (store_item_id=$1 and id in (select (jsonb_array_elements_text($5))::uuid) or charge_item_code=$4)
                      and coalesce(approval_status,''Pending'')=''Pending'''
            using m.keep_id, m.keep_name, m.keep_code, m.drop_code, case when jsonb_typeof(v_ids)='array' then v_ids else '[]'::jsonb end;
        end if;
        foreach v_code in array v_disabled loop execute format('alter table public.%I enable trigger %I', t.tbl, v_code); end loop;
        if jsonb_typeof(v_ids)='array' and jsonb_array_length(v_ids)>0 then v_moved := v_moved||jsonb_build_object(t.tbl||'.'||t.col, v_ids); v_cnt := v_cnt+jsonb_array_length(v_ids);
        elsif jsonb_typeof(v_ids)='number' and v_ids::text<>'0' then v_moved := v_moved||jsonb_build_object(t.tbl||'.'||t.col, v_ids); v_cnt := v_cnt+(v_ids::text)::int;
        end if;
      end loop;

      -- the duplicate: switched off and labelled, never deleted; old Charge Master name row switched off
      update public.consumable_store_items set active=false, item_name=left(item_name,80)||' [merged into '||m.keep_code||']' where id=m.drop_id;
      update public.charge_tariff_master set is_active=false
       where lower(trim(service_name))=lower(trim(m.drop_name)) and lower(trim(service_name))<>lower(trim(m.keep_name))
         and category in ('Consumables','Pharmacy & Basic Supplies','Pharmacy');
      -- rate: never overwritten; only filled when the kept item had none
      if m.keep_rate is null and m.drop_rate is not null then
        update public.consumable_store_items set charge_rate=m.drop_rate where id=m.keep_id;
      end if;

      insert into public.store_item_merges(verification_id,keep_item_id,keep_code,keep_name,merged_item_id,merged_code,merged_name,moved_rows)
      values(v_pv,m.keep_id,m.keep_code,m.keep_name,m.drop_id,m.drop_code,m.drop_name,v_moved);
      n := n+1;
      rep := rep||jsonb_build_object('seq',n,'code',m.drop_code,'name',m.drop_name,'action','MERGED into '||m.keep_code,
        'note',v_cnt||' record(s) moved'||case when m.keep_rate is distinct from m.drop_rate
          then ' · rate: kept ₹'||coalesce(m.keep_rate::text,'—')||' / duplicate ₹'||coalesce(m.drop_rate::text,'—')||case when m.keep_rate is null and m.drop_rate is not null then ' (duplicate rate copied)' else ' (kept rate stays)' end else '' end);
    end loop;

    -- spelling fix on the kept Catheter Tip Syringe (Charge Master name row follows)
    update public.charge_tariff_master set service_name='Catheter Tip Syringe'
     where lower(trim(service_name))=lower(trim((select item_name from public.consumable_store_items where item_code='CON-0080')))
       and not exists(select 1 from public.charge_tariff_master x where x.service_name='Catheter Tip Syringe' and x.category=charge_tariff_master.category);
    update public.consumable_store_items set item_name='Catheter Tip Syringe' where item_code='CON-0080' and item_name<>'Catheter Tip Syringe';

    -- 2d. Bring each item to the shelf count -----------------------------------------------------
    perform set_config('samara.stock_reset','on',true);   -- lets an old decimal balance (e.g. 2.5) be squared off
    for k in select s.*, i.id, i.item_name from pv_sheet s join public.consumable_store_items i on i.item_code=s.code
              where s.act in ('count','remove','to_biomedical','to_pharmacy') order by s.code loop
      select coalesce(sum(qty_in),0)-coalesce(sum(qty_out),0) into v_bal from public.consumable_store_ledger where item_id=k.id and voided_at is null;
      select coalesce(sum(qty_in),0)-coalesce(sum(qty_out),0) into v_since from public.consumable_store_ledger
       where item_id=k.id and voided_at is null and movement_at>c_count;
      v_erp := v_bal-v_since;
      v_diff := k.shelf-v_erp;
      v_led := null;
      if v_diff<>0 then
        insert into public.consumable_store_ledger(item_id,movement_type,qty_in,qty_out,balance_after,reference_text,remarks,actor_id,actor_name)
        values(k.id, case when v_diff>0 then 'Adjustment In' else 'Adjustment Out' end, greatest(v_diff,0), greatest(-v_diff,0), v_bal+v_diff,
          case when k.act='remove' then 'Removed from Stores – '||c_label
               when k.act='to_biomedical' then 'Moved to Biomedical Equipment – '||c_label
               when v_diff>0 then 'Opening Stock – '||c_label
               else 'Unknown Usage – '||c_label end,
          'Shelf count '||rtrim(to_char(k.shelf,'FM999999990.99'),'.')||' · ERP at 03:14 PM '||rtrim(to_char(v_erp,'FM999999990.99'),'.')
            ||case when v_since<>0 then ' · moved after count '||rtrim(to_char(v_since,'FM999999990.99'),'.') else '' end
            ||case when v_diff<0 then ' · not charged to any Guest' else '' end,
          v_actor, v_actor_name)
        returning id into v_led;
      end if;
      insert into public.store_physical_verification_lines(verification_id,item_id,item_code,item_name,action,erp_at_count,moved_since_count,shelf_count,adjustment,ledger_id)
      values(v_pv,k.id,k.code,k.item_name,
        case when k.act='remove' then 'Removed from Stores' when k.act='to_biomedical' then 'Moved to Biomedical Equipment'
             when k.act='to_pharmacy' then 'Moved to Pharmacy' when v_diff>0 then 'Opening Stock' when v_diff<0 then 'Unknown Usage' else 'Matches' end,
        v_erp,v_since,k.shelf,v_diff,v_led);
      n := n+1;
      rep := rep||jsonb_build_object('seq',n,'code',k.code,'name',k.item_name,
        'action',case when k.act='remove' then 'REMOVED from Stores' when k.act='to_biomedical' then 'MOVED to Biomedical Equipment'
                      when k.act='to_pharmacy' then 'MOVED to Pharmacy' when v_diff>0 then 'Opening Stock +'||rtrim(to_char(v_diff,'FM999999990.99'),'.')
                      when v_diff<0 then 'Unknown Usage '||rtrim(to_char(v_diff,'FM999999990.99'),'.') else 'matches — no change' end,
        'erp',v_erp,'since',v_since,'shelf',k.shelf,'adj',v_diff,
        'note',case when k.code in ('CON-0072','CON-0076','CON-0102','CON-0080','CON-0047','CON-0091') then 'after merge' else null end);
    end loop;
    perform set_config('samara.stock_reset','off',true);

    -- 2e. Removals and moves ---------------------------------------------------------------------
    update public.consumable_store_items set active=false
     where item_code in (select code from pv_sheet where act in ('remove','to_biomedical'));

    -- INJ.Avil → Pharmacy (new PHA- code only if the item has never been used, so old records keep matching)
    select i.id, i.item_name into d from public.consumable_store_items i where i.item_code='CON-0081';
    v_has_hist := exists(select 1 from public.consumable_store_ledger where item_id=d.id)
               or exists(select 1 from public.patient_consumable_indents where store_item_id=d.id)
               or exists(select 1 from public.bill_charge_requests where store_item_id=d.id or charge_item_code='CON-0081');
    if v_has_hist then v_code := 'CON-0081';
    else v_code := 'PHA-'||lpad(nextval('public.samara_pharmacy_code_seq')::text,4,'0'); end if;
    update public.consumable_store_items set item_category='Pharmacy', item_code=v_code where id=d.id;
    update public.charge_tariff_master set category='Pharmacy & Basic Supplies'
     where lower(trim(service_name))=lower(trim(d.item_name)) and category='Consumables'
       and not exists(select 1 from public.charge_tariff_master x where x.category='Pharmacy & Basic Supplies' and lower(trim(x.service_name))=lower(trim(d.item_name)));
    rep := rep||jsonb_build_object('seq',n+1,'code','CON-0081','name',d.item_name,'action','now in Pharmacy as '||v_code,
            'note',case when v_has_hist then 'has history — code kept' else 'new Pharmacy code' end);
    n := n+1;

    -- Pulse Oximeter → Biomedical Equipment item master (pieces are added there per piece, as for BP cuff / thermometer)
    if not exists(select 1 from public.biomedical_equipment_items where lower(item_name) like '%oximeter%') then
      insert into public.biomedical_equipment_items(item_name,notes,active,created_by,created_by_name)
      values('Pulse Oximeter','Moved from Consumables (CON-0097) — '||c_label,true,v_actor,v_actor_name);
      rep := rep||jsonb_build_object('seq',n+1,'code','(Equipment)','name','Pulse Oximeter','action','added to Biomedical Equipment items','note','add each piece in Biomedical Equipment');
    else
      rep := rep||jsonb_build_object('seq',n+1,'code','(Equipment)','name','Pulse Oximeter','action','already in Biomedical Equipment items','note',null);
    end if;
    n := n+1;

    -- items that are active in Consumables but were not on the printed sheet: left untouched, listed
    for d in select i.item_code, i.item_name from public.consumable_store_items i
              where coalesce(i.item_category,'Consumables')='Consumables' and coalesce(i.active,true)
                and not exists(select 1 from pv_sheet s where s.code=i.item_code) order by i.item_code loop
      n := n+1;
      rep := rep||jsonb_build_object('seq',n,'code',d.item_code,'name',d.item_name,'action','NOT on the count sheet — unchanged','note','check');
    end loop;

    if not p_apply then raise exception using errcode='P0001', message='SAMARA_PREVIEW_ONLY'; end if;
  exception when sqlstate 'P0001' then
    if sqlerrm<>'SAMARA_PREVIEW_ONLY' then raise; end if;
    -- preview: every change above has been undone; only the report is kept
  end;

  return query
    select (x->>'seq')::int, x->>'code', x->>'name',
           case when p_apply then '' else 'PREVIEW · ' end || (x->>'action'),
           (x->>'erp')::numeric, (x->>'since')::numeric, (x->>'shelf')::numeric, (x->>'adj')::numeric, x->>'note'
      from jsonb_array_elements(rep) x order by (x->>'seq')::int;
end; $function$;
revoke all on function public.samara_pv_consumables_20102026(boolean) from public, anon, authenticated;

notify pgrst,'reload schema';
commit;

-- 3. PREVIEW — nothing is changed. Read the table: action column shows what STEP 2 will do.
select * from public.samara_pv_consumables_20102026(false);
