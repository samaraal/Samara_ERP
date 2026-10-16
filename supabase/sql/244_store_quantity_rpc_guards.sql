begin;
do $patch$
declare f record; arg text; guards text; def text;
begin
for f in select oid,proname,proargnames from pg_proc where pronamespace='public'::regnamespace and prolang=(select oid from pg_language where lanname='plpgsql') and proname in ('receive_consumable_store_stock','store_receive_into_section','store_issue_to_department','reconcile_consumable_store_stock','approve_patient_consumable_indent_v2','handover_patient_consumable_indent_v2','receive_patient_consumable_indent','record_patient_item_consumption','request_patient_store_return') loop
def:=pg_get_functiondef(f.oid);guards:='';
if position('whole stock quantity input guard' in def)>0 then continue; end if;
foreach arg in array f.proargnames loop
if arg in('p_quantity','p_approved_qty','p_handed_over_qty','p_received_qty','p_physical_qty') then
guards:=guards||format(E'\n if %1$I is not null and (%1$I::text in (''NaN'',''Infinity'',''-Infinity'') or %1$I<>trunc(%1$I)) then raise exception ''Stores quantities must be whole numbers; decimals are not allowed.''; end if;',arg);
end if;
end loop;
if guards<>'' then
def:=regexp_replace(def,E'\\mbegin\\M','begin'||E'\n -- whole stock quantity input guard'||guards,'i');
execute def;
end if;
end loop;
end $patch$;
-- Existing Housekeeping holdings also appear in the item filter, using the same master.
do $hk$
declare def text;
begin
def:=pg_get_functiondef('public.housekeeping_workflow(text,jsonb)'::regprocedure);
def:=replace(def,'where i.item_category=''Housekeeping & General''','where (i.item_category=''Housekeeping & General'' or exists(select 1 from public.housekeeping_indents held where held.store_item_id=i.id))');
-- Replenishment of an item already held by Housekeeping uses the ordinary approval workflow.
def:=replace(def,'item.item_category<>''Housekeeping & General''','(item.item_category<>''Housekeeping & General'' and not exists(select 1 from public.housekeeping_indents held where held.store_item_id=item.id))');
execute def;
end $hk$;
commit;
