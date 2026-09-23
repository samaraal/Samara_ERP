# Samara ERP – app.js source files

`app.js` (about 30,900 lines) is now split into the 74 small files in this folder.
The live site still loads **one** `app.js`. It is rebuilt by joining these files, in the order in
`manifest.json`, into a file that is byte-for-byte identical to the old app.js.

## Golden rules

1. **Never edit or upload `app.js` directly.** Edit the matching file in `src/app/`.
2. After editing, rebuild `app.js`:
   - **Automatic:** on GitHub, the "Build app.js" action rebuilds and commits `app.js` a minute
     after you save a file in `src/app/` (see the **Actions** tab: green tick = done, red cross =
     your change had an error and the live app was **not** touched).
   - **Manual (if Node is installed):** `node tools/build-app.js`
3. `node tools/build-app.js --check` confirms `app.js` matches `src/app` without changing anything.
4. Still bump the version number (index.html, service-worker.js, bootstrap-error.js,
   `0-start/01-app-constants.js`) for every release, as before. The build warns if they differ.

## Important: these files are pieces of one big function

All files share one closure (the old `(() => { ... })();`). That means:

- `0-start/01-app-constants.js` **opens** the closure and `z-end/01-form-helpers-and-start-app.js`
  **closes** it and starts the app. Don't move those lines.
- A file on its own is not valid JavaScript. That is expected.
- Helpers such as `h`, `client`, `formatDateIN`, `todayISOIndia`, `sendWhatsAppText` live in
  `core/` and are available to every page file listed after them.
- If you rename or change a shared helper in `core/`, `shared/`, `global-ui/` or
  `patients/medication-helpers.js` / `patients/patient-select-helpers.js`, it can affect many
  pages. Search all of `src/app` for its name before changing it.
- The files in `global-ui/` marked **GLOBAL WATCHER** act on every page (required-field
  blocking, clickable cards/rows, date rewriting, voice buttons, mobile tables). Edit them with
  extra care and test several pages afterwards.

## Adding a new file

Create it in the right folder, then add it to `manifest.json` at the correct position (after any
helper it uses, before `z-end/...`). The build refuses to run if a file is missing from the manifest.

## How to ask an AI for a change (copy this)

> I'm working on Samara Care ERP. The code is split into small files that are joined in order
> into one app.js; all files share one closure, so helpers from `core/` are available everywhere.
> Here is `src/app/<folder>/<file>.js`. Please change ONLY this file, and only the function(s)
> needed for: <describe the change>.
> Do not rename existing functions, variables or CSS class names. Do not add any code that
> watches or changes the whole page (no MutationObserver, no document-wide listeners).
> Reply with only the changed part and tell me what else in the app might be affected.

## File map

| # | File | Lines | What's inside |
|---|------|------:|---------------|
| 1 | `0-start/00-inauguration-invitation.js` | 238 | Old inauguration invitation popup (expired 1-Sep-2026; safe to delete later) |
| 2 | `0-start/01-app-constants.js` | 60 | OPENS the main app closure. Version, build date, fixed lists (blood groups, professions, centre) |
| 3 | `core/01-app-help-repair-popups.js` | 196 | Popup close/drag helpers, Repair App, Check for Updates, App Help, push notification helpers |
| 4 | `core/02-react-helper-and-logo.js` | 27 | h() React helper, accounts workflow nav, brand logo |
| 5 | `core/03-brand-theme-css.js` | 978 | Global brand colour theme (CSS injected at start) |
| 6 | `core/04-supabase-roles-navigation.js` | 219 | Supabase client, audit log writer, roles, departments, menu per role, page permissions |
| 7 | `core/05-whatsapp-phone-helpers.js` | 150 | Login id helpers, phone number validation, WhatsApp template/text sending |
| 8 | `core/06-date-format-task-navigation.js` | 92 | Indian date formats, strict date inputs, task navigation memory |
| 9 | `core/07-action-success-toasts.js` | 400 | After-save behaviour, success/failure toasts and their CSS |
| 10 | `core/08-date-utils.js` | 54 | Date maths (today in India, add days, Monday of week), WhatsApp welcome link |
| 11 | `shared/01-camera-and-global-search.js` | 87 | Camera capture popup, global search |
| 12 | `clinical-alerts/01-alert-engine.js` | 1205 | Clinical alert popup + the background clinical alert engine |
| 13 | `clinical-alerts/02-alert-pages.js` | 372 | Clinical Alerts page, Escalations dashboard, Alert Settings |
| 14 | `global-ui/01-smooth-refresh-splash.js` | 91 | Smooth refresh CSS, splash screen status |
| 15 | `global-ui/02-workspace-layout-css.js` | 1262 | Big global layout CSS (ensureCleanWorkspaceLayout) |
| 16 | `global-ui/03-form-requirements.js` | 490 | GLOBAL WATCHER: required-field rules + Form Field Settings page |
| 17 | `global-ui/04-compact-data-entry-css.js` | 192 | Compact data-entry CSS |
| 18 | `global-ui/05-hover-clickable-cards-mobile-tables.js` | 160 | GLOBAL WATCHERS: smart hover, clickable cards/rows, mobile table adapter |
| 19 | `global-ui/06-bell-notifications-popups.js` | 177 | Alert bell, notifications, workflow popups, store indent alerts |
| 20 | `global-ui/07-voice-input-tamil-assist.js` | 226 | GLOBAL WATCHER: voice buttons on text fields, Tamil Assist |
| 21 | `global-ui/08-handover-worklist-maintenance.js` | 108 | General handover worklist, system maintenance |
| 22 | `shell/01-app-main.js` | 676 | App() - the main shell: login state, page switching, global watchers switched on here |
| 23 | `shell/02-login-password.js` | 237 | Login, first-login password change, password recovery |
| 24 | `shell/03-my-profile.js` | 207 | My Profile page |
| 25 | `shell/04-navigation-menus.js` | 179 | Sidebar, mobile menu, bottom nav, drawer, nursing quick actions |
| 26 | `pages/family-feedback.js` | 217 | Family communication + Feedback dashboard |
| 27 | `pages/titan-mail.js` | 340 | Titan Mail page |
| 28 | `pages/dashboard.js` | 388 | Home Dashboard and its navigation helpers |
| 29 | `pages/manager-personal-todo.js` | 391 | Manager personal to-do |
| 30 | `pages/whatsapp-inbox.js` | 754 | WhatsApp Inbox |
| 31 | `hr/hr-dashboard.js` | 101 | HR dashboard |
| 32 | `hr/career-applications-interviews.js` | 578 | Career applications, interviews |
| 33 | `nursing/nursing-manager-quick-tasks.js` | 273 | Nursing Manager quick tasks |
| 34 | `nursing/nurse-personal-todo.js` | 92 | Nurse personal to-do list |
| 35 | `pages/director-office.js` | 1470 | Director Office: enquiries, today ticker, dashboard |
| 36 | `hr/leave-permission.js` | 331 | Leave / permission, staff leave changes, return to duty |
| 37 | `hr/employees.js` | 1374 | Employees page (+ its CSS) |
| 38 | `patients/enquiries.js` | 49 | Enquiries page |
| 39 | `patients/medication-helpers.js` | 135 | Medication time/frequency helpers shared by Admissions & Medicines |
| 40 | `patients/admissions.js` | 2350 | Admissions page (+ Tamil Nadu districts list) |
| 41 | `nursing/shift-tasks.js` | 397 | Shift tasks |
| 42 | `patients/patients.js` | 2777 | Patients page |
| 43 | `patients/patient-select-helpers.js` | 97 | usePatients, patient/room-bed dropdowns, file input, Section |
| 44 | `patients/discharge.js` | 1517 | Discharge management |
| 45 | `rooms/care-packages.js` | 101 | Care packages |
| 46 | `rooms/rooms-beds.js` | 566 | Rooms & beds |
| 47 | `clinical/clinical-dashboard.js` | 230 | Clinical dashboard |
| 48 | `clinical/daily-care-vitals.js` | 220 | Daily care, vital signs |
| 49 | `clinical/medicines.js` | 643 | Medicines (+ discharge medication review) |
| 50 | `clinical/medication-errors.js` | 299 | Medication errors |
| 51 | `clinical/food.js` | 87 | Food / diet / resident food intake |
| 52 | `clinical/physiotherapy.js` | 244 | Physiotherapy |
| 53 | `nursing/special-nurse.js` | 268 | Special nurse management |
| 54 | `nursing/duty-assignment.js` | 892 | Shift management + Duty Assignment (duty roster) |
| 55 | `nursing/shift-handover.js` | 157 | Shift handover |
| 56 | `clinical/incidents-documents.js` | 222 | Incidents, documents |
| 57 | `accounts/01-accounts-workspace-css.js` | 230 | Accounts workspace CSS |
| 58 | `accounts/02-package-expiry.js` | 223 | Package expiry dashboard |
| 59 | `accounts/03-accounts-dashboard.js` | 199 | Accounts dashboard |
| 60 | `accounts/04-final-billing-refunds.js` | 415 | Final billing view, refunds |
| 61 | `accounts/05-payment-settlement-css.js` | 214 | Payment settlement CSS |
| 62 | `accounts/06-patient-ledger.js` | 322 | Patient ledger |
| 63 | `accounts/07-charge-readiness.js` | 56 | Unposted charge checks |
| 64 | `accounts/08-billing-payments.js` | 1172 | Billing & payments |
| 65 | `stores/store-authority-items.js` | 202 | Store in-charge, item master, pharmacy stock |
| 66 | `stores/consumables-stores.js` | 254 | Consumables stores |
| 67 | `stores/patient-consumables.js` | 131 | Patient consumables |
| 68 | `accounts/09-clinical-charges.js` | 689 | Charge master, clinical charges |
| 69 | `reports/whatsapp-delivery-logs.js` | 51 | WhatsApp delivery logs |
| 70 | `reports/intelligent-reports.js` | 644 | Intelligent reports |
| 71 | `reports/reports.js` | 314 | Reports |
| 72 | `reports/audit-trail.js` | 109 | Audit trail |
| 73 | `z-end/01-form-helpers-and-start-app.js` | 12 | Small form helpers, then STARTS the app and CLOSES the main closure |
| 74 | `z-end/02-mail-mobile-css-and-notes.js` | 18 | Mail mobile CSS + old version notes |
