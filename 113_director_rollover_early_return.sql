begin;

-- Nightly at 23:55 Asia/Kolkata (18:25 UTC). No browser needs to be open.
create or replace function public.rollover_director_office_jobs(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  local_now timestamp := p_now at time zone 'Asia/Kolkata';
  target_day date := local_now::date + case when local_now::time >= time '23:55' then 1 else 0 end;
  changed integer;
begin
  update public.director_office_items d set
    scheduled_at = case when d.scheduled_at is not null then
      (target_day + (d.scheduled_at at time zone 'Asia/Kolkata')::time) at time zone 'Asia/Kolkata' end,
    due_date = case when d.due_date is not null then target_day end,
    rescheduled_at = p_now,
    reschedule_note = 'Automatically carried forward at the 11:55 PM India cutoff',
    reschedule_history = coalesce(d.reschedule_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at',p_now,'by',null,'automatic',true,
      'old_scheduled_at',d.scheduled_at,'old_due_date',d.due_date,
      'new_scheduled_at',case when d.scheduled_at is not null then
        (target_day + (d.scheduled_at at time zone 'Asia/Kolkata')::time) at time zone 'Asia/Kolkata' end,
      'new_due_date',case when d.due_date is not null then target_day end,
      'note','Automatically carried forward at the 11:55 PM India cutoff')),
    updated_at = p_now
  where d.status in ('Pending','In Progress')
    and coalesce((d.scheduled_at at time zone 'Asia/Kolkata')::date,d.due_date) < target_day;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.rollover_director_office_jobs(timestamptz) from public, anon, authenticated;

alter table public.absence_requests
  add column if not exists original_leave_to_date date,
  add column if not exists return_to_duty_date date,
  add column if not exists return_recorded_by uuid references public.profiles(id),
  add column if not exists return_recorded_at timestamptz,
  add column if not exists return_remarks text;

create or replace function public.record_absence_early_return(p_request_id bigint,p_return_date date,p_remarks text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.absence_requests%rowtype; me public.profiles%rowtype; days_taken integer;
begin
  select * into me from public.profiles
  where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(is_active,true) limit 1;
  if me.id is null or me.role not in ('Admin','Manager') then
    raise exception 'Only an active Manager or Administrator can record an early return';
  end if;
  select * into r from public.absence_requests where id=p_request_id for update;
  if not found then raise exception 'Leave request not found'; end if;
  if r.employee_id=me.id then raise exception 'Another Manager or Administrator must confirm your return'; end if;
  if r.request_type <> 'Leave' or r.status <> 'approved' then raise exception 'Only approved leave can be shortened'; end if;
  if r.return_to_duty_date is not null then raise exception 'An early return has already been recorded'; end if;
  if p_return_date is null or p_return_date<r.from_date or p_return_date>r.to_date then
    raise exception 'Return date must fall within the approved leave period';
  end if;
  if p_return_date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Confirm the return only after the employee has rejoined'; end if;
  if nullif(trim(p_remarks),'') is null then raise exception 'Return confirmation remarks are required'; end if;
  days_taken := p_return_date-r.from_date;
  update public.absence_requests set
    original_leave_to_date=r.to_date,return_to_duty_date=p_return_date,
    return_recorded_by=me.id,return_recorded_at=now(),return_remarks=trim(p_remarks),
    to_date=case when days_taken=0 then r.from_date else p_return_date-1 end,
    status=case when days_taken=0 then 'cancelled' else 'approved' end,
    cancelled_at=case when days_taken=0 then now() else cancelled_at end
  where id=r.id;
  insert into public.audit_log(user_id,action,entity,entity_id,details)
  values(me.id,'Record Early Return','Leave / Permission',r.id::text,jsonb_build_object(
    'employee_id',r.employee_id,'original_from_date',r.from_date,'original_to_date',r.to_date,
    'return_to_duty_date',p_return_date,'days_taken',days_taken,'remarks',trim(p_remarks)));
  return jsonb_build_object('ok',true,'message','Early return recorded. Leave calendar and duty availability updated.','days_taken',days_taken);
end;
$$;
revoke all on function public.record_absence_early_return(bigint,date,text) from public, anon;
grant execute on function public.record_absence_early_return(bigint,date,text) to authenticated;

-- Same job name updates the schedule instead of creating duplicate jobs.
select cron.schedule('samara-director-office-2355-ist','25 18 * * *','select public.rollover_director_office_jobs();');
notify pgrst, 'reload schema';
commit;
