-- 169: Automatic patient / family WhatsApp — allow the staff who actually trigger them.
-- (Supersedes 168. Safe to run whether or not 168 was run. Safe to run more than once.)
--
-- Audit finding (30-09-2026): every browser-triggered WhatsApp goes through the whatsapp-send
-- Edge Function, which only allowed Admin / Manager, and the Nursing Manager only for food vendors.
-- So these automatic messages were silently failing for the person who triggers them:
--   * Admission WhatsApp + Family Portal access  -> Nursing Manager, Jaya, Saranya
--   * Discharge confirmation (on final discharge) -> Nurse (only a Nurse can complete final discharge)
--   * Payment receipt (after payment is saved)    -> Accounts
--
-- New rule, decided here in ONE place (wa_food_guard), used by whatsapp-send:
--   Admin / Manager (not Nursing Manager) ...... everything, as before
--   Nursing Manager ............................ food vendors (as before) + admission, portal access,
--                                                discharge confirmation, review reminder
--   Jaya / Saranya (admission delegates) ....... admission + portal access
--   Nurse ...................................... discharge confirmation + review reminder
--   Accounts ................................... payment receipt + bill reminder
-- Patient / family templates go ONLY to a number already registered for a patient
-- (Family Portal contact, attendant / patient mobile, or discharge relative contact).
-- Free-text replies and attachments keep the old rules.
--
-- IMPORTANT: also redeploy the whatsapp-send Edge Function from
-- supabase/function-copies/whatsapp-send-food-scope.ts (it now lets the guard decide the role).

begin;

-- A number registered for any patient / family member.
create or replace function public.wa_patient_contact(p_phone text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(length(wa_food_phone(p_phone))>=10,false) and (
   exists(select 1 from family_portal_access f where wa_food_phone(f.mobile)=wa_food_phone(p_phone))
   or exists(select 1 from patients x where wa_food_phone(x.attendant_phone)=wa_food_phone(p_phone) or wa_food_phone(x.mobile)=wa_food_phone(p_phone))
   or exists(select 1 from patient_discharges d where wa_food_phone(d.relative_contact)=wa_food_phone(p_phone))
 )
$$;
revoke all on function public.wa_patient_contact(text) from public,anon,authenticated;
grant execute on function public.wa_patient_contact(text) to service_role;

create or replace function public.wa_food_guard(p_user uuid,p_phone text default null,p_media text default null,p_template text default null)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p profiles;cover boolean;nursing boolean;delegate boolean:=false;
begin
 select * into p from duty_profiles where id=p_user or auth_user_id=p_user;
 if not found or not coalesce(p.is_active,p.active,false) then return false;end if;
 nursing:=coalesce(wa_food_is_nursing(to_jsonb(p)),false);
 if not nursing and p.role in ('Admin','Manager') then return true;end if;

 if p_media is not null then
  if not nursing then return false;end if;
  cover:=(public.active_department_leave_cover(p.id)).id is not null;
  return exists(select 1 from hr_whatsapp_communications h where (wa_food_row(to_jsonb(h)) or (cover and wa_std_row(to_jsonb(h)))) and h.direction='inbound' and h.message_type in ('image','audio','video','document','sticker') and h.message_payload->h.message_type->>'id'=p_media);
 end if;

 -- Patient / family templates for the staff who trigger them, only to a registered patient / family number.
 if p_template is not null and wa_patient_contact(p_phone) then
  begin delegate:=coalesce(public.admission_delegate_profile(p),false); exception when others then delegate:=false; end;
  if p_template in ('samara_patient_admission','samara_family_portal_access') and (nursing or delegate) then return true;end if;
  if p_template in ('samara_discharge_confirmation','appointment_review_reminder') and (nursing or p.role='Nurse') then return true;end if;
  if p_template in ('samara_payment_receipt','samara_bill_reminder') and p.role='Accounts' then return true;end if;
 end if;

 -- Nursing Manager / STD cover: food-vendor conversations (unchanged).
 if nursing then return (p_template is null or p_template='samara_callback_request') and wa_food_vendor(p_phone);end if;
 return false;
end $$;
revoke all on function public.wa_food_guard(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wa_food_guard(uuid,text,text,text) to service_role;

notify pgrst,'reload schema';
commit;

-- Verify: should return true.
select position('samara_payment_receipt' in pg_get_functiondef('public.wa_food_guard(uuid,text,text,text)'::regprocedure)) > 0 as whatsapp_roles_fix_installed;
