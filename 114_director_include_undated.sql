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
    due_date = case when d.due_date is not null or d.scheduled_at is null then target_day end,
    rescheduled_at = p_now,
    reschedule_note = 'Automatically carried forward at the 11:55 PM India cutoff',
    reschedule_history = coalesce(d.reschedule_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at',p_now,'by',null,'automatic',true,
      'old_scheduled_at',d.scheduled_at,'old_due_date',d.due_date,
      'new_scheduled_at',case when d.scheduled_at is not null then
        (target_day + (d.scheduled_at at time zone 'Asia/Kolkata')::time) at time zone 'Asia/Kolkata' end,
      'new_due_date',case when d.due_date is not null or d.scheduled_at is null then target_day end,
      'note','Automatically carried forward at the 11:55 PM India cutoff')),
    updated_at = p_now
  where d.status in ('Pending','In Progress')
    and coalesce((d.scheduled_at at time zone 'Asia/Kolkata')::date,d.due_date,target_day-1) < target_day;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.rollover_director_office_jobs(timestamptz) from public, anon, authenticated;

commit;
