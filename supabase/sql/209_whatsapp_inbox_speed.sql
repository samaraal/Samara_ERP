-- SAMARA CARE ERP 2.15.95 — WhatsApp Inbox loads fast again. Same permissions, faster checks.
-- Why it was slow: the food-vendor security rules (SQL 125 / 130 / 183) ran a "is this a food-vendor
-- message?" test on EVERY WhatsApp row for EVERY user, and each test scanned the whole fv_orders table
-- (plus a profile lookup per row). As messages and food orders grew, loading got slower and slower.
-- This file:
--   1. indexes the vendor phone in fv_orders (the per-row test becomes an instant lookup);
--   2. makes the test do the cheap checks first and look up the phone only when needed;
--   3. rewrites the same rules so "who is signed in / are they the food in-charge" is worked out ONCE per
--      query instead of once per row (identical logic — nobody gains or loses access);
--   4. adds a tiny vendor-phone list for the Food Vendors folder (replaces the full fetch of SQL 208).
-- Run once in Supabase > SQL Editor, after SQL 208. Safe to run again.
begin;

-- 1. Indexes ----------------------------------------------------------------------------------
create index if not exists fv_orders_wa_phone_idx on public.fv_orders ((public.wa_food_phone(data->>'phone')));
create index if not exists hr_wa_comm_created_id_idx on public.hr_whatsapp_communications (created_at desc, id desc);

-- 2. Same answers, cheaper order ---------------------------------------------------------------
create or replace function public.wa_food_vendor(p text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare n text := public.wa_food_phone(p);
begin
  if length(n) not between 8 and 15 then return false; end if;
  return exists(select 1 from public.fv_settings s where public.wa_food_phone(s.data->>'phone') = n)
      or exists(select 1 from public.fv_orders o where public.wa_food_phone(o.data->>'phone') = n);
end $$;

create or replace function public.wa_food_row(r jsonb)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if nullif(r->>'career_application_id','') is not null or nullif(r->>'application_id','') is not null then return false; end if;
  if lower(coalesce(r->>'source_type','')) ~ '(patient|family|emergency|hr applicant|employee)' then return false; end if;
  if lower(coalesce(r->>'communication_type','')) ~ '(payment|daily report|discharge|employee|emergency|family portal|patient|interview|admission)' then return false; end if;
  if lower(coalesce(r->>'template_name','')) ~ '(patient|employee|interview|admission|family|emergency|payment)' then return false; end if;
  if coalesce(r->'message_payload','{}'::jsonb) ?| array['patient_id','patient_uuid','patient_code','patient_ref','patient','resident_id','career_application_id'] then return false; end if;
  return public.wa_food_vendor(r->>'recipient_number');
end $$;

-- 3. Same rules; per-user parts evaluated once per query ("(select …)") ------------------------
alter policy nursing_food_whatsapp_scope on public.hr_whatsapp_communications
  using (not (select public.wa_food_only()) or ((select public.wa_food_active()) and (public.wa_food_row(to_jsonb(hr_whatsapp_communications)) or ((select public.has_department_leave_cover()) and public.wa_std_row(to_jsonb(hr_whatsapp_communications))))))
  with check (not (select public.wa_food_only()) or ((select public.wa_food_active()) and (public.wa_food_row(to_jsonb(hr_whatsapp_communications)) or ((select public.has_department_leave_cover()) and public.wa_std_row(to_jsonb(hr_whatsapp_communications))))));
alter policy nursing_food_whatsapp_select on public.hr_whatsapp_communications using ((select public.wa_food_active()));
alter policy nursing_food_whatsapp_insert on public.hr_whatsapp_communications with check ((select public.wa_food_active()));
alter policy nursing_food_whatsapp_update on public.hr_whatsapp_communications using ((select public.wa_food_active())) with check ((select public.wa_food_active()));
-- Admin / Director / food in-charge: allowed at once, no per-row test. Everyone else: per-row test (now indexed).
alter policy fv_named_whatsapp_scope on public.hr_whatsapp_communications
  using (coalesce(((select public.fv_access())->>'read')::boolean,false) or not public.wa_food_row(to_jsonb(hr_whatsapp_communications)))
  with check (coalesce(((select public.fv_access())->>'control')::boolean,false) or not public.wa_food_row(to_jsonb(hr_whatsapp_communications)));
alter policy fv_named_whatsapp_read on public.hr_whatsapp_communications
  using (coalesce(((select public.fv_access())->>'read')::boolean,false) and public.wa_food_row(to_jsonb(hr_whatsapp_communications)));

-- 4. Vendor phone list for the Food Vendors folder (food in-charge / Admin / Director only) ----
create or replace function public.fv_whatsapp_vendor_phones()
returns text[] language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not coalesce((public.fv_access()->>'read')::boolean,false) then return '{}'::text[]; end if;
  return coalesce((select array_agg(distinct p) from (
    select public.wa_food_phone(s.data->>'phone') p from public.fv_settings s
    union select public.wa_food_phone(o.data->>'phone') from public.fv_orders o) x
    where length(p) between 8 and 15), '{}'::text[]);
end $$;
revoke all on function public.fv_whatsapp_vendor_phones() from public, anon;
grant execute on function public.fv_whatsapp_vendor_phones() to authenticated;

analyze public.fv_orders;
analyze public.hr_whatsapp_communications;
notify pgrst, 'reload schema';
commit;

-- Check: all WhatsApp security rules after this update (send a screenshot of this result if the inbox is still slow).
select policyname, permissive, cmd, qual, with_check from pg_policies
 where schemaname='public' and tablename='hr_whatsapp_communications' order by policyname;
