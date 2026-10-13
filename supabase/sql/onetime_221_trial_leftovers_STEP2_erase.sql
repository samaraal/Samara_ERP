-- Samara ERP — ONE TIME, after 221_trial_erase_complete.sql:
-- removes what EARLIER Trial Guest erases left behind (e.g. names in Admin → Rooms → Room Shift History),
-- Trial Guests' audit-log entries, and their names in the erase records. Real Guests are never touched.
-- All-or-nothing. Check the preview from file 221 first; this should remove the same things.
select public.purge_trial_leftovers(false) as removed;
