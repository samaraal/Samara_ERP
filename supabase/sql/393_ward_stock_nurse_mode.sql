-- 2.20.64 — Ward Stock: Nursing Manager in "Switch to Nurse" mode works exactly like a Nurse login.
-- Problem: night_stock_access() (SQL 387) was written after SQL 266 and only checked actor_role='Nurse', so in
-- Nurse mode Sobana was still treated as the Nursing Manager — no "Opening Count / Accept" / "Closing Count"
-- boxes, and the server refused her counts ("Only a Nurse can do the Ward Stock counts").
-- Fix: in Nurse mode (public.acting_as_nurse(), SQL 259) Ward Stock access = Nurse access (blind counts, no
-- manager boxes). Her Nursing Manager alerts stay on (rule from 2.18.x) via a separate mgr_alerts flag.
-- Switch OFF = exactly as before. Replaces night_stock_access() and night_stock_alerts() only; no data changes.
begin;

create or replace function public.night_stock_access() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a record; today date:=(now() at time zone 'Asia/Kolkata')::date; admin boolean; nm boolean; ctrl boolean; nurse boolean; day_nurse boolean; nm_day boolean; nmode boolean;
begin
  select * into a from public.stores_actor();
  if a.actor_id is null then return jsonb_build_object('ok',false); end if;
  nmode:=coalesce(public.acting_as_nurse(),false);
  nm_day:=public.night_stock_nm_on_day_duty(today);
  if nmode then
    -- Nursing Manager in Nurse mode: exactly the Nurse view (she is the NM, so she never verifies as "Day duty nurse")
    return jsonb_build_object('ok',true,'actor',a.actor_id,'name',a.actor_name,'admin',false,'nm',false,'controller',false,'nurse',true,
      'manage',false,'verify',false,'verify_as',null,'nm_on_day_duty',nm_day,'day_nurse',false,'nurse_mode',true,'mgr_alerts',true);
  end if;
  admin:=a.actor_role='Admin';
  nm:=public.current_user_is_nurse_manager();
  ctrl:=coalesce(public.stores_controller_authorised(),false);
  nurse:=a.actor_role='Nurse';
  day_nurse:=nurse and exists(select 1 from public.duty_assignments d where d.employee_id=a.actor_id and d.duty_date=today and d.shift ilike 'Day%' and coalesce(d.status,'') not in ('Cancelled','Absent','Weekly Off') and not coalesce(d.is_weekly_off,false));
  return jsonb_build_object('ok',admin or nm or ctrl or nurse,'actor',a.actor_id,'name',a.actor_name,'admin',admin,'nm',nm,'controller',ctrl,'nurse',nurse,
    'manage',admin or nm or ctrl,
    'verify',admin or nm or ctrl or (day_nurse and not nm_day),
    'verify_as',case when nm then 'Nursing Manager' when admin then 'Admin' when ctrl then 'Stores in-charge (leave cover)' when day_nurse and not nm_day then 'Day duty nurse (Nursing Manager off today)' else null end,
    'nm_on_day_duty',nm_day,'day_nurse',day_nurse);
end $$;
revoke all on function public.night_stock_access() from public,anon;
grant execute on function public.night_stock_access() to authenticated;

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
  if coalesce((acc->>'mgr_alerts')::boolean,(acc->>'manage')::boolean) and mins>=30 then
    select * into nt from public.night_stock_nights n where public.ward_shift_rank(n.night_date,n.shift)=cur_rank-1;
    if nt.night_date is not null and nt.closed_at is null and nt.status not in ('Verified','Verified – Discrepancy') then
      alert_key:='ws-noclose-'||nt.night_date||nt.shift; audience:='manager'; title:='Ward Stock closing count not done';
      detail:=concat(public.ward_shift_label(nt.night_date,nt.shift),': the outgoing nurse did not do the closing count.'); night_date:=nt.night_date; alert_at:=now(); return next;
    end if;
  end if;
  -- 2.20.62: opening count / accept not done 60 minutes after the shift started → Nursing Manager / Admin
  if coalesce((acc->>'mgr_alerts')::boolean,(acc->>'manage')::boolean) and mins>=60 and mins<660 then
    select * into nt from public.night_stock_nights n where n.night_date=c.shift_date and n.shift=c.shift;
    if nt.night_date is null or nt.accepted_at is null then
      alert_key:='ws-noaccept-'||c.shift_date||c.shift; audience:='manager'; title:='Ward Stock not accepted by the nurse';
      detail:=concat(public.ward_shift_label(c.shift_date,c.shift),': no nurse has done the Opening Count / Accept — ',mins/60,' h ',mins%60,' min since the shift started at ',case when c.shift='Day' then '07:00' else '19:00' end,'. Please remind the nurse on duty.');
      night_date:=c.shift_date; alert_at:=now(); return next;
    end if;
  end if;
  -- daily verification (Day shift hours) → verifier; not done by 10:00 → Admin
  if c.shift='Day' and exists(select 1 from public.night_stock_nights n where public.ward_shift_rank(n.night_date,n.shift)<cur_rank and n.status not in ('Verified','Verified – Discrepancy','Returned')) then
    if (coalesce((acc->>'mgr_alerts')::boolean,false) or (acc->>'verify')::boolean) and not (acc->>'admin')::boolean then
      alert_key:='ws-verify-'||c.shift_date; audience:='verifier'; title:='Ward Stock — morning verification due';
      detail:='Count the Ward Stock cupboard and tap Morning Verification in Nursing → Ward Stock.'; night_date:=c.shift_date; alert_at:=now(); return next;
    elsif (acc->>'admin')::boolean and extract(hour from nowist)>=10 then
      alert_key:='ws-verify-late-'||c.shift_date; audience:='admin'; title:='Ward Stock not verified by 10:00';
      detail:='Please follow up with the Nursing Manager / Day duty nurse.'; night_date:=c.shift_date; alert_at:=now(); return next;
    end if;
  end if;
  if coalesce((acc->>'mgr_alerts')::boolean,(acc->>'manage')::boolean) then
    for tr in select * from public.night_stock_transfers t where t.status='Rejected' and t.decided_at>now()-interval '24 hours' loop
      alert_key:='ws-transfer-rej-'||tr.id; audience:='manager'; title:='Ward Stock change not accepted by the nurse';
      detail:=concat(tr.decided_by_name,': ',tr.decision_note); night_date:=c.shift_date; alert_at:=tr.decided_at; return next;
    end loop;
  end if;
  if coalesce((acc->>'mgr_alerts')::boolean,(acc->>'manage')::boolean) then
    for nt in select * from public.night_stock_nights n where public.ward_shift_rank(n.night_date,n.shift)>=cur_rank-2 and (n.accept_discrepancy or n.close_discrepancy) and n.status not in ('Verified','Verified – Discrepancy') loop
      alert_key:='ws-diff-'||nt.night_date||nt.shift||(nt.accept_discrepancy)::text||(nt.close_discrepancy)::text; audience:='manager'; title:='Ward Stock count difference reported';
      detail:=concat(public.ward_shift_label(nt.night_date,nt.shift),': ',coalesce(nt.close_note,nt.accept_note,'count differs from the ERP')); night_date:=nt.night_date; alert_at:=coalesce(nt.closed_at,nt.accepted_at); return next;
    end loop;
  end if;
end $$;
revoke all on function public.night_stock_alerts() from public,anon;
grant execute on function public.night_stock_alerts() to authenticated;
notify pgrst,'reload schema';
commit;
