-- ERP 2.16.30 — Spot Assessment → linked enquiry, updated automatically (run once; safe to run again).
-- Why: only STD / Admin / Manager may update enquiries (enq_followup). A nurse who records the Spot
-- Assessment outcome could not close the linked enquiry, so Akshi had to update it a second time.
-- This function does exactly ONE job for any signed-in staff member, and only from what the Spot
-- Assessment itself records:
--   * Admission started from the Spot Assessment (Convert to Guest / Fill from Spot Assessment) → enquiry "Admitted"
--   * Outcome "Not converted" with a reason                                                       → enquiry "Closed" with that reason
-- It never moves an enquiry backwards from "Admitted", and writes the usual line in the enquiry history.
begin;

create or replace function public.spot_enquiry_sync(p_spot_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 me public.profiles := public.enq_me();
 v_spot_id text; d jsonb; e public.pre_admission_enquiries;
 v_to text; v_reason text; v_note text; v_from text;
begin
 if me.id is null then raise exception 'Please sign in again'; end if;
 select s.id::text, coalesce(s.details,'{}'::jsonb) into v_spot_id, d from public.spot_assessments s where s.id::text = p_spot_id;
 if v_spot_id is null then raise exception 'Spot Assessment not found'; end if;
 if coalesce(d->>'enquiry_id','') = '' then return jsonb_build_object('updated',false,'reason','No linked enquiry'); end if;

 select * into e from public.pre_admission_enquiries where id::text = d->>'enquiry_id' for update;
 if e.id is null then return jsonb_build_object('updated',false,'reason','Enquiry not found'); end if;

 if jsonb_typeof(d->'converted_admission') = 'object' then
   v_to := 'Admitted'; v_note := 'Admission started from the Spot Assessment';
 elsif d->>'outcome' = 'Not converted' and coalesce(trim(d->>'outcome_reason'),'') <> '' then
   v_to := 'Closed'; v_reason := trim(d->>'outcome_reason');
   v_note := 'Spot Assessment outcome: not converted' || coalesce(' — ' || nullif(trim(d->>'outcome_note'),''), '');
 else
   return jsonb_build_object('updated',false,'reason','No outcome yet','enquiry_no',e.enquiry_no);
 end if;

 -- never undo an admission; nothing to do if it already has this status
 if e.status in ('Admitted','Converted to Admission') or e.status = v_to then
   return jsonb_build_object('updated',false,'reason','Already '||e.status,'enquiry_no',e.enquiry_no);
 end if;

 v_from := e.status;
 update public.pre_admission_enquiries
    set status = v_to, next_follow_up = null,
        closed_reason = case when v_to = 'Closed' then v_reason else null end,
        handled_by = me.id, updated_at = now(), last_activity_at = now()
  where id = e.id;
 insert into public.enquiry_activity(enquiry_id,kind,note,status_from,status_to,next_follow_up,actor,actor_name)
 values (e.id,'Status', v_note || case when v_to = 'Closed' then ' — Closed: ' || v_reason else '' end, v_from, v_to, null, me.id, me.full_name);
 return jsonb_build_object('updated',true,'enquiry_no',e.enquiry_no,'status',v_to);
end $$;

revoke all on function public.spot_enquiry_sync(text) from public;
grant execute on function public.spot_enquiry_sync(text) to authenticated;

commit;
