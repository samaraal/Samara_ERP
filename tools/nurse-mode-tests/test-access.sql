-- Run as the database owner after SQL 312. Every fixture, mode change and audit write rolls back.
-- No real charges, stock movements, procedures or messages are committed.
begin;
select set_config('test.nm_profile',p.id::text,true),
 set_config('test.nm_auth',coalesce(p.auth_user_id,p.id)::text,true)
from public.profiles p where p.role='Manager' and public.wa_food_is_nursing(to_jsonb(p))
 and coalesce(p.active,true) and coalesce(p.is_active,true) limit 1;
select set_config('test.other_nurse',p.id::text,true) from public.profiles p
where p.role='Nurse' and coalesce(p.active,true) and coalesce(p.is_active,true) limit 1;
select set_config('test.patient',id::text,true) from public.patients where is_active=true limit 1;
select set_config('test.item',id::text,true) from public.consumable_store_items
where active=true and item_category in ('Consumables','Pharmacy') limit 1;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.nm_auth'),'role','authenticated')::text,true);

-- Explicit negative indent numbers avoid advancing the live indent-number sequence.
insert into public.patient_consumable_indents
 (id,indent_no,patient_id,store_item_id,item_name,requested_qty,unit,status,
 approved_qty,handed_over_qty,received_qty,received_at,initiated_by,initiated_by_name,request_remarks)
 overriding system value
select '00000000-0000-4000-8000-000000031202',-312002,current_setting('test.patient')::uuid,i.id,
 i.item_name,3,i.unit,'Received',3,3,3,now(),current_setting('test.nm_profile')::uuid,'Permission test','Rolled back'
from public.consumable_store_items i where id=current_setting('test.item')::uuid;
insert into public.patient_item_consumption
 (id,indent_id,patient_id,store_item_id,quantity,used_on,recorded_by,recorded_by_name)
values
 ('00000000-0000-4000-8000-000000031203','00000000-0000-4000-8000-000000031202',
 current_setting('test.patient')::uuid,current_setting('test.item')::uuid,1,
 (now() at time zone 'Asia/Kolkata')::date,current_setting('test.nm_profile')::uuid,'Permission test'),
 ('00000000-0000-4000-8000-000000031204','00000000-0000-4000-8000-000000031202',
 current_setting('test.patient')::uuid,current_setting('test.item')::uuid,1,
 (now() at time zone 'Asia/Kolkata')::date,current_setting('test.other_nurse')::uuid,'Other Nurse fixture');

set local role authenticated;
select public.set_nurse_mode(false);
do $$ begin
 if public.acting_as_nurse() or public.current_user_has_role(array['Nurse']) then raise exception 'Nurse mode stayed on'; end if;
 begin perform public.request_approval_item(null,null,null,null); raise exception 'OFF mode unexpectedly raised a Nurse request';
 exception when others then if sqlerrm<>'Only Nurse can raise an approval request.' then raise; end if; end;
end $$;

select public.set_nurse_mode(true);
do $$ begin
 if not public.acting_as_nurse() or not public.current_user_has_role(array['Nurse']) then raise exception 'Nurse access missing'; end if;
 begin perform public.request_approval_item(null,null,null,null); raise exception 'Expected patient validation';
 exception when others then if sqlerrm<>'Select a patient.' then raise; end if; end;
 begin perform public.confirm_patient_departure_v2(null,'Permission test','Rolled back'); raise exception 'Expected discharge validation';
 exception when others then if sqlerrm<>'Discharge request not found.' then raise; end if; end;
 if not (public.bme_access()->>'nurse')::boolean then raise exception 'Nurse equipment access missing'; end if;
end $$;

-- Actual RLS inserts, using the same identity as the switched Nurse.
insert into public.patient_consumable_indents
 (id,indent_no,patient_id,store_item_id,item_name,requested_qty,unit,initiated_by,initiated_by_name,status,request_remarks)
 overriding system value
select '00000000-0000-4000-8000-000000031201',-312001,current_setting('test.patient')::uuid,i.id,
 i.item_name,1,i.unit,public.current_profile_id(),'Permission test','Initiated','Rolled back'
from public.consumable_store_items i where id=current_setting('test.item')::uuid;
insert into public.bill_charge_requests
 (id,patient_id,category,description,service_name,quantity,unit,billable,raised_by,raised_by_name)
values ('00000000-0000-4000-8000-000000031205',current_setting('test.patient')::uuid,
 'Miscellaneous','Permission test; rolled back','Permission test',1,'Service',false,auth.uid(),'Permission test');
do $$ begin
 if not exists(select 1 from public.patient_consumable_indents where id='00000000-0000-4000-8000-000000031201') then raise exception 'Indent insert missing'; end if;
 if not exists(select 1 from public.bill_charge_requests where id='00000000-0000-4000-8000-000000031205') then raise exception 'Charge insert missing'; end if;
 perform public.void_patient_item_consumption('00000000-0000-4000-8000-000000031203','Permission test; rolled back');
 if not exists(select 1 from public.patient_item_consumption where id='00000000-0000-4000-8000-000000031203' and voided_at is not null) then raise exception 'Own consumption correction blocked'; end if;
 begin perform public.void_patient_item_consumption('00000000-0000-4000-8000-000000031204','Permission test; rolled back'); raise exception 'Another Nurse entry was incorrectly editable';
 exception when others then if sqlerrm<>'Only the recording Nurse, Nursing Manager or Admin may void an entry.' then raise; end if; end;
end $$;
select 'PASS: ON/OFF Nurse permissions, charge and indent inserts, procedure/equipment/discharge guards and own-entry correction; all fixtures rolled back' as result;
rollback;
