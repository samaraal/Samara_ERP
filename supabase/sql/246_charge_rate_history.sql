-- Samara Care ERP 2.17.2 — Charge Master rate change history
-- Every change of a patient charge rate is recorded automatically by the database:
--   * Stores / Pharmacy items  (consumable_store_items.charge_rate)
--   * Service tariffs          (charge_tariff_master.amount)
-- Old rate, new rate, who changed it and when. Recorded by triggers, so it works
-- whichever screen (or SQL) changes the rate. Read-only: nobody can edit or delete history.
-- Visible to Admin and Accounts. Safe to run more than once.

create table if not exists public.charge_rate_history (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('Stores / Pharmacy','Service Tariff')),
  item_id text not null,
  item_code text,
  item_name text,
  category text,
  old_rate numeric,
  new_rate numeric,
  changed_by uuid,
  changed_by_name text,
  changed_by_role text,
  changed_at timestamptz not null default now()
);
create index if not exists charge_rate_history_item_idx on public.charge_rate_history(item_id,changed_at desc);
create index if not exists charge_rate_history_at_idx on public.charge_rate_history(changed_at desc);

alter table public.charge_rate_history enable row level security;
drop policy if exists charge_rate_history_read on public.charge_rate_history;
create policy charge_rate_history_read on public.charge_rate_history for select to authenticated
  using (exists (select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role in ('Admin','Accounts')));
-- no insert/update/delete policies: only the triggers below (security definer) write here.
revoke insert, update, delete on public.charge_rate_history from anon, authenticated;
grant select on public.charge_rate_history to authenticated;

create or replace function public.log_charge_rate_change() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_name text; v_role text; v_old numeric; v_new numeric; v_rec jsonb := to_jsonb(new);
begin
  if tg_table_name='consumable_store_items' then
    v_old := old.charge_rate; v_new := new.charge_rate;
  else
    v_old := old.amount; v_new := new.amount;
  end if;
  if v_old is not distinct from v_new then return new; end if;
  begin -- history must never block a rate change
  select coalesce(nullif(full_name,''),login_id), role into v_name, v_role
    from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  insert into public.charge_rate_history(source,item_id,item_code,item_name,category,old_rate,new_rate,changed_by,changed_by_name,changed_by_role)
  values (
    case when tg_table_name='consumable_store_items' then 'Stores / Pharmacy' else 'Service Tariff' end,
    new.id::text,
    coalesce(v_rec->>'item_code', v_rec->>'charge_code'),
    coalesce(v_rec->>'item_name', v_rec->>'service_name'),
    coalesce(v_rec->>'item_category', v_rec->>'category'),
    v_old, v_new, auth.uid(), coalesce(v_name,'System'), v_role
  );
  exception when others then raise warning 'charge_rate_history not recorded: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_store_item_rate_history on public.consumable_store_items;
create trigger trg_store_item_rate_history after update of charge_rate on public.consumable_store_items
  for each row execute function public.log_charge_rate_change();

drop trigger if exists trg_tariff_rate_history on public.charge_tariff_master;
create trigger trg_tariff_rate_history after update of amount on public.charge_tariff_master
  for each row execute function public.log_charge_rate_change();
