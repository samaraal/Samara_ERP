-- Samara Unified Feedback Module v1.0
-- Run once in Supabase SQL Editor before uploading the three front-end packages.

create extension if not exists pgcrypto;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'Website',
  respondent_type text not null default 'Visitor',
  respondent_name text,
  mobile text,
  email text,
  patient_id uuid references public.patients(id) on delete set null,
  patient_code text,
  patient_name text,
  relationship text,
  category text not null default 'General',
  rating smallint check (rating between 1 and 5),
  subject text,
  message text not null,
  consent_to_contact boolean not null default true,
  status text not null default 'New' check (status in ('New','Under Review','Replied','Closed')),
  priority text not null default 'Normal' check (priority in ('Normal','High','Urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  admin_reply text,
  replied_by uuid references public.profiles(id) on delete set null,
  replied_at timestamptz,
  closure_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback(created_at desc);
create index if not exists feedback_status_idx on public.feedback(status);
create index if not exists feedback_patient_id_idx on public.feedback(patient_id);

alter table public.feedback enable row level security;

drop policy if exists feedback_public_insert on public.feedback;
create policy feedback_public_insert on public.feedback for insert to anon
with check (
  source = 'Website'
  and length(trim(message)) between 3 and 4000
  and (rating is null or rating between 1 and 5)
);

drop policy if exists feedback_staff_select on public.feedback;
create policy feedback_staff_select on public.feedback for select to authenticated
using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role in ('Admin','Manager')));

drop policy if exists feedback_staff_update on public.feedback;
create policy feedback_staff_update on public.feedback for update to authenticated
using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role in ('Admin','Manager')))
with check (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role in ('Admin','Manager')));

create or replace function public.family_submit_feedback(
  p_session_token text,
  p_respondent_type text,
  p_category text,
  p_rating integer,
  p_subject text,
  p_message text,
  p_consent_to_contact boolean default true
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_access record;
  v_id uuid;
begin
  select fpa.*, p.full_name as resident_name
    into v_access
  from public.family_portal_access fpa
  join public.patients p on p.id=fpa.patient_id
  where fpa.session_token=p_session_token
    and coalesce(fpa.is_active,true)=true
  limit 1;
  if v_access is null then raise exception 'Family Portal session is invalid or expired'; end if;
  if length(trim(coalesce(p_message,''))) < 3 then raise exception 'Please enter your feedback'; end if;
  if p_rating is not null and (p_rating<1 or p_rating>5) then raise exception 'Rating must be between 1 and 5'; end if;

  insert into public.feedback(source,respondent_type,respondent_name,patient_id,patient_code,patient_name,relationship,category,rating,subject,message,consent_to_contact)
  values('Family Portal',coalesce(nullif(trim(p_respondent_type),''),'Family Member'),
         coalesce(v_access.relative_name,'Family Member'),v_access.patient_id,v_access.patient_code,v_access.resident_name,
         v_access.relationship,coalesce(nullif(trim(p_category),''),'General'),p_rating,nullif(trim(p_subject),''),trim(p_message),coalesce(p_consent_to_contact,true))
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.family_submit_feedback(text,text,text,integer,text,text,boolean) to anon, authenticated;
