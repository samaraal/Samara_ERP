# Samara ERP 2.13.39

Director's Office automatically carries dated Pending and In Progress items due today or earlier to the next calendar day at 11:55 PM India time. Scheduled times, progress status, and reschedule history are retained. Completed, cancelled, future, and undated items are excluded. The database job runs without an open ERP browser.

Managers and Administrators can open approved staff leave in Leave Approvals or expand a Staff Leave Calendar entry and choose Record Early Return. Enter the actual return date and confirmation remarks. Leave ends the previous day; the original approved dates and the recording manager are retained. Returning on the first leave day records zero days taken and cancels the unused leave. Existing calendar and duty availability checks use the shortened dates. Attendance and duty assignments still need their normal entries. A manager cannot confirm their own return.

Database migration: `113_director_rollover_early_return.sql`. The named pg_cron job is `samara-director-office-2355-ist`, scheduled at `25 18 * * *` in GMT (23:55 Asia/Kolkata). Running the migration again updates this job rather than adding duplicates. The first automatic run is at the next cutoff; migration installation does not reschedule existing items immediately.

Validation: PostgreSQL transaction tests passed for cutoff boundaries, preserved times and status, repeated runs, excluded completed/future/undated items, five-day leave shortened to two days, zero-day returns, invalid and future dates, mandatory remarks, duplicate returns, and authorization. All test data was rolled back. Browser tests passed for management approval and calendar flows, preserved approval details, error handling, and staff action visibility. JavaScript syntax checks passed.
