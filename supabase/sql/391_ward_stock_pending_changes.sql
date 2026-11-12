-- 2.20.60 — Ward Stock: changes during an accepted shift wait for the nurse on duty.
-- Once a nurse has accepted the cupboard (opening count) for the current shift — or the incoming nurse has accepted
-- the next one — any Add items / Edit / Return by the Nursing Manager becomes a PENDING change. Nothing moves
-- (Main Store or cupboard) until the nurse on duty taps Confirm; she can also reject it (items not received).
-- While a change is pending, the closing count and the morning verification wait for it.
begin;

create table if not exists public.night_stock_transfers(
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('In','Out')),
  items jsonb not null,
  note text,
  status text not null default 'Pending' check(status in ('Pending','Confirmed','Rejected','Cancelled')),
  requested_by uuid references public.profiles(id), requested_by_name text, requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id), decided_by_name text, decided_at timestamptz, decision_note text
);
alter table public.night_stock_transfers enable row level security;
revoke all on public.night_stock_transfers from anon,authenticated;
grant select on public.night_stock_transfers to authenticated;
drop policy if exists night_stock_transfers_read on public.night_stock_transfers;
create policy night_stock_transfers_read on public.night_stock_transfers for select to authenticated using (exists(select 1 from public.duty_profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true) and p.role in ('Admin','Manager','Nurse')));

-- Is a nurse holding the cupboard now? (current shift accepted and not closed, or next shift already accepted)
create or replace function public.ward_stock_shift_open() returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c record; nd date; ns text;
begin
  select * into c from public.ward_shift_of(now());
  if c.shift='Day' then nd:=c.shift_date; ns:='Night'; else nd:=c.shift_date+1; ns:='Day'; end if;
  return exists(select 1 from public.night_stock_nights n where n.night_date=c.shift_date and n.shift=c.shift and n.accepted_at is not null and n.closed_at is null and n.status not in ('Verified','Verified – Discrepancy'))
      or exists(select 1 from public.night_stock_nights n where n.night_date=nd and n.shift=ns and n.accepted_at is not null);
end $$;

-- Move items between the Main Store and the cupboard (In = to cupboard, Out = back to Main Store).
create or replace function public.ward_stock_apply_move(p_kind text,p_items jsonb,p_note text,p_date date,p_shift text,p_actor uuid,p_actor_name text,p_transfer uuid)
returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare x jsonb; q numeric; itm public.consumable_store_items%rowtype; cbal numeric; bal numeric; cid uuid; n int:=0; nowist timestamp:=(now() at time zone 'Asia/Kolkata');
begin
  insert into public.night_stock_nights(night_date,shift) values(p_date,p_shift) on conflict(night_date,shift) do nothing;
  for x in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    q:=(x->>'qty')::numeric;
    continue when q is null or q=0;
    if q<0 or q<>trunc(q) then raise exception 'Quantities must be whole numbers.'; end if;
    select * into itm from public.consumable_store_items where id=(x->>'store_item_id')::uuid for update;
    if not found then raise exception 'Item not found.'; end if;
    select balance_qty into cbal from public.consumable_store_stock where item_id=itm.id;
    cid:=gen_random_uuid();
    if p_kind='In' then
      if not itm.active or coalesce(itm.item_category,'Consumables') not in ('Consumables','Pharmacy') then raise exception 'Only active Consumables / Pharmacy items can be added to Ward Stock.'; end if;
      if coalesce(cbal,0)<q then raise exception 'Main Store has only % % of %.',coalesce(cbal,0),itm.unit,itm.item_name; end if;
      insert into public.night_stock_items(store_item_id,par_qty,active,updated_by,updated_by_name,updated_at)
      values(itm.id,q,true,p_actor,p_actor_name,now())
      on conflict(store_item_id) do update set par_qty=case when public.night_stock_items.active then public.night_stock_items.par_qty else excluded.par_qty end,
        active=true,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=now();
      insert into public.consumable_store_ledger(id,item_id,movement_type,qty_in,qty_out,balance_after,reference_text,actor_id,actor_name,remarks)
      values(cid,itm.id,'Department Issue',0,q,coalesce(cbal,0)-q,concat('Ward Stock top-up ',to_char(nowist,'DD-MM-YYYY')),p_actor,p_actor_name,coalesce(p_note,'Issued to the Ward Stock cupboard'));
      insert into public.night_stock_ledger(night_date,shift,store_item_id,movement,qty,central_ledger_id,actor_id,actor_name,remarks)
      values(p_date,p_shift,itm.id,'Top-up',q,cid,p_actor,p_actor_name,p_note);
    else
      bal:=public.night_stock_balance(itm.id);
      if bal<q then raise exception 'Ward Stock has only % % of %.',bal,itm.unit,itm.item_name; end if;
      insert into public.consumable_store_ledger(id,item_id,movement_type,qty_in,qty_out,balance_after,reference_text,actor_id,actor_name,remarks)
      values(cid,itm.id,'Return to Store',q,0,coalesce(cbal,0)+q,concat('Ward Stock return ',to_char(nowist,'DD-MM-YYYY')),p_actor,p_actor_name,p_note);
      insert into public.night_stock_ledger(night_date,shift,store_item_id,movement,qty,central_ledger_id,actor_id,actor_name,remarks)
      values(p_date,p_shift,itm.id,'Return to Store',-q,cid,p_actor,p_actor_name,p_note);
    end if;
    n:=n+1;
  end loop;
  if n=0 then raise exception 'Enter at least one quantity.'; end if;
  perform public.record_audit_event(case when p_kind='In' then 'Ward Stock top-up' else 'Ward Stock return' end,'Ward Stock',coalesce(p_transfer::text,p_date::text||' '||p_shift),jsonb_build_object('items',n),'Success');
  return n;
end $$;
revoke all on function public.ward_stock_apply_move(text,jsonb,text,date,text,uuid,text,uuid) from public,anon,authenticated;

-- Workspace -------------------------------------------------------------------------------------------
create or replace function public.night_stock_workspace() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare acc jsonb:=public.night_stock_access(); mgr boolean:=coalesce((public.night_stock_access()->>'manage')::boolean,false);
  c record; since date;
begin
  if not coalesce((acc->>'ok')::boolean,false) then raise exception 'Ward Stock is for Nurses, the Nursing Manager and Admin.'; end if;
  select * into c from public.ward_shift_of(now());
  since:=c.shift_date-90;
  return jsonb_build_object(
    'access',acc,'current_shift',jsonb_build_object('date',c.shift_date,'shift',c.shift),
    'minutes_into_shift',floor(extract(epoch from (now()-((c.shift_date+case when c.shift='Day' then time '07:00' else time '19:00' end) at time zone 'Asia/Kolkata')))/60),
    'now',now(),
    'items',coalesce((select jsonb_agg(jsonb_build_object('store_item_id',i.id,'item_name',i.item_name,'unit',i.unit,'category',i.item_category,'item_code',i.item_code,
        'par_qty',case when mgr then n.par_qty end,'active',coalesce(n.active,false),'in_list',n.store_item_id is not null,
        'central_balance',case when mgr then coalesce(s.balance_qty,0) end,'night_balance',case when mgr then coalesce((select sum(l.qty) from public.night_stock_ledger l where l.store_item_id=i.id),0) end) order by i.item_name)
      from public.consumable_store_items i left join public.night_stock_items n on n.store_item_id=i.id left join public.consumable_store_stock s on s.item_id=i.id
      where i.active and coalesce(i.item_category,'Consumables') in ('Consumables','Pharmacy') and (mgr or n.store_item_id is not null)),'[]'::jsonb),
    'shifts',coalesce((select jsonb_agg(to_jsonb(n) order by n.night_date desc,n.shift desc) from public.night_stock_nights n where n.night_date>=since),'[]'::jsonb),
    'ledger',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from public.night_stock_ledger l where l.night_date>=since and (mgr or l.movement='Use')),'[]'::jsonb),
    'transfers',coalesce((select jsonb_agg(to_jsonb(t) order by t.requested_at desc) from public.night_stock_transfers t where t.status='Pending' or t.requested_at>now()-interval '3 days'),'[]'::jsonb),
    'counts',case when mgr then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.night_stock_counts x where x.night_date>=since),'[]'::jsonb) else '[]'::jsonb end);
end $$;

-- All actions -----------------------------------------------------------------------------------------
create or replace function public.night_stock_post(p_id uuid,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_variable
declare a record; acc jsonb:=public.night_stock_access(); c record; sd date; ss text; nt public.night_stock_nights%rowtype;
  x jsonb; itm public.consumable_store_items%rowtype; q numeric; bal numeric; cbal numeric; cid uuid; lid uuid; iid uuid; prior jsonb; note text; diff boolean:=false;
  pat public.patients%rowtype; res jsonb:='{}'::jsonb; nowist timestamp:=(now() at time zone 'Asia/Kolkata'); late boolean:=false; n int:=0; cur_rank int; mins int;
  mgr boolean; latest public.night_stock_nights%rowtype; tr public.night_stock_transfers%rowtype;
begin
  if p_id is null then raise exception 'Missing request reference.'; end if;
  select o.result into prior from public.night_stock_ops o where id=p_id;
  if found then return coalesce(prior,'{}'::jsonb)||jsonb_build_object('already_saved',true); end if;
  select * into a from public.stores_actor();
  if not coalesce((acc->>'ok')::boolean,false) then raise exception 'Ward Stock is for Nurses, the Nursing Manager and Admin.'; end if;
  mgr:=coalesce((acc->>'manage')::boolean,false);
  note:=nullif(trim(coalesce(p_data->>'note','')),'');
  select * into c from public.ward_shift_of(now());
  cur_rank:=public.ward_shift_rank(c.shift_date,c.shift);
  mins:=floor(extract(epoch from (now()-((c.shift_date+case when c.shift='Day' then time '07:00' else time '19:00' end) at time zone 'Asia/Kolkata')))/60);

  if p_action='set_list' then
    if not mgr then raise exception 'Only the Nursing Manager or Admin can change the Ward Stock list.'; end if;
    for x in select * from jsonb_array_elements(coalesce(p_data->'items','[]'::jsonb)) loop
      select * into itm from public.consumable_store_items where id=(x->>'store_item_id')::uuid;
      if not found or coalesce(itm.item_category,'Consumables') not in ('Consumables','Pharmacy') then raise exception 'Only Consumables / Pharmacy items can be kept in Ward Stock.'; end if;
      q:=(x->>'par_qty')::numeric;
      if not coalesce((x->>'active')::boolean,true) and public.night_stock_balance(itm.id)<>0 then raise exception '% is still in the Ward Stock cupboard (%). Return it to the Main Store first, then remove it.',itm.item_name,public.night_stock_balance(itm.id); end if;
      if coalesce((x->>'active')::boolean,true) and (q is null or q<=0 or q<>trunc(q)) then raise exception 'Usual level for % must be a whole number above 0.',itm.item_name; end if;
      insert into public.night_stock_items(store_item_id,par_qty,active,updated_by,updated_by_name,updated_at)
      values(itm.id,greatest(coalesce(q,1),1),coalesce((x->>'active')::boolean,true),a.actor_id,a.actor_name,now())
      on conflict(store_item_id) do update set par_qty=excluded.par_qty,active=excluded.active,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=now();
      n:=n+1;
    end loop;
    perform public.record_audit_event('Ward Stock list updated','Ward Stock',null,jsonb_build_object('items',n),'Success');
    res:=jsonb_build_object('success',true,'items',n);

  elsif p_action in ('topup','return_to_store') then
    if not mgr then raise exception 'Only the Nursing Manager, her Stores leave cover or Admin can change Ward Stock quantities.'; end if;
    if p_action='topup' then
      select * into nt from public.night_stock_nights where public.ward_shift_rank(night_date,shift)<cur_rank and status not in ('Verified','Verified – Discrepancy') order by night_date desc,shift desc limit 1;
      if found then raise exception '% is not verified yet. Do Morning Verification first, then add items.',public.ward_shift_label(nt.night_date,nt.shift); end if;
    elsif note is null then raise exception 'Enter the reason for returning to the Main Store.';
    end if;
    -- 2.20.60: a nurse has accepted the cupboard for this (or the next) shift → the change waits for her confirmation.
    if public.ward_stock_shift_open() then
      if not exists(select 1 from jsonb_array_elements(coalesce(p_data->'items','[]'::jsonb)) e where coalesce((e->>'qty')::numeric,0)>0) then raise exception 'Enter at least one quantity.'; end if;
      insert into public.night_stock_transfers(kind,items,note,requested_by,requested_by_name)
      values(case when p_action='topup' then 'In' else 'Out' end,
        (select jsonb_agg(jsonb_build_object('store_item_id',e->>'store_item_id','qty',(e->>'qty')::numeric,'item_name',i.item_name,'unit',i.unit)) from jsonb_array_elements(p_data->'items') e join public.consumable_store_items i on i.id=(e->>'store_item_id')::uuid where coalesce((e->>'qty')::numeric,0)>0),
        note,a.actor_id,a.actor_name) returning id into cid;
      res:=jsonb_build_object('success',true,'pending',true,'transfer_id',cid);
    else
      n:=public.ward_stock_apply_move(case when p_action='topup' then 'In' else 'Out' end,p_data->'items',note,c.shift_date,c.shift,a.actor_id,a.actor_name,null);
      res:=jsonb_build_object('success',true,'items',n);
    end if;

  -- 2.20.60: the nurse on duty confirms (or rejects) a change made while she holds the cupboard
  elsif p_action in ('confirm_transfer','reject_transfer') then
    if not (acc->>'nurse')::boolean then raise exception 'The nurse on duty confirms Ward Stock changes from her Nurse login.'; end if;
    select * into tr from public.night_stock_transfers where id=(p_data->>'id')::uuid for update;
    if not found or tr.status<>'Pending' then raise exception 'This change is no longer waiting for confirmation.'; end if;
    if p_action='confirm_transfer' then
      n:=public.ward_stock_apply_move(tr.kind,tr.items,concat_ws(' · ',tr.note,'requested by '||tr.requested_by_name,'confirmed by '||a.actor_name),c.shift_date,c.shift,tr.requested_by,tr.requested_by_name,tr.id);
      update public.night_stock_transfers set status='Confirmed',decided_by=a.actor_id,decided_by_name=a.actor_name,decided_at=now() where id=tr.id;
    else
      if note is null then raise exception 'Enter why you are not accepting this change (e.g. items not received).'; end if;
      update public.night_stock_transfers set status='Rejected',decided_by=a.actor_id,decided_by_name=a.actor_name,decided_at=now(),decision_note=note where id=tr.id;
    end if;
    res:=jsonb_build_object('success',true);

  elsif p_action='cancel_transfer' then
    if not mgr then raise exception 'Only the Nursing Manager or Admin can cancel a pending change.'; end if;
    update public.night_stock_transfers set status='Cancelled',decided_by=a.actor_id,decided_by_name=a.actor_name,decided_at=now(),decision_note=note where id=(p_data->>'id')::uuid and status='Pending';
    if not found then raise exception 'This change is no longer pending.'; end if;
    res:=jsonb_build_object('success',true);

  -- Opening count (incoming nurse) / Closing count (outgoing nurse) ------------------------------------
  elsif p_action in ('accept','close') then
    if not (acc->>'nurse')::boolean then raise exception 'Only a Nurse can do the Ward Stock counts.'; end if;
    if p_action='accept' then
      -- in the last hour of a shift the incoming nurse accepts the NEXT shift
      if mins>=660 then
        if c.shift='Day' then sd:=c.shift_date; ss:='Night'; else sd:=c.shift_date+1; ss:='Day'; end if;
      else sd:=c.shift_date; ss:=c.shift; end if;
    else
      -- the outgoing nurse closes her shift; in the first hours of the next shift she can still close the previous one
      if coalesce(p_data->>'which','')='previous' or (coalesce(p_data->>'which','')<>'current' and mins<120) then
        if c.shift='Day' then sd:=c.shift_date-1; ss:='Night'; else sd:=c.shift_date; ss:='Day'; end if;
      else sd:=c.shift_date; ss:=c.shift; end if;
    end if;
    insert into public.night_stock_nights(night_date,shift) values(sd,ss) on conflict(night_date,shift) do nothing;
    select * into nt from public.night_stock_nights where night_date=sd and shift=ss for update;
    if nt.status in ('Verified','Verified – Discrepancy') then raise exception '% is already verified.',public.ward_shift_label(sd,ss); end if;
    if p_action='accept' and nt.accepted_at is not null then raise exception '% already accepted by % at %.',public.ward_shift_label(sd,ss),nt.accepted_by_name,to_char(nt.accepted_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI'); end if;
    if p_action='close' and exists(select 1 from public.night_stock_transfers where status='Pending') then raise exception 'A Ward Stock change from the Nursing Manager is waiting for your confirmation. Confirm or reject it first, then do the closing count.'; end if;
    if p_action='close' and nt.status='Closed' then raise exception 'Closing count for % already done by %.',public.ward_shift_label(sd,ss),nt.closed_by_name; end if;
    for x in select * from jsonb_array_elements(coalesce(p_data->'counts','[]'::jsonb)) loop
      q:=(x->>'counted')::numeric;
      if q is null or q<0 or q<>trunc(q) then raise exception 'Enter a whole-number count for every item (0 if none).'; end if;
      bal:=public.night_stock_balance((x->>'store_item_id')::uuid);
      if bal<>q then diff:=true; end if;
      insert into public.night_stock_counts(night_date,shift,store_item_id,kind,expected_qty,counted_qty,actor_id,actor_name)
      values(sd,ss,(x->>'store_item_id')::uuid,case when p_action='accept' then 'Opening' else 'Closing' end,bal,q,a.actor_id,a.actor_name)
      on conflict(night_date,shift,store_item_id,kind) do update set expected_qty=excluded.expected_qty,counted_qty=excluded.counted_qty,actor_id=excluded.actor_id,actor_name=excluded.actor_name,created_at=now();
      n:=n+1;
    end loop;
    if n=0 then raise exception 'Count every Ward Stock item.'; end if;
    if diff and note is null then raise exception 'Some counts do not match. Enter a note explaining the difference.'; end if;
    if p_action='accept' then
      update public.night_stock_nights set status=case when status='Stocked' then 'Accepted' else status end,accepted_by=a.actor_id,accepted_by_name=a.actor_name,accepted_at=now(),accept_note=note,accept_discrepancy=diff,updated_at=now() where night_date=sd and shift=ss;
    else
      update public.night_stock_nights set status='Closed',closed_by=a.actor_id,closed_by_name=a.actor_name,closed_at=now(),close_note=note,close_discrepancy=diff,updated_at=now() where night_date=sd and shift=ss;
    end if;
    perform public.record_audit_event(case when p_action='accept' then 'Ward Stock accepted' else 'Ward Stock closing count' end,'Ward Stock',sd::text||' '||ss,jsonb_build_object('items',n,'difference',diff),'Success');
    res:=jsonb_build_object('success',true,'shift_date',sd,'shift',ss,'difference',diff);

  -- Use for a Guest (Nurse, or the Nursing Manager) ----------------------------------------------------
  elsif p_action='use' then
    if not ((acc->>'nurse')::boolean or (acc->>'nm')::boolean) then raise exception 'Only a Nurse or the Nursing Manager can record Ward Stock use.'; end if;
    sd:=coalesce((p_data->>'shift_date')::date,c.shift_date); ss:=coalesce(p_data->>'shift',c.shift);
    if sd=c.shift_date and ss=c.shift then late:=false;
    else
      select * into nt from public.night_stock_nights where night_date=sd and shift=ss;
      if not found or nt.status in ('Verified','Verified – Discrepancy') or public.ward_shift_rank(sd,ss)>=cur_rank or public.ward_shift_rank(sd,ss)<cur_rank-3 then
        raise exception 'Late entry is possible only for a recent shift that is not verified yet.'; end if;
      if note is null then raise exception 'Late entry: enter why this use was not recorded during the shift.'; end if;
      late:=true;
    end if;
    select * into pat from public.patients where id=(p_data->>'patient_id')::uuid;
    if not found or not coalesce(pat.is_active,true) then raise exception 'Select an active Guest.'; end if;
    select * into itm from public.consumable_store_items where id=(p_data->>'store_item_id')::uuid for update;
    if not found then raise exception 'Select an item.'; end if;
    q:=(p_data->>'qty')::numeric;
    if q is null or q<=0 or q<>trunc(q) then raise exception 'Enter a whole-number quantity above 0.'; end if;
    bal:=public.night_stock_balance(itm.id);
    if bal<q then
      if mgr then raise exception 'Ward Stock has only % % of %.',bal,itm.unit,itm.item_name; end if;
      raise exception 'The ERP does not show that many % in the Ward Stock cupboard. Check the quantity; if you really used it, inform the Nursing Manager.',itm.item_name;
    end if;
    insert into public.night_stock_nights(night_date,shift) values(sd,ss) on conflict(night_date,shift) do nothing;
    lid:=gen_random_uuid(); iid:=gen_random_uuid();
    insert into public.patient_consumable_indents(id,patient_id,store_item_id,item_name,requested_qty,unit,request_remarks,status,
      approved_qty,approval_remarks,handed_over_qty,handover_remarks,received_qty,receipt_remarks,
      initiated_by,initiated_by_name,initiated_at,approved_by,approved_by_name,approved_at,handed_over_by,handed_over_by_name,handed_over_at,received_by,received_by_name,received_at,night_stock_ledger_id)
    values(iid,pat.id,itm.id,itm.item_name,q,itm.unit,concat('Ward Stock use',case when note is not null then ' — '||note end),'Received',
      q,'Ward Stock — issued earlier to the Ward Stock cupboard (no new Stores issue).',q,'Taken from the Ward Stock cupboard.',q,'Ward Stock use recorded by the nurse.',
      a.actor_id,a.actor_name,now(),a.actor_id,a.actor_name,now(),a.actor_id,a.actor_name,now(),a.actor_id,a.actor_name,now(),lid);
    insert into public.night_stock_ledger(id,night_date,shift,store_item_id,movement,qty,patient_id,indent_id,late_entry,actor_id,actor_name,remarks)
    values(lid,sd,ss,itm.id,'Use',-q,pat.id,iid,late,a.actor_id,a.actor_name,note);
    insert into public.patient_item_consumption(id,indent_id,patient_id,store_item_id,quantity,used_on,recorded_by,recorded_by_name,remarks)
    values(gen_random_uuid(),iid,pat.id,itm.id,q,(now() at time zone 'Asia/Kolkata')::date,a.actor_id,a.actor_name,'Ward Stock use');
    perform public.record_audit_event('Ward Stock use','Ward Stock',lid::text,jsonb_build_object('patient_id',pat.id,'item',itm.item_name,'qty',q,'late',late,'indent_id',iid,'shift',ss),'Success');
    res:=jsonb_build_object('success',true,'indent_id',iid);

  elsif p_action='return_to_nurse' then
    if not (acc->>'verify')::boolean then raise exception 'You cannot verify Ward Stock today.'; end if;
    sd:=(p_data->>'shift_date')::date; ss:=coalesce(p_data->>'shift','Night');
    select * into nt from public.night_stock_nights where night_date=sd and shift=ss for update;
    if not found or nt.status in ('Verified','Verified – Discrepancy') then raise exception 'Shift not found or already verified.'; end if;
    if note is null then raise exception 'Tell the nurse what to check.'; end if;
    update public.night_stock_nights set status='Returned',returned_by=a.actor_id,returned_by_name=a.actor_name,returned_at=now(),return_note=note,updated_at=now() where night_date=sd and shift=ss;
    res:=jsonb_build_object('success',true);

  -- Daily verification: covers every ended shift not yet verified --------------------------------------
  elsif p_action='verify' then
    if not (acc->>'verify')::boolean then raise exception 'Only the Nursing Manager (or, when she is off today, the Day duty nurse) can verify Ward Stock.'; end if;
    select * into latest from public.night_stock_nights where public.ward_shift_rank(night_date,shift)<cur_rank and status not in ('Verified','Verified – Discrepancy') order by night_date desc,shift desc limit 1 for update;
    if not found then raise exception 'No ended shift is waiting for verification.'; end if;
    if exists(select 1 from public.night_stock_transfers where status='Pending') then raise exception 'A Ward Stock change is waiting for the nurse on duty to confirm. Ask her to confirm (or cancel it), then verify.'; end if;
    if latest.closed_by is not null and latest.closed_by=a.actor_id and not (acc->>'admin')::boolean then raise exception 'The nurse who did the closing count cannot also verify it.'; end if;
    for x in select * from jsonb_array_elements(coalesce(p_data->'counts','[]'::jsonb)) loop
      q:=(x->>'counted')::numeric;
      if q is null or q<0 or q<>trunc(q) then raise exception 'Enter a whole-number count for every item (0 if none).'; end if;
      bal:=public.night_stock_balance((x->>'store_item_id')::uuid);
      insert into public.night_stock_counts(night_date,shift,store_item_id,kind,expected_qty,counted_qty,actor_id,actor_name)
      values(latest.night_date,latest.shift,(x->>'store_item_id')::uuid,'Verify',bal,q,a.actor_id,a.actor_name)
      on conflict(night_date,shift,store_item_id,kind) do update set expected_qty=excluded.expected_qty,counted_qty=excluded.counted_qty,actor_id=excluded.actor_id,actor_name=excluded.actor_name,created_at=now();
      if bal<>q then
        diff:=true;
        if note is null then raise exception 'Counts do not match. Enter the reason (or Return to the nurse to enter missed Guest use).'; end if;
        insert into public.night_stock_ledger(night_date,shift,store_item_id,movement,qty,actor_id,actor_name,remarks)
        values(latest.night_date,latest.shift,(x->>'store_item_id')::uuid,'Count Adjustment',q-bal,a.actor_id,a.actor_name,note);
      end if;
      n:=n+1;
    end loop;
    if n=0 then raise exception 'Count every Ward Stock item.'; end if;
    update public.night_stock_nights set status=case when diff and night_date=latest.night_date and shift=latest.shift then 'Verified – Discrepancy' else 'Verified' end,
      verified_by=a.actor_id,verified_by_name=a.actor_name,verified_at=now(),verify_note=note,verifier_as=acc->>'verify_as',updated_at=now()
      where public.ward_shift_rank(night_date,shift)<cur_rank and status not in ('Verified','Verified – Discrepancy');
    perform public.record_audit_event('Ward Stock verified','Ward Stock',latest.night_date::text||' '||latest.shift,jsonb_build_object('difference',diff,'verified_as',acc->>'verify_as'),'Success');
    res:=jsonb_build_object('success',true,'difference',diff);
  else
    raise exception 'Unknown Ward Stock action.';
  end if;

  insert into public.night_stock_ops(id,action,result) values(p_id,p_action,res);
  return res;
end $$;

-- Alerts ----------------------------------------------------------------------------------------------
create or replace function public.night_stock_alerts() returns table(alert_key text,audience text,title text,detail text,night_date date,alert_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare acc jsonb:=public.night_stock_access(); c record; mins int; nt public.night_stock_nights%rowtype; tr public.night_stock_transfers%rowtype; cur_rank int; nowist timestamp:=(now() at time zone 'Asia/Kolkata');
begin
  if not coalesce((acc->>'ok')::boolean,false) or not exists(select 1 from public.night_stock_items where active) then return; end if;
  select * into c from public.ward_shift_of(now());
  cur_rank:=public.ward_shift_rank(c.shift_date,c.shift);
  mins:=floor(extract(epoch from (now()-((c.shift_date+case when c.shift='Day' then time '07:00' else time '19:00' end) at time zone 'Asia/Kolkata')))/60);
  if (acc->>'nurse')::boolean then
    select * into nt from public.night_stock_nights n where n.night_date=c.shift_date and n.shift=c.shift;
    if mins>=30 and mins<660 and (nt.night_date is null or nt.accepted_at is null) then
      alert_key:='ws-accept-'||c.shift_date||c.shift; audience:='nurse'; title:='Accept Ward Stock (opening count)';
      detail:=c.shift||' shift: count the Ward Stock cupboard and tap Opening Count / Accept in Nursing → Ward Stock.'; night_date:=c.shift_date; alert_at:=now(); return next; end if;
    if mins>=690 and coalesce(nt.status,'') not in ('Closed','Verified','Verified – Discrepancy') then
      alert_key:='ws-close-'||c.shift_date||c.shift; audience:='nurse'; title:='Ward Stock closing count due';
      detail:='Before your shift ends, record every item used, then count the cupboard and tap Closing Count.'; night_date:=c.shift_date; alert_at:=now(); return next; end if;
    for tr in select * from public.night_stock_transfers t where t.status='Pending' loop
      alert_key:='ws-transfer-'||tr.id; audience:='nurse'; title:=case when tr.kind='In' then 'Confirm items added to Ward Stock' else 'Confirm items taken out of Ward Stock' end;
      detail:=concat(tr.requested_by_name,case when tr.kind='In' then ' is adding items to the cupboard' else ' is taking items out of the cupboard' end,'. Check them and tap Confirm in Nursing → Ward Stock → Changes to confirm.'); night_date:=c.shift_date; alert_at:=tr.requested_at; return next;
    end loop;
    for nt in select * from public.night_stock_nights n where n.status='Returned' and n.night_date>=c.shift_date-3 loop
      alert_key:='ws-returned-'||nt.night_date||nt.shift; audience:='nurse'; title:='Ward Stock returned — enter missed Guest use';
      detail:=concat(public.ward_shift_label(nt.night_date,nt.shift),': ',nt.return_note,' (',nt.returned_by_name,')'); night_date:=nt.night_date; alert_at:=nt.returned_at; return next;
    end loop;
  end if;
  -- previous shift not closed, 30 minutes after it ended → Nursing Manager / Admin
  if (acc->>'manage')::boolean and mins>=30 then
    select * into nt from public.night_stock_nights n where public.ward_shift_rank(n.night_date,n.shift)=cur_rank-1;
    if nt.night_date is not null and nt.closed_at is null and nt.status not in ('Verified','Verified – Discrepancy') then
      alert_key:='ws-noclose-'||nt.night_date||nt.shift; audience:='manager'; title:='Ward Stock closing count not done';
      detail:=concat(public.ward_shift_label(nt.night_date,nt.shift),': the outgoing nurse did not do the closing count.'); night_date:=nt.night_date; alert_at:=now(); return next;
    end if;
  end if;
  -- daily verification (Day shift hours) → verifier; not done by 10:00 → Admin
  if c.shift='Day' and exists(select 1 from public.night_stock_nights n where public.ward_shift_rank(n.night_date,n.shift)<cur_rank and n.status not in ('Verified','Verified – Discrepancy','Returned')) then
    if (acc->>'verify')::boolean and not (acc->>'admin')::boolean then
      alert_key:='ws-verify-'||c.shift_date; audience:='verifier'; title:='Ward Stock — morning verification due';
      detail:='Count the Ward Stock cupboard and tap Morning Verification in Nursing → Ward Stock.'; night_date:=c.shift_date; alert_at:=now(); return next;
    elsif (acc->>'admin')::boolean and extract(hour from nowist)>=10 then
      alert_key:='ws-verify-late-'||c.shift_date; audience:='admin'; title:='Ward Stock not verified by 10:00';
      detail:='Please follow up with the Nursing Manager / Day duty nurse.'; night_date:=c.shift_date; alert_at:=now(); return next;
    end if;
  end if;
  if (acc->>'manage')::boolean then
    for tr in select * from public.night_stock_transfers t where t.status='Rejected' and t.decided_at>now()-interval '24 hours' loop
      alert_key:='ws-transfer-rej-'||tr.id; audience:='manager'; title:='Ward Stock change not accepted by the nurse';
      detail:=concat(tr.decided_by_name,': ',tr.decision_note); night_date:=c.shift_date; alert_at:=tr.decided_at; return next;
    end loop;
  end if;
  if (acc->>'manage')::boolean then
    for nt in select * from public.night_stock_nights n where public.ward_shift_rank(n.night_date,n.shift)>=cur_rank-2 and (n.accept_discrepancy or n.close_discrepancy) and n.status not in ('Verified','Verified – Discrepancy') loop
      alert_key:='ws-diff-'||nt.night_date||nt.shift||(nt.accept_discrepancy)::text||(nt.close_discrepancy)::text; audience:='manager'; title:='Ward Stock count difference reported';
      detail:=concat(public.ward_shift_label(nt.night_date,nt.shift),': ',coalesce(nt.close_note,nt.accept_note,'count differs from the ERP')); night_date:=nt.night_date; alert_at:=coalesce(nt.closed_at,nt.accepted_at); return next;
    end loop;
  end if;
end $$;
revoke all on function public.night_stock_alerts() from public,anon;
grant execute on function public.night_stock_alerts() to authenticated;

revoke all on function public.night_stock_alerts() from public,anon;
grant execute on function public.night_stock_alerts(),public.ward_stock_shift_open() to authenticated;
notify pgrst,'reload schema';
commit;
