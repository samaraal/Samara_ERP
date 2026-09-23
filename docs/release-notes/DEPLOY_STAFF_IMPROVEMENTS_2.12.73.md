# Samara ERP 2.12.73 — staff workflows

This is a changed-files update for the supplied Samara_ERP-main(1).zip. It includes the employee search, English/Tamil voice assistant, week highlighting and green Assign Duty button from the preceding update.

## Deploy in this order

1. Retain your current frontend files, deployed function source and a database backup for rollback.
2. Run `supabase/sql/98_review_live_permissions.sql` as an administrator. This is a read-only audit. Review active policies and existing duplicate duties. No live permissions were verified during preparation of this package. Broad authenticated-write policies in older scripts need a separate reviewed migration; this release does not silently replace them.
3. Run `supabase/sql/97_staff_workflow_safeguards.sql`. It adds an atomic action limiter, an index and a trigger preventing new duplicate employee/date assignments. Existing duplicates are retained for review. One roster entry per employee per day matches the current weekly-assignment workflow; cancelled entries do not block replacement. Apply and test this migration in a staging database first.
4. Set the Supabase function secret `WHATSAPP_APP_SECRET` to the Meta application's App Secret (not the access token or webhook verification token). Keep existing WhatsApp/Supabase secrets. Never put the App Secret in config.js.
5. Deploy `admin-users`, `whatsapp-send`, `whatsapp-media` and `whatsapp-webhook`, including `_shared/whatsapp-auth.ts`. Use the included function settings from `supabase/config.toml`. The webhook accepts signature-authenticated POSTs without a Supabase JWT; send/media require an active Admin or Manager session. Check this role scope against your operational accounts before deployment.
6. Replace `app.js`, `styles.css`, `index.html`, `service-worker.js` and `config.js` together. Preserve any production-specific Supabase URL/key settings when merging config.js. The version is now 2.12.73 so cached clients can recognise the update.
7. Run the acceptance checks below using staging users before rolling out to staff.

Do not deploy only app.js: database duplicate protection and the WhatsApp limiter depend on the SQL migration. If the limiter is absent, sending/recovery fails closed. If WHATSAPP_APP_SECRET is missing, the webhook returns an error rather than accepting unverifiable events.

## Staff changes

- Previous Week, This Week and Next Week are fixed presets relative to today. Separate labelled arrows move one week from the displayed period. The active preset, selected period and dates stay in sync. Other weeks show “N Weeks Ahead/Ago”; manually selected date ranges show “Custom Date Range”.
- Roster loading queries the requested period and paginates instead of silently truncating at 500 duties. Loading, failed and empty states are separate, with Retry on failure.
- Coverage shows unique assigned staff by shift, employees without any assignment in the period, approved leave/permission, and employee-days with multiple assignments. These are period counts, not minimum staffing targets. The form fetches coverage for its selected week before saving.
- Copy Previous Week previews each source row, destination date and conflict. Past dates, existing assignments, approved leave/permission and duplicate source entries are skipped. Confirmation copies only ready rows in one insert, rechecks conflicts and resets acknowledgements to Assigned while preserving weekly off. Patient/task/remarks are copied as displayed and should be reviewed for suitability.
- Saving fetches current duties and checks leave. Approved leave/permission blocks the save; pending requests retain the existing warning behaviour. Database protection is required for concurrent duplicate writes.
- Voice results show recognised and unchanged fields separately. Ambiguous employee matches require a choice from the matches or the manual employee selector before saving. Unsupported speech still leaves the original field values available for manual editing.
- Shared date displays use 14 Sep 2026; stored ISO dates remain unchanged. Shared React action buttons use green for create/save actions, pink for selections and neutral close/cancel controls, and red for destructive actions. Existing bespoke HTML/template controls should also be checked during acceptance testing.

## Security changes

- Password recovery no longer changes an email address, confirms an email, or removes an authentication ban. Recovery requires an existing confirmed authentication email matching the employee email. Legacy internal-email accounts need a separately authorised account repair before email recovery will work.
- Recovery requests and WhatsApp sending use the atomic database limiter. Recovery allows three requests per account per 15 minutes; WhatsApp allows 30 sends per user per minute. Supabase Auth's own login/rate-limit configuration must still be verified.
- Login-success audit reports require a matching authenticated user. Browser-reported failures are marked as untrusted rather than allowing an unauthenticated requester to manufacture another user's lockout.
- WhatsApp send/media verify the caller and active Admin/Manager role. Successful sends attempt an audit entry; audit failure is logged without encouraging a duplicate send.
- Webhook POSTs verify the raw-body HMAC signature. Database processing failures return 503 so delivery can retry; inbound message IDs preserve idempotency.

## Acceptance checks

1. Repeatedly click Next Week: it remains next week. Use the right arrow twice and verify the date range advances; This Week returns to the current week. Repeat in Duty Calendar and across a year boundary.
2. Compare shift counts/unassigned employees to known duties. Check approved leave and an existing duplicate. Change the form week and confirm coverage reloads.
3. Preview a previous-week copy containing clean rows, an existing duty, approved leave and a weekly off. Confirm only ready rows are inserted; acknowledgements must not be copied.
4. Open two sessions and try saving the same employee/date concurrently. One must be rejected by the database trigger after the migration.
5. Say two employees' shared first name; saving must require a choice. Check English/Tamil shift, duty and week recognition and editable transcript review.
6. Simulate a failed roster request and confirm an error/Retry appears instead of an empty roster. Restore the connection and retry.
7. Check green create/save, pink selected weeks, red delete controls, keyboard focus and date labels on desktop and mobile.
8. Verify unauthenticated/disallowed WhatsApp callers are rejected; valid Meta-signed webhook events process, invalid signatures do not write data, and a temporary database failure is retried.
9. Test recovery for a confirmed matching account, a banned account and a legacy internal-email account. Recovery must never unban or rewrite the identity.
10. Verify live row-level security using separate Admin, Manager, Nurse, Caregiver, Accounts and inactive-user sessions. Frontend visibility is not proof of database access control.

## Validation performed

- JavaScript and modified TypeScript syntax checks passed.
- Focused tests passed for fixed week presets, arrows, year boundary, India-time date labels, ambiguous employee matches, pagination beyond 500 records, copy conflict filtering, recheck after preview, acknowledgement reset and lock release.
- Mock React render smoke checks passed for initial and populated Duty Assignment/Calendar, assignment form, coverage, voice ambiguity and copy preview.
- Mock backend tests passed for missing/invalid webhook signatures, valid signatures, retry on processing failure, and WhatsApp role checks.

Not verified against a live deployment: SQL migration execution/concurrency, production RLS, live microphone recognition/translation services, Meta delivery, real email recovery, and device/browser visual behaviour. No live data, accounts, messages or database policies were changed during preparation.
