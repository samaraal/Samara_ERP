-- Samara Care ERP 2.15.85 · SQL 204 — WhatsApp Inbox: never relabel a sent _v2 food message as the old template.
-- Run once in Supabase > SQL Editor. Safe to run again. Changes NO message and sends nothing.
--
-- SQL 203 repaired the older Inbox rows, but the 04:17 PM cancellation was relabelled again
-- (samara_food_modification instead of samara_food_modification_v2). The live database copies food
-- messages into the Inbox through its own trigger, so this guard sits on the Inbox table itself:
-- whatever updates the row later, a recorded "..._v2" template name and its text are kept.

begin;

create or replace function public.wa_keep_food_v2_template()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if coalesce(old.template_name,'') ~ '^samara_food_[a-z_]+_v2$'
    and coalesce(new.template_name,'') is distinct from old.template_name
    and coalesce(new.template_name,'') = regexp_replace(old.template_name,'_v2$','') then
  new.template_name := old.template_name;
  new.message_content := old.message_content;
  new.message_payload := coalesce(new.message_payload,'{}'::jsonb)
                         || jsonb_build_object('body_params',coalesce(old.message_payload->'body_params',new.message_payload->'body_params'));
 end if;
 return new;
end $$;

drop trigger if exists wa_keep_food_v2_template on public.hr_whatsapp_communications;
create trigger wa_keep_food_v2_template
 before update on public.hr_whatsapp_communications
 for each row execute function public.wa_keep_food_v2_template();

-- Repair rows already relabelled (the _v2 values have "<date> – <meal>" as value 2; old ones start "FOOD-…").
update public.hr_whatsapp_communications
   set template_name=template_name||'_v2', updated_at=now()
 where template_name in ('samara_food_order','samara_food_modification','samara_food_receipt')
   and message_payload->'body_params'->>1 like '% – %'
   and created_at > now() - interval '30 days';

commit;

-- Check: today's food messages — every new-style message should end in _v2
select created_at, template_name, status, message_payload->'body_params'->>1 as value_2
  from public.hr_whatsapp_communications
 where template_name like 'samara_food%' and created_at > now() - interval '2 days'
 order by created_at desc;
