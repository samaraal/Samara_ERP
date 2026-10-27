-- ERP 2.18.182: Nursing Manager has full WhatsApp inbox / API access.
-- The authenticated send/media handlers keep using wa_food_guard. No provider credentials
-- are returned to the browser, and other roles retain their existing permissions.
begin;

create or replace function public.wa_nursing_inbox_active(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_user is not null and exists(
   select 1 from public.duty_profiles p
   where (p.id=p_user or p.auth_user_id=p_user) and p.role='Manager'
     and coalesce(p.is_active,p.active,false) and coalesce(p.active,p.is_active,false)
     and coalesce(public.wa_food_is_nursing(to_jsonb(p)),false)
 )
$$;
revoke all on function public.wa_nursing_inbox_active(uuid) from public,anon;
grant execute on function public.wa_nursing_inbox_active(uuid) to authenticated,service_role;

-- Both the nursing food-only scope and the named food-assignee scope must allow
-- the full inbox. Retain their original expressions for every other profile.
do $$ declare r record; q text; c text;
begin
 for r in select * from pg_policies where schemaname='public'
 and tablename='hr_whatsapp_communications' and permissive='RESTRICTIVE' loop
  q:=r.qual; c:=r.with_check;
  if q is not null and position('wa_nursing_inbox_active' in q)=0 then q:='((select public.wa_nursing_inbox_active()) or ('||q||'))'; end if;
  if c is not null and position('wa_nursing_inbox_active' in c)=0 then c:='((select public.wa_nursing_inbox_active()) or ('||c||'))'; end if;
  execute format('alter policy %I on public.hr_whatsapp_communications%s%s',r.policyname,
   case when q is null then '' else ' using ('||q||')' end,
   case when c is null then '' else ' with check ('||c||')' end);
 end loop;
end $$;

drop policy if exists nursing_whatsapp_inbox_read on public.hr_whatsapp_communications;
create policy nursing_whatsapp_inbox_read on public.hr_whatsapp_communications for select to authenticated
 using ((select public.wa_nursing_inbox_active()));
drop policy if exists nursing_whatsapp_inbox_insert on public.hr_whatsapp_communications;
create policy nursing_whatsapp_inbox_insert on public.hr_whatsapp_communications for insert to authenticated
 with check ((select public.wa_nursing_inbox_active()));
drop policy if exists nursing_whatsapp_inbox_update on public.hr_whatsapp_communications;
create policy nursing_whatsapp_inbox_update on public.hr_whatsapp_communications for update to authenticated
 using ((select public.wa_nursing_inbox_active())) with check ((select public.wa_nursing_inbox_active()));

-- This RPC accepts a verified caller ID only from the server-side WhatsApp handlers.
create or replace function public.wa_food_guard(p_user uuid,p_phone text default null,p_media text default null,p_template text default null)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if public.wa_nursing_inbox_active(p_user) or public.wa_std_inbox_active(p_user) then return true; end if;
 return public.wa_food_guard_before_std_inbox(p_user,p_phone,p_media,p_template);
end $$;
revoke all on function public.wa_food_guard(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wa_food_guard(uuid,text,text,text) to service_role;

create or replace function public.wa_hide_message(p_id uuid,p_hide boolean default true,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare who_name text; n int;
begin
 if p_hide and not (public.wa_std_inbox_active() or public.wa_nursing_inbox_active() or public.current_user_has_role(array['Admin','Manager'])) then
  raise exception 'Only Admin, Manager or STD can hide WhatsApp messages.'; end if;
 if not p_hide and not (public.wa_std_inbox_active() or public.wa_nursing_inbox_active() or public.current_user_has_role(array['Admin'])) then
  raise exception 'Only Admin, Nursing Manager or STD can restore hidden WhatsApp messages.'; end if;
 select coalesce(nullif(trim(concat_ws(' ',to_jsonb(pr)->>'title',to_jsonb(pr)->>'full_name')),''),to_jsonb(pr)->>'email','Staff')
 into who_name from public.profiles pr where pr.id=auth.uid() or pr.auth_user_id=auth.uid() limit 1;
 update public.hr_whatsapp_communications set
 deleted_at=case when p_hide then now() else null end,
 deleted_by=case when p_hide then auth.uid() else null end,
 deleted_by_name=case when p_hide then who_name else null end,
 delete_reason=case when p_hide then nullif(trim(coalesce(p_reason,'')),'') else null end,
 updated_at=now() where id=p_id and (p_hide=(deleted_at is null));
 get diagnostics n=row_count;
 insert into public.audit_log(user_id,action,entity,entity_id,details)
 values(auth.uid(),case when p_hide then 'WhatsApp message deleted (hidden)' else 'WhatsApp message restored' end,
 'WhatsApp',p_id,jsonb_build_object('reason',p_reason,'by',who_name,'changed',n));
 return jsonb_build_object('ok',true,'changed',n);
end $$;
revoke all on function public.wa_hide_message(uuid,boolean,text) from public,anon;
grant execute on function public.wa_hide_message(uuid,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
