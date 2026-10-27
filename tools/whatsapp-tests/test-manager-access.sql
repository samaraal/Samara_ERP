-- Run as the database owner after SQL 311. All audit/test writes roll back.
-- Never sends a WhatsApp message or calls Meta.
begin;
select set_config('test.wa_expected_count',(select count(*)::text from public.hr_whatsapp_communications),true);
select set_config('request.jwt.claims',
 json_build_object('sub',p.auth_user_id,'role','authenticated')::text,true)
from public.duty_profiles p
where p.role='Manager' and public.wa_food_is_nursing(to_jsonb(p))
 and coalesce(p.is_active,p.active,false) and coalesce(p.active,p.is_active,false)
limit 1;
do $$ begin
 if has_function_privilege('anon','public.wa_nursing_inbox_active(uuid)','execute') then raise exception 'Anonymous helper access'; end if;
 if has_function_privilege('authenticated','public.wa_food_guard(uuid,text,text,text)','execute') then raise exception 'Browser can spoof API caller'; end if;
 if public.wa_food_guard(null,'15555550123',null,null) then raise exception 'Missing caller was allowed'; end if;
 if not public.wa_food_guard(auth.uid(),'15555550123',null,null) then raise exception 'Non-vendor reply blocked'; end if;
 if not public.wa_food_guard(auth.uid(),'15555550123',null,'samara_general_followup') then raise exception 'General template blocked'; end if;
 if not public.wa_food_guard(auth.uid(),null,'permission-test-media',null) then raise exception 'Non-vendor media blocked'; end if;
 if exists(select 1 from public.duty_profiles p where not coalesce(public.wa_food_is_nursing(to_jsonb(p)),false) and public.wa_nursing_inbox_active(p.id)) then raise exception 'Other role received Nursing Manager permission'; end if;
end $$;
set local role authenticated;
do $$ begin
 if not public.wa_nursing_inbox_active() then raise exception 'No active Nursing Manager test identity'; end if;
 if (select count(*) from public.hr_whatsapp_communications) <> current_setting('test.wa_expected_count')::bigint then raise exception 'Nursing Manager inbox is still filtered'; end if;
 if (public.wa_hide_message('00000000-0000-0000-0000-000000000000',false,'Permission test; rolled back')->>'changed')::int <> 0 then raise exception 'Unexpected row changed'; end if;
end $$;
select 'PASS: full inbox, reply/template/media guard, restore, caller and role isolation' as result;
rollback;
