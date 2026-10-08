-- SAMARA CARE ERP 2.15.94 — Food-order WhatsApp inbox follows the Food Management assignment.
-- Whoever is currently assigned Food Management (fv_assignments, e.g. Akshi – STD) — plus Admin / Director —
-- sees the food-vendor WhatsApp conversations in WhatsApp Inbox ("Food Vendors" folder), can mark them read,
-- and the assigned person gets a pop-up for each new vendor message. When the assignment is changed, expires
-- or is revoked, access moves automatically to the new person (fv_access is checked on every call).
-- Sending to the vendor is unchanged (wa_food_guard, SQL 183: in-charge may reply and send the food callback template).
-- Run once in Supabase > SQL Editor, after SQL 207. Safe to run again.
begin;

-- 1. Food-vendor conversation rows, for the Food Management in-charge / Admin / Director only.
create or replace function public.fv_whatsapp_inbox()
returns setof public.hr_whatsapp_communications
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not coalesce((public.fv_access()->>'read')::boolean,false) then return; end if;
  return query
    with vendor_phones as (
      select public.wa_food_phone(s.data->>'phone') as p from public.fv_settings s
      union
      select public.wa_food_phone(o.data->>'phone') from public.fv_orders o
    )
    select h.* from public.hr_whatsapp_communications h
    where public.wa_food_phone(h.recipient_number) in (select p from vendor_phones where length(p) between 8 and 15)
      and public.wa_food_row(to_jsonb(h))
    order by h.created_at desc, h.id desc;
end $$;
revoke all on function public.fv_whatsapp_inbox() from public, anon;
grant execute on function public.fv_whatsapp_inbox() to authenticated;

-- 2. Mark food-vendor messages read (works for any role holding the assignment, e.g. STD).
create or replace function public.fv_whatsapp_mark_read(p_ids uuid[])
returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if not coalesce((public.fv_access()->>'read')::boolean,false) then
    raise exception 'Only the current Food Management in-charge or Admin / Director can open food-vendor WhatsApp messages';
  end if;
  update public.hr_whatsapp_communications h
     set erp_read_at = now(), updated_at = now()
   where h.id = any(coalesce(p_ids,'{}'::uuid[]))
     and h.direction = 'inbound' and h.erp_read_at is null
     and public.wa_food_row(to_jsonb(h));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fv_whatsapp_mark_read(uuid[]) from public, anon;
grant execute on function public.fv_whatsapp_mark_read(uuid[]) to authenticated;

-- 3. Unread vendor messages (last 2 days) for the pop-up — only the person ASSIGNED Food Management
--    (Admin / Director still see them in the inbox, without pop-ups).
create or replace function public.fv_whatsapp_unread()
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb := public.fv_access();
begin
  if not coalesce((a->>'delegated')::boolean,false) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x order by x.latest_at desc) from (
      select public.wa_food_phone(h.recipient_number) as phone,
             (array_agg(coalesce(nullif(h.contact_name,''),nullif(h.applicant_name,'')) order by h.created_at desc))[1] as contact_name,
             count(*)::int as unread,
             (array_agg(h.id order by h.created_at desc))[1] as latest_id,
             max(h.created_at) as latest_at,
             left(regexp_replace(coalesce((array_agg(
               case when h.message_type in ('image','document','audio','video','sticker') and coalesce(h.message_content,'')=''
                    then '['||h.message_type||']' else h.message_content end
               order by h.created_at desc))[1],''),'\s+',' ','g'),140) as snippet
      from public.hr_whatsapp_communications h
      where h.direction = 'inbound' and h.erp_read_at is null and h.deleted_at is null
        and h.created_at > now() - interval '2 days'
        and public.wa_food_row(to_jsonb(h))
      group by public.wa_food_phone(h.recipient_number)
    ) x), '[]'::jsonb);
end $$;
revoke all on function public.fv_whatsapp_unread() from public, anon;
grant execute on function public.fv_whatsapp_unread() to authenticated;

notify pgrst, 'reload schema';
commit;

-- Verify: should show 3 rows.
select proname from pg_proc where proname in ('fv_whatsapp_inbox','fv_whatsapp_mark_read','fv_whatsapp_unread') order by 1;
