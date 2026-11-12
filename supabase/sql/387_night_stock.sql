-- 2.20.53 — Night Stock (Nursing → Night Stock)
-- The Nursing Manager (store keeper) is not on duty at night. A locked Night Stock cupboard at the nurses'
-- station holds a fixed list of Consumables / Pharmacy items at set levels.
--   Evening : Nursing Manager (or Stores leave cover / Admin) tops it up from the Main Store
--             (central ledger 'Department Issue', reference "Night Stock").
--   19:00   : night nurse counts and accepts (opening count).
--   Night   : night nurse records use for a Guest → creates a Guest indent already 'Received' + its use entry,
--             so the item is charged in Bills & Charges exactly like a day indent (no second stock deduction).
--   07:00   : night nurse closing count.
--   Morning : Nursing Manager verifies (or, when she is not on Day duty today, the Day-shift duty nurse).
--             Any difference is posted as a 'Count Adjustment' with a reason; or the night is returned to the
--             night nurse to enter missed Guest use.
-- Night shift only (19:00–07:00). Night date = the date the night shift starts.
-- New objects only. Existing tables / functions are not changed (one nullable column added to
-- patient_consumable_indents to link a night-stock use).
begin;

create table if not exists public.night_stock_items(
  store_item_id uuid primary key references public.consumable_store_items(id),
  par_qty numeric(12,2) not null check(par_qty>0),
  active boolean not null default true,
  updated_by uuid references public.profiles(id), updated_by_name text, updated_at timestamptz not null default now()
);

create table if not exists public.night_stock_nights(
  night_date date primary key,
  status text not null default 'Stocked' check(status in ('Stocked','Accepted','Closed','Returned','Verified','Verified – Discrepancy')),
  accepted_by uuid references public.profiles(id), accepted_by_name text, accepted_at timestamptz, accept_note text, accept_discrepancy boolean not null default false,
  closed_by uuid references public.profiles(id), closed_by_name text, closed_at timestamptz, close_note text, close_discrepancy boolean not null default false,
  returned_by uuid references public.profiles(id), returned_by_name text, returned_at timestamptz, return_note text,
  verified_by uuid references public.profiles(id), verified_by_name text, verified_at timestamptz, verify_note text, verifier_as text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.night_stock_ledger(
  id uuid primary key default gen_random_uuid(),
  night_date date not null,
  store_item_id uuid not null references public.consumable_store_items(id),
  movement text not null check(movement in ('Top-up','Use','Return to Store','Count Adjustment')),
  qty numeric(12,2) not null check(qty<>0),
  patient_id uuid references public.patients(id),
  indent_id uuid references public.patient_consumable_indents(id),
  central_ledger_id uuid,
  late_entry boolean not null default false,
  actor_id uuid references public.profiles(id), actor_name text, remarks text,
  created_at timestamptz not null default now()
);
create index if not exists night_stock_ledger_item_idx on public.night_stock_ledger(store_item_id);
create index if not exists night_stock_ledger_night_idx on public.night_stock_ledger(night_date);

create table if not exists public.night_stock_counts(
  id uuid primary key default gen_random_uuid(),
  night_date date not null,
  store_item_id uuid not null references public.consumable_store_items(id),
  kind text not null check(kind in ('Opening','Closing','Verify')),
  expected_qty numeric(12,2) not null, counted_qty numeric(12,2) not null check(counted_qty>=0),
  actor_id uuid references public.profiles(id), actor_name text, created_at timestamptz not null default now(),
  unique(night_date,store_item_id,kind)
);

create table if not exists public.night_stock_ops(id uuid primary key, action text not null, result jsonb, created_at timestamptz not null default now());

alter table public.patient_consumable_indents add column if not exists night_stock_ledger_id uuid;

-- Read access: clinical / stores staff. All writes go through night_stock_post().
do $$ declare t text; begin
  foreach t in array array['night_stock_items','night_stock_nights','night_stock_ledger','night_stock_counts','night_stock_ops'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;
grant select on public.night_stock_items,public.night_stock_nights,public.night_stock_ledger,public.night_stock_counts to authenticated;
drop policy if exists night_stock_items_read on public.night_stock_items;
create policy night_stock_items_read on public.night_stock_items for select to authenticated using (exists(select 1 from public.duty_profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true) and p.role in ('Admin','Manager','Nurse')));
drop policy if exists night_stock_nights_read on public.night_stock_nights;
create policy night_stock_nights_read on public.night_stock_nights for select to authenticated using (exists(select 1 from public.duty_profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true) and p.role in ('Admin','Manager','Nurse')));
drop policy if exists night_stock_ledger_read on public.night_stock_ledger;
create policy night_stock_ledger_read on public.night_stock_ledger for select to authenticated using (exists(select 1 from public.duty_profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true) and p.role in ('Admin','Manager','Nurse')));
drop policy if exists night_stock_counts_read on public.night_stock_counts;
create policy night_stock_counts_read on public.night_stock_counts for select to authenticated using (exists(select 1 from public.duty_profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true) and p.role in ('Admin','Manager','Nurse')));

-- Helpers -------------------------------------------------------------------------------------------
create or replace function public.night_stock_night_of(p_at timestamptz) returns date language sql immutable as $$
  select ((p_at at time zone 'Asia/Kolkata') - interval '7 hours')::date
$$;
create or replace function public.night_stock_is_night(p_at timestamptz default now()) returns boolean language sql stable as $$
  select extract(hour from (p_at at time zone 'Asia/Kolkata'))>=19 or extract(hour from (p_at at time zone 'Asia/Kolkata'))<7
$$;
create or replace function public.night_stock_balance(p_item uuid) returns numeric language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(sum(qty),0) from public.night_stock_ledger where store_item_id=p_item
$$;

-- Nursing Manager is "on Day duty today" when she has an active Day Shift row in the roster for today.
create or replace function public.night_stock_nm_on_day_duty(p_day date) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.duty_assignments d join public.duty_profiles p on p.id=d.employee_id
    where d.duty_date=p_day and d.shift ilike 'Day%' and coalesce(d.status,'') not in ('Cancelled','Absent','Weekly Off') and not coalesce(d.is_weekly_off,false)
      and lower(trim(coalesce(p.designation,''))) in ('nurse manager','nursing manager') and coalesce(p.is_active,true))
$$;

-- Who may verify the morning count:
--  Admin / Nursing Manager / Stores leave cover always; otherwise a Nurse on Day Shift today when the
--  Nursing Manager is not on Day duty today (leave / weekly off / absent / not rostered).
create or replace function public.night_stock_access() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a record; today date:=(now() at time zone 'Asia/Kolkata')::date; admin boolean; nm boolean; ctrl boolean; nurse boolean; day_nurse boolean; nm_day boolean;
begin
  select * into a from public.stores_actor();
  if a.actor_id is null then return jsonb_build_object('ok',false); end if;
  admin:=a.actor_role='Admin';
  nm:=public.current_user_is_nurse_manager();
  ctrl:=coalesce(public.stores_controller_authorised(),false);
  nurse:=a.actor_role='Nurse';
  nm_day:=public.night_stock_nm_on_day_duty(today);
  day_nurse:=nurse and exists(select 1 from public.duty_assignments d where d.employee_id=a.actor_id and d.duty_date=today and d.shift ilike 'Day%' and coalesce(d.status,'') not in ('Cancelled','Absent','Weekly Off') and not coalesce(d.is_weekly_off,false));
  return jsonb_build_object('ok',admin or nm or ctrl or nurse,'actor',a.actor_id,'name',a.actor_name,'admin',admin,'nm',nm,'controller',ctrl,'nurse',nurse,
    'manage',admin or nm or ctrl,
    'verify',admin or nm or ctrl or (day_nurse and not nm_day),
    'verify_as',case when nm then 'Nursing Manager' when admin then 'Admin' when ctrl then 'Stores in-charge (leave cover)' when day_nurse and not nm_day then 'Day duty nurse (Nursing Manager off today)' else null end,
    'nm_on_day_duty',nm_day,'day_nurse',day_nurse);
end $$;

-- Workspace: everything the page needs in one call.
create or replace function public.night_stock_workspace() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare acc jsonb:=public.night_stock_access(); cur date:=public.night_stock_night_of(now());
begin
  if not coalesce((acc->>'ok')::boolean,false) then raise exception 'Night Stock is for Nurses, the Nursing Manager and Admin.'; end if;
  return jsonb_build_object(
    'access',acc,'current_night',cur,'is_night',public.night_stock_is_night(now()),'now',now(),
    'items',coalesce((select jsonb_agg(jsonb_build_object('store_item_id',i.id,'item_name',i.item_name,'unit',i.unit,'category',i.item_category,'item_code',i.item_code,
        'par_qty',n.par_qty,'active',coalesce(n.active,false),'in_list',n.store_item_id is not null,
        'central_balance',coalesce(s.balance_qty,0),'night_balance',coalesce((select sum(l.qty) from public.night_stock_ledger l where l.store_item_id=i.id),0)) order by i.item_name)
      from public.consumable_store_items i left join public.night_stock_items n on n.store_item_id=i.id left join public.consumable_store_stock s on s.item_id=i.id
      where i.active and coalesce(i.item_category,'Consumables') in ('Consumables','Pharmacy')),'[]'::jsonb),
    'nights',coalesce((select jsonb_agg(to_jsonb(n) order by n.night_date desc) from public.night_stock_nights n where n.night_date>=cur-90),'[]'::jsonb),
    'ledger',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from public.night_stock_ledger l where l.night_date>=cur-90),'[]'::jsonb),
    'counts',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.night_stock_counts c where c.night_date>=cur-90),'[]'::jsonb));
end $$;

-- One entry point for every action (idempotent by p_id).
create or replace function public.night_stock_post(p_id uuid,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; acc jsonb:=public.night_stock_access(); cur date:=public.night_stock_night_of(now()); nightd date; nt public.night_stock_nights%rowtype;
  x jsonb; itm public.consumable_store_items%rowtype; q numeric; bal numeric; cbal numeric; cid uuid; lid uuid; iid uuid; prior jsonb; note text; diff boolean:=false;
  pat public.patients%rowtype; result jsonb:='{}'::jsonb; nowist timestamp:=(now() at time zone 'Asia/Kolkata'); late boolean:=false; n int:=0;
begin
  if p_id is null then raise exception 'Missing request reference.'; end if;
  select result into prior from public.night_stock_ops where id=p_id;
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
      if coalesce((x->>'active')::boolean,true) and (q is null or q<=0 or q<>trunc(q)) then raise exception 'Set level for % must be a whole number above 0.',itm.item_name; end if;
      insert into public.night_stock_items(store_item_id,par_qty,active,updated_by,updated_by_name,updated_at)
      values(itm.id,greatest(coalesce(q,1),1),coalesce((x->>'active')::boolean,true),a.actor_id,a.actor_name,now())
      on conflict(store_item_id) do update set par_qty=excluded.par_qty,active=excluded.active,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=now();
      n:=n+1;
    end loop;
    perform public.record_audit_event('Night Stock list updated','Night Stock',null,jsonb_build_object('items',n),'Success');
    result:=jsonb_build_object('success',true,'items',n);

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
      if not found or not exists(select 1 from public.night_stock_items where store_item_id=itm.id and active) then raise exception 'Add the item to the Night Stock list first.'; end if;
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
    result:=jsonb_build_object('success',true,'items',n,'night_date',cur);

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
    result:=jsonb_build_object('success',true,'items',n);

  -- Night nurse: opening count / accept ---------------------------------------------------------------
  elsif p_action in ('accept','close') then
    if not (acc->>'nurse')::boolean then raise exception 'Only a Nurse can do the Night Stock counts.'; end if;
    if p_action='accept' then
      if not public.night_stock_is_night(now()) and extract(hour from nowist)<18 then raise exception 'The opening count is done at the start of the night shift (from 18:00).'; end if;
      nightd:=case when extract(hour from nowist)>=18 then nowist::date else cur end;
    else
      nightd:=coalesce((p_data->>'night_date')::date,cur);
      if nightd>cur then raise exception 'Invalid night.'; end if;
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
    result:=jsonb_build_object('success',true,'night_date',nightd,'difference',diff);

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
    result:=jsonb_build_object('success',true,'indent_id',iid,'balance',bal-q);

  -- Verifier returns the night to the night nurse (to enter missed Guest use) ----------------------------
  elsif p_action='return_to_nurse' then
    if not (acc->>'verify')::boolean then raise exception 'You cannot verify Night Stock today.'; end if;
    nightd:=(p_data->>'night_date')::date;
    select * into nt from public.night_stock_nights where night_date=nightd for update;
    if not found or nt.status in ('Verified','Verified – Discrepancy') then raise exception 'Night not found or already verified.'; end if;
    if note is null then raise exception 'Tell the night nurse what to check.'; end if;
    update public.night_stock_nights set status='Returned',returned_by=a.actor_id,returned_by_name=a.actor_name,returned_at=now(),return_note=note,updated_at=now() where night_date=nightd;
    result:=jsonb_build_object('success',true);

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
    result:=jsonb_build_object('success',true,'difference',diff);
  else
    raise exception 'Unknown Night Stock action.';
  end if;

  insert into public.night_stock_ops(id,action,result) values(p_id,p_action,result);
  return result;
end $$;

-- Alerts for the bell / pop-ups --------------------------------------------------------------------
create or replace function public.night_stock_alerts() returns table(alert_key text,audience text,title text,detail text,night_date date,alert_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare acc jsonb:=public.night_stock_access(); nowist timestamp:=(now() at time zone 'Asia/Kolkata'); cur date:=public.night_stock_night_of(now()); prev date; nt public.night_stock_nights%rowtype; h numeric;
begin
  if not coalesce((acc->>'ok')::boolean,false) or not exists(select 1 from public.night_stock_items where active) then return; end if;
  h:=extract(hour from nowist)+extract(minute from nowist)/60.0;
  -- Night nurse: accept by 19:30, close from 06:30
  if (acc->>'nurse')::boolean and public.night_stock_is_night(now()) then
    select * into nt from public.night_stock_nights where night_date=cur;
    if (h>=19.5) and (nt.night_date is null or nt.accepted_at is null) then
      alert_key:='ns-accept-'||cur; audience:='nurse'; title:='Accept Night Stock (opening count)'; detail:='Count the Night Stock cupboard and tap Accept in Nursing → Night Stock.'; night_date:=cur; alert_at:=now(); return next; end if;
    if (h>=6.5 and h<7) and coalesce(nt.status,'') not in ('Closed','Verified','Verified – Discrepancy') then
      alert_key:='ns-close-'||cur; audience:='nurse'; title:='Night Stock closing count due'; detail:='Before you leave at 07:00, count the Night Stock cupboard and tap Closing Count.'; night_date:=cur; alert_at:=now(); return next; end if;
  end if;
  -- Returned to the night nurse
  if (acc->>'nurse')::boolean then
    for nt in select * from public.night_stock_nights n where n.status='Returned' and n.night_date>=cur-3 loop
      alert_key:='ns-returned-'||nt.night_date; audience:='nurse'; title:='Night Stock returned — enter missed Guest use';
      detail:=concat('Night of ',to_char(nt.night_date,'DD-MM-YYYY'),': ',nt.return_note,' (',nt.returned_by_name,')'); night_date:=nt.night_date; alert_at:=nt.returned_at; return next;
    end loop;
  end if;
  prev:=cur-1;
  select * into nt from public.night_stock_nights where night_date=prev;
  -- Morning: closing count missing after 07:30 → Nursing Manager / Admin
  if not public.night_stock_is_night(now()) and h>=7.5 and nt.night_date is not null and nt.closed_at is null and nt.status not in ('Verified','Verified – Discrepancy') and (acc->>'manage')::boolean then
    alert_key:='ns-noclose-'||prev; audience:='manager'; title:='Night Stock closing count not done';
    detail:=concat('Night of ',to_char(prev,'DD-MM-YYYY'),': the night nurse did not do the closing count. Count it during verification.'); night_date:=prev; alert_at:=now(); return next;
  end if;
  -- Verification due → the verifier; overdue after 10:00 → Admin too
  if not public.night_stock_is_night(now()) and nt.night_date is not null and nt.status not in ('Verified','Verified – Discrepancy','Returned') then
    if (acc->>'verify')::boolean and not (acc->>'admin')::boolean then
      alert_key:='ns-verify-'||prev; audience:='verifier'; title:='Verify last night''s Night Stock';
      detail:=concat('Night of ',to_char(prev,'DD-MM-YYYY'),case when nt.close_discrepancy then ' — the night nurse reported a difference' else '' end,'. Count the cupboard and tap Verify in Nursing → Night Stock.'); night_date:=prev; alert_at:=now(); return next;
    elsif (acc->>'admin')::boolean and h>=10 then
      alert_key:='ns-verify-late-'||prev; audience:='admin'; title:='Night Stock not verified by 10:00';
      detail:=concat('Night of ',to_char(prev,'DD-MM-YYYY'),' is not verified yet. Please follow up with the Nursing Manager / Day duty nurse.'); night_date:=prev; alert_at:=now(); return next;
    end if;
  end if;
  -- Differences reported at accept / close → manager
  if (acc->>'manage')::boolean then
    for nt in select * from public.night_stock_nights n where n.night_date>=cur-1 and (n.accept_discrepancy or n.close_discrepancy) and n.status not in ('Verified','Verified – Discrepancy') loop
      alert_key:='ns-diff-'||nt.night_date||'-'||(nt.accept_discrepancy)::text||(nt.close_discrepancy)::text; audience:='manager'; title:='Night Stock count difference reported';
      detail:=concat('Night of ',to_char(nt.night_date,'DD-MM-YYYY'),': ',coalesce(nt.close_note,nt.accept_note,'count differs from the ERP')); night_date:=nt.night_date; alert_at:=coalesce(nt.closed_at,nt.accepted_at); return next;
    end loop;
  end if;
end $$;

revoke all on function public.night_stock_access(),public.night_stock_workspace(),public.night_stock_post(uuid,text,jsonb),public.night_stock_alerts(),public.night_stock_balance(uuid),public.night_stock_nm_on_day_duty(date) from public,anon;
grant execute on function public.night_stock_access(),public.night_stock_workspace(),public.night_stock_post(uuid,text,jsonb),public.night_stock_alerts() to authenticated;
grant execute on function public.night_stock_night_of(timestamptz),public.night_stock_is_night(timestamptz) to authenticated;

notify pgrst,'reload schema';
commit;
