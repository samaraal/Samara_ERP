begin;
alter table public.outside_nursing_visits add column if not exists consolidated_into uuid references public.outside_nursing_visits(id);
alter table public.outside_nursing_visits add column if not exists invoice_amended_at timestamptz;
alter table public.outside_nursing_visits add column if not exists invoice_amendment_reason text;
do $$ begin
 if to_regprocedure('public.outside_nursing_base_235(text,jsonb)') is null then
  alter function public.outside_nursing(text,jsonb) rename to outside_nursing_base_235;
 end if;
end $$;
revoke all on function public.outside_nursing_base_235(text,jsonb) from public,anon,authenticated;
create or replace function public.outside_nursing(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.outside_nursing_visits%rowtype; source public.outside_nursing_visits%rowtype;
 ind public.patient_consumable_indents%rowtype; result jsonb; line jsonb; lines jsonb:='[]'; reason text;
 materials numeric(12,2):=0; qty numeric(12,2); price numeric(12,2); count_lines integer:=0;
begin
 if auth.uid() is null or not public.current_user_has_role(array['Admin','Accounts','Nurse','Manager']) then raise exception 'Nursing services access required'; end if;
 if p_action='load' then
  result:=public.outside_nursing_base_235(p_action,p_data);
  return jsonb_set(result,'{indents}',coalesce((select jsonb_agg(x||jsonb_build_object('invoice_visit_id',coalesce(v.consolidated_into,v.id))) from jsonb_array_elements(result->'indents') x join public.outside_nursing_visits v on v.id=(x->>'outside_visit_id')::uuid),'[]'));
 end if;
 if p_action<>'consolidate_items' then return public.outside_nursing_base_235(p_action,p_data); end if;
 if not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin can review and consolidate invoice items'; end if;
 perform 1 from public.outside_nursing_visits where id in ((p_data->>'visit_id')::uuid,(p_data->>'source_visit_id')::uuid) order by id for update;
 select * into target from public.outside_nursing_visits where id=(p_data->>'visit_id')::uuid;
 select * into source from public.outside_nursing_visits where id=(p_data->>'source_visit_id')::uuid;
 reason:=trim(coalesce(p_data->>'review_note',''));
 if target.id is null or source.id is null or target.id=source.id or target.patient_id<>source.patient_id or target.service_date<>source.service_date then raise exception 'Select separate records for the same patient and date'; end if;
 if target.review_status<>'Approved' or target.billed_at is null or source.review_status not in ('Submitted','Returned') or source.billed_at is not null or source.consolidated_into is not null then raise exception 'Retain an approved invoice and select an unbilled, unvoided source'; end if;
 if length(reason)<10 then raise exception 'Consolidation reason required (at least 10 characters)'; end if;
 if exists(select 1 from public.outside_nursing_payments where visit_id in (target.id,source.id)) or exists(select 1 from public.outside_nursing_online_requests where visit_id in (target.id,source.id) and status in ('Creating','Pending','Paid')) then raise exception 'Cannot amend: a payment or active online payment link exists. Accounts must review first'; end if;
 if exists(select 1 from public.outside_nursing_visits where duplicate_of=source.id) then raise exception 'Source is the retained record of another duplicate; review it first'; end if;
 perform 1 from public.patient_consumable_indents where outside_visit_id in (target.id,source.id) or outside_visit_id in (select id from public.outside_nursing_visits where consolidated_into=target.id) order by id for update;
 if not exists(select 1 from public.patient_consumable_indents where outside_visit_id=source.id and status='Received') or exists(select 1 from public.patient_consumable_indents where outside_visit_id=source.id and status not in ('Received','Rejected')) then raise exception 'Source must have received items and no pending indents'; end if;
 if jsonb_typeof(p_data->'material_lines') is distinct from 'array' then raise exception 'Review all received item rates'; end if;
 for ind in select i.* from public.patient_consumable_indents i join public.outside_nursing_visits v on v.id=i.outside_visit_id where (v.id in (source.id,target.id) or v.consolidated_into=target.id) and i.status='Received' order by i.indent_no loop
  select x into line from jsonb_array_elements(p_data->'material_lines') x where x->>'indent_id'=ind.id::text;
  if line is null or (select count(*) from jsonb_array_elements(p_data->'material_lines') x where x->>'indent_id'=ind.id::text)<>1 then raise exception 'Review each received indent exactly once'; end if;
  price:=case when coalesce((line->>'included')::boolean,false) then 0 else (line->>'rate')::numeric end;
  if price is null or price<0 then raise exception 'Item rates must be non-negative'; end if;
  qty:=least(ind.outside_used_qty,greatest(coalesce(ind.received_qty,0)-ind.outside_wastage_qty,0));
  materials:=materials+round(qty*price,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('indent_id',ind.id,'indent_no',ind.indent_no,'source_visit_id',ind.outside_visit_id,'item_id',ind.store_item_id,'item_name',ind.item_name,'unit',ind.unit,'category',(select item_category from public.consumable_store_items where id=ind.store_item_id),'quantity',qty,'wastage_qty',ind.outside_wastage_qty,'rate',price,'included',coalesce((line->>'included')::boolean,false),'amount',round(qty*price,2)));
  count_lines:=count_lines+1;
 end loop;
 if jsonb_array_length(p_data->'material_lines')<>count_lines then raise exception 'Unexpected invoice item line'; end if;
 -- Keep stock movements and original clinical notes intact. Only invoice attribution changes.
 update public.outside_nursing_visits set consolidated_into=target.id,review_status='Voided',duplicate_of=target.id,voided_at=now(),voided_by=auth.uid(),void_reason='Consolidated used items into retained invoice: '||reason where id=source.id;
 update public.outside_nursing_visits set materials_total=materials,material_lines=lines,total=round(quantity*rate,2)+materials-concession,invoice_amended_at=now(),invoice_amendment_reason=reason where id=target.id;
 perform public.record_audit_event('Outside Nursing Invoice Items Consolidated','Outside Nursing',target.id::text,jsonb_build_object('source_visit_id',source.id,'reason',reason,'previous_total',target.total,'previous_material_lines',target.material_lines,'new_material_lines',lines,'new_total',round(target.quantity*target.rate,2)+materials-target.concession),'Success');
 return jsonb_build_object('id',target.id);
end $$;
revoke all on function public.outside_nursing(text,jsonb) from public,anon;
grant execute on function public.outside_nursing(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
