-- Automatic payment acknowledgment, separate from optional bank-issued references.
begin;
alter table public.op_trial_payments add column if not exists bank_reference text not null default '';
update public.op_trial_payments set bank_reference=reference where method<>'Cash' and bank_reference='' and trim(reference)<>'';
create unique index if not exists op_trial_duplicate_bank_reference on public.op_trial_payments(lower(trim(account)),lower(trim(bank_reference))) where method<>'Cash' and reversed_at is null and trim(bank_reference)<>'';
do $migration$
declare source text; updated text;
begin
 source:=pg_get_functiondef('public.op_trial_rpc(text,jsonb)'::regprocedure);
 if position($old$if trim(coalesce(p->>'account',''))='' or trim(coalesce(p->>'reference',''))='' then raise exception 'Account and transaction reference / cash acknowledgment required';end if;$old$ in source)=0 or position($old$insert into public.op_trial_payments(request_id,amount,paid_on,method,account,reference,recipient,proof,recorded_by,recorded_name)
  values(r.id,val,(p->>'paid_on')::date,p->>'method',trim(p->>'account'),trim(p->>'reference'),trim(coalesce(p->>'recipient','')),docs,(a->>'id')::uuid,a->>'name') returning * into v;$old$ in source)=0 then raise exception 'Unexpected payment function; review before applying';end if;
 updated:=replace(source,$old$if trim(coalesce(p->>'account',''))='' or trim(coalesce(p->>'reference',''))='' then raise exception 'Account and transaction reference / cash acknowledgment required';end if;$old$,$new$if trim(coalesce(p->>'account',''))='' then raise exception 'Bank account / cashbook required';end if;$new$);
 updated:=replace(updated,$old$insert into public.op_trial_payments(request_id,amount,paid_on,method,account,reference,recipient,proof,recorded_by,recorded_name)
  values(r.id,val,(p->>'paid_on')::date,p->>'method',trim(p->>'account'),trim(p->>'reference'),trim(coalesce(p->>'recipient','')),docs,(a->>'id')::uuid,a->>'name') returning * into v;$old$,$new$insert into public.op_trial_payments(request_id,amount,paid_on,method,account,reference,bank_reference,recipient,proof,recorded_by,recorded_name)
  values(r.id,val,(p->>'paid_on')::date,p->>'method',trim(p->>'account'),'PENDING-'||gen_random_uuid()::text,case when p->>'method'='Cash' then '' else trim(coalesce(p->>'bank_reference',p->>'reference','')) end,trim(coalesce(p->>'recipient','')),docs,(a->>'id')::uuid,a->>'name') returning * into v;
  update public.op_trial_payments set reference='TRIAL-PAY-'||lpad(v.number::text,greatest(5,length(v.number::text)),'0') where id=v.id returning * into v;$new$);
 execute updated;
end $migration$;
commit;
