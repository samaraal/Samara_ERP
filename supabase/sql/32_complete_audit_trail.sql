-- Samara Care ERP 1.3.4
-- Complete Audit Trail: additive, non-destructive setup

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity text not null,
  entity_id text,
  user_id uuid,
  user_name text,
  user_role text,
  result text not null default 'Success',
  details jsonb not null default '{}'::jsonb,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log add column if not exists user_name text;
alter table public.audit_log add column if not exists user_role text;
alter table public.audit_log add column if not exists result text default 'Success';
alter table public.audit_log add column if not exists details jsonb default '{}'::jsonb;
alter table public.audit_log add column if not exists old_data jsonb;
alter table public.audit_log add column if not exists new_data jsonb;

create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_user_idx on public.audit_log(user_id);
create index if not exists audit_log_entity_idx on public.audit_log(entity, created_at desc);

create or replace function public.record_audit_event(
  p_action text,
  p_entity text default 'System',
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb,
  p_result text default 'Success'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_name text;
  v_role text;
begin
  select trim(concat_ws(' ',title,full_name)), role
  into v_name,v_role
  from public.profiles
  where id=auth.uid() or auth_user_id=auth.uid()
  limit 1;

  insert into public.audit_log(action,entity,entity_id,user_id,user_name,user_role,result,details)
  values(p_action,p_entity,p_entity_id,auth.uid(),v_name,v_role,coalesce(p_result,'Success'),coalesce(p_details,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.record_audit_event(text,text,text,jsonb,text) to authenticated;

create or replace function public.audit_table_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_name text;
  v_role text;
  v_entity_id text;
  v_action text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op='INSERT' then
    v_new=to_jsonb(new);
    v_entity_id=coalesce(v_new->>'id',v_new->>'patient_id',v_new->>'employee_id');
    v_action='Created';
  elsif tg_op='UPDATE' then
    v_old=to_jsonb(old);
    v_new=to_jsonb(new);
    v_entity_id=coalesce(v_new->>'id',v_new->>'patient_id',v_new->>'employee_id');
    v_action='Updated';
  else
    v_old=to_jsonb(old);
    v_entity_id=coalesce(v_old->>'id',v_old->>'patient_id',v_old->>'employee_id');
    v_action='Deleted';
  end if;

  select trim(concat_ws(' ',title,full_name)),role
  into v_name,v_role
  from public.profiles
  where id=v_user or auth_user_id=v_user
  limit 1;

  insert into public.audit_log(action,entity,entity_id,user_id,user_name,user_role,result,details,old_data,new_data)
  values(v_action,tg_table_name,v_entity_id,v_user,v_name,v_role,'Success',
    jsonb_build_object('operation',tg_op,'table',tg_table_name),
    v_old,v_new);

  return coalesce(new,old);
end;
$$;

do $$
declare
  t text;
  trigger_name text;
  tables text[]:=array[
    'patients','profiles','patient_documents','employee_documents',
    'medication_orders','medication_administrations','care_orders','care_logs',
    'vital_signs','meal_records','physiotherapy_orders','physiotherapy_sessions',
    'shift_handovers','incidents','medication_errors','billing_transactions',
    'recovery_events','patient_communications','room_beds'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is not null then
      trigger_name:='audit_'||t||'_changes';
      execute format('drop trigger if exists %I on public.%I',trigger_name,t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_table_change()',
        trigger_name,t
      );
    end if;
  end loop;
end $$;

alter table public.audit_log enable row level security;

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select
on public.audit_log for select
to authenticated
using (public.current_user_has_role(array['Admin']));

drop policy if exists audit_log_authenticated_insert on public.audit_log;
create policy audit_log_authenticated_insert
on public.audit_log for insert
to authenticated
with check (user_id=auth.uid());

notify pgrst, 'reload schema';

select
  to_regclass('public.audit_log') is not null as audit_table_ready,
  exists(select 1 from pg_proc where proname='record_audit_event') as audit_rpc_ready,
  count(*) as existing_audit_records
from public.audit_log;
