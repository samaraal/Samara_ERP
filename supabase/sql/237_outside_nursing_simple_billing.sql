begin;
-- Preserve all existing role, duplicate, payment and stock safeguards.
do $$ begin
 if to_regprocedure('public.outside_nursing_base_237(text,jsonb)') is null then
  alter function public.outside_nursing(text,jsonb) rename to outside_nursing_base_237;
 end if;
end $$;
revoke all on function public.outside_nursing_base_237(text,jsonb) from public,anon,authenticated;
create or replace function public.outside_nursing(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.outside_nursing_visits%rowtype; patient public.outside_nursing_patients%rowtype;
 ind public.patient_consumable_indents%rowtype; result jsonb; lines jsonb:='[]';
 price numeric(12,2); charge numeric(12,2); qty numeric(12,2); materials numeric(12,2):=0; old_line jsonb;
begin
 if auth.uid() is null or not public.current_user_has_role(array['Admin','Accounts','Nurse','Manager']) then raise exception 'Nursing services access required'; end if;
 if p_action='rate' then raise exception 'Standard procedure tariffs are no longer used. Enter the procedure charge when approving the invoice'; end if;
 if p_action in ('visit','resubmit') then
  if not public.current_user_has_role(array['Nurse']) then raise exception 'Only nurses can enter procedures and indents'; end if;
  result:=public.outside_nursing_base_237(p_action,p_data);
  if jsonb_typeof(coalesce(p_data->'lines','[]'::jsonb)) is distinct from 'array' then raise exception 'Invalid used-item lines'; end if;
  if jsonb_array_length(coalesce(p_data->'lines','[]'::jsonb))>0 then
   perform public.outside_nursing_base_237('indent',jsonb_build_object('visit_id',p_data->>'id','lines',p_data->'lines','remarks',coalesce(p_data->>'remarks','')));
   update public.outside_nursing_visits set items_expected=true where id=(p_data->>'id')::uuid;
  end if;
  return result;
 end if;
 if p_action='load' then
  result:=public.outside_nursing_base_237(p_action,p_data);
  return jsonb_set(result,'{rates}','[]'::jsonb);
 end if;
 if p_action='consolidate_items' then
  if not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin can review and consolidate invoice items'; end if;
  perform 1 from public.outside_nursing_visits where id in ((p_data->>'visit_id')::uuid,(p_data->>'source_visit_id')::uuid) order by id for update;
  select * into v from public.outside_nursing_visits where id=(p_data->>'visit_id')::uuid;
  perform 1 from public.patient_consumable_indents where outside_visit_id in (v.id,(p_data->>'source_visit_id')::uuid) or outside_visit_id in (select id from public.outside_nursing_visits where consolidated_into=v.id) order by id for update;
  perform 1 from public.consumable_store_items where id in (select store_item_id from public.patient_consumable_indents where outside_visit_id in (v.id,(p_data->>'source_visit_id')::uuid) or outside_visit_id in (select id from public.outside_nursing_visits where consolidated_into=v.id)) order by id for share;
  for ind in select i.* from public.patient_consumable_indents i join public.outside_nursing_visits x on x.id=i.outside_visit_id where (x.id in (v.id,(p_data->>'source_visit_id')::uuid) or x.consolidated_into=v.id) and i.status='Received' order by i.indent_no loop
   select x into old_line from jsonb_array_elements(v.material_lines) x where x->>'indent_id'=ind.id::text;
   if old_line is not null then price:=(old_line->>'rate')::numeric;
   else select charge_rate into price from public.consumable_store_items where id=ind.store_item_id; end if;
   if price is null or price<0 or price::text in ('NaN','Infinity','-Infinity') then raise exception 'Missing valid Store Master price for %',ind.item_name; end if;
   lines:=lines||jsonb_build_array(jsonb_build_object('indent_id',ind.id,'rate',price,'included',coalesce((old_line->>'included')::boolean,false)));
  end loop;
  return public.outside_nursing_base_237(p_action,p_data||jsonb_build_object('material_lines',lines));
 end if;
 if p_action<>'bill' then return public.outside_nursing_base_237(p_action,p_data); end if;
 -- Samara Directors use the existing Admin role. Do not widen Accounts/Stores access.
 if not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin / Director can enter the procedure charge and approve'; end if;
 select * into v from public.outside_nursing_visits where id=(p_data->>'visit_id')::uuid for update;
 if not found or v.review_status='Voided' then raise exception 'Voided or missing procedures cannot be billed'; end if;
 if v.billed_at is not null then raise exception 'Invoice already issued'; end if;
 if v.review_status<>'Submitted' then raise exception 'Only submitted procedures can be approved'; end if;
 charge:=nullif(trim(p_data->>'rate'),'')::numeric;
 if charge is null or charge<0 or charge::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a non-negative procedure charge (INR)'; end if;
 perform 1 from public.patient_consumable_indents where outside_visit_id=v.id order by id for update;
 if v.items_expected and not exists(select 1 from public.patient_consumable_indents where outside_visit_id=v.id) then raise exception 'Nurse must add the used-item indents before invoicing'; end if;
 if exists(select 1 from public.patient_consumable_indents where outside_visit_id=v.id and status not in ('Received','Rejected')) then raise exception 'Stores must approve and hand over the indents, then the nurse confirms receipt before invoicing'; end if;
 -- Lock the existing item prices; ignore any client-supplied rates, quantities or inclusion flags.
 perform 1 from public.consumable_store_items where id in (select store_item_id from public.patient_consumable_indents where outside_visit_id=v.id and status='Received') order by id for share;
 for ind in select * from public.patient_consumable_indents where outside_visit_id=v.id and status='Received' order by indent_no loop
  select charge_rate into price from public.consumable_store_items where id=ind.store_item_id;
  if price is null or price<0 or price::text in ('NaN','Infinity','-Infinity') then raise exception 'Missing valid Store Master price for %. Stores must fix its existing item price',ind.item_name; end if;
  qty:=least(ind.outside_used_qty,greatest(coalesce(ind.received_qty,0)-ind.outside_wastage_qty,0));
  materials:=materials+round(qty*price,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('indent_id',ind.id,'indent_no',ind.indent_no,'item_id',ind.store_item_id,'item_name',ind.item_name,'unit',ind.unit,'category',(select item_category from public.consumable_store_items where id=ind.store_item_id),'quantity',qty,'wastage_qty',ind.outside_wastage_qty,'rate',price,'included',false,'amount',round(qty*price,2)));
 end loop;
 select * into patient from public.outside_nursing_patients where id=v.patient_id;
 update public.outside_nursing_visits set review_status='Approved',review_note=coalesce(p_data->>'review_note',''),billed_at=now(),billed_by=auth.uid(),quantity=1,rate=charge,concession=0,materials_total=materials,material_lines=lines,total=charge+materials,snapshot=to_jsonb(patient) where id=v.id;
 perform public.record_audit_event('Outside Nursing Invoice Approved','Outside Nursing',v.id::text,jsonb_build_object('procedure_charge',charge,'automatic_material_lines',lines,'total',charge+materials,'review_note',coalesce(p_data->>'review_note','')),'Success');
 return jsonb_build_object('id',v.id);
end $$;
revoke all on function public.outside_nursing(text,jsonb) from public,anon;
grant execute on function public.outside_nursing(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
