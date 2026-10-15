begin;
create table if not exists public.outside_nursing_online_requests(
 id uuid primary key default gen_random_uuid(), visit_id uuid not null references public.outside_nursing_visits(id),
 request_code text not null unique default ('ON-'||upper(replace(gen_random_uuid()::text,'-',''))),
 amount numeric(12,2) not null check(amount>0 and amount<=500000),
 status text not null default 'Creating' check(status in ('Creating','Pending','Paid','Cancelled','Expired','Failed')),
 link_id text unique, payment_url text, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '48 hours',
 recipient_phone text, recipient_name text, whatsapp_message_id text, shared_at timestamptz
);
create index if not exists outside_nursing_online_visit on public.outside_nursing_online_requests(visit_id,created_at desc);
alter table public.outside_nursing_online_requests enable row level security;
revoke all on public.outside_nursing_online_requests from anon,authenticated;
grant all on public.outside_nursing_online_requests to service_role;
alter table public.outside_nursing_payments add column if not exists online_request_id uuid references public.outside_nursing_online_requests(id);
alter table public.outside_nursing_payments add column if not exists gateway_payment_id text unique;
alter table public.outside_nursing_payments drop constraint if exists outside_nursing_payments_method_check;
alter table public.outside_nursing_payments add constraint outside_nursing_payments_method_check check(method in ('Cash','UPI','Bank transfer','Card','Razorpay Online'));
-- Resident billing remains entirely separate.
create or replace function public.outside_nursing_online(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.outside_nursing_visits%rowtype; r public.outside_nursing_online_requests%rowtype;
 amount numeric(12,2); balance numeric(12,2); entry jsonb; existing public.outside_nursing_payments%rowtype;
begin
 if p_action='reserve' then
  select * into v from public.outside_nursing_visits where id=(p_data->>'visit_id')::uuid for update;
  if not found or v.billed_at is null or v.review_status<>'Approved' then raise exception 'An approved invoice is required'; end if;
  if not exists(select 1 from public.profiles where id=(p_data->>'staff_id')::uuid and is_active is distinct from false and role in ('Admin','Accounts')) then raise exception 'Admin or Accounts permission required'; end if;
  select * into r from public.outside_nursing_online_requests where visit_id=v.id and status in ('Creating','Pending') order by created_at desc limit 1;
  if found then return jsonb_build_object('request',to_jsonb(r),'fresh',false); end if;
  select v.total-coalesce(sum(p.amount),0) into balance from public.outside_nursing_payments p where p.visit_id=v.id;
  amount:=coalesce(nullif(p_data->>'amount','')::numeric,balance);
  if amount is null or amount<1 or amount<>round(amount,2) or amount>balance or amount>500000 then raise exception 'Amount must be at least INR 1 and cannot exceed invoice balance or INR 500000'; end if;
  insert into public.outside_nursing_online_requests(visit_id,amount,created_by) values(v.id,amount,(p_data->>'staff_id')::uuid) returning * into r;
  return jsonb_build_object('request',to_jsonb(r),'fresh',true);
 end if;
 select * into r from public.outside_nursing_online_requests where id=(p_data->>'request_id')::uuid;
 if not found then raise exception 'Payment request not found'; end if;
 select * into v from public.outside_nursing_visits where id=r.visit_id for update;
 select * into r from public.outside_nursing_online_requests where id=r.id for update;
 if p_action='attach' then
  if r.status not in ('Creating','Pending') then raise exception 'Payment request is no longer open'; end if;
  if r.link_id is not null and r.link_id<>p_data->>'link_id' then raise exception 'Payment link already attached'; end if;
  update public.outside_nursing_online_requests set link_id=p_data->>'link_id',payment_url=p_data->>'payment_url',status='Pending' where id=r.id returning * into r;
 elsif p_action='fail' then
  update public.outside_nursing_online_requests set status='Failed' where id=r.id and link_id is null and status='Creating' returning * into r;
 elsif p_action='settle' then
  for entry in select * from jsonb_array_elements(coalesce(p_data->'payments','[]')) loop
   if nullif(entry->>'payment_id','') is null or (entry->>'amount_paise')::bigint<=0 then raise exception 'Verified payment details required'; end if;
   select * into existing from public.outside_nursing_payments where gateway_payment_id=entry->>'payment_id';
   if found then
    if existing.online_request_id<>r.id or existing.amount<>(entry->>'amount_paise')::numeric/100 then raise exception 'Payment already belongs to another request'; end if;
    continue;
   end if;
   amount:=(entry->>'amount_paise')::numeric/100;
   if amount>r.amount-coalesce((select sum(p.amount) from public.outside_nursing_payments p where p.online_request_id=r.id),0) then raise exception 'Gateway receipts exceed payment request'; end if;
   if amount>v.total-coalesce((select sum(p.amount) from public.outside_nursing_payments p where p.visit_id=v.id),0) then raise exception 'Gateway receipt exceeds invoice balance; Accounts review required'; end if;
   insert into public.outside_nursing_payments(id,visit_id,payment_date,amount,method,reference,recorded_by,online_request_id,gateway_payment_id)
   values(gen_random_uuid(),v.id,(to_timestamp((entry->>'created_at')::double precision) at time zone 'Asia/Kolkata')::date,amount,'Razorpay Online','Razorpay Online / '||(entry->>'payment_id'),r.created_by,r.id,entry->>'payment_id');
  end loop;
  if coalesce((select sum(p.amount) from public.outside_nursing_payments p where p.online_request_id=r.id),0)=r.amount then
   update public.outside_nursing_online_requests set status='Paid' where id=r.id;
  elsif p_data->>'gateway_status' in ('cancelled','expired') then
   update public.outside_nursing_online_requests set status=initcap(p_data->>'gateway_status') where id=r.id;
  end if;
  select * into r from public.outside_nursing_online_requests where id=r.id;
 elsif p_action='shared' then
  update public.outside_nursing_online_requests set recipient_phone=p_data->>'phone',recipient_name=p_data->>'name',whatsapp_message_id=p_data->>'message_id',shared_at=now() where id=r.id returning * into r;
 else raise exception 'Unknown online payment action'; end if;
 return jsonb_build_object('request',to_jsonb(r));
end $$;
revoke all on function public.outside_nursing_online(text,jsonb) from public,anon,authenticated;
grant execute on function public.outside_nursing_online(text,jsonb) to service_role;
-- One invoice lock serialises cash receipts and gateway settlement. An open link
-- must be cancelled/synchronised before recording a separate manual payment.
create or replace function public.guard_outside_online_receipt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.outside_nursing_visits where id=NEW.visit_id for update;
 if NEW.online_request_id is null and exists(select 1 from public.outside_nursing_online_requests where visit_id=NEW.visit_id and status in ('Creating','Pending')) then raise exception 'Cancel or reconcile the open online payment link before recording a manual receipt'; end if;
 return NEW;
end $$;
drop trigger if exists outside_online_receipt_guard on public.outside_nursing_payments;
create trigger outside_online_receipt_guard before insert on public.outside_nursing_payments for each row execute function public.guard_outside_online_receipt();
notify pgrst,'reload schema';
commit;

