begin;
create or replace function public.require_director_job_date()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.scheduled_at is null and new.due_date is null then
    raise exception 'Please select a Scheduled / Due Date for the Director''s Office job.';
  end if;
  return new;
end;
$$;
create or replace trigger director_job_date_required
before insert or update of scheduled_at,due_date on public.director_office_items
for each row execute function public.require_director_job_date();
commit;
