-- 2.20.54 — Night Stock: one "Add items to Night Stock" screen.
-- Top-up now also puts a new item on the Night Stock list (first quantity = its usual level),
-- so there is no separate Item List step. Removing an item is allowed only when none is left in the cupboard.
-- Replaces night_stock_post only (same name / parameters). Nothing else changes.
begin;
-- One entry point for every action (idempotent by p_id).
create or replace function public.night_stock_post(p_id uuid,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; acc jsonb:=public.night_stock_access(); cur date:=public.night_stock_night_of(now()); nightd date; nt public.night_stock_nights%rowtype;
  x jsonb; itm public.consumable_store_items%rowtype; q numeric; bal numeric; cbal numeric; cid uuid; lid uuid; iid uuid; prior jsonb; note text; diff boolean:=false;
  pat public.patients%rowtype; res jsonb:='{}'::jsonb; nowist timestamp:=(now() at time zone 'Asia/Kolkata'); late boolean:=false; n int:=0;
begin
  if p_id is null then raise exception 'Missing request reference.'; end if;
  select o.result into prior from public.night_stock_ops o where id=p_id;
  if found then return coalesce(prior,'{}'::jsonb)||jsonb_build_object('already_saved',true); end if;
  select * into a from public.stores_actor();
  if not coalesce((acc->>'ok')::boolean,false) then raise exception 'Night Stock is for Nurses, the Nursing Manager and Admin.'; end if;
  note:=nullif(trim(coalesce(p_data->>'note','')),'');

  -- Nursing Manager / Admin: the item list and set levels ---------------------------------------------
  if p_action='set_list' then
    if not (acc->>'manage')::boolean then raise exception 'Only the Nursing Manager or Admin can change the Night Stock list.'; end if;
    for x in select * from jsonb_array_elements(coalesce(p_data->'items','[]'::jsonb)) loop
      select * into itm from public.consumable_store_items where id=(x->>'store_item_id')::uuid;
      if not found or coalesce(itm.item_category,'Consumables') not in ('Consumables','Pharmacy') then raise exception 'Only Consumables / Pharmacy items can be kept in Night Stock.'; end if;
      q:=(x->>'par_qty')::numeric;
      if not coalesce((x->>'active')::boolean,true) and public.night_stock_balance(itm.id)<>0 then raise exception '% is still in the Night Stock cupboard (%). Return it to the Main Store first, then remove it.',itm.item_name,public.night_stock_balance(itm.id); end if;
      if coalesce((x->>'active')::boolean,true) and (q is null or q<=0 or q<>trunc(q)) then raise exception 'Set level for % must be a whole number above 0.',itm.item_name; end if;
      insert into public.night_stock_items(store_item_id,par_qty,active,updated_by,updated_by_name,updated_at)
      values(itm.id,greatest(coalesce(q,1),1),coalesce((x->>'active')::boolean,true),a.actor_id,a.actor_name,now())
      on conflict(store_item_id) do update set par_qty=excluded.par_qty,active=excluded.active,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=now();
      n:=n+1;
    end loop;
    perform public.record_audit_event('Night Stock list updated','Night Stock',null,jsonb_build_object('items',n),'Success');
    res:=jsonb_build_object('success',true,'items',n);

  -- Top up from the Main Store -----------------------------------------------------------------------
  elsif p_action='topup' then
    if not (acc->>'manage')::boolean then raise exception 'Only the Nursing Manager, her Stores leave cover or Admin can top up Night Stock.'; end if;
    select * into nt from public.night_stock_nights where night_date<cur and status not in ('Verified','Verified – Discrepancy') order by night_date desc limit 1;
    if found then raise exception 'Night of % is not verified yet. Do the morning verification first, then top up.',to_char(nt.night_date,'DD-MM-YYYY'); end if;
    insert into public.night_stock_nights(night_date) values(cur) on conflict(night_date) do nothing;
    for x in select * from jsonb_array_elements(coalesce(p_data->'items','[]'::jsonb)) loop
      q:=(x->>'qty')::numeric;
      continue when q is null or q=0;
      if q<0 or q<>trunc(q) then raise exception 'Top-up quantities must be whole numbers.'; end if;
      select * into itm from public.consumable_store_items where id=(x->>'store_item_id')::uuid for update;
      if not found or not itm.active or coalesce(itm.item_category,'Consumables') not in ('Consumables','Pharmacy') then raise exception 'Only active Consumables / Pharmacy items can be added to Night Stock.'; end if;
      -- 2.20.54: adding an item puts it on the Night Stock list; its first quantity becomes its usual level.
      insert into public.night_stock_items(store_item_id,par_qty,active,updated_by,updated_by_name,updated_at)
      values(itm.id,q,true,a.actor_id,a.actor_name,now())
      on conflict(store_item_id) do update set par_qty=case when public.night_stock_items.active then public.night_stock_items.par_qty else excluded.par_qty end,
        active=true,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=now();
      select balance_qty into cbal from public.consumable_store_stock where item_id=itm.id;
      if coalesce(cbal,0)<q then raise exception 'Main Store has only % % of %.',coalesce(cbal,0),itm.unit,itm.item_name; end if;
      cid:=gen_random_uuid();
      insert into public.consumable_store_ledger(id,item_id,movement_type,qty_in,qty_out,balance_after,reference_text,actor_id,actor_name,remarks)
      values(cid,itm.id,'Department Issue',0,q,coalesce(cbal,0)-q,concat('Night Stock top-up ',to_char(cur,'DD-MM-YYYY')),a.actor_id,a.actor_name,coalesce(note,'Issued to the Night Stock cupboard'));
      insert into public.night_stock_ledger(night_date,store_item_id,movement,qty,central_ledger_id,actor_id,actor_name,remarks)
      values(cur,itm.id,'Top-up',q,cid,a.actor_id,a.actor_name,note);
      n:=n+1;
    end loop;
    if n=0 then raise exception 'Enter at least one quantity to top up.'; end if;
    update public.night_stock_nights set updated_at=now() where night_date=cur;
    perform public.record_audit_event('Night Stock top-up','Night Stock',cur::text,jsonb_build_object('items',n),'Success');
    res:=jsonb_build_object('success',true,'items',n,'night_date',cur);

  -- Return items from the cupboard to the Main Store --------------------------------------------------
  elsif p_action='return_to_store' then
    if not (acc->>'manage')::boolean then raise exception 'Only the Nursing Manager, her Stores leave cover or Admin can return Night Stock to the Main Store.'; end if;
    if note is null then raise exception 'Enter the reason for returning to the Main Store.'; end if;
    for x in select * from jsonb_array_elements(coalesce(p_data->'items','[]'::jsonb)) loop
      q:=(x->>'qty')::numeric; continue when q is null or q=0;
      if q<0 or q<>trunc(q) then raise exception 'Return quantities must be whole numbers.'; end if;
      select * into itm from public.consumable_store_items where id=(x->>'store_item_id')::uuid for update;
      bal:=public.night_stock_balance(itm.id);
      if bal<q then raise exception 'Night Stock has only % % of %.',bal,itm.unit,itm.item_name; end if;
      select balance_qty into cbal from public.consumable_store_stock where item_id=itm.id;
      cid:=gen_random_uuid();
      insert into public.consumable_store_ledger(id,item_id,movement_type,qty_in,qty_out,balance_after,reference_text,actor_id,actor_name,remarks)
      values(cid,itm.id,'Return to Store',q,0,coalesce(cbal,0)+q,concat('Night Stock return ',to_char(cur,'DD-MM-YYYY')),a.actor_id,a.actor_name,note);
      insert into public.night_stock_ledger(night_date,store_item_id,movement,qty,central_ledger_id,actor_id,actor_name,remarks)
      values(cur,itm.id,'Return to Store',-q,cid,a.actor_id,a.actor_name,note);
      n:=n+1;
    end loop;
    if n=0 then raise exception 'Enter at least one quantity to return.'; end if;
    res:=jsonb_build_object('success',true,'items',n);

  -- Night nurse: opening count / accept ---------------------------------------------------------------
  elsif p_action in ('accept','close') then
    if not (acc->>'nurse')::boolean then raise exception 'Only a Nurse can do the Night Stock counts.'; end if;
    if p_action='accept' then
      if not public.night_stock_is_night(now()) and extract(hour from nowist)<18 then raise exception 'The opening count is done at the start of the night shift (from 18:00).'; end if;
      nightd:=case when extract(hour from nowist)>=18 then nowist::date else cur end;
    else
      -- During the night: tonight. After 07:00: the night that has just ended (late closing count).
      nightd:=case when public.night_stock_is_night(now()) then cur else cur-1 end;
    end if;
    insert into public.night_stock_nights(night_date) values(nightd) on conflict(night_date) do nothing;
    select * into nt from public.night_stock_nights where night_date=nightd for update;
    if nt.status in ('Verified','Verified – Discrepancy') then raise exception 'This night is already verified.'; end if;
    if p_action='accept' and nt.accepted_at is not null then raise exception 'Already accepted by % at %.',nt.accepted_by_name,to_char(nt.accepted_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI'); end if;
    if p_action='close' and nt.status='Closed' then raise exception 'Closing count already done by %.',nt.closed_by_name; end if;
    for x in select * from jsonb_array_elements(coalesce(p_data->'counts','[]'::jsonb)) loop
      q:=(x->>'counted')::numeric;
      if q is null or q<0 or q<>trunc(q) then raise exception 'Enter a whole-number count for every item (0 if none).'; end if;
      bal:=public.night_stock_balance((x->>'store_item_id')::uuid);
      if bal<>q then diff:=true; end if;
      insert into public.night_stock_counts(night_date,store_item_id,kind,expected_qty,counted_qty,actor_id,actor_name)
      values(nightd,(x->>'store_item_id')::uuid,case when p_action='accept' then 'Opening' else 'Closing' end,bal,q,a.actor_id,a.actor_name)
      on conflict(night_date,store_item_id,kind) do update set expected_qty=excluded.expected_qty,counted_qty=excluded.counted_qty,actor_id=excluded.actor_id,actor_name=excluded.actor_name,created_at=now();
      n:=n+1;
    end loop;
    if n=0 then raise exception 'Count every Night Stock item.'; end if;
    if diff and note is null then raise exception 'Some counts do not match the ERP. Enter a note explaining the difference.'; end if;
    if p_action='accept' then
      update public.night_stock_nights set status=case when status='Stocked' then 'Accepted' else status end,accepted_by=a.actor_id,accepted_by_name=a.actor_name,accepted_at=now(),accept_note=note,accept_discrepancy=diff,updated_at=now() where night_date=nightd;
    else
      update public.night_stock_nights set status='Closed',closed_by=a.actor_id,closed_by_name=a.actor_name,closed_at=now(),close_note=note,close_discrepancy=diff,updated_at=now() where night_date=nightd;
    end if;
    perform public.record_audit_event(case when p_action='accept' then 'Night Stock accepted' else 'Night Stock closing count' end,'Night Stock',nightd::text,jsonb_build_object('items',n,'difference',diff),'Success');
    res:=jsonb_build_object('success',true,'night_date',nightd,'difference',diff);

  -- Night nurse: use for a Guest ----------------------------------------------------------------------
  elsif p_action='use' then
    if not (acc->>'nurse')::boolean then raise exception 'Only a Nurse can record Night Stock use.'; end if;
    nightd:=coalesce((p_data->>'night_date')::date,cur);
    if nightd=cur and public.night_stock_is_night(now()) then late:=false;
    else
      -- Late entry: only for the night that has just ended, until it is verified.
      select * into nt from public.night_stock_nights where night_date=nightd;
      if public.night_stock_is_night(now()) or nightd<>cur-1 or not found or nt.status not in ('Accepted','Closed','Returned','Stocked') then
        raise exception 'Night Stock is for the night shift (19:00–07:00). Day-shift items go through Raise Indent.'; end if;
      if note is null then raise exception 'Late entry: enter why this use was not recorded during the night.'; end if;
      late:=true;
    end if;
    select * into pat from public.patients where id=(p_data->>'patient_id')::uuid;
    if not found or not coalesce(pat.is_active,true) then raise exception 'Select an active Guest.'; end if;
    select * into itm from public.consumable_store_items where id=(p_data->>'store_item_id')::uuid for update;
    if not found then raise exception 'Select an item.'; end if;
    q:=(p_data->>'qty')::numeric;
    if q is null or q<=0 or q<>trunc(q) then raise exception 'Enter a whole-number quantity above 0.'; end if;
    bal:=public.night_stock_balance(itm.id);
    if bal<q then raise exception 'Night Stock has only % % of %.',bal,itm.unit,itm.item_name; end if;
    insert into public.night_stock_nights(night_date) values(nightd) on conflict(night_date) do nothing;
    lid:=gen_random_uuid(); iid:=gen_random_uuid();
    insert into public.patient_consumable_indents(id,patient_id,store_item_id,item_name,requested_qty,unit,request_remarks,status,
      approved_qty,approval_remarks,handed_over_qty,handover_remarks,received_qty,receipt_remarks,
      initiated_by,initiated_by_name,initiated_at,approved_by,approved_by_name,approved_at,handed_over_by,handed_over_by_name,handed_over_at,received_by,received_by_name,received_at,night_stock_ledger_id)
    values(iid,pat.id,itm.id,itm.item_name,q,itm.unit,concat('Night Stock use',case when note is not null then ' — '||note end),'Received',
      q,'Night Stock — issued earlier to the Night Stock cupboard (no new Stores issue).',q,'Taken from the Night Stock cupboard.',q,'Night Stock use recorded by the night nurse.',
      a.actor_id,a.actor_name,now(),a.actor_id,a.actor_name,now(),a.actor_id,a.actor_name,now(),a.actor_id,a.actor_name,now(),lid);
    insert into public.night_stock_ledger(id,night_date,store_item_id,movement,qty,patient_id,indent_id,late_entry,actor_id,actor_name,remarks)
    values(lid,nightd,itm.id,'Use',-q,pat.id,iid,late,a.actor_id,a.actor_name,note);
    insert into public.patient_item_consumption(id,indent_id,patient_id,store_item_id,quantity,used_on,recorded_by,recorded_by_name,remarks)
    values(gen_random_uuid(),iid,pat.id,itm.id,q,(now() at time zone 'Asia/Kolkata')::date,a.actor_id,a.actor_name,'Night Stock use');
    perform public.record_audit_event('Night Stock use','Night Stock',lid::text,jsonb_build_object('patient_id',pat.id,'item',itm.item_name,'qty',q,'late',late,'indent_id',iid),'Success');
    res:=jsonb_build_object('success',true,'indent_id',iid,'balance',bal-q);

  -- Verifier returns the night to the night nurse (to enter missed Guest use) ----------------------------
  elsif p_action='return_to_nurse' then
    if not (acc->>'verify')::boolean then raise exception 'You cannot verify Night Stock today.'; end if;
    nightd:=(p_data->>'night_date')::date;
    select * into nt from public.night_stock_nights where night_date=nightd for update;
    if not found or nt.status in ('Verified','Verified – Discrepancy') then raise exception 'Night not found or already verified.'; end if;
    if note is null then raise exception 'Tell the night nurse what to check.'; end if;
    update public.night_stock_nights set status='Returned',returned_by=a.actor_id,returned_by_name=a.actor_name,returned_at=now(),return_note=note,updated_at=now() where night_date=nightd;
    res:=jsonb_build_object('success',true);

  -- Morning verification -------------------------------------------------------------------------------
  elsif p_action='verify' then
    if not (acc->>'verify')::boolean then raise exception 'Only the Nursing Manager (or, when she is off today, the Day duty nurse) can verify Night Stock.'; end if;
    nightd:=(p_data->>'night_date')::date;
    if nightd is null or nightd>=cur then raise exception 'A night can be verified after it ends (07:00).'; end if;
    select * into nt from public.night_stock_nights where night_date=nightd for update;
    if not found then raise exception 'Night not found.'; end if;
    if nt.status in ('Verified','Verified – Discrepancy') then raise exception 'Already verified by %.',nt.verified_by_name; end if;
    if nt.closed_by is not null and nt.closed_by=a.actor_id and not (acc->>'admin')::boolean then raise exception 'The nurse who did the closing count cannot also verify it.'; end if;
    for x in select * from jsonb_array_elements(coalesce(p_data->'counts','[]'::jsonb)) loop
      q:=(x->>'counted')::numeric;
      if q is null or q<0 or q<>trunc(q) then raise exception 'Enter a whole-number count for every item (0 if none).'; end if;
      bal:=public.night_stock_balance((x->>'store_item_id')::uuid);
      insert into public.night_stock_counts(night_date,store_item_id,kind,expected_qty,counted_qty,actor_id,actor_name)
      values(nightd,(x->>'store_item_id')::uuid,'Verify',bal,q,a.actor_id,a.actor_name)
      on conflict(night_date,store_item_id,kind) do update set expected_qty=excluded.expected_qty,counted_qty=excluded.counted_qty,actor_id=excluded.actor_id,actor_name=excluded.actor_name,created_at=now();
      if bal<>q then
        diff:=true;
        if note is null then raise exception 'Counts do not match the ERP. Enter the reason (or Return to the night nurse to enter missed Guest use).'; end if;
        insert into public.night_stock_ledger(night_date,store_item_id,movement,qty,actor_id,actor_name,remarks)
        values(nightd,(x->>'store_item_id')::uuid,'Count Adjustment',q-bal,a.actor_id,a.actor_name,note);
      end if;
      n:=n+1;
    end loop;
    if n=0 then raise exception 'Count every Night Stock item.'; end if;
    update public.night_stock_nights set status=case when diff then 'Verified – Discrepancy' else 'Verified' end,verified_by=a.actor_id,verified_by_name=a.actor_name,verified_at=now(),verify_note=note,verifier_as=acc->>'verify_as',updated_at=now() where night_date=nightd;
    perform public.record_audit_event('Night Stock verified','Night Stock',nightd::text,jsonb_build_object('difference',diff,'verified_as',acc->>'verify_as'),'Success');
    res:=jsonb_build_object('success',true,'difference',diff);
  else
    raise exception 'Unknown Night Stock action.';
  end if;

  insert into public.night_stock_ops(id,action,result) values(p_id,p_action,res);
  return res;
end $$;

notify pgrst,'reload schema';
commit;
