begin;
create table public.outside_nursing_patients (
 id uuid primary key default gen_random_uuid(), full_name text not null check(length(trim(full_name))>0),
 phone text not null, address text not null default '', created_at timestamptz not null default now()
);
create table public.outside_nursing_rates (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(trim(name))>0),
 rate numeric(12,2) not null check(rate>=0), active boolean not null default true
);
create table public.outside_nursing_visits (
 id uuid primary key, patient_id uuid not null references public.outside_nursing_patients,
 service_date date not null, procedure_name text not null check(length(trim(procedure_name))>0),
 nurse_name text not null check(length(trim(nurse_name))>0), location text not null check(location in ('At Samara','Home / outside visit')),
 notes text not null default '', recorded_by uuid not null, created_at timestamptz not null default now(),
 invoice_number bigint generated always as identity unique, billed_at timestamptz, billed_by uuid,
 review_status text not null default 'Submitted' check(review_status in ('Submitted','Returned','Approved')), review_note text not null default '',
 quantity numeric(12,2), rate numeric(12,2), concession numeric(12,2), total numeric(12,2), snapshot jsonb,
 check(billed_at is null or (quantity>0 and rate>=0 and concession>=0 and concession<=round(quantity*rate,2) and total=round(quantity*rate,2)-concession))
);
create table public.outside_nursing_payments (
 id uuid primary key, visit_id uuid not null references public.outside_nursing_visits,
 payment_date date not null, amount numeric(12,2) not null check(amount>0),
 method text not null check(method in ('Cash','UPI','Bank transfer','Card')), reference text not null default '',
 recorded_by uuid not null, created_at timestamptz not null default now()
);
create index outside_nursing_visit_date on public.outside_nursing_visits(service_date,patient_id);
create index outside_nursing_payment_visit on public.outside_nursing_payments(visit_id,payment_date);
alter table public.outside_nursing_patients enable row level security;
alter table public.outside_nursing_rates enable row level security;
alter table public.outside_nursing_visits enable row level security;
alter table public.outside_nursing_payments enable row level security;
do $$ declare t text; begin
 foreach t in array array['outside_nursing_patients','outside_nursing_rates','outside_nursing_visits','outside_nursing_payments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;
create or replace function public.outside_nursing(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.outside_nursing_visits%rowtype; patient public.outside_nursing_patients%rowtype;
 eid uuid; pid uuid; finance boolean; qty numeric(12,2); price numeric(12,2); discount numeric(12,2); amount numeric(12,2); day date;
begin
 if auth.uid() is null or not public.current_user_has_role(array['Admin','Accounts','Nurse','Manager']) then raise exception 'Nursing services access required'; end if;
 finance:=public.current_user_has_role(array['Admin','Accounts']);
 eid:=nullif(p_data->>'id','')::uuid;
 if p_action='load' then
 return jsonb_build_object(
 'patients',coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name) from public.outside_nursing_patients p),'[]'),
 'rates',coalesce((select jsonb_agg(case when finance then to_jsonb(r) else to_jsonb(r)-'rate' end order by r.name) from public.outside_nursing_rates r),'[]'),
 'visits',coalesce((select jsonb_agg(case when finance then to_jsonb(x) else to_jsonb(x)-array['rate','quantity','concession','total','snapshot','billed_by'] end order by x.service_date,x.created_at) from public.outside_nursing_visits x),'[]'),
 'payments',case when finance then coalesce((select jsonb_agg(to_jsonb(p) order by p.payment_date,p.created_at) from public.outside_nursing_payments p),'[]') else '[]'::jsonb end);
 end if;
 if p_action='patient' then
 if nullif(trim(p_data->>'full_name'),'') is null or nullif(trim(p_data->>'phone'),'') is null then raise exception 'Patient name and phone required'; end if;
 insert into public.outside_nursing_patients(id,full_name,phone,address) values(coalesce(eid,gen_random_uuid()),trim(p_data->>'full_name'),trim(p_data->>'phone'),coalesce(p_data->>'address','')) on conflict(id) do nothing;
 elsif p_action in ('visit','resubmit') then
 day:=(p_data->>'service_date')::date;
 if day is null or day>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Valid service date required'; end if;
 if p_action='resubmit' then
 select * into v from public.outside_nursing_visits where id=eid for update;
 if not found or v.review_status<>'Returned' or v.billed_at is not null or (v.recorded_by<>auth.uid() and not public.current_user_has_role(array['Admin'])) then raise exception 'Only the submitting nurse can correct a returned form'; end if;
 update public.outside_nursing_visits set service_date=day,procedure_name=trim(p_data->>'procedure_name'),nurse_name=trim(p_data->>'nurse_name'),location=p_data->>'location',notes=coalesce(p_data->>'notes',''),review_status='Submitted' where id=eid;
 else
 if not public.current_user_has_role(array['Nurse','Admin','Manager']) then raise exception 'Nursing access required for completed procedure submission'; end if;
 insert into public.outside_nursing_visits(id,patient_id,service_date,procedure_name,nurse_name,location,notes,recorded_by)
 values(eid,(p_data->>'patient_id')::uuid,day,trim(p_data->>'procedure_name'),trim(p_data->>'nurse_name'),p_data->>'location',coalesce(p_data->>'notes',''),auth.uid()) on conflict(id) do nothing;
 end if;
 elsif p_action='rate' then
 if not public.current_user_has_role(array['Admin']) then raise exception 'Admin sets procedure rates'; end if;
 insert into public.outside_nursing_rates(id,name,rate,active) values(coalesce(eid,gen_random_uuid()),trim(p_data->>'name'),(p_data->>'rate')::numeric,coalesce((p_data->>'active')::boolean,true))
 on conflict(id) do update set name=excluded.name,rate=excluded.rate,active=excluded.active;
 elsif p_action in ('bill','payment','return') then
 if not finance then raise exception 'Admin or Accounts access required'; end if;
 select * into v from public.outside_nursing_visits where id=(p_data->>'visit_id')::uuid for update;
 if not found then raise exception 'Procedure record not found'; end if;
 if p_action in ('bill','return') and not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin can approve, set fees and issue invoices'; end if;
 if p_action='return' then
 if v.billed_at is not null then raise exception 'An issued invoice cannot be returned'; end if;
 if nullif(trim(p_data->>'review_note'),'') is null then raise exception 'Return reason required'; end if;
 update public.outside_nursing_visits set review_status='Returned',review_note=trim(p_data->>'review_note') where id=v.id;
 elsif p_action='bill' then
 if v.billed_at is not null then raise exception 'Invoice already issued'; end if;
 qty:=(p_data->>'quantity')::numeric; price:=(p_data->>'rate')::numeric; discount:=(p_data->>'concession')::numeric;
 if qty is null or price is null or discount is null or qty<=0 or price<0 or discount<0 or discount>round(qty*price,2) then raise exception 'Check quantity, rate and concession'; end if;
 select * into patient from public.outside_nursing_patients where id=v.patient_id;
 if v.review_status<>'Submitted' then raise exception 'Only submitted procedures can be approved'; end if;
 update public.outside_nursing_visits set review_status='Approved',review_note=coalesce(p_data->>'review_note',''),billed_at=now(),billed_by=auth.uid(),quantity=qty,rate=price,concession=discount,total=round(qty*price,2)-discount,snapshot=to_jsonb(patient) where id=v.id;
 else
 if exists(select 1 from public.outside_nursing_payments where id=eid and visit_id=v.id) then return jsonb_build_object('id',eid); end if;
 if v.billed_at is null then raise exception 'Issue invoice before receiving payment'; end if;
 amount:=(p_data->>'amount')::numeric;day:=(p_data->>'payment_date')::date;
 if day is null or day<v.service_date or day>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Payment date must be between service date and today'; end if;
 if amount is null or amount<=0 or amount>v.total-coalesce((select sum(p.amount) from public.outside_nursing_payments p where p.visit_id=v.id),0) then raise exception 'Payment must be positive and cannot exceed invoice balance'; end if;
 insert into public.outside_nursing_payments(id,visit_id,payment_date,amount,method,reference,recorded_by) values(eid,v.id,day,amount,p_data->>'method',coalesce(p_data->>'reference',''),auth.uid());
 end if;
 else raise exception 'Unknown nursing action'; end if;
 perform public.record_audit_event('Outside Nursing '||p_action,'Outside Nursing',coalesce(eid,v.id)::text,p_data,'Success');
 return jsonb_build_object('id',eid);
end $$;
revoke all on function public.outside_nursing(text,jsonb) from public,anon;
grant execute on function public.outside_nursing(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
