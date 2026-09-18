-- Nursing Manager: food-vendor WhatsApp only. Other roles keep their policies.
begin;
create or replace function public.wa_food_is_nursing(p jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 with x as (select lower(regexp_replace(trim(coalesce(nullif(p->>'designation',''),nullif(p->>'employee_designation',''),nullif(p->>'job_title',''),p->>'position','')), '[._[:space:]-]+',' ','g')) d)
 select d in ('nurse manager','nursing manager') or (d='' and lower(trim(p->>'department'))='nursing' and lower(trim(p->>'role'))='manager') from x
$$;
create or replace function public.wa_food_only()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(wa_food_is_nursing(to_jsonb(p)),false))
$$;
create or replace function public.wa_food_active()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,p.active,false) and coalesce(wa_food_is_nursing(to_jsonb(p)),false))
$$;
create or replace function public.wa_food_phone(p text)
returns text language sql immutable set search_path=public,pg_temp as $$
 with x as (select regexp_replace(coalesce(p,''),'[^0-9]','','g') n)
 select case when length(n)=10 then '91'||n when n like '00%' then substring(n from 3) else n end from x
$$;
create or replace function public.wa_food_vendor(p text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select length(wa_food_phone(p)) between 8 and 15 and
 (exists(select 1 from fv_settings where wa_food_phone(data->>'phone')=wa_food_phone(p)) or
 exists(select 1 from fv_orders where wa_food_phone(data->>'phone')=wa_food_phone(p)))
$$;
create or replace function public.wa_food_row(r jsonb)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select wa_food_vendor(r->>'recipient_number')
 and nullif(r->>'career_application_id','') is null and nullif(r->>'application_id','') is null
 and lower(coalesce(r->>'source_type','')) !~ '(patient|family|emergency|hr applicant|employee)'
 and lower(coalesce(r->>'communication_type','')) !~ '(payment|daily report|discharge|employee|emergency|family portal|patient|interview|admission)'
 and lower(coalesce(r->>'template_name','')) !~ '(patient|employee|interview|admission|family|emergency|payment)'
 and not (coalesce(r->'message_payload','{}') ?| array['patient_id','patient_uuid','patient_code','patient_ref','patient','resident_id','career_application_id'])
$$;
-- Restrictive policy intersects every permissive policy, including the legacy Manager grant.
drop policy if exists nursing_food_whatsapp_scope on public.hr_whatsapp_communications;
create policy nursing_food_whatsapp_scope on public.hr_whatsapp_communications as restrictive for all to authenticated
 using (not wa_food_only() or (wa_food_active() and wa_food_row(to_jsonb(hr_whatsapp_communications))))
 with check (not wa_food_only() or (wa_food_active() and wa_food_row(to_jsonb(hr_whatsapp_communications))));
drop policy if exists nursing_food_whatsapp_select on public.hr_whatsapp_communications;
create policy nursing_food_whatsapp_select on public.hr_whatsapp_communications for select to authenticated using (wa_food_active());
drop policy if exists nursing_food_whatsapp_insert on public.hr_whatsapp_communications;
create policy nursing_food_whatsapp_insert on public.hr_whatsapp_communications for insert to authenticated with check (wa_food_active());
drop policy if exists nursing_food_whatsapp_update on public.hr_whatsapp_communications;
create policy nursing_food_whatsapp_update on public.hr_whatsapp_communications for update to authenticated using (wa_food_active()) with check (wa_food_active());
create or replace function public.wa_food_inbox()
returns setof public.hr_whatsapp_communications language sql stable security invoker set search_path=public,pg_temp as $$
 select * from hr_whatsapp_communications h where wa_food_active() and wa_food_row(to_jsonb(h)) order by created_at desc limit 1000
$$;
-- Only the authenticated Edge Function may supply a verified user's identity here.
create or replace function public.wa_food_guard(p_user uuid,p_phone text default null,p_media text default null,p_template text default null)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p profiles;
begin
 select * into p from profiles where id=p_user or auth_user_id=p_user;
 if not found or not coalesce(p.is_active,p.active,false) then return false;end if;
 if not coalesce(wa_food_is_nursing(to_jsonb(p)),false) then return p.role in ('Admin','Manager');end if;
 if p_media is not null then
  return exists(select 1 from hr_whatsapp_communications h where wa_food_row(to_jsonb(h)) and h.direction='inbound' and h.message_type in ('image','audio','video','document','sticker') and h.message_payload->h.message_type->>'id'=p_media);
 end if;
 return (p_template is null or p_template='samara_callback_request') and wa_food_vendor(p_phone);
end $$;
revoke all on function public.wa_food_guard(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wa_food_guard(uuid,text,text,text) to service_role;
revoke all on function public.wa_food_is_nursing(jsonb),public.wa_food_only(),public.wa_food_active(),public.wa_food_phone(text),public.wa_food_vendor(text),public.wa_food_row(jsonb),public.wa_food_inbox() from public,anon;
grant execute on function public.wa_food_is_nursing(jsonb),public.wa_food_only(),public.wa_food_active(),public.wa_food_phone(text),public.wa_food_vendor(text),public.wa_food_row(jsonb),public.wa_food_inbox() to authenticated,service_role;
commit;
