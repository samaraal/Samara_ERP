-- Deploy food-cutoff-push first. Keep its legacy JWT verification enabled.
-- Supply the EXISTING public legacy anon JWT; never use a service_role key.
-- This preserves the scheduler's existing private x-cron-secret inside Postgres.
do $schedule$
declare old_command text; new_command text;
 anon_key text:='REPLACE_WITH_EXISTING_LEGACY_ANON_KEY';
begin
 if anon_key not like 'eyJ%' then raise exception 'Supply the existing public legacy anon JWT';end if;
 select command into strict old_command from cron.job
 where jobname='samara-clinical-push-dispatch' and active;
 if old_command not like '%/functions/v1/clinical-push-dispatch%' or old_command not like '%jsonb_build_object%'
 or (length(old_command)-length(replace(old_command,'''x-cron-secret''','')))/length('''x-cron-secret''')<>1
 then raise exception 'Unexpected scheduler template; no job changed';end if;
 new_command:=replace(old_command,'/functions/v1/clinical-push-dispatch','/functions/v1/food-cutoff-push');
 new_command:=replace(new_command,'''x-cron-secret''',format('''Authorization'', %L, ''x-cron-secret''','Bearer '||anon_key));
 perform cron.schedule('samara-food-cutoff-push','* * * * *',new_command);
end $schedule$;
select jobid,jobname,schedule,active from cron.job where jobname='samara-food-cutoff-push';
