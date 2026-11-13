-- Samara ERP SQL 402 (app 2.20.93) — Ward Stock: the Nursing Manager can do the Opening / Closing count herself
-- (13-11-2026: Sobana on Day + Night duty — in Nurse mode the count kept closing when the Nurse-mode flag was switched
-- back to Manager, e.g. by a manager alert opened on another device). Nurses are unchanged.
-- Patches the live night_stock_post: accept / close allowed for a Nurse OR the Nursing Manager. Safe to run again.
do $do$
declare d text;
  o text := 'if not (acc->>''nurse'')::boolean then raise exception ''Only a Nurse can do the Ward Stock counts.''; end if;';
  n text := 'if not ((acc->>''nurse'')::boolean or (acc->>''nm'')::boolean) then raise exception ''Only a Nurse or the Nursing Manager can do the Ward Stock counts.''; end if;';
begin
  d := pg_get_functiondef('public.night_stock_post(uuid,text,jsonb)'::regprocedure);
  if position(n in d) > 0 then raise notice 'already applied'; return; end if;
  if position(o in d) = 0 then raise exception 'pattern not found — nothing changed'; end if;
  execute replace(d, o, n);
end $do$;
select position('or (acc->>''nm'')::boolean' in pg_get_functiondef('public.night_stock_post(uuid,text,jsonb)'::regprocedure)) > 0 as nm_can_count;
