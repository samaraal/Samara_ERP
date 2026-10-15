begin;
create table if not exists public.outside_nursing_whatsapp_sends (
 request_id uuid primary key references public.outside_nursing_online_requests(id),
 visit_id uuid not null references public.outside_nursing_visits(id),
 recipient_phone text not null, recipient_name text not null,
 status text not null check(status in ('Preparing','Accepted','Failed','Unknown')),
 staff_id uuid not null, opt_in_confirmed_at timestamptz not null,
 provider_message_id text unique, media_id text, document_path text, document_sha256 text,
 error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.outside_nursing_whatsapp_sends enable row level security;
revoke all on public.outside_nursing_whatsapp_sends from public,anon,authenticated;
grant all on public.outside_nursing_whatsapp_sends to service_role;
create or replace function public.outside_nursing_whatsapp(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.outside_nursing_online_requests%rowtype;v public.outside_nursing_visits%rowtype;p public.outside_nursing_patients%rowtype;s public.outside_nursing_whatsapp_sends%rowtype;to_phone text;to_name text;
begin
 select * into r from public.outside_nursing_online_requests where id=(p_data->>'request_id')::uuid for update;
 if not found then raise exception 'Payment request not found';end if;
 select * into v from public.outside_nursing_visits where id=r.visit_id;
 select * into p from public.outside_nursing_patients where id=v.patient_id;
 select * into s from public.outside_nursing_whatsapp_sends where request_id=r.id;
 if p_action='context' then return jsonb_build_object('request',to_jsonb(r),'visit',to_jsonb(v),'patient',to_jsonb(p),'send',to_jsonb(s));end if;
 if p_action='reserve' then
  if not exists(select 1 from public.profiles where id=(p_data->>'staff_id')::uuid and is_active is distinct from false and role in ('Admin','Accounts')) then raise exception 'Admin or Accounts permission required';end if;
  if coalesce((p_data->>'opt_in')::boolean,false) is not true then raise exception 'Confirm that the family agreed to receive this invoice on WhatsApp';end if;
  if v.review_status<>'Approved' or v.billed_at is null or r.status<>'Pending' or r.payment_url is null or r.expires_at<=now() then raise exception 'An approved invoice and active unpaid payment link are required';end if;
  if r.amount>v.total-coalesce((select sum(amount) from public.outside_nursing_payments where visit_id=v.id),0) then raise exception 'Reconcile payments before sending this request';end if;
  if s.request_id is not null and s.status<>'Failed' then return jsonb_build_object('fresh',false,'send',to_jsonb(s));end if;
  to_phone:=regexp_replace(coalesce(nullif(r.recipient_phone,''),nullif(v.snapshot->>'phone',''),p.phone),'[^0-9]','','g');
  if length(to_phone)=10 then to_phone:='91'||to_phone;end if;
  if to_phone !~ '^[1-9][0-9]{7,14}$' then raise exception 'The saved family WhatsApp number is invalid';end if;
  to_name:=coalesce(nullif(r.recipient_name,''),nullif(v.snapshot->>'full_name',''),p.full_name,'Patient / Family');
  insert into public.outside_nursing_whatsapp_sends(request_id,visit_id,recipient_phone,recipient_name,status,staff_id,opt_in_confirmed_at)
   values(r.id,v.id,to_phone,to_name,'Preparing',(p_data->>'staff_id')::uuid,now())
   on conflict(request_id) do update set recipient_phone=excluded.recipient_phone,recipient_name=excluded.recipient_name,status='Preparing',staff_id=excluded.staff_id,opt_in_confirmed_at=excluded.opt_in_confirmed_at,error_message=null,updated_at=now() returning * into s;
  return jsonb_build_object('fresh',true,'send',to_jsonb(s));
 elsif p_action='finish' then
  if s.request_id is null or s.status<>'Preparing' then raise exception 'A reserved WhatsApp send is required';end if;
  if p_data->>'status' not in ('Accepted','Failed','Unknown') then raise exception 'Invalid send outcome';end if;
  if p_data->>'status'='Accepted' and coalesce(p_data->>'message_id','')='' then raise exception 'Meta message ID required';end if;
  update public.outside_nursing_whatsapp_sends set status=p_data->>'status',provider_message_id=p_data->>'message_id',media_id=p_data->>'media_id',document_path=p_data->>'document_path',document_sha256=p_data->>'document_sha256',error_message=left(p_data->>'error',500),updated_at=now() where request_id=r.id returning * into s;
  return jsonb_build_object('send',to_jsonb(s));
 end if;
 raise exception 'Unknown WhatsApp action';
end $$;
revoke all on function public.outside_nursing_whatsapp(text,jsonb) from public,anon,authenticated;
grant execute on function public.outside_nursing_whatsapp(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
