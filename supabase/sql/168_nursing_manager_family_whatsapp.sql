-- 168: Hotfix for 2.15.11 — Admission / Family Portal WhatsApp blocked for the Nursing Manager.
--
-- Problem: since 2.13.53 (SQL 125/130) the whatsapp-send Edge Function asks wa_food_guard()
-- whether the caller may send. For a Nursing Manager it only allowed food-vendor numbers, so
-- when the Nursing Manager completed an admission the automatic Admission WhatsApp failed, and
-- the manual button showed: "WhatsApp access is limited to authorised food-vendor conversations."
--
-- Fix: the Nursing Manager (who completes admissions) may ALSO send the two admission templates
--   * samara_patient_admission     (Admission WhatsApp)
--   * samara_family_portal_access  (Family Portal access / PIN)
-- but only to a mobile that is registered and ACTIVE in family_portal_access for a patient.
-- Food-vendor scope, media scope, Inbox visibility and Admin/Manager behaviour are unchanged.
-- No Edge Function redeploy and no app.js change needed.
--
-- Safe to run more than once.

begin;

create or replace function public.wa_food_guard(p_user uuid,p_phone text default null,p_media text default null,p_template text default null)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p profiles;cover boolean;
begin
 select * into p from duty_profiles where id=p_user or auth_user_id=p_user;
 if not found or not coalesce(p.is_active,p.active,false) then return false;end if;
 if not coalesce(wa_food_is_nursing(to_jsonb(p)),false) then return p.role in ('Admin','Manager');end if;
 cover:=(public.active_department_leave_cover(p.id)).id is not null;
 if p_media is not null then
  return exists(select 1 from hr_whatsapp_communications h where (wa_food_row(to_jsonb(h)) or (cover and wa_std_row(to_jsonb(h)))) and h.direction='inbound' and h.message_type in ('image','audio','video','document','sticker') and h.message_payload->h.message_type->>'id'=p_media);
 end if;
 -- 168: Nursing Manager completes admissions -> may send the admission templates to an active Family Portal mobile.
 if p_template in ('samara_patient_admission','samara_family_portal_access')
    and exists(select 1 from family_portal_access f
               where coalesce(f.is_active,false)
                 and wa_food_phone(f.mobile)=wa_food_phone(p_phone)) then
  return true;
 end if;
 -- STD has no broader send permission. Cover keeps the Nursing Manager send scope.
 return (p_template is null or p_template='samara_callback_request') and wa_food_vendor(p_phone);
end $$;

revoke all on function public.wa_food_guard(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wa_food_guard(uuid,text,text,text) to service_role;

notify pgrst,'reload schema';
commit;

-- Verify: should return true.
select position('samara_patient_admission' in pg_get_functiondef('public.wa_food_guard(uuid,text,text,text)'::regprocedure)) > 0 as nursing_manager_admission_whatsapp_fix_installed;
