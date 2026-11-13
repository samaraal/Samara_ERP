-- 2.20.86 (Admin, 13-11-2026): Admin ON / OFF switch for the spoken clinical voice alerts (all devices).
-- ON (default) = voice alerts run as before. OFF = no spoken voice; chime, pop-ups, bell and notifications continue.
alter table public.clinical_alert_settings add column if not exists voice_master_on boolean not null default true;
update public.clinical_alert_settings set voice_master_on = true where voice_master_on is null;
