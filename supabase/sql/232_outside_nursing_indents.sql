begin;
alter table public.patient_consumable_indents add column if not exists outside_visit_id uuid references public.outside_nursing_visits(id);
alter table public.patient_consumable_indents add column if not exists outside_patient_name text;
alter table public.patient_consumable_indents add column if not exists outside_used_qty numeric(12,2);
alter table public.patient_consumable_indents add column if not exists outside_wastage_qty numeric(12,2) not null default 0 check(outside_wastage_qty>=0);
alter table public.patient_consumable_indents alter column patient_id drop not null;
alter table public.patient_consumable_indents add constraint indent_patient_link check((patient_id is not null and outside_visit_id is null) or (patient_id is null and outside_visit_id is not null and outside_used_qty>=0 and requested_qty=outside_used_qty+outside_wastage_qty));
create index if not exists outside_nursing_indent_visit on public.patient_consumable_indents(outside_visit_id) where outside_visit_id is not null;
create function public.guard_outside_nursing_indent() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare visit public.outside_nursing_visits%rowtype;
begin
 if TG_OP='UPDATE' and OLD.outside_visit_id is not null then
 if NEW.outside_visit_id is distinct from OLD.outside_visit_id or NEW.store_item_id is distinct from OLD.store_item_id or NEW.requested_qty is distinct from OLD.requested_qty or NEW.outside_used_qty is distinct from OLD.outside_used_qty or NEW.outside_wastage_qty is distinct from OLD.outside_wastage_qty then raise exception 'Submitted outside item details are fixed; raise a separate indent for additional items'; end if;
 end if;
 if NEW.outside_visit_id is not null then
 select * into visit from public.outside_nursing_visits where id=NEW.outside_visit_id for update;
 if not found or visit.billed_at is not null then raise exception 'Outside procedure must exist and remain unbilled'; end if;
 if NEW.outside_used_qty is null then raise exception 'Record used quantity for outside care'; end if;
 if not exists(select 1 from public.consumable_store_items where id=NEW.store_item_id and item_category in ('Consumables','Pharmacy')) then raise exception 'Outside indent needs a Consumables or Pharmacy item'; end if;
 end if;
 return NEW;
end $$;
create trigger outside_nursing_indent_guard before insert or update on public.patient_consumable_indents for each row execute function public.guard_outside_nursing_indent();
create function public.guard_outside_used_item_return() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.patient_consumable_indents where id=NEW.indent_id and outside_visit_id is not null) then raise exception 'Outside procedure items were recorded as used/wasted; unused-item return is not applicable'; end if;
 return NEW;
end $$;
create trigger outside_used_item_return_guard before insert on public.patient_store_returns for each row execute function public.guard_outside_used_item_return();
alter table public.outside_nursing_visits add column if not exists materials_total numeric(12,2) not null default 0 check(materials_total>=0);
alter table public.outside_nursing_visits add column if not exists material_lines jsonb not null default '[]';
alter table public.outside_nursing_visits add column if not exists items_expected boolean not null default false;
do $$ declare c record; definition text; begin
 for c in select conname from pg_constraint where conrelid='public.outside_nursing_visits'::regclass and contype='c' and pg_get_constraintdef(oid) like '%total =%' loop
 execute format('alter table public.outside_nursing_visits drop constraint %I',c.conname);
 end loop;
 alter table public.outside_nursing_visits add constraint outside_nursing_invoice_total check(billed_at is null or (quantity>0 and rate>=0 and concession>=0 and concession<=round(quantity*rate,2)+materials_total and total=round(quantity*rate,2)+materials_total-concession));
 -- Preserve the resident receipt path; outside items go only into the nursing invoice.
 definition:=pg_get_functiondef('public.receive_patient_consumable_indent(uuid,numeric,text)'::regprocedure);
 if position('v.outside_visit_id is null' in definition)=0 then
 if position($needle$if new_status='Received' and$needle$ in definition)=0 then raise exception 'Receipt function changed; review integration'; end if;
 definition:=replace(definition,$needle$if new_status='Received' and$needle$,$needle$if new_status='Received' and v.outside_visit_id is null and$needle$);
 execute definition;
 end if;
 -- Lock the same master item used by stock receipts/reconciliation before outside handover.
 definition:=pg_get_functiondef('public.handover_patient_consumable_indent_v2(uuid,numeric,text)'::regprocedure);
 if position('if v.outside_visit_id is not null then perform 1' in definition)=0 then
 definition:=replace(definition,'select balance_qty into bal', 'if v.outside_visit_id is not null then perform 1 from public.consumable_store_items where id=v.store_item_id for update; end if; select balance_qty into bal');
 execute definition;
 end if;
end $$;
-- Keep ordinary actions in the original implementation; only linkage/approval is extended.
alter function public.outside_nursing(text,jsonb) rename to outside_nursing_base_231;
revoke all on function public.outside_nursing_base_231(text,jsonb) from public,anon,authenticated;
create function public.outside_nursing(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.outside_nursing_visits%rowtype; p public.outside_nursing_patients%rowtype;
 a record; line jsonb; item public.consumable_store_items%rowtype; ind public.patient_consumable_indents%rowtype;
 request_id uuid; used numeric(12,2); waste numeric(12,2); qty numeric(12,2); item_rate numeric(12,2); discount numeric(12,2); materials numeric(12,2):=0; lines jsonb:='[]'; finance boolean; result jsonb; count_lines integer:=0;
begin
 if auth.uid() is null or not public.current_user_has_role(array['Admin','Accounts','Nurse','Manager']) then raise exception 'Nursing services access required'; end if;
 finance:=public.current_user_has_role(array['Admin','Accounts']);
 if p_action='load' then
 result:=public.outside_nursing_base_231(p_action,p_data);
 if not finance then
 result:=jsonb_set(result,'{visits}',coalesce((select jsonb_agg(x-array['materials_total','material_lines']) from jsonb_array_elements(result->'visits') x),'[]'));
 end if;
 return result||jsonb_build_object(
 'stock_items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'item_code',i.item_code,'item_name',i.item_name,'category',i.item_category,'unit',i.unit,'balance_qty',s.balance_qty)||case when finance then jsonb_build_object('charge_rate',i.charge_rate) else '{}'::jsonb end order by i.item_category,i.item_name) from public.consumable_store_items i join public.consumable_store_stock s on s.item_id=i.id where i.active and i.item_category in ('Consumables','Pharmacy')),'[]'),
 'indents',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('category',m.item_category)||case when finance then jsonb_build_object('charge_rate',m.charge_rate) else '{}'::jsonb end order by i.created_at,i.indent_no) from public.patient_consumable_indents i left join public.consumable_store_items m on m.id=i.store_item_id where i.outside_visit_id is not null),'[]'));
 end if;
 if p_action in ('visit','resubmit') then
 result:=public.outside_nursing_base_231(p_action,p_data);
 update public.outside_nursing_visits set items_expected=coalesce((p_data->>'items_expected')::boolean,false) where outside_nursing_visits.id=(p_data->>'id')::uuid and billed_at is null;
 return result;
 end if;
 if p_action not in ('indent','bill','receive_indent') then return public.outside_nursing_base_231(p_action,p_data); end if;
 select * into v from public.outside_nursing_visits where id=(p_data->>'visit_id')::uuid for update;
 if not found then raise exception 'Outside procedure not found'; end if;
 select * into p from public.outside_nursing_patients where id=v.patient_id;
 if p_action='receive_indent' then
 if not public.current_user_has_role(array['Nurse','Admin']) then raise exception 'Nurse receipt confirmation required'; end if;
 select * into ind from public.patient_consumable_indents where id=(p_data->>'indent_id')::uuid and outside_visit_id=v.id;
 if not found then raise exception 'Linked indent not found'; end if;
 return public.receive_patient_consumable_indent(ind.id,(p_data->>'received_qty')::numeric,p_data->>'remarks');
 end if;
 if v.billed_at is not null then raise exception 'Invoice already issued; linked items and fees are frozen'; end if;
 if p_action='indent' then
 if not public.current_user_has_role(array['Nurse','Admin']) then raise exception 'Nurse raises completed procedure indents'; end if;
 select * into a from public.consumables_actor();
 if a.actor_id is null then raise exception 'Nursing profile required'; end if;
 if jsonb_typeof(p_data->'lines')<>'array' or coalesce(jsonb_array_length(p_data->'lines'),0) not between 1 and 50 then raise exception 'Add 1 to 50 item lines'; end if;
 for line in select x from jsonb_array_elements(p_data->'lines') x loop
 request_id:=(line->>'id')::uuid;used:=(line->>'used_qty')::numeric;waste:=coalesce((line->>'wastage_qty')::numeric,0);
 if request_id is null or used is null or used<0 or waste<0 or used+waste<=0 then raise exception 'Valid used and wasted quantities required'; end if;
 select * into item from public.consumable_store_items where id=(line->>'item_id')::uuid and active and item_category in ('Consumables','Pharmacy');
 if not found then raise exception 'Select an active Consumables or Pharmacy item'; end if;
 if exists(select 1 from public.patient_consumable_indents i where i.id=(line->>'id')::uuid) then
 if not exists(select 1 from public.patient_consumable_indents i where i.id=(line->>'id')::uuid and i.outside_visit_id=v.id and i.store_item_id=item.id and i.outside_used_qty=used and i.outside_wastage_qty=waste) then raise exception 'Indent request key reused with different details'; end if;
 else
 insert into public.patient_consumable_indents(id,patient_id,outside_visit_id,outside_patient_name,store_item_id,item_name,unit,requested_qty,outside_used_qty,outside_wastage_qty,request_remarks,initiated_by,initiated_by_name)
 values(request_id,null,v.id,p.full_name,item.id,item.item_name,item.unit,used+waste,used,waste,concat('Outside Samara procedure: ',v.procedure_name,' · Completed ',v.service_date,' · ',coalesce(p_data->>'remarks','')),a.actor_id,a.actor_name);
 end if;
 end loop;
 perform public.record_audit_event('Outside Nursing Indent Raised','Outside Nursing',v.id::text,p_data,'Success');
 return jsonb_build_object('id',v.id);
 end if;
 if not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin can approve fees and issue invoices'; end if;
 if v.review_status<>'Submitted' then raise exception 'Only submitted procedures can be approved'; end if;
 if v.items_expected and not exists(select 1 from public.patient_consumable_indents where outside_visit_id=v.id) then raise exception 'Nurse must raise the consumables/pharmacy indent before invoicing'; end if;
 perform 1 from public.patient_consumable_indents where outside_visit_id=v.id order by id for update;
 if exists(select 1 from public.patient_consumable_indents where outside_visit_id=v.id and status not in ('Received','Rejected')) then raise exception 'Complete linked indent approval, handover and nurse receipt before invoicing'; end if;
 if jsonb_typeof(coalesce(p_data->'material_lines','[]'))<>'array' then raise exception 'Invalid invoice item lines'; end if;
 for ind in select * from public.patient_consumable_indents where outside_visit_id=v.id and status='Received' order by indent_no loop
 select x into line from jsonb_array_elements(coalesce(p_data->'material_lines','[]')) x where x->>'indent_id'=ind.id::text;
 if line is null or (select count(*) from jsonb_array_elements(coalesce(p_data->'material_lines','[]')) x where x->>'indent_id'=ind.id::text)<>1 then raise exception 'Review each received indent once'; end if;
 item_rate:=case when coalesce((line->>'included')::boolean,false) then 0 else (line->>'rate')::numeric end;
 if item_rate is null or item_rate<0 then raise exception 'Set a non-negative item fee or mark included'; end if;
 qty:=least(ind.outside_used_qty,greatest(coalesce(ind.received_qty,0)-ind.outside_wastage_qty,0));
 materials:=materials+round(qty*item_rate,2);
 lines:=lines||jsonb_build_array(jsonb_build_object('indent_id',ind.id,'indent_no',ind.indent_no,'item_id',ind.store_item_id,'item_name',ind.item_name,'unit',ind.unit,'category',(select item_category from public.consumable_store_items where id=ind.store_item_id),'quantity',qty,'wastage_qty',ind.outside_wastage_qty,'rate',item_rate,'included',coalesce((line->>'included')::boolean,false),'amount',round(qty*item_rate,2)));
 count_lines:=count_lines+1;
 end loop;
 if jsonb_array_length(coalesce(p_data->'material_lines','[]'))<>count_lines then raise exception 'Unexpected invoice item line'; end if;
 qty:=(p_data->>'quantity')::numeric;item_rate:=(p_data->>'rate')::numeric;discount:=(p_data->>'concession')::numeric;
 if qty is null or item_rate is null or discount is null or qty<=0 or item_rate<0 or discount<0 or discount>round(qty*item_rate,2)+materials then raise exception 'Check nursing fee and concession'; end if;
 update public.outside_nursing_visits set review_status='Approved',review_note=coalesce(p_data->>'review_note',''),billed_at=now(),billed_by=auth.uid(),quantity=qty,rate=item_rate,concession=discount,materials_total=materials,material_lines=lines,total=round(qty*item_rate,2)+materials-discount,snapshot=to_jsonb(p) where outside_nursing_visits.id=v.id;
 perform public.record_audit_event('Outside Nursing Invoice Approved','Outside Nursing',v.id::text,p_data,'Success');
 return jsonb_build_object('id',v.id);
end $$;
revoke all on function public.outside_nursing(text,jsonb) from public,anon;
grant execute on function public.outside_nursing(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
