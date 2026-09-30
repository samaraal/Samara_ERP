# Samara Care ERP — Changelog

Newest first. From 2.14.15 onwards, add each release here (a few lines) instead of creating a new START_HERE / RELEASE file.
The full original notes for older releases are kept in [`docs/release-notes/`](docs/release-notes/).

## 2.15.21 — WhatsApp button beside each Call button
- Guest Overview → 📞 Call: every mobile number also gets a green WhatsApp button (opens that person's WhatsApp chat; tap WhatsApp's 📞 icon to call). WhatsApp has no link that starts a call directly. Landlines get no WhatsApp button. No SQL.

## 2.15.20 — One-tap "📞 Call" on the Guest Overview
- Top of the Guest's Overview: a Call block with every number on file as a tap-to-call button — family contacts (primary first), attendant + alternative, emergency contact, the Guest's own mobile and the treating doctor. Duplicates and blank "+91" placeholders are skipped; overseas and landline numbers dial correctly.
- Nurses can see relatives' numbers via the new read-only guest_call_contacts() (Admin, Manager, Nurse, Accounts; name, relationship, mobile only — no PIN / e-mail).
- SQL: supabase/sql/173_guest_call_contacts.sql (run once). Before it is run, family numbers show only for users who could already read them.

## 2.15.19 — Global "open this record only" + Erase Trial Guest on the timeline
- New shared helper (src/app/shared/03-record-focus.js): openRecord(page,{id,patient_id,label}) opens a page focused on one record; the page shows only that record with a yellow "Showing only: … — Show all" bar, scrolls to it and highlights it. Rule: every link to one record should use it.
- Discharge / Discharge Clearance: register can be focused on one Guest. Timeline entries get one-click buttons on the entry itself — "Show in register" and, for Admin on a Trial Guest, "🧪 Erase Trial Guest" (no scrolling to find the row).
- Erase Trial Guest: the Resident ID check now compares letters and digits only (spaces / dash styles no longer cause "did not match"), and shows what was typed if it still differs. No SQL.

## 2.15.18 — Erase Trial Guest: receipt vouchers and payment links erased with the Guest
- Live database: payment_vouchers.patient_id is mandatory, so "detach" was refused ("protected payment_vouchers … cannot be detached"); nothing had changed.
- payment_vouchers (the Guest's own CV-/CARDV- receipt vouchers) and staff_payment_requests (the Guest's Razorpay payment links) are Guest-owned and are now erased with the Guest. Their voucher numbers and any PAID Razorpay payment IDs are copied into the permanent TRIAL_GUEST_PURGED audit entry first; the list step flags paid online payments.
- SQL: re-run supabase/sql/171_trial_guest_purge.sql (revised). Re-tested on a local copy matching the live tables.

## 2.15.17 — Real / Trial (test) Guests; Admin can permanently erase a Trial Guest
- Admission: "Guest record" at the top of the form — ✓ Real Guest or 🧪 Trial (test) Guest — must be chosen for a new Guest. An existing / returning Guest's record never changes type (a real Guest can never become erasable).
- Trial Guests behave like real ones (alerts, billing, WhatsApp) and show "🧪 TRIAL" in patient lists.
- Patient Discharge / Discharge Clearance register: Admin-only "🧪 Erase Trial Guest" (after discharge is initiated). Shows a dry-run list of everything to be removed, asks for the Resident ID, then erases in one all-or-nothing step and deletes the Guest's stored documents / videos.
- Erase keeps: audit log (+ a TRIAL_GUEST_PURGED entry), Samara payment vouchers / staff payment requests (unlinked), stock movements (unlinked); the bed is released. Refused while equipment / oxygen cylinders are still issued.
- SQL: supabase/sql/171_trial_guest_purge.sql (required); 172_mark_chandran_trial.sql (one-off, marks CHANDRAN MOG-2026-09-0015 as Trial). Tested on a local copy of the schema (real Guest untouched, all-or-nothing on errors).

## 2.15.16 — Discharge timeline entries open the Guest's current step directly
- Clicking an entry in "Discharge timeline & departure follow-up" now does what that Guest's register button does for your role: Awaiting Management → Review & Decide; Discount pending → Review Discount Request; Awaiting Accounts / recheck (Admin, Accounts) → Payments opened on that Guest's discharge settlement; Accounts cleared (Nurse) → Final Discharge Clearance; Returned (Nurse / Manager) → Rectify & Re-initiate.
- Each such entry shows "Click to open: … →" and a "History ▾" button to see the timeline. Completed / no-action entries expand as before.
- "View Payments" from the Patient Discharge page now actually opens Payments (it needed the Discharge Clearance page before). No SQL.

## 2.15.15 — Assisted Living Package no longer charged twice on a re-saved admission
- The admission form checked for an existing package charge only when resuming an interrupted admission; saving the admission again normally posted the package a second time (seen: two ₹30,000 charges 3 minutes apart, same coverage).
- Now every save checks for a package charge for the same Guest with the same coverage start date, and skips it if present. A readmission (new admission date) still gets its own package charge. No SQL.

## 2.15.14 — Guest name shows on charge requests & diagnostics of discharged Guests
- Bills & Charges / Charge Approvals (Bill & Charge Requests + Diagnostic Services Timeline) and the Nursing Charge Register showed "—" in the Patient column when the Guest had been discharged (only active Guests were loaded).
- Missing Guests are now looked up by ID and shown as "Name · Resident ID · Discharged". Patient dropdowns still list active Guests only. No SQL.

## 2.15.13 — Discharge Approval (management review) made simple, mobile-friendly
- Opens with only three things: **Patient** (name, Resident ID, room, discharge type/date, condition, destination, doctor), **Payment** (charges, paid/advance, discount given, outstanding) and **Discount & Decision** (remarks, discount amount/reason for Admin, Reject / Approve).
- **View full details** button shows everything else (raised charge requests, full nursing discharge request, all account transactions, Refresh account review).
- Phone: full-screen window, one column, big Approve / Reject buttons that stay visible at the bottom. No change to the approval rules. No SQL.

## 2.15.12 — Admission form: optional attendant, Guest name in CAPITALS, Date of Birth → Age (SQL 170)
- **Is an attendant staying with the Guest?** Yes / No (must choose). Yes → attendant name (mandatory), attendant mobile (mandatory) and alternative mobile. No → attendant fields hidden, nothing saved, no mobile required. Consent form prints "Attendant staying: No".
- **Patient name** is typed and saved in CAPITAL letters automatically, even if entered in lower case (re-admissions are shown in capitals too).
- **Date of Birth (optional)**: when entered, Age is filled automatically and locked (clear the DOB to type the age manually). Future dates are rejected.
- SQL 170 adds `patients.date_of_birth` and `patients.attendant_staying`. **Run SQL 170 before uploading the frontend.**

## SQL 169 + whatsapp-send (hotfix on 2.15.11) — automatic patient / family WhatsApp for the staff who trigger them
- Admission WhatsApp + Family Portal access failed with "limited to authorised food-vendor conversations" for the Nursing Manager (and would fail for Jaya / Saranya); review reminder (Nurse) and bill reminder (Accounts) were also blocked. Discharge confirmation and Payment receipt were already handled by their own checks in the live function and are unchanged.
- Role rules now in one place, `wa_food_guard`: Nursing Manager → food vendors + admission / portal access / discharge / review reminder; Jaya & Saranya → admission / portal access; Nurse → discharge / review reminder; Accounts → payment receipt / bill reminder; Admin / Manager unchanged. Patient / family templates only to a number registered for a patient.
- whatsapp-send (from the live deployed version): removed only the Admin/Manager-only line before `wa_food_guard`; clearer error messages.
- Deploy: run `supabase/sql/169_whatsapp_send_roles_patient_family.sql` (supersedes 168), then redeploy Edge Function **whatsapp-send** from `supabase/function-copies/whatsapp-send-food-scope.ts`. Read-only check: `supabase/sql/diagnostic_whatsapp_automation.sql`.

## 2.15.11 — Medicines: nurse may WITHHOLD a dose on clinical assessment; doctor's instruction follow-up (SQL 167)
- New status **Withheld (clinical — inform doctor)** in the medicine record. The nurse records the **reason** (Low BP, Low blood sugar, Low pulse, Drowsy / unwell, Nil by mouth, Vomiting, Other), the **reading** that led to it (e.g. BP 90/58 mmHg), and the **treating doctor informed** — name (pre-filled), how (phone / WhatsApp / in person / not reachable yet) and when.
- **Immediate alert** to Nurses, Nursing Manager, Managers and Admin / Directors until the doctor's instruction is recorded.
- **Withheld doses — awaiting doctor's instruction** panel at the top of Medicines. **Record doctor's instruction** (Nurse on duty / Manager / Admin): Give now · Give at a later time · Skip this dose · Change prescription (opens Doctor Review / Modify — medicines are still changed only through Doctor Review). What the doctor said is recorded permanently.
- "Give now / later" puts the dose back in Today's MAR and Shift Tasks at that time (and in the clinical alert engine).
- **Warn-only check:** opening a BP / diabetes / heart-rate medicine shows a warning when today's latest vitals are low (BP below 100/60, blood sugar below 100 mg/dL, pulse below 55) with a one-tap "Withhold this dose". The nurse decides.
- Internal only — not shown in the Family Portal.
- **Run SQL 167 once.** Files: `src/app/clinical/medicines.js`, `src/app/patients/medication-helpers.js`, `src/app/global-ui/06-bell-notifications-popups.js`, version files, `app.js` (rebuilt).

## 2.15.10 — An admission cannot be completed again for a resident who is already admitted
- Completing an old unfinished admission of a resident who was meanwhile admitted (e.g. draft AD-0001 for Mrs. Lakshmi) stopped the resident's medicines and care orders and wrote the draft's list in their place — without Doctor Review. This is now blocked with a clear message: discard the draft; change details from the Patient file and medicines through Doctor Review / Modify.
- No SQL. Files: `src/app/patients/admissions.js`, version files, `app.js` (rebuilt).

## 2.15.9 — New Admission form: compact and even
- All fields in a row now line up at the top (no more inputs pushed down by a taller neighbour), with tighter spacing and smaller, cleaner inputs.
- **Voice** is a small chip beside each field's label instead of a full-width bar under the field.
- **Language / Dictate** appear only on the field being typed in (and stay visible while dictating), instead of under every field.
- Diagnosis / Allergies lists: slim "No item added yet" line and tighter rows.
- Only the New Admission form is changed; other screens keep their current look. No SQL. Files: `src/app/patients/admissions.js`, `styles.css`, version files, `app.js` (rebuilt).

## 2.15.8 — No false "Default package names" alert on New Admission
- The red "Action failed — Default package names are shown temporarily…" popup appeared every time New Admission opened, for a split second before the real Care Packages loaded. It now appears only if the packages have loaded and none are set up, only to Admin / Manager, and as a notice rather than an error.
- No SQL. Files: `src/app/patients/admissions.js`, version files, `app.js` (rebuilt).

## 2.15.7 — Known allergies: Yes / No, then details
- **Known allergies** now starts with a simple choice: **No — no known allergies** or **Yes — has allergies**. Choosing No needs nothing typed.
- For **Yes**, add each allergy (e.g. "Penicillin — skin rash"); every entry can be deleted with ×. Completing the admission with Yes but no allergy added, or with an allergy typed but not added, shows a clear message.
- Fixed: after adding an item with **Add**, the mandatory-field check still said the field was empty (it looked at the cleared typing box). The check now reads the added items — also for Diagnosis / condition.
- Older entries such as "None", "Nil", "NKDA" are read as No.
- No SQL. Files: `src/app/patients/admissions.js`, version files, `app.js` (rebuilt).

## 2.15.6 — Admission room allotment: no more "room/bed no longer available" after an interrupted save (SQL 166)
- **Cause fixed:** when an admission save was interrupted (network drop, server busy), the bed could stay linked to that half-finished admission. The screen showed the bed as Available, but every retry was refused with "Selected room/bed is no longer available."
- **One rule, on the server:** a bed is taken only if another **admitted** resident holds it, or another admission is still in progress on it (last 30 minutes). A link to the same resident, or to a discharged / abandoned admission, is treated as stale and replaced. Maintenance beds are never allotted; reserved beds only through the reservation.
- The message now says **who** holds the bed (name, Resident ID, admitted / admission in progress).
- **Safe to press "Complete Admission" again:** on a retry, anything already saved for the resident (package charge, medicines, care orders, physiotherapy, draft documents) is kept and never saved twice.
- **Run SQL 166 once.** Files: `src/app/patients/admissions.js`, version files, `app.js` (rebuilt).

## 2.15.5 — Unfinished Admissions: auto-save and continue on any device (SQL 165)
- **Unfinished Admissions** list at the top of New Admission (desktop, tablet and phone): patient name, draft no. (AD-0001 …), room, type, last saved time, by whom and on which device, documents saved. **Continue** or **Discard** (with reason).
- Every admission in progress is its own server draft — several can be in progress at once, and **any Admission staff / Nursing Manager / Admin can continue** it (e.g. at shift change), on any device. A warning is shown if someone else was working on it in the last 3 minutes.
- Auto-save starts as soon as typing starts (this device), and on the server as soon as the patient name is entered (was: name + mobile + address).
- Same browser tab reloaded (phone camera / file picker, network drop, accidental refresh) → the admission continues automatically.
- **Documents are no longer lost:** photo, ID proof, discharge summary, prescription and reports are saved with the draft the moment they are picked and attached to the resident on admission (no second upload). Each saved file can be removed (✕).
- After Continue, the form scrolls back to the field the staff member was on (highlighted).
- "＋ Start New" keeps the current admission in the list; the draft closes automatically when the admission formalities are complete.
- Older one-per-user drafts are copied into the new list once. A draft never creates a patient, occupies a bed, starts billing or triggers clinical alerts.
- **Run SQL 165 once.** Files: `src/app/patients/admissions.js`, `styles.css`, version files, `app.js` (rebuilt).

## 2.15.4 — Biomedical Equipment: Item Master + Receive / Purchase (SQL 164)
- **Equipment Items** (new box): each kind of equipment is created once and gets an **item code** — BME-001 Pulse Oximeter, BME-002 Air Mattress … — linked to its Charge Master rate (BIO- code) or "Not charged". Edit renames all its pieces; Inactive stops new pieces; Delete only when it has no pieces. Duplicate names are blocked.
- **Receive / Purchase** (replaces "Add Equipment"): choose the item → **Purchase from vendor** (vendor, bill no., bill date, cost per piece, warranty, serial numbers) or **Already owned (opening stock)**. Pieces are created automatically with codes **after the item code: BME-001-01, BME-001-02 …**
- **Purchase Register** (new box): every receipt (BMR-0001 …) with period filter + Apply; tap a row for full details (vendor, bill, cost, total, warranty, piece codes, who received).
- **Equipment Register** is grouped by item (e.g. "BME-001 · Pulse Oximeter — 3 pieces · 2 available · 0 in use"); cards show vendor / bill and warranty.
- Existing pieces are grouped into items by name and renumbered to the new style by SQL 164 (history stays linked).
- Fix: "← Back to Dashboard" / phone Back on Stores, Equipment, Oxygen and Charge Master dashboards sometimes left the page instead of returning to the dashboard.
- **Run SQL 164 once** (after 163). Files: `src/app/stores/equipment-oxygen.js`, `src/app/stores/stores-dashboard.js`, `src/app/shell/01-app-main.js`, `styles.css`, version files, `app.js` (rebuilt).

## 2.15.3 — Equipment / Cylinder Register: see every piece, delete wrong entries (SQL 163)
- **Equipment Register** tile now counts **every** piece (it used to skip Out of Service pieces, so it showed 0) and says how many are in / out of service.
- Register filter chips: All / Available / In Use / Under Repair / Out of Service (with counts). Same for the **Cylinder Register** (All / Full / In Use / Empty / At Refill / Out of Service).
- **Back in Service** button for Out of Service equipment.
- **🗑 Delete (wrong entry)** for equipment and cylinders — Store In-charge / Admin only, reason required, and only if the piece was **never given to a resident** (otherwise use Out of Service, so history stays). The deleted record, its movements and the reason are kept in `equipment_register_deletions`.
- **Run SQL 163 once** (`supabase/sql/163_equipment_cylinder_delete_wrong_entry.sql`). Files: `src/app/stores/equipment-oxygen.js`, `styles.css`, version files, `app.js` (rebuilt).

## 2.15.2 — Patient File opens instantly
- Tapping a patient row (or Open Patient File) now shows the card **at once** with an "Opening Patient File…" panel and a Cancel button, instead of nothing happening until every section has loaded.
- If loading fails, the panel says why, with **Try again** — no more silent clicks.
- Faster opening: medication review items are now fetched only for that resident (it used to fetch 2,000 rows for all residents each time).
- If you tap a second patient while the first is still loading, only the second one opens.
- No SQL. Files: `src/app/patients/patients.js`, `styles.css`, version files, `app.js` (rebuilt).

## 2.15.1 — ADMISSION and PATIENTS menus; Admission Register
- **ADMISSION** menu (before / at admission): Enquiries, Spot Assessment, **New Admission** (the admission form), and the new **Admission Register**.
- **PATIENTS** menu (after admission, every day): Patients, Discharge, Documents, Recovery Timeline, Intelligent Reports, Family Communication, Incidents, Medication Errors, Patient Ledger, Final Billing (Patient Ledger and Final Billing also stay under Accounts / Billing). Same for the Nursing Manager's menu. Nurses' menus unchanged; role access unchanged.
- **Admission Register:** every admission (active and discharged) with admission date, Resident ID, name, type, category, room / bed, status, consent and discharge date. Period filter with **Apply** (Today, This Week, This Month, Last Month, This Year, All, Custom), quick filters All / Active / Discharged / Consent pending, search. Tap a row for full details and **Open Patient Card** (opens that resident's card).
- Names no longer show the title twice (e.g. "Mrs. Mrs.Lakshmi" → "Mrs.Lakshmi"; the saved name is unchanged and can be tidied in Edit Patient).
- Sidebar icons for Spot Assessment (was a plain square), Admission Register and Family Communication.
- No SQL. Files: `src/app/patients/admission-register.js` (new), `src/app/patients/patients.js`, `src/app/core/04-supabase-roles-navigation.js`, `src/app/core/03-brand-theme-css.js`, `src/app/shell/01-app-main.js`, `src/app/shell/04-navigation-menus.js`, `src/app/manifest.json`, version files, `app.js` (rebuilt).

## 2.15.0 — Charge Master back in the ADMIN menu
- **Charge Master** is listed again under **ADMIN** (as before 2.14.99) and also at the top of the **CHARGE MASTER** section; both open All Categories. Nursing Procedures and every other non-store category are under CHARGE MASTER (one item each), and **All Categories → Full List** is the classic single Charge Master table.
- No SQL. Files: `src/app/core/04-supabase-roles-navigation.js`, version files, `app.js` (rebuilt).

## 2.14.99 — Charge Master: category menu + dashboards; Biomedical charges register-controlled
- New sidebar section **CHARGE MASTER** (Admin): **All Categories** (one box per category — new categories appear here automatically; also the full classic list) and one item per category: Biomedical Equipment, Diagnostic / Imaging, Doctor Services, Food & Nutrition, Hospital Visits, Laboratory Services, Miscellaneous, Nursing Procedures, Physiotherapy, Special Care, Transport, and **Stores Item Rates** (Consumables, Pharmacy, Housekeeping, Kitchen rates).
- Each category opens a Samara dashboard: **Items & Rates** (add / edit / rate / turn off), **Rates Not Set** (red), **Inactive Items** (turn back ON → reappears in Bills & Charges / Approval Requests at once), **Approval Routing**, **Charges Posted** in the period (count + ₹), **Awaiting Accounts**, and for Biomedical **Equipment Linked**. Period filter with **Apply**; every charge row opens full details (resident, item & code, quantity, raised by & when, Accounts decision, amount, remarks). Same Back to Dashboard / Close / phone back.
- **Biomedical Equipment (decision A):** charged only from Bills & Charges, controlled by the equipment register (only equipment issued to that resident, quantity = days). Approval routing for it is switched OFF and cannot be turned ON.
- **SQL — run `supabase/sql/162_biomedical_charges_register_controlled.sql` once** (turns Biomedical approval OFF and locks it; safe to run again).
- Files: `src/app/accounts/10-charge-master-dashboard.js` (new), `src/app/accounts/09-clinical-charges.js`, `src/app/0-start/01-app-constants.js`, `src/app/core/03-brand-theme-css.js`, `src/app/core/04-supabase-roles-navigation.js`, `src/app/shell/01-app-main.js`, `src/app/shell/04-navigation-menus.js`, `src/app/manifest.json`, `styles.css`, `supabase/sql/162_biomedical_charges_register_controlled.sql`, version files, `app.js` (rebuilt).

## 2.14.98 — Unit is a dropdown everywhere (no more "2" / "10" as a unit)
- One standard **Unit** list for every Stores item: Nos, Pieces, Pairs, Sets, Packs, Packets, Boxes, Rolls, Bottles, Strips, Tablets, Capsules, Vials, Ampoules, Tubes, Sachets, Inhalers, Kg, Grams, Litres, ml, Dozens, Cans, Cylinders.
- Used in Receive from Vendor, Pharmacy & Stores → Edit Item, and **Store Master → Add / Edit Item (Admin), which was free typing** (the likely source of the wrong units). A number can never be saved as a unit; editing an item that has one asks to choose a proper unit.
- Items that still have a number as unit show **⚠ unit "2" — Edit Item** once, next to the item name; quantities are shown plainly.
- No SQL. Files: `src/app/0-start/01-app-constants.js`, `src/app/stores/consumables-stores.js`, `src/app/stores/store-authority-items.js`, `styles.css`, version files, `app.js` (rebuilt).

## 2.14.97 — Stock details pop-up: full resident story; wrong units flagged
- **Stock Movement Register → click an item:** besides the period totals and movements, a **Residents** list shows every indent for that item in the period: resident (name, ID, room), indent no. and status, requested, **raised by (nurse) with date & time**, approved by, handed over by, **received by (nurse)**, **used (charged to resident)**, **returned to Stores** (who, when, confirmed by) and **unused balance with the resident**.
- **Click a movement:** a Patient Issue / handover now also shows that same resident indent story.
- **Units saved as a number** (e.g. DNS 500 ML unit "2", BIFILAC unit "10", which showed as "4 2" / "9 10") are shown as `(unit "2" ⚠ fix in Edit Item)` in Current Stock and the Movement Register so they can be corrected; the quantities themselves were correct.
- No SQL. Files: `src/app/stores/consumables-stores.js`, version files, `app.js` (rebuilt).

## 2.14.96 — "Apply" button on period / date filters; click any register row for full details
- **Apply filter** (whole ERP): changing a Period / From / To (and Stock Item in the Movement Register) no longer reloads the list at once — press **✓ Apply** (it turns pink with "Filter changed — press Apply"). Pages: Pharmacy & Stores Stock Movement Register, Clinical Alerts, Medication Errors, Duty Assignment (custom dates; week buttons stay instant), Nursing Charge Register (From / To; period buttons stay instant), WhatsApp Inbox (STD dates), Patients → Clinical History (custom date), Audit Trail. Medicines (MAR) already had Apply.
- Date boxes that used the browser picker (Stock Movement Register, Nursing Charge Register, Clinical History) now use the ERP's DD-MM-YYYY date input.
- **Click any row** in Pharmacy & Stores for a details window: Stock Movement Register item rows (period summary + every movement), every stock movement (date & time, type, in / out, balance after, resident, reference, vendor receipt, batch / expiry, recorded by, remarks), Vendor Receipt Register, Expiry Watch, Department Issue Register, Indent Register and Received / Used Balance (resident, item & code, raised by nurse with time, approved by, handed over by, received by nurse, charged, returned, unused balance).
- Pharmacy & Stores lists show **"Loading…"** while data is still arriving (instead of "No stock items" / "All good").
- No SQL. Files: `src/app/shared/02-apply-filter-row-details.js` (new), `src/app/stores/consumables-stores.js`, `src/app/stores/patient-consumables.js`, `src/app/clinical-alerts/02-alert-pages.js`, `src/app/clinical/medication-errors.js`, `src/app/nursing/duty-assignment.js`, `src/app/nursing/nursing-charge-register.js`, `src/app/pages/whatsapp-inbox.js`, `src/app/patients/patients.js`, `src/app/reports/audit-trail.js`, `src/app/manifest.json`, `styles.css`, version files, `app.js` (rebuilt).

## 2.14.95 — Biomedical Equipment + Oxygen Cylinders registers; one charge route per item
- **Biomedical Equipment** (new sidebar item under Pharmacy & Stores): every piece gets an asset no. (BME-0001…) and is linked to its **Charge Master "Biomedical Equipment" item and BIO code**. Boxes: In Use (resident, since, days), Available, Service Due (7 days / overdue), Under Repair, Equipment Register, Add Equipment (several identical pieces at once), Movement History. Nursing Manager / Admin issue, repair, service, out of service; nurses can Return.
- **Oxygen Cylinders** (new sidebar item): B-type (OXB-001…) and D-type (OXD-001…), Full → In use (resident / room, hours) → Empty → At refill → Full; low-full warning; history. Nurses can put a Full cylinder on a resident and take it off (night swaps); Nursing Manager / Admin send for refill, receive back, add, out of service. Oxygen is still charged through Approval Requests (Oxygen Therapy – B/D-type – 6/12/24 h); each in-use cylinder shows its hours.
- **Bills & Charges ↔ Biomedical register:** for Biomedical Equipment a nurse can charge only equipment issued to that resident (or returned within 14 days), shown as "BME-0003 in use since DD-MM-YYYY · N days"; Quantity = days. **Accounts approval** for Biomedical Equipment = Charge Master rate × days (was always 1 × rate).
- **Accounts → Manual Billing & Payment Entry:** "Charge" is now allowed only for **Room Charges, Final Settlement and Other** (Other needs a reason). Everything in Charge Master / Pharmacy & Stores is charged only through Bills & Charges → Accounts approval → Patient Ledger, so nothing can be charged twice or without being issued. Payment, Advance, Discount and Refund are unchanged.
- Dashboard shell shared by all Pharmacy & Stores pages (no visible change).
- **SQL — run `supabase/sql/161_biomedical_equipment_oxygen_cylinders.sql` once** (Supabase → SQL Editor; safe to run again). Last line shows both registers ready and how many Biomedical items Charge Master has.
- Files: `src/app/stores/equipment-oxygen.js` (new), `src/app/stores/stores-dashboard.js`, `src/app/accounts/08-billing-payments.js`, `src/app/accounts/09-clinical-charges.js`, `src/app/0-start/01-app-constants.js`, `src/app/core/03-brand-theme-css.js`, `src/app/core/04-supabase-roles-navigation.js`, `src/app/shell/01-app-main.js`, `src/app/shell/04-navigation-menus.js`, `src/app/manifest.json`, `styles.css`, `supabase/sql/161_biomedical_equipment_oxygen_cylinders.sql`, version files, `app.js` (rebuilt).

## 2.14.94 — Stores: stock list load retry and real error message
- Pharmacy & Stores pages showed "Stores database is not installed yet. Please run 91_consumables_store_inventory.sql" whenever the stock list failed to load for any reason (for example the few seconds Supabase reloads after an SQL file is run). It now retries once automatically and, if it still fails, shows the real reason with "Tap ↻ Refresh". The "run 91" message appears only when the stock table really does not exist.
- No SQL. Files: `src/app/stores/consumables-stores.js`, version files, `app.js` (rebuilt).

## 2.14.93 — Pharmacy & Stores: Housekeeping & General and Kitchen / Food Stores
- **Two new sidebar sections** under Pharmacy & Stores, each with its own dashboard (same boxes as Consumables / Pharmacy): **Housekeeping & General** (linen, gowns, tissue, cleaning, general supplies — codes HKG-0001…) and **Kitchen / Food Stores** (pantry, kitchen items, snacks — codes KIT-0001…). Separate from Food Vendor Management.
- **Issue to Department** (new box on these two dashboards, and an "Issue to Dept" button on each stock item): issue stock to Nursing Floor, Housekeeping, Kitchen / Pantry, Laundry, Office / Admin, Maintenance, Front Desk or Other, with who received it. Stock reduces at once. **Department Issue Register** (Today / This Month / Last Month / All).
- Items in these sections can **also be charged to a resident** through the normal indent → approval → handover → nurse received → Bills & Charges flow; Accounts approves at the live Store Master rate.
- **One shared list of sections** now drives the sidebar, dashboards, Store Master (Add / Filter / Move), receiving, the nurses' Raise Indent category list, Charge Master and Bills & Charges — a new section appears everywhere together.
- **Move Item** (Admin) can now move an item to any section, e.g. existing Bed Linens / Garbage Bags from Consumables to Housekeeping & General (code, stock and history stay with the item).
- **Fix:** a brand-new item received from a vendor under Pharmacy was saved as Consumables (CON- code). It is now created in the section it was received into.
- **SQL — run `supabase/sql/160_store_sections_housekeeping_kitchen.sql` once** (Supabase → SQL Editor; safe to run again). Until it is run, Consumables / Pharmacy work exactly as before; the new sections show a message asking for it.
- Files: `src/app/0-start/01-app-constants.js`, `src/app/stores/consumables-stores.js`, `src/app/stores/stores-dashboard.js`, `src/app/stores/store-authority-items.js`, `src/app/accounts/09-clinical-charges.js`, `src/app/core/04-supabase-roles-navigation.js`, `src/app/core/03-brand-theme-css.js`, `src/app/shell/01-app-main.js`, `src/app/shell/04-navigation-menus.js`, `supabase/sql/160_store_sections_housekeeping_kitchen.sql`, version files, `app.js` (rebuilt).

## 2.14.92 — Sidebar section icons
- Each sidebar section now has its own icon: Food & Diet 🍽, Accounts / Billing ₹, Communication ✉, My Account ☺, Duty Roster & Leave ◷, Director's Office ★, Nursing / Clinical ✚ (previously Food & Diet showed ₹ and several sections shared the ⚙ gear).
- Added `supabase/sql/diagnostic_store_functions.sql` — READ-ONLY check (changes nothing) of the existing stock / charge database functions, needed before adding the Housekeeping & General and Kitchen / Food Stores sections.
- No SQL to install. Files: `src/app/shell/04-navigation-menus.js`, `supabase/sql/diagnostic_store_functions.sql`, version files, `app.js` (rebuilt).

## 2.14.91 — Pharmacy & Stores: category dashboards
- **Consumables** and **Pharmacy** (sidebar → Pharmacy & Stores) now each open a Samara-colour **dashboard** instead of one very long page. It has eight boxes with live numbers: **Indents — Action Needed**, **Indent Register**, **Received / Used Balance**, **Current Stock**, **Receive from Vendor** (store in-charge only), **Vendor Receipt Register**, **Stock Movement Register** and **Expiry Watch**. Boxes needing attention are highlighted red / amber.
- Tapping a box opens only that section, with a **← Back to Dashboard** bar (stays at the top while scrolling) and **×** Close. The phone / browser back button also returns to the dashboard.
- **Pharmacy now shows its own indents** (Pharmacy Indent Register, Received / Used Balance); Consumables shows only consumable indents.
- **Stock Movement Register** has a **Summary / Every Movement** switch; Every Movement lists each movement for the chosen period and item (no more endless ledger).
- New **Expiry Watch**: receipts of items still in stock that are expired, expire within 90 days, or have no expiry entered, with Add / Edit Expiry.
- "Patient Consumables" (Indent Register) removed from the Manager sidebar; its work is now inside the two dashboards. The page itself stays for the indent alert badge. Nurses' Raise Indent / Received Indents pages and the STD "Stores" page are unchanged.
- No SQL. Files: `src/app/stores/stores-dashboard.js` (new), `src/app/stores/consumables-stores.js`, `src/app/stores/patient-consumables.js`, `src/app/shell/01-app-main.js`, `src/app/core/04-supabase-roles-navigation.js`, `src/app/manifest.json`, `styles.css`, version files, `app.js` (rebuilt).

## 2.14.90 — Admission: Family Portal / Daily Intelligent Report / Both
- Admission → Family Communication now offers three clear choices: **Family Portal Access** (Samara's highlight, shown first), **Daily Intelligent Report on WhatsApp**, or **Both**. The family can choose either one or both. Family Portal Access is no longer forced on every admission.
- When the Daily Intelligent Report is included, the admission form shows **Daily Report Time** (default 8:00 PM) and "Report will be sent to" (Family Contact 1's name, relationship and WhatsApp number). From admission day the Intelligent Patient Report (PDF) goes out daily at that time through the approved WhatsApp template.
- Report only: no Family Portal login or PIN is created, and no portal WhatsApp is sent. The admission welcome WhatsApp still goes to Contact 1. Family Contact 2 (a second portal login) appears only when Family Portal is chosen.
- Either option can be changed later from Patients.
- No SQL (same settings table and daily sending job). Files: `src/app/patients/admissions.js`, `styles.css`, version files, `app.js` (rebuilt).

## 2.14.89 — Pharmacy & Stores: add / edit Expiry Date later
- New **Expiry** button on every stock item, and **Add Expiry / Edit Expiry** on each row of the Vendor Receipt Register (Stores / Pharmacy in-charge only). It opens that item's vendor receipts, where the **Batch No.** and **Expiry Date** (DD-MM-YYYY) of each receipt can be added or corrected; each receipt has its own Save Expiry. Quantities, stock balance, vendor, invoice and charges are not changed. Who changed it and when is kept.
- Registers and item history now show **"Expiry not entered"** (amber), **"Expires soon"** (within 90 days, amber) or **"EXPIRED"** (red).
- Receive from Vendor: Expiry Date stays optional, with a note that it can be added later.
- **SQL — run `supabase/sql/159_store_receipt_expiry_edit.sql` once** (Supabase → SQL Editor; safe to run again).
- Files: `src/app/stores/consumables-stores.js`, `supabase/sql/159_store_receipt_expiry_edit.sql`, version files, `app.js` (rebuilt).

## 2.14.88 — Save buttons lock after a successful save (whole ERP)
- After the green "saved" confirmation, the Save / Submit / Update / Record button that was pressed turns grey with a **"✓ Saved"** tag and cannot be pressed again (no duplicate entries). It unlocks as soon as anything is changed in the same form or window (typing, choosing another patient, uploading / removing a document, adding / removing a row). Close / Cancel keep it locked.
- Works on every page and popup (e.g. Edit Patient → "Save Patient Information & Documents", Daily Care, admissions, HR, stores), because it follows the ERP's shared success confirmation. A failed save does not lock the button.
- No SQL. Files: `button-feedback.js`, version files, `app.js` (rebuilt, version only).

## 2.14.87 — Daily Care: whole-shift timing and optional preferred time
- **No more 7 AM / 7 PM alerts for Daily Care.** A care task without a preferred time can be given any time in the shift: nurse reminder 2 hours before the shift ends (5 PM / 5 AM, only if not yet recorded), Managers + Admins escalation 1 hour before the shift ends (6 PM / 6 AM), WhatsApp "Critical pending" at 6:30 PM / 6:30 AM.
- **Optional preferred time** on each care task (admission and Edit Patient → Master care plan: "Preferred from" / "Preferred to", e.g. 10:00 AM – 12:00 PM): reminder at the start of the window, escalation at its end, "Critical pending" 30 min later. The care plan shows "Any time in shift" or the preferred window.
- Clinical Alerts shows Daily Care as "By 6:00 PM" / "Pending this shift" instead of an early due time.
- **SQL — run `supabase/sql/158_daily_care_alert_matching_autoresolve.sql` (this version; it replaces the 2.14.86 file, which should NOT be run)** — adds the preferred time columns, the new timing, the care matching by shift + activity, and automatic closing of escalations (including past ones whose care was recorded in that shift).
- Files: `src/app/patients/medication-helpers.js`, `src/app/patients/admissions.js`, `src/app/patients/patients.js`, `src/app/clinical-alerts/02-alert-pages.js`, `supabase/sql/158_daily_care_alert_matching_autoresolve.sql`, version files, `app.js` (rebuilt).

## 2.14.86 — Daily Care alerts: care given is counted, escalations close by themselves
- **Problem (Mrs. Kasthuri, 29-09-2026):** Daily Care alerts / WhatsApp escalations kept coming although the care was recorded. Causes: (1) an entry made directly on the Daily Care page was saved with no link to the care order, so the alert never cleared (Bathing assistance 06:26 AM); (2) an entry opened from an alert kept that alert's link even when the nurse changed the activity (Walking/mobility saved against the Bathing order); (3) the server matched care by date, not by shift, so every night-shift task re-appeared at 12:00 midnight and escalated at once; (4) Daily Care escalations never closed after the care was recorded.
- **App:** Daily Care entry now links itself to the patient's order for the chosen activity and shift; changing patient or activity drops the old link.
- **SQL — run `supabase/sql/158_daily_care_alert_matching_autoresolve.sql` once** (Supabase → SQL Editor; safe to run again): care counts when the same patient + same activity is recorded in the current shift (linked or not); open Daily Care escalations close automatically when the care is recorded, and past ones whose care was recorded in that shift are closed now. Medicines, vitals and physiotherapy unchanged.
- Files: `src/app/clinical/daily-care-vitals.js`, `supabase/sql/158_daily_care_alert_matching_autoresolve.sql`, version files, `app.js` (rebuilt).

## 2.14.85 — Clinical Alerts: Period filter
- NURSING → Clinical Alerts looked empty because it lists only tasks due **at this moment**; when nothing is due, all counts show 0. The empty table now says so and points to the new Period filter.
- New **Period** filter: Now (live) (default, unchanged), Today, Yesterday, Last 7 days, Last 30 days, This month, Custom (From / To, DD-MM-YYYY). A past period shows alerts from the escalation register with Status (Open / Resolved), Type, Priority, Patient, Room, Due, Alert Raised, Sent To, Reason, Resolution and an **Open Task** button; counts show total, still open, resolved and by type; Status and Type filters narrow the list.
- No SQL, no Edge Function change. Files: `src/app/clinical-alerts/02-alert-pages.js`, version files, `app.js` (rebuilt).

## 2.14.84 — Help / உதவி: Samara look, clearer answers, bigger window
- Header is now white with the **Samara logo**; colours taken from the logo (Samara magenta, with the feather's orange as a thin accent line) instead of the dark maroon ribbon.
- Answers are **formatted**: bold headings show as bold (no more `**` marks), numbered steps get round step numbers, and ERP button / page names in quotes are highlighted (e.g. Confirm & Start) so staff can spot them on screen.
- **Bigger window** on Windows (500 × 780) plus a ⤢ **Enlarge** button for a near full-screen view (remembered on that computer). Larger text (15.5 px, 16 px on phones). Phones keep the full-screen sheet; "Staff questions" becomes a 📋 icon there.
- No SQL, no Edge Function change. Files: `erp-help.js`, `erp-help.css`, new `assets/samara-help-logo.png`, version files, `app.js` (rebuilt, version only).

## 2.14.83 — Help / உதவி: Tamil answers and "tell it in Tamil"
- "tell it in tamil" / "தமிழில் சொல்லுங்கள்" / "in English" now repeats the previous answer in that language (before, a short English follow-up was answered in English or failed).
- Long Tamil answers that the AI cut off, or returned in slightly broken format, are recovered instead of showing "Help is temporarily unavailable"; a cut-off answer is asked for again with more room.
- **Edge Function redeploy required:** `erp-help-ai` (paste `supabase/functions/erp-help-ai/index.ts` → Deploy; keep Verify JWT OFF). No SQL.
- Files: `supabase/functions/erp-help-ai/index.ts`, version files, `app.js` (rebuilt, version only).

## 2.14.82 — Help / உதவி: fixed "Help is temporarily unavailable" (Gemini model retired)
- The Help function asked Google for `gemini-2.5-flash`, which Google no longer gives to new users (log: `erp-help gemini 404 NOT_FOUND`). It now uses current models in order — `gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, then `gemini-2.5-flash` — and moves to the next one automatically if a model is ever retired again. Optional secret `GEMINI_HELP_MODEL` still overrides the first choice.
- **Edge Function redeploy required:** `erp-help-ai` (paste `supabase/functions/erp-help-ai/index.ts` into Dashboard → erp-help-ai → Code → Deploy). Keep **Verify JWT with legacy secret OFF**.
- No SQL. Files: `supabase/functions/erp-help-ai/index.ts`, version files, `app.js` (rebuilt, version only).

## 2.14.81 — Help / உதவி: typing box fixed on phones
- The ERP-wide "🎤 Voice" + "Dictate / Language" bar was being added to the Help typing box, squeezing it into a thin vertical strip on phones. The Help box now opts out (Help already has its own 🎙 button).
- **"உதவி தற்போது கிடைக்கவில்லை" (Help not available) on every question:** Supabase → Edge Functions → `erp-help-ai` → Settings → turn **Verify JWT with legacy secret OFF** → Save. The function checks the staff login itself (same as the other ERP functions). Also make sure `supabase/sql/157_erp_help_assistant.sql` has been run.
- No SQL change. Files: `erp-help.js`, `erp-help.css`, version files, `app.js` (rebuilt, version only).

## 2.14.80 — Approval Requests: "Confirm & Start" now shows on Windows / desktop
- NURSING → Approval Requests: the **Approved — Ready to Start** cards (nurse's **Confirm & Start** button) and the **Pending Approval** cards (Nursing Manager's **Approve / Decline** buttons) were visible only on phones — they used a phone-only card style hidden above 760px width, so on Windows the section showed a count, e.g. "(2)", but no cards. They now show on every screen size.
- No SQL required. No database change. Workflow unchanged. Includes everything in 2.14.79 (Help assistant).
- Files: `src/app/nursing/nursing-procedures.js`, `styles.css`, version files (`index.html`, `service-worker.js`, `bootstrap-error.js`, `src/app/0-start/01-app-constants.js`), `app.js` (rebuilt).

## 2.14.79 — Help / உதவி assistant for staff (Tamil voice, text or screenshot)
- New **Help / உதவி** button (bottom right; on phones "💬 உதவி" above the bottom menu) for every logged-in staff member. It opens a help chat that answers **only questions about using the ERP**: where a page is, which button to press, how a workflow goes, what an error message means.
- Staff can **speak in Tamil** (🎙, up to 1 minute), **type**, or **attach / paste a screenshot** (📷 or Ctrl+V). The page they are on is sent automatically. Answers come as short numbered steps in simple Tamil (button names kept in English exactly as on screen) and are **read aloud** when the question was spoken (🔊 to replay). 👍 / 👎 feedback on each answer.
- Role-aware: it knows the staff member's role and menu, and says so when a page is not available for their role. It follows ERP rules (medicines only through Doctor Review, indent flow, DD-MM-YYYY, etc.). Non-ERP questions (medical advice etc.) are politely declined.
- Screenshots and voice recordings are used only to answer and are **never stored**; staff are reminded to crop patient details. 40 questions per hour per staff member.
- **Admin** sees "📋 Staff questions" inside Help: the latest 100 questions (date, staff, role, page, question, answer, voice / screenshot, 👍/👎) — useful for training.
- The help knowledge is built from the ERP itself (menus per role, on-screen text of every page, this CHANGELOG and a staff guide `tools/erp-help-guide.md`) into `help/erp-help-kb.json`. To update it: edit the guide, run `python3 tools/build-help-kb.py`, upload the JSON — no redeploy needed.
- Built as separate files (`erp-help.js`, `erp-help.css`), not inside app.js, so it cannot affect other pages.
- **SQL required:** `supabase/sql/157_erp_help_assistant.sql`. **New Edge Function:** `erp-help-ai` (uses the existing GEMINI_API_KEY and OPENAI_API_KEY secrets).
- Files: `erp-help.js`, `erp-help.css`, `help/erp-help-kb.json`, `tools/build-help-kb.py`, `tools/erp-help-guide.md`, `supabase/functions/erp-help-ai/index.ts`, `supabase/sql/157_erp_help_assistant.sql`, `index.html`, `service-worker.js`, version files, `app.js` (rebuilt, version only).

## 2.14.78 — DD-MM-YYYY everywhere (one global standard)
- **Every date box** in the ERP (forms, filters, popups, on phone and Windows) now shows **DD-MM-YYYY**, and date-time boxes show **DD-MM-YYYY, hh:mm AM/PM**. Before, 35 date boxes used the phone's / Windows' own format (often MM/DD/YYYY). This is done once, centrally in `date-time.js`, so any new date box added later is automatically DD-MM-YYYY too. Tapping the box still opens the normal calendar; saved values are unchanged.
- **All dates written on screen** are now DD-MM-YYYY. The automatic on-screen check now also converts "28 Sept 2026", "28/09/2026", "Sep 28, 2026" and "24-Sep-2026" styles (it previously caught only 2026-09-28).
- **Discharge timeline & departure follow-up:** every patient row now shows its date & time stamps without opening it — open cases: "Initiated … · Last update …"; completed cases: "Departed …" (or "Completed …") · "Initiated …". No database change.
- Fixed at source: Discharge timeline & departure follow-up (showed "28 Sept 2026, 10:49 am"), Temporary Duty Swap, Food vendor receipt-window messages and order cutoff text, Director's Office selected date ("28-09-2026 – Monday").
- Phone push / WhatsApp Inbox texts from `food-cutoff-push` and `food-whatsapp-inbox` Edge Functions now use DD-MM-YYYY (optional redeploy; in-app screens are already fixed without it).
- No SQL required. No database change.
- Files: `date-time.js`, `discharge-workflow.js`, `duty-swap.js`, `food-vendor.js`, `food-vendor-core.js`, `src/app/core/06-date-format-task-navigation.js`, `src/app/pages/director-office.js`, version files, `app.js` (rebuilt); optional `supabase/function-copies/food-cutoff-push.ts`, `supabase/function-copies/food-whatsapp-inbox.ts`.

## 2.14.77 — Food vendor WhatsApp replies now raise alerts
- The vendor's button reply on the food order WhatsApp (Acknowledged / Returned / Needs Modification) used to be recorded silently in Messages only. Now:
  - **Returned** (vendor will not supply): urgent pop-up + phone push to the Nursing Manager and Admin / Director.
  - **Needs Modification**: pop-up + phone push to the Nursing Manager.
  - **No reply** 30 minutes after an order was sent by WhatsApp (and before its delivery time): pop-up + phone push to the Nursing Manager.
  - **Acknowledged**: no alert; a green "✓ Vendor acknowledged" badge on the order.
- Notifications has a new "Food Vendor Replies — Action Needed" section (Nursing Manager, Admin / Director) with "Open order message" and "Mark handled". Mark handled needs a short note (e.g. "called vendor, arranged other food"). A new vendor reply re-opens the alert; a later Acknowledged clears an earlier Returned / Needs Modification.
- Food Vendor Management › Orders and History show the vendor's reply as a coloured badge (Acknowledged / RETURNED / Asks changes / Awaiting reply). Messages shows "Mark handled" and the handled note.
- The old "Request WhatsApp Confirmation" button is removed: the order message itself now carries the reply buttons, and its separate template was never submitted to Meta.
- **SQL required:** `supabase/sql/156_food_vendor_reply_alerts.sql` (new columns on fv_messages + alert, handled and push functions; fv_rpc / fv_access / the webhook reply function are unchanged).
- **Edge Function redeploy required for phone pushes:** `food-cutoff-push` (copy: `supabase/function-copies/food-cutoff-push.ts`). It keeps sending the cutoff pushes exactly as before and now also sends the vendor-reply pushes; each phone gets each alert once. The existing every-minute schedule is reused. Pop-ups and Notifications work without this redeploy.
- Files: `food-vendor.js`, `src/app/global-ui/06-bell-notifications-popups.js`, `supabase/sql/156_food_vendor_reply_alerts.sql`, `supabase/function-copies/food-cutoff-push.ts`, version files, `app.js` (rebuilt).
- This package also contains everything from 2.14.74, 2.14.75 and 2.14.76.

## 2.14.76 — Doctor Review: "Add New Medicine" opens its own popup; several medicines at once
- "Add New Medicine" now opens a separate popup. Enter one medicine, or press "+ Add another medicine" to enter several on the same page; each has Remove.
- "Save" checks every medicine (name, strength number + unit, frequency, route, time, start date & time), closes the popup and shows a confirmation: "N new medicines added … Press Apply Doctor Review & Update Medication to save to the patient record."
- The added medicines appear in the review list as short cards (name, strength, schedule, start time) with Edit (reopens the popup for that medicine) and Remove.
- Nothing is saved to the patient record until "Apply Doctor Review & Update Medication", which keeps the rule that medicines change only through a doctor review (doctor name and prescription / verbal-order details).
- Modify and Stop for existing medicines work as before.
- Files: `src/app/clinical/medicines.js`, `styles.css`, version files, `app.js` (rebuilt).
- This package also contains everything from 2.14.74 and 2.14.75.

## 2.14.75 — Medicine Strength: number + unit from a list
- Admission form and Doctor Review / Modify: Strength is now a number box plus a Unit dropdown (mg, mcg, g, ml, mg/ml, mg/5 ml, IU, units, %, drops, tablet, capsule, puff, sachet, patch). Letters cannot be typed in the number box, so mistakes like "500ma" are no longer possible. Combination strengths such as 50/500 mg still work.
- Saved exactly as before, as one text value (e.g. "500 mg"). No SQL needed for this part.
- Existing entries such as "500mg", "1 tab" or "2.5 mg/5ml" are read automatically. An unreadable old entry shows "Previously entered as … — enter the number and choose the unit" when that medicine is modified.
- Saving is blocked until every new or modified medicine has both a number and a unit.
- Files: `src/app/patients/medication-helpers.js`, `src/app/patients/admissions.js`, `src/app/clinical/medicines.js`, version files, `app.js` (rebuilt).
- This package also contains everything from 2.14.74. If 2.14.74 is not uploaded yet, upload only this package, and run SQL 155 if not already done.

## 2.14.74 — Doctor Review: separate start / stop time per medicine; Weekly & Monthly medicines due only on their day
- Doctor Review / Modify: every added, modified or stopped medicine now has its own "Starts from" / "Stop from" date & time. It defaults to the review's Effective From (now labelled "default for all changes"), so nothing changes unless you set it. Example: a weekly tablet last taken before admission can be added to start on its next due date while other changes start now.
- When medicines in one review have different times, each time is saved as its own doctor-review record (same doctor and prescription document; notes say "Part 1 of 2 …"). With one common time, the save is exactly as before. If a later part fails, the message lists which medicines were saved and which were not.
- Weekly medicines are now due only every 7 days from the first dose (Effective From date); Monthly medicines on the same date each month (last day of a shorter month). Before this, both showed a dose every day. MAR, Shift Tasks and Clinical Dashboard follow this. Active Prescriptions shows "Next due <date>" and Administer is disabled on other days.
- **Existing Weekly / Monthly orders:** their day is now counted from their Effective From (or start) date. Check them in Active Prescriptions after upload.
- **SQL required (run once):** `supabase/sql/155_medicine_alerts_start_stop_weekly.sql` — the server alerts / escalations raised "Medicine Due" every day for every active medicine, including orders starting later (2.14.73), stopped or ended orders and Weekly / Monthly days. Now they follow the same rules as the screens. Only the regular medicine-dose part of `get_current_clinical_alerts` is changed.
- Admission form: each medicine's date & time box is now labelled "Starts from / Effective from", shows "Future start …" for a later start, reminds you to enter the NEXT due date for Weekly / Monthly medicines, and is limited to 30 days ahead.
- Files: `src/app/patients/admissions.js`, `src/app/clinical/medicines.js`, `src/app/patients/medication-helpers.js`, `src/app/0-start/01-app-constants.js`, `app.js` (rebuilt), `index.html`, `service-worker.js`, `bootstrap-error.js`, `supabase/sql/155_medicine_alerts_start_stop_weekly.sql`.

## 2.14.73 — Doctor Review / Modify: Effective From can be a future date & time
- A doctor's change can now be ordered to start later (up to 30 days ahead). The current prescription continues until that moment; no dose of the new order is scheduled before it. The form shows "Future start: the new order begins …" when a later time is chosen.
- Doctor Review Date & Time still cannot be in the future.
- Fix: a filled date that was outside the allowed range showed "… is required". The message now says what is wrong (e.g. "later than allowed"); "required" is shown only for an empty field. This applies to all forms.
- Active Prescriptions shows the old medicine as "Until <time> (doctor review)" and the new one as "Starts <time>" (button "Starts later"). Shift Tasks and the Clinical Dashboard keep giving the old medicine's doses until the change time.
- **SQL required (run once, before or with this upload):** `supabase/sql/154_medication_review_future_start.sql` — changes one line in `apply_medication_review` (future limit 1 minute → 30 days). The review date/time is still not allowed in the future.
- Files: `src/app/clinical/medicines.js`, `src/app/clinical/clinical-dashboard.js`, `src/app/nursing/shift-tasks.js`, `src/app/global-ui/03-form-requirements.js`, `supabase/sql/154_medication_review_future_start.sql`.

## 2.14.72 — Patient record › Medicines: "Add / Modify Medicines" button for nurses
- Nurses saw the patient record as "View only" and had no way to change medicines from it (the only shortcut was inside Edit Patient, which is Admin / Manager only).
- The Medicines tab now has "Add / Modify Medicines" for Admin, Manager and Nurse. It opens Medication Administration › Doctor Review / Modify for that resident (doctor's prescription required, previous orders kept in history).
- Personal details remain view-only for nurses.
- Frontend only. File: `src/app/patients/patients.js`.

## 2.14.71 — Admission medicines: Effective From date & time; end-date fix
- Admission form › Medication: "Start date" is replaced by "Effective from (date & time)". It is pre-filled with the admission date and time and can be changed per medicine; saved to medication_orders.effective_from (the same field Doctor Review / Modify uses), so no dose is scheduled before that moment. Saved rows show "Effective from: dd-mm-yyyy h:mm AM/PM".
- Fix: the end date of fixed-duration admission medicines was one day early in India (UTC conversion) — a "1 Day" medicine ended the day before it started and never appeared in the MAR; "3 Days" from 27-09 ended 28-09 instead of 29-09. Dates are now calculated as plain calendar dates.
- New medicine rows use the India date (not UTC) as their default date.
- Frontend only. Files: `src/app/patients/admissions.js`, `src/app/patients/medication-helpers.js`.

## 2.14.70 — Pharmacy & Stores: move an item to an approved category instead of removing it
- "Remove Item" now opens "Remove or Move Item". First choice: move the item to an approved Standard Item List category; it keeps its item code, stock balance and full history.
- Within the same section (e.g. Consumables → Urine Bags): store in-charge (Nursing Manager / STD).
- To the other section (Consumables ↔ Pharmacy): Admin only — same call as Stores Master › Move Item. Reminder shown that Pharmacy is only for medicines.
- Remove works as in 2.14.69. Every move is written to the audit trail ("Move Store Item").
- Frontend only. File: `src/app/stores/consumables-stores.js`.

## 2.14.69 — Pharmacy & Stores: stock search, separate Receive / Edit buttons, Remove Item fixed
- Stock list has its own "Search stock" box (item name or code, e.g. "diaper" or "CON-0017"); it no longer shares the Receive from Vendor search.
- "Receive from Vendor" now opens from its own button (closed by default); every item also has a "Receive Stock" button that opens the form with that item already selected.
- "Edit Item" opens an on-page form (name, unit, strength, dosage form) instead of four browser pop-ups.
- "Remove Item" fixed: it asks in an on-page box (browser pop-ups can be blocked) and a removed item now disappears from the stock list, counts and item pickers. Items with history are still only deactivated, so their receipts, issues and charges are kept.
- Frontend only. File: `src/app/stores/consumables-stores.js`.

## 2.14.68 — Fix: Medication Administration date filter was one day early
- Picking From 24-09 To 27-09 searched 23-09 to 26-09, and the Period choices (Today / 7 Days / 30 Days) also started one day early. Cause: the day list was built with a UTC conversion, which in India (UTC+5:30) turns local midnight into the previous day.
- Now the dates are worked out as plain calendar dates with the existing `addDaysISODate` helper, so the dates shown and searched are exactly the dates chosen.
- Frontend only. File: `src/app/clinical/medicines.js`.

## 2.14.67 — Raise Indent shows Category and Stores codes
- Raise Indent: pick Category first (Consumables / Pharmacy, as in Stores Master), then the item — each shown with its Stores code and live balance, e.g. "CON-0017 · Disposable Syringe - 10 mL · Store balance 5 Nos", A→Z. Same code, name and category as Stores & Pharmacy and Bills & Charges.
- Frontend only. File: `src/app/stores/patient-consumables.js`.

## 2.14.66 — "Indent Register" menu item for the Nursing Manager (store keeper)
- The Nursing Manager's PHARMACY & STORES menu now has "Indent Register" (the Patient Consumables page: every patient indent, Consumables and Pharmacy, with Approve / Hand Over / returns). Before, it was only reachable at the bottom of the long Consumables stock page.
- Frontend only. File: `src/app/core/04-supabase-roles-navigation.js`.

## 2.14.65 — "Raise Indent" link in Bills & Charges; Nurses see only Resident Food Intake
- Bills & Charges (Nurse): when nothing has been received for the patient in Consumables / Pharmacy, a "＋ Raise Indent for this patient" button opens the Raise Indent page (after confirming the unsaved charge form can close).
- Food & Diet: Nurses now see only Resident Food Intake (Food Vendor Management removed from their menu and page). Nursing Manager / STD keep Food Vendor Management; Admin and others keep both.
- New in-app page-link event (`samara-open-page`) in the app shell; pages the user can't open are still blocked by the existing permission check.
- Frontend only. Files: `src/app/accounts/09-clinical-charges.js`, `src/app/clinical/food.js`, `src/app/shell/01-app-main.js`.

## 2.14.64 — Fix: nurse's Consumables / Pharmacy list showed items already charged
- Cause: "already charged" was counted only from the nurse-raised charge links (bill_charge_store_allocations). Charges raised by Admin / Accounts, or older charges without that link, were never subtracted, so items already billed still showed as chargeable.
- Now: chargeable = received for the patient (Indent → Nursing Manager approval → Hand Over → Received) − returned − every non-rejected Consumables / Pharmacy charge for that patient and item, whoever raised it (older charges without an item link are matched by item name). Rejected charges don't count, so the item can be re-raised.
- The nurse's list shows only items with something left to charge, as "CON-0017 · Disposable Syringe - 10 mL — 2 Nos to charge". Admin / Accounts see all active Stores items with their codes.
- Read-only check: `supabase/sql/check_patient_items_to_charge.sql`. Files: `src/app/accounts/09-clinical-charges.js`.

## 2.14.63 — Bills & Charges item list matches Stores and Charge Master exactly
- Consumables / Pharmacy: the Service / Item dropdown now lists exactly the Stores Master items, with the same Stores code (e.g. CON-0017 · Disposable Syringe - 10 mL). For Nurses it lists ONLY items received for the selected patient (Indent → Hand Over → Received) and not yet charged, with the quantity available; anything not received for that patient is not shown at all (previously every rated Stores item was listed and the rule was only checked on Save).
- Other categories show the Charge Master code beside each item, for Nurses too (code only, never the rate).
- Changing the patient refreshes the item list; saving re-checks the rule.
- Database: `153_charge_catalog_codes_for_nursing.sql`. Files: `src/app/accounts/09-clinical-charges.js`.

## 2.14.62 — Alphabetical lists everywhere for charges
- Charge Master, Bills & Charges and Approval Requests: every Category dropdown and every Service / Item dropdown is now A→Z (case-insensitive), with "Others" always last. Consumables / Pharmacy now sit in their alphabetical place instead of at the end. Charge Master's item tables and category filter are sorted the same way.
- Frontend only. Files: `src/app/accounts/09-clinical-charges.js`, `src/app/nursing/nursing-procedures.js`.

## 2.14.61 — Approval routing per Charge Master category; all categories back in Bills & Charges
- Charge Master (Admin): new "Approval Routing by Category" table. Admin can turn "Needs Nursing Manager approval" ON/OFF for any non-stock category (Nursing Procedures is ON by default; Stores / Pharmacy categories can't be switched).
- ON: that category is raised only from NURSING → Approval Requests (request → Admin/Nursing Manager approval → nurse Confirm & Start → charge to Accounts), for everyone; the database blocks it in Bills & Charges. OFF: raised directly from Bills & Charges.
- Bills & Charges: nurses again see every Charge Master category (Doctor Services, Physiotherapy, Lab, Transport, etc.) plus Consumables/Pharmacy from Stores — except categories switched ON for approval.
- The "Nursing Procedures" menu item is renamed "Approval Requests": Category → Item (with Charge Master code), for every approval category.
- Database: `152_charge_category_approval_routing.sql` (run after 151). Files: `src/app/nursing/nursing-procedures.js`, `src/app/accounts/09-clinical-charges.js`, `src/app/core/04-supabase-roles-navigation.js`, `src/app/shell/01-app-main.js`.

## 2.14.60 — Nursing Procedures now come only from Charge Master; removed from Bills & Charges
- Nursing → Nursing Procedures: the procedure dropdown now lists exactly the active "Nursing Procedures" items in Charge Master, with their Charge Master code (e.g. NUR-0001 · Catheterization). The separate NP-xxx code list (and its Add/Edit/Deactivate screen) is retired; Admin maintains the list in Charge Master only. Admin / Nursing Manager see a read-only "Nursing Procedure List" on the page. Nurses see code and name only, never the rate. "Others" needs the procedure name in Remarks.
- Bills & Charges: "Nursing Procedures" removed as a category for everyone. The database also blocks any Nursing Procedures charge that doesn't come from Confirm & Start, so the same procedure can't be billed twice. Existing Nursing Procedures charges and Accounts' verify/post step are unchanged; the register filter still lists older Nursing Procedures charges.
- Repair: procedures already marked Started whose charge was missing (e.g. 26-09-2026 Pressure Sore Care / Catheterization) get their charge raised now, Pending for Accounts.
- Database: `151_nursing_procedures_from_charge_master.sql` (run once; safe to re-run). Files: `src/app/nursing/nursing-procedures.js`, `src/app/accounts/09-clinical-charges.js`.

## 2.14.59 — Food & Diet: receipt reminder + auto-close, and vendor reply buttons on the order message
- A delivered order could sit at "Pending receipt" indefinitely if nobody happened to open it and log what arrived — nothing ever nudged staff, and nothing ever closed it out.
- New fixed window, timed from each order's own delivery time: 0–2h normal, 2–3h a "Food Receipts Overdue" reminder now shows in Notifications for the Nurse Manager (the normal food order in-charge) and Admin/Director, with a "Record receipt now" button straight to Food Vendor Management. Past 3h (2h entry window + 1h grace), the order automatically closes as not received — no vendor WhatsApp message, no billing (a Closed order with nothing recorded stays excluded from the vendor statement, exactly like a manual "Close" already works today).
- In-app only for now, by request — no new WhatsApp template or Meta approval needed; it can be extended to also message the vendor's WhatsApp later if wanted.
- Separately: the 3 vendor reply buttons (Acknowledged / Returned / Needs Modification) originally planned as a new, separate `samara_food_confirm_request` WhatsApp template were instead added directly to the existing, already-approved `samara_food_order` template — one message now carries the full order and the reply buttons, instead of two messages. The button tap → ERP recording path from 2.14.57 (`whatsapp-webhook` → `fv_apply_vendor_button_reply`) needed no changes, since it was already generic to any message kind. The separate `samara_food_confirm_request` template draft was not submitted.
- Database: `150_food_receipt_autoclose.sql` (new `fv_auto_close_overdue_receipts()` function + a `pg_cron` job running every minute; does not touch `fv_rpc`, `fv_access` or any existing action — it only automates the same effect as the existing manual "Close" action).
- Files: `food-vendor-core.js` (new `receiptDeadline` helper, shared by the reminder UI), `src/app/global-ui/06-bell-notifications-popups.js` (new "Food Receipts Overdue" section in Notifications).

## 2.14.58 — Fix: Nursing Procedure Codes weren't checked against Consumables/Pharmacy for duplicates
- Bug: v2.14.47 added a duplicate-catalog check so the same real thing can't quietly get billed twice under two different names (e.g. "Glucose Monitoring" as a Nursing Procedure and "Glucose Strips" as a separate Pharmacy item). It was only ever wired up in one direction — adding/editing a Consumables/Pharmacy item correctly warned about a matching Nursing Procedure Code, but adding/editing a Nursing Procedure Code never checked the other way, so a duplicate could still be created from that side without warning.
- Fix: adding or editing a Nursing Procedure Code now also checks against active Consumables/Pharmacy items, using the same close-name matching already used everywhere else (exact match, or ≥0.72 word-overlap similarity), and blocks with the same kind of warning shown on the Stores Master side.
- Frontend-only (`src/app/nursing/nursing-procedures.js`), no database changes.

## 2.14.57 — Food Vendor: Acknowledged / Returned / Modification Requested vendor reply
- Every order/modification/receipt/confirmation message in Food Vendor Management → Messages now shows "Vendor reply: ..." with Mark Acknowledged / Mark Returned / Mark Modification Requested buttons, so staff can record what the vendor actually said (a WhatsApp delivered/read tick only means Meta delivered it, never that the vendor agreed). Works immediately — no Meta approval needed.
- New "Request WhatsApp Confirmation" action (Orders and Messages) sends a message asking the vendor to tap Acknowledged / Returned / Modification Requested. Automatic capture of the vendor's tap (via a new WhatsApp quick-reply-button template, `samara_food_confirm_request`) needs a one-time Meta template approval — see `docs/META_TEMPLATE_samara_food_confirm_request.md` for the exact text to submit. Until it's approved, the same request goes out over the existing manual WhatsApp fallback and staff record the reply themselves with the buttons above — exactly like `samara_food_order`/`modification`/`receipt` already work today.
- Placing, modifying and receiving orders is completely unaffected either way — `samara_food_order`, `samara_food_modification` and `samara_food_receipt` are not touched by this release, and neither is the existing WhatsApp signature check, the website enquiry auto-reply menu, or the central WhatsApp Inbox logging wrapper already running in these two Edge Functions.
- Database: `149_food_vendor_reply_status.sql` (adds reply columns to `fv_messages` + 3 new functions; `fv_rpc`/`fv_access`/`fv_apply_provider_status` untouched). Also needs the `whatsapp-webhook` and `food-whatsapp` Edge Functions redeployed (`supabase/functions/whatsapp-webhook/index.ts` and `supabase/function-copies/food-whatsapp-inbox.ts`) — both were pulled fresh from what's actually live before editing, so this release only adds the two functions above and doesn't touch anything already running there.

## 2.14.56 — Fix: Admission Delegates blocked from completing admission by Family Portal step
- Bug: the Admissions page already lets Admin, Manager and the two named Admission Delegates (Jaya, Saranya) complete a patient admission, but the Family Portal Access step inside that same save — now mandatory for every admission since 2.14.55 — was still restricted to Admin/Manager only inside the database function that creates it. An Admission Delegate could get all the way through room/bed allotment and then fail at the last step: "...document or care setup failed: Only Admin or Manager can manage Family Portal access."
- Fix: whoever is already trusted to complete an admission (Admin, Manager, or Jaya/Saranya as Admission Delegate) can now also set Family Portal access while doing so — the same people, no wider. Editing an already-active patient's Family Portal from Patients still requires Admin/Manager, unchanged.
- Database: `148_admission_family_portal_access.sql` (live-patches the existing `upsert_family_portal_access` role check in place, same safe pattern as the 2.14.35 room-allotment fix — this one needs the SQL run in Supabase before Admission Delegates can complete an admission).

## 2.14.55 — Family Portal mandatory on Edit Patient + deferred consent upload + pending-consent list
- Family Portal Access is now mandatory (at least Family Contact 1 or Family Contact 2 enabled) when saving an existing patient's details from Edit Patient — not just at the moment of new admission. This closes the gap for older residents admitted before Family Portal existed who currently have zero contacts on file; the Admissions page already enforced this for new admissions.
- New admission flow already generates the consent form, sends the automatic admission WhatsApp message (falling back to a manual WhatsApp button if the API fails), and lets an urgent/technical case defer the signed-consent upload with a recorded reason — none of that changed. What was missing was a way to go back and finish a deferred upload later: Edit Patient's document section now shows a "Signed Admission Consent Form" upload option whenever a patient's consent is not yet completed (with the exception reason shown, if one was recorded). Uploading it there marks the consent Completed, same as finishing it from Admissions.
- New "Pending signed consent" quick filter and count on the Patients page, and a matching "Pending Signed Consent" card on the Dashboard, so any admission still waiting on a signed/uploaded consent form is never silently forgotten — click either one to jump straight to the filtered list.
- No database changes; reuses the existing `patients.admission_consent_status` / `patient_documents` columns and storage bucket already used by the Admissions consent workflow.

## 2.14.54 — Pharmacy & Stores: Clean Up Item Names
- Some items were entered with that day's received quantity stuck onto the end of the name by mistake (e.g. "INJ.ADRENALINE 1ML-2" — the "-2" being the quantity received, not part of the medicine's name).
- New "Clean Up Item Names" button (Current Stock section, Pharmacy & Stores) finds every item ending in "-<number>" and shows a review list (current name vs. proposed clean name) before touching anything — untick, or hand-edit, any row that's actually a genuine code ending in a number (e.g. "U-40" on an insulin syringe) rather than a mistaken quantity, then Apply only renames the ticked rows.
- Renaming an item only changes its display name going forward; its stock history, receipts and past charges stay linked by the item's internal ID and are unaffected.
- No database changes; reuses the existing item-rename permission and RPC (`store_incharge_edit_item`) already used by "Edit Item".

## 2.14.53 — Fix: 2.14.52's category filter hid every existing item
- Bug: right after 2.14.52, since no item had a Standard Category yet, choosing "Tablets" (or any category) in Standard Item List made "Existing Inventory Item" show nothing at all — the exact items it was meant to help find were now hidden until someone tagged them first.
- Fix: the filter now only applies once at least one item is actually tagged with that category. Until then, picking a category shows every item in the section exactly as before (with a note that nothing is tagged yet), so Receive from Vendor is never blocked while tagging is still in progress.
- No database changes; frontend-only.

## 2.14.52 — Pharmacy & Stores: Existing Inventory Item now filters by category
- Bug: in Pharmacy & Stores > Receive from Vendor, choosing a category from "Standard Item List" (e.g. "Tablets") had no effect on the "Existing Inventory Item" dropdown below it — it always listed every item in the section.
- Fix: each store item can now be tagged with a Standard Category (new "Category" button on every item, next to Edit Item / Rate). Once tagged, choosing that category in "Standard Item List" filters "Existing Inventory Item" down to just those items. A new item added by picking a Standard Item List entry is tagged automatically.
- New "Assign Category to All (N)" button (shown when there's at least one untagged item that can be matched) auto-tags existing items from their recorded Dosage Form or a name match against the standard list — please spot-check the results using each item's Category button; a few guesses may need correcting, since this can't be certain for every item name.
- Pharmacy items picked from Standard Item List now prefill "Add Item Manually" with just a 3-letter prefix for that category (e.g. "TAB." for Tablets, matching the existing CAP./INJ. style already used in the catalog) — type the specific medicine name right after it, e.g. "TAB.Paracetamol". Consumables/Stores items are unaffected — picking one still fills in the full standard name as before.
- Database: `147_store_item_standard_category.sql` (adds `consumable_store_items.standard_category` and a new `store_incharge_set_standard_category` RPC; nothing existing changed).

## 2.14.51 — Fix: Discharge timeline mislabelled "Awaiting Accounts"
- Bug: on the Discharge timeline ("Discharge timeline & departure follow-up", shown on both Discharge and Discharge Clearance pages), a case that had not yet been approved by Admin/Manager — still Pending, or Returned/Rejected — was also labelled "Awaiting Accounts", the same wording used for a case genuinely waiting on Accounts. That made a case still stuck at Management review look like it should already be in Accounts' "Pending Financial Clearance" list, when it correctly wasn't there yet.
- Fix: the timeline now shows "Awaiting Management Approval" for a case still pending the Admin/Manager decision, and "Returned by Management" for one that was rejected, and only says "Awaiting Accounts" once Management has actually approved it. The "Pending Financial Clearance" table itself was not changed — it was already correct (it only ever listed management-approved, not-yet-cleared cases); only the timeline's wording was misleading.
- Not related to the 2.14.50 Consumables/Pharmacy pricing fix or any billing/charge-approval code — this is a separate, pre-existing label in `discharge-workflow.js` that a discharge review with a Pending or Rejected status surfaced.
- No database changes; frontend-only (`discharge-workflow.js`).

## 2.14.50 — Fix: Consumables/Pharmacy approval used a stale, invisible rate
- Bug: approving a Consumables/Pharmacy charge checked the amount against a leftover Charge Master tariff row from before Stores Master had its own rate column — a row Admin could not even see (Charge Master's Stores/Pharmacy table only shows/edits `consumable_store_items.charge_rate`). Editing the rate from Stores Master had no effect on what Accounts was required to approve, and it never accounted for quantity, so a request for more than 1 unit could only coincidentally match.
- Fix: Accounts' approval for Consumables/Pharmacy items now always checks against the live Stores Master rate × the request's quantity. The approval prompt also now shows the breakdown, e.g. "Store rate ₹70.00 × 3 = ₹210.00", instead of just a flat figure that didn't visibly connect to the ₹70 shown in Charge Master.
- Non-stock service tariffs (Nursing Procedures, Doctor Services, Lab, etc.) are unaffected — unchanged.
- Database: `146_store_charge_approval_live_rate.sql` (reissues `decide_bill_charge_request_v5` with the same name/parameters — nothing else to update).

## 2.14.49 — Charge Master: category filter + auto-generated IDs
- Charge Master (Admin) now has a Category dropdown next to the search box, with a live count per category (e.g. "Nursing Procedures (24)"), so items can be found instantly instead of scrolling through the full list — covers Consumables, Pharmacy, Nursing Procedures and every other category in one place.
- New Charge Master service items now get an ID automatically — one short prefix per category (NUR- Nursing Procedures, DOC- Doctor Services, DIA- Diagnostic/Imaging, LAB- Laboratory, BIO- Biomedical Equipment, and so on, same idea as the Stores Master CON-/PHA- codes). Admin no longer types a code when adding one.
- New "Assign Codes to All" button backfills a code onto every existing Charge Master item that was still showing "—", in one click.
- No database changes — IDs are generated in the app and saved to the existing `charge_code` column.

## 2.14.48 — Charge Register (view-only) for the Nursing Manager
- New "Charge Register" page (NURSING section) for Admin and the Nursing Manager: every charge raised by Nursing, with Accounts' decision and the approved tariff/rate, in one table.
- Filters: Status (All / Pending / Approved / Partially Approved / Returned — "Returned" is the existing "Rejected" decision, shown in plain language), Category, Patient, Raised By, and a date range with Today / This Week / This Month quick buttons. Summary cards at the top (All, Pending, Approved, Returned, Approved Value) double as one-click filters.
- Strictly view-only: no raise, edit, approve or reject action exists on this page — those stay on the existing Charge Approvals page, unchanged. No database changes — `bill_charge_requests` already grants SELECT to the Manager role, so this reuses existing data with no new tables, RLS or RPCs.

## 2.14.47 — Duplicate-billing guard between Nursing Procedures and Consumables/Pharmacy
- Adding or editing a Nursing Procedure Code now checks its name against both other procedure codes and every active Consumables/Pharmacy item; a close match (e.g. "Glucose Monitoring" vs "Glucose Strips") is blocked with a message naming the existing entry, instead of silently creating a second billable item for the same thing.
- Adding or editing a Consumables/Pharmacy store item now also checks against Nursing Procedure Codes, not just other store items, with a matching warning ("Already listed as a Nursing Procedure Code") when the same real thing could be charged from two catalogs.
- No database changes; both checks run in the app before saving, using the existing catalog tables. Names that carry their own distinguishing detail (a size, strength, gauge — or, for the strips vs. the procedure itself, a note like "for glucose monitoring") are still accepted as genuine, separate entries.

## 2.14.46 — Nursing Procedures workflow + Remove Item in Stores
- New "Nursing Procedures" page (NURSING section): Nurse requests a procedure from a maintained code list → Admin/Nursing Manager approves or declines → the requesting-shift Nurse confirms and starts it. Starting a procedure automatically raises the matching "Nursing Procedures" charge in the existing Charge Approvals pipeline (category, service name, quantity 1), so Accounts verifies and posts it exactly as before — nothing on the billing side changed.
- Procedure Code master (e.g. NP-001 · Dressing) maintained by Admin/Nursing Manager on the same page; seeded from the procedure names already used under Charge Master's "Nursing Procedures" category so tariffs line up from day one.
- Consumables/Pharmacy stock page: new "Remove Item" button (Admin and Nursing Manager only). An item never received or issued is deleted outright; an item with any stock history is deactivated instead, keeping past receipts/issues/charges intact.
- Database: `144_nursing_procedures_workflow.sql`, `145_stores_remove_item.sql`.

## 2.14.43 — Food Orders: period is visible and upcoming orders are listed
- Orders / History always show the period in view ("Showing 01-09-2026 to 24-09-2026 + upcoming 7 days"); the button is now "Change period".
- When the period reaches today, the list also includes the next 7 days, so tomorrow's orders appear without changing the period.
- Cut-off card: once today's cutoff for a meal has passed, it shows the next delivery date that can still be ordered (e.g. tomorrow's Breakfast, open until 9 PM).

## 2.14.42 — Food: no receiving before the delivery day
- A food order can be received only from 3 hours before its scheduled delivery time (IST). Earlier, tomorrow's Breakfast could be marked Received today.
- Receive button is disabled (with the opening time shown) until then; too-early orders are left out of the Receive list; receipt times before the window are rejected.
- Database: `143_food_receipt_time_guard.sql` (trigger on fv_events, plus a one-time correction that resets FOOD-FF7D4170 to Ordered).

## 2.14.41 — Food orders: clear help when an order already exists for the meal
- New order now checks the chosen date + meal straight away and shows who holds the slot (draft, placed order, cancellation pending, or received), with a button to open it — even for tomorrow's orders, which the Orders list (1st of month → today) did not show.
- Replaces the dead-end "An order already exists… open the existing order" message.

## 2.14.40 — Charge Master: cylinder variants no longer blocked as duplicates
- Editing/adding Oxygen Therapy B-type vs D-type lines (same hours) was rejected as "already exists" by the too-similar check. Names that each carry their own distinguishing detail (e.g. B-type vs D-type) are now treated as genuine variants.
- The duplicate warning now names the matching item instead of the generic "record already exists" message.

## 2.14.15 — Page crash protection + error log
- A crash on one page now shows "This page had a problem" on that page only; menu and other pages keep working.
- Errors after login no longer replace the whole app with "Application request error"; a small notice is shown instead.
- Errors are saved to the new `client_errors` table (Admin-only; see `client_errors_recent`).
- Database: `137_client_errors.sql`.

## 2.14.14 — app.js split into `src/app/`
- app.js is now built from 74 small files in `src/app/` by the "Build app.js" GitHub action (no change in behaviour).

## Repository tidy-up
- Release notes moved to `docs/release-notes/`, SQL files to `supabase/sql/`, Edge Function copies to `supabase/function-copies/`, unused old files to `archive/`.

## Earlier releases

### 2.14.10 — Mobile bills & charges structural fix
- Notes: [START_HERE.txt](docs/release-notes/START_HERE.txt)

### 2.14.09 — Safe isolated update
- Notes: [START_HERE_v2.14.09_SAFE_STORES_BILLING_IDLE.txt](docs/release-notes/START_HERE_v2.14.09_SAFE_STORES_BILLING_IDLE.txt)

### 2.14.05 — Global Family Mobile backend fix
- Database: `136_global_family_portal_mobile.sql`
- Notes: [README_FIRST_v2.14.05.txt](docs/release-notes/README_FIRST_v2.14.05.txt)

### 2.13.96 — WhatsApp Inbox completeness
- Database: `133_whatsapp_inbox_transport.sql`, `134_recover_whatsapp_history.sql`
- Notes: [RELEASE_2.13.96.md](docs/release-notes/RELEASE_2.13.96.md)

### 2.13.76 — Leave approval enhancement
- Database: `134_partial_leave_approval.sql`
- Notes: [RELEASE_2.13.76.md](docs/release-notes/RELEASE_2.13.76.md)

### 2.13.75 — Fixes only the reported application-shell issues after Additional Duty Assignment
- Database: `133_general_additional_duty.sql`
- Notes: [RELEASE_2.13.75.md](docs/release-notes/RELEASE_2.13.75.md)

### 2.13.73 — Additional Duty Assignment menu visibility fix
- Database: `132_additional_department_duty.sql`
- Notes: [RELEASE_2.13.73.md](docs/release-notes/RELEASE_2.13.73.md)

### 2.13.72 — Additional STD / Nursing Manager Duty
- Database: `130_mutual_department_leave_cover.sql`, `132_additional_department_duty.sql`
- Notes: [RELEASE_2.13.72.md](docs/release-notes/RELEASE_2.13.72.md)

### 2.13.71 — Allow synthetic bold specifically for Food & Diet Open/Closed status text
- Notes: [RELEASE_2.13.71.md](docs/release-notes/RELEASE_2.13.71.md)

### 2.13.70 — Display Breakfast, Lunch and Dinner cutoff notices as separate full-width rows on all screen…
- Notes: [RELEASE_2.13.70.md](docs/release-notes/RELEASE_2.13.70.md)

### 2.13.69 — Food & Diet now displays agreed order cutoffs on its main menu and Orders screen, with today's…
- Notes: [RELEASE_2.13.69.md](docs/release-notes/RELEASE_2.13.69.md)

### 2.13.68 — Dictate across pauses
- Notes: [RELEASE_2.13.68.md](docs/release-notes/RELEASE_2.13.68.md)

### 2.13.67 — Single-phrase dictation
- Notes: [RELEASE_2.13.67.md](docs/release-notes/RELEASE_2.13.67.md)

### 2.13.66 — Assessment save actions
- Notes: [RELEASE_2.13.66.md](docs/release-notes/RELEASE_2.13.66.md)

### 2.13.65 — Quick Tamil / English dictation
- Notes: [RELEASE_2.13.65.md](docs/release-notes/RELEASE_2.13.65.md)

### 2.13.64 — Refresh on every page
- Notes: [RELEASE_2.13.64.md](docs/release-notes/RELEASE_2.13.64.md)

### 2.13.63 — Persistent Accounts navigation
- Notes: [RELEASE_2.13.63.md](docs/release-notes/RELEASE_2.13.63.md)

### 2.13.62 — Global button feedback
- Notes: [RELEASE_2.13.62.md](docs/release-notes/RELEASE_2.13.62.md)

### 2.13.61 — Durable discharge history and late departure review
- Database: `131_discharge_history_and_departure.sql`
- Notes: [RELEASE_2.13.61.md](docs/release-notes/RELEASE_2.13.61.md)

### 2.13.60 — Automatic leave cover
- Database: `130_mutual_department_leave_cover.sql`
- Notes: [RELEASE_2.13.60.md](docs/release-notes/RELEASE_2.13.60.md)

### 2.13.59 — Simple duty assignment page
- Notes: [RELEASE_2.13.59.md](docs/release-notes/RELEASE_2.13.59.md)

### 2.13.58 — Daily temporary-duty notice
- Database: `129_duty_swap_daily_notice.sql`
- Notes: [RELEASE_2.13.58.md](docs/release-notes/RELEASE_2.13.58.md)

### 2.13.57 — Temporary department duty swaps
- Database: `128_temporary_department_swap.sql`
- Notes: [RELEASE_2.13.57.md](docs/release-notes/RELEASE_2.13.57.md)

### 2.13.56 — Management review of raised charges
- Database: `127_management_charge_review.sql`
- Notes: [RELEASE_2.13.56.md](docs/release-notes/RELEASE_2.13.56.md)

### 2.13.55 — Discharge clearance and billing display
- Database: `126_discharge_actual_financial_changes.sql`
- Notes: [RELEASE_2.13.55.md](docs/release-notes/RELEASE_2.13.55.md)

### 2.13.53 — Nursing Manager now has Communication → WhatsApp Inbox, restricted to food-vendor…
- Database: `125_nursing_food_whatsapp.sql`
- Notes: [RELEASE_2.13.53.md](docs/release-notes/RELEASE_2.13.53.md)

### 2.13.39 — Director's Office automatically carries dated Pending and In Progress items due today or…
- Database: `113_director_rollover_early_return.sql`
- Notes: [RELEASE_2.13.39.md](docs/release-notes/RELEASE_2.13.39.md)

### 2.12.83 — Erp 2.12.83
- Notes: [FOOD_VENDOR_v2.12.83.md](docs/release-notes/FOOD_VENDOR_v2.12.83.md)

### 2.12.73 — Staff workflows
- Database: `97_staff_workflow_safeguards.sql`, `98_review_live_permissions.sql`
- Notes: [DEPLOY_STAFF_IMPROVEMENTS_2.12.73.md](docs/release-notes/DEPLOY_STAFF_IMPROVEMENTS_2.12.73.md)

### 2.12.07 — Duty assignment control
- Notes: [START_HERE_v2.12.07_DUTY_ASSIGNMENT_SCOPE.txt](docs/release-notes/START_HERE_v2.12.07_DUTY_ASSIGNMENT_SCOPE.txt)

### 2.11.97 — Global compact mobile data layout
- Mobile horizontal-scroll audit
- Notes: [START_HERE_2.11.97.txt](docs/release-notes/START_HERE_2.11.97.txt), [MOBILE_HORIZONTAL_SCROLL_AUDIT_2.11.97.txt](docs/release-notes/MOBILE_HORIZONTAL_SCROLL_AUDIT_2.11.97.txt)

### 2.11.96 — Dedicated room reservation workflow
- Database: `117_room_reservation_expected_time.sql`
- Notes: [START_HERE_2.11.96.txt](docs/release-notes/START_HERE_2.11.96.txt)

### 2.11.95 — Colour-coded rooms dashboard
- Notes: [START_HERE_2.11.95.txt](docs/release-notes/START_HERE_2.11.95.txt)

### 2.11.94 — Compact mobile rooms
- Notes: [START_HERE_2.11.94.txt](docs/release-notes/START_HERE_2.11.94.txt)

### 2.11.93 — Patient bed count correction
- Notes: [START_HERE_2.11.93.txt](docs/release-notes/START_HERE_2.11.93.txt)

### 2.11.92 — Login account security register
- Notes: [START_HERE_2.11.92.txt](docs/release-notes/START_HERE_2.11.92.txt)

### 2.11.90 — Optional tamil understanding aid
- Database: `110_staff_tamil_translation.sql`
- Notes: [START_HERE_v2.11.90_ON_DEMAND_TAMIL_ASSIST.txt](docs/release-notes/START_HERE_v2.11.90_ON_DEMAND_TAMIL_ASSIST.txt)

### 2.11.89 — Opaque nurse to-do pop-up
- Notes: [START_HERE_v2.11.89_OPAQUE_NURSE_TODO_POPUP.txt](docs/release-notes/START_HERE_v2.11.89_OPAQUE_NURSE_TODO_POPUP.txt)

### 2.11.88 — Handover voice workflow for nurse to-do
- Notes: [START_HERE_v2.11.88_HANDOVER_VOICE_FOR_TODO.txt](docs/release-notes/START_HERE_v2.11.88_HANDOVER_VOICE_FOR_TODO.txt)

### 2.11.87 — Multi-sentence nurse voice
- Notes: [START_HERE_v2.11.87_MULTISENTENCE_NURSE_VOICE.txt](docs/release-notes/START_HERE_v2.11.87_MULTISENTENCE_NURSE_VOICE.txt)

### 2.11.86 — Full nurse voice translation
- Notes: [START_HERE_v2.11.86_FULL_VOICE_TRANSLATION.txt](docs/release-notes/START_HERE_v2.11.86_FULL_VOICE_TRANSLATION.txt)

### 2.11.85 — Nurse personal to-do list
- Database: `109_nurse_personal_todo.sql`
- Notes: [START_HERE_v2.11.85_NURSE_PERSONAL_TODO.txt](docs/release-notes/START_HERE_v2.11.85_NURSE_PERSONAL_TODO.txt)

### 2.11.62 — Required files only
- Database: `58_room_space_status_options.sql`
- Notes: [START_HERE_v2.11.62.txt](docs/release-notes/START_HERE_v2.11.62.txt)

### 2.11.60 — Care packages mobile alignment
- Notes: [START_HERE_v2.11.60.txt](docs/release-notes/START_HERE_v2.11.60.txt)

### 2.11.59 — Report readability and clipping fix
- Notes: [START_HERE_v2.11.59.txt](docs/release-notes/START_HERE_v2.11.59.txt)

### 2.11.58 — Global label : details alignment
- Notes: [START_HERE_v2.11.58.txt](docs/release-notes/START_HERE_v2.11.58.txt)

### 2.11.57 — Aligned handover plan
- Notes: [START_HERE_v2.11.57.txt](docs/release-notes/START_HERE_v2.11.57.txt)

### 2.11.56 — Meal duplicate and time control
- Database: `57_meal_duplicate_and_time_enforcement.sql`
- Notes: [START_HERE_v2.11.56.txt](docs/release-notes/START_HERE_v2.11.56.txt)

### 2.11.53 — Food, beverages and report layout
- Database: `97_food_beverage_nursing_entry.sql`
- Notes: [START_HERE_v2.11.53.txt](docs/release-notes/START_HERE_v2.11.53.txt)

### 2.11.52 — Detailed two-page intelligent report
- Notes: [START_HERE_v2.11.52.txt](docs/release-notes/START_HERE_v2.11.52.txt)

### 2.11.51 — One intelligent report generator
- Notes: [START_HERE_v2.11.51_UNIFIED_INTELLIGENT_REPORT.txt](docs/release-notes/START_HERE_v2.11.51_UNIFIED_INTELLIGENT_REPORT.txt)

### 2.11.50 — Whatsapp composer clear
- Notes: [START_HERE_v2.11.50_WHATSAPP_COMPOSER_CLEAR.txt](docs/release-notes/START_HERE_v2.11.50_WHATSAPP_COMPOSER_CLEAR.txt)

### 2.11.49 — Stores delegation control
- Database: `92_stores_position_and_std_delegation.sql`
- Notes: [START_HERE_v2.11.49_STORES_DELEGATION_CONTROL.txt](docs/release-notes/START_HERE_v2.11.49_STORES_DELEGATION_CONTROL.txt)

### 2.11.48 — Independent stores
- Database: `92_stores_position_and_std_delegation.sql`
- Notes: [START_HERE_v2.11.48_INDEPENDENT_STORES.txt](docs/release-notes/START_HERE_v2.11.48_INDEPENDENT_STORES.txt)

### 2.11.47 — Stores restored
- Database: `90_patient_consumables_indent_workflow.sql`, `91_consumables_store_inventory.sql`
- Notes: [START_HERE_v2.11.47_STORES_RESTORED.txt](docs/release-notes/START_HERE_v2.11.47_STORES_RESTORED.txt)

### 2.11.46 — General handover worklist
- Database: `97_general_handover_tasks.sql`
- Notes: [START_HERE_v2.11.46_GENERAL_HANDOVER.txt](docs/release-notes/START_HERE_v2.11.46_GENERAL_HANDOVER.txt)

### 2.11.45 — Handover tasks in priority worklist
- Notes: [START_HERE_v2.11.45_HANDOVER_PRIORITY_WORKLIST.txt](docs/release-notes/START_HERE_v2.11.45_HANDOVER_PRIORITY_WORKLIST.txt)

### 2.11.44 — Logo theme and priority worklist guide
- Notes: [START_HERE_v2.11.44_SAMARA_THEME_PRIORITY_WORKLIST.txt](docs/release-notes/START_HERE_v2.11.44_SAMARA_THEME_PRIORITY_WORKLIST.txt)

### 2.11.43 — Handover identification
- Notes: [START_HERE_v2.11.43_HANDOVER_IDENTIFICATION.txt](docs/release-notes/START_HERE_v2.11.43_HANDOVER_IDENTIFICATION.txt)

### 2.11.42 — Dashboard shift handovers
- Notes: [START_HERE_v2.11.42_DASHBOARD_HANDOVERS.txt](docs/release-notes/START_HERE_v2.11.42_DASHBOARD_HANDOVERS.txt)

### 2.11.41 — Mobile voice review button
- Notes: [START_HERE_v2.11.41_MOBILE_VOICE_BUTTON.txt](docs/release-notes/START_HERE_v2.11.41_MOBILE_VOICE_BUTTON.txt)

### 2.11.40 — Patient-locked shift handover
- Notes: [START_HERE_v2.11.40_PATIENT_LOCKED_HANDOVER.txt](docs/release-notes/START_HERE_v2.11.40_PATIENT_LOCKED_HANDOVER.txt)

### 2.11.39 — Gemini primary voice + openai automatic fallback
- Notes: [GEMINI_OPENAI_SETUP_SAMARA_v2.11.39.txt](docs/release-notes/GEMINI_OPENAI_SETUP_SAMARA_v2.11.39.txt)

### 2.11.38 — Google chirp 2 primary voice + openai fallback
- Notes: [GOOGLE_SPEECH_SETUP_SAMARA_v2.11.38.txt](docs/release-notes/GOOGLE_SPEECH_SETUP_SAMARA_v2.11.38.txt)

### 2.11.36 — Global nursing voice input
- Notes: [START_HERE_v2.11.36_GLOBAL_NURSING_VOICE.txt](docs/release-notes/START_HERE_v2.11.36_GLOBAL_NURSING_VOICE.txt)

### 2.11.35 — Patient Medication Table View
- Notes: [START_HERE_v2.11.35_PATIENT_MEDICATION_TABLE.txt](docs/release-notes/START_HERE_v2.11.35_PATIENT_MEDICATION_TABLE.txt)

### 2.11.34 — Patient File Medication History
- Notes: [START_HERE_v2.11.34_PATIENT_MEDICATION_HISTORY.txt](docs/release-notes/START_HERE_v2.11.34_PATIENT_MEDICATION_HISTORY.txt)

### 2.11.33 — Explicit Enable / Disable Mobile Notification Controls
- Notes: [README.txt](docs/release-notes/README.txt)

### 2.11.26 — Medication Doctor Review / Prescription Revision
- Notes: [START_HERE_v2.11.26_MEDICATION_REVIEW.txt](docs/release-notes/START_HERE_v2.11.26_MEDICATION_REVIEW.txt)

### 2.11.25 — Fixes
- Notes: [START_HERE_v2.11.25_MODAL_LAYOUT_STABLE.txt](docs/release-notes/START_HERE_v2.11.25_MODAL_LAYOUT_STABLE.txt)

### 2.11.24 — Changes
- Notes: [START_HERE_v2.11.24_POPUP_BOTTOM_CLOSE_QUICK_EDIT_SAFE.txt](docs/release-notes/START_HERE_v2.11.24_POPUP_BOTTOM_CLOSE_QUICK_EDIT_SAFE.txt)

### 2.11.23 — Changes
- Notes: [START_HERE_v2.11.23_POPUP_BOTTOM_CLOSE_QUICK_EDIT.txt](docs/release-notes/START_HERE_v2.11.23_POPUP_BOTTOM_CLOSE_QUICK_EDIT.txt)

### 2.11.15 — Update popup fix
- Consumables stores
- Database: `91_consumables_store_inventory.sql`
- Notes: [START_HERE_v2.11.15_UPDATE_POPUP_FIX.txt](docs/release-notes/START_HERE_v2.11.15_UPDATE_POPUP_FIX.txt), [START_HERE_v2.11.15_STORES.txt](docs/release-notes/START_HERE_v2.11.15_STORES.txt)

### 2.11.14 — Patient consumables indent workflow
- Available beds + occupied beds details
- Database: `90_patient_consumables_indent_workflow.sql`
- Notes: [START_HERE_v2.11.14_PATIENT_CONSUMABLES.txt](docs/release-notes/START_HERE_v2.11.14_PATIENT_CONSUMABLES.txt), [START_HERE_v2.11.14.txt](docs/release-notes/START_HERE_v2.11.14.txt)

### 2.11.13 — Available beds click – route fix
- Notes: [START_HERE_v2.11.13.txt](docs/release-notes/START_HERE_v2.11.13.txt)

### 2.11.12 — Compact available beds details
- Notes: [START_HERE_v2.11.12.txt](docs/release-notes/START_HERE_v2.11.12.txt)

### 2.11.11 — Available beds count – corrected
- Notes: [START_HERE_v2.11.11.txt](docs/release-notes/START_HERE_v2.11.11.txt)

### 2.11.10 — Dashboard drill-downs – windows + mobile
- Notes: [START_HERE_v2.11.10.txt](docs/release-notes/START_HERE_v2.11.10.txt)

### 2.11.09 — Dashboard → available beds details
- Notes: [START_HERE_v2.11.09.txt](docs/release-notes/START_HERE_v2.11.09.txt)

### 2.11.07 — Dashboard financial + clinical actions fix
- Notes: [START_HERE_v2.11.07.txt](docs/release-notes/START_HERE_v2.11.07.txt)

### 2.11.06 — Active employee count – single source of truth
- Notes: [START_HERE_v2.11.06.txt](docs/release-notes/START_HERE_v2.11.06.txt)

### 2.11.05 — Admission Details readability fix
- Notes: [START_HERE_v2.11.05.txt](docs/release-notes/START_HERE_v2.11.05.txt)

### 2.11.04 — Patient card – admission details
- Notes: [START_HERE_v2.11.04.txt](docs/release-notes/START_HERE_v2.11.04.txt)

### 2.11.03 — Dashboard current patients filter
- Notes: [START_HERE_v2.11.03.txt](docs/release-notes/START_HERE_v2.11.03.txt)

### 2.11.02 — Complete bill – logo / date / compact room & nursing summary
- Notes: [START_HERE_v2.11.02.txt](docs/release-notes/START_HERE_v2.11.02.txt)

### 2.11.01 — Package expiry whatsapp quick-reply buttons
- Database: `108_package_quick_reply_requests.sql`
- Notes: [START_HERE_v2.11.01.txt](docs/release-notes/START_HERE_v2.11.01.txt)

### 2.11.00 — Package expiry + renewal + auto daily-fare + whatsapp
- Database: `107_package_expiry_renewal_dashboard.sql`
- Notes: [START_HERE_v2.11.00.txt](docs/release-notes/START_HERE_v2.11.00.txt)

### 2.10.63 — Patient File Layout Fix
- Notes: [START_HERE_v2.10.63.txt](docs/release-notes/START_HERE_v2.10.63.txt)

### 2.10.62 — Purpose
- Notes: [START_HERE_v2.10.62.txt](docs/release-notes/START_HERE_v2.10.62.txt)

### 2.10.59 — Automatic admission whatsapp
- Notes: [START_HERE_v2.10.59_AUTO_ADMISSION_WHATSAPP.txt](docs/release-notes/START_HERE_v2.10.59_AUTO_ADMISSION_WHATSAPP.txt)

### 2.10.58 — Auth profile load fix
- Notes: [README_REPLACE.txt](docs/release-notes/README_REPLACE.txt)

### 2.10.52 — Nurse manager voice task routing fix
- Notes: [START_HERE_v2.10.52.txt](docs/release-notes/START_HERE_v2.10.52.txt)

### 2.10.51 — Nurse Manager Tamil / English Voice Task Access
- Notes: [START_HERE_v2.10.51_NURSE_MANAGER_VOICE_TASK_ACCESS.txt](docs/release-notes/START_HERE_v2.10.51_NURSE_MANAGER_VOICE_TASK_ACCESS.txt)

### 2.10.50 — Employment & salary panel restore
- Notes: [START_HERE_v2.10.50_EMPLOYMENT_HISTORY_PANEL_RESTORE.txt](docs/release-notes/START_HERE_v2.10.50_EMPLOYMENT_HISTORY_PANEL_RESTORE.txt)

### 2.10.48 — Employment action layout cleanup
- Notes: [START_HERE_v2.10.48_EMPLOYMENT_ACTION_LAYOUT.txt](docs/release-notes/START_HERE_v2.10.48_EMPLOYMENT_ACTION_LAYOUT.txt)

### 2.10.47 — Employment & salary history
- Database: `116_employee_employment_salary_history.sql`
- Notes: [START_HERE_v2.10.47_EMPLOYMENT_HISTORY_SALARY.txt](docs/release-notes/START_HERE_v2.10.47_EMPLOYMENT_HISTORY_SALARY.txt)

### 2.10.46 — Employee edit save fix
- Database: `115_employee_profile_edit_permission_fix.sql`
- Notes: [START_HERE_v2.10.46_EMPLOYEE_EDIT_SAVE_FIX.txt](docs/release-notes/START_HERE_v2.10.46_EMPLOYEE_EDIT_SAVE_FIX.txt)

### 2.10.45 — Nurse manager designation fix
- Database: `114_nurse_manager_designation_compatibility.sql`
- Notes: [START_HERE_v2.10.45_NURSE_MANAGER_DESIGNATION_FIX.txt](docs/release-notes/START_HERE_v2.10.45_NURSE_MANAGER_DESIGNATION_FIX.txt)

### 2.10.44 — Nursing manager role fix
- Database: `113_nursing_manager_personal_tasks.sql`
- Notes: [START_HERE_v2.10.44_NURSING_MANAGER_ROLE_FIX.txt](docs/release-notes/START_HERE_v2.10.44_NURSING_MANAGER_ROLE_FIX.txt)

### 2.10.43 — Nursing manager voice quick tasks
- Database: `113_nursing_manager_personal_tasks.sql`
- Notes: [START_HERE_v2.10.43_NURSING_MANAGER_VOICE_TASKS.txt](docs/release-notes/START_HERE_v2.10.43_NURSING_MANAGER_VOICE_TASKS.txt)

### 2.10.42 — Director's office mobile dashboard tap fix
- Notes: [START_HERE_v2.10.42_DIRECTOR_OFFICE_MOBILE_TAP_FIX.txt](docs/release-notes/START_HERE_v2.10.42_DIRECTOR_OFFICE_MOBILE_TAP_FIX.txt)

### 2.10.41 — Global dashboard tap-through
- Notes: [START_HERE_v2.10.41_GLOBAL_DASHBOARD_NAV.txt](docs/release-notes/START_HERE_v2.10.41_GLOBAL_DASHBOARD_NAV.txt)

### 2.10.40 — DIRECTOR'S OFFICE iPHONE LAYOUT FIX
- Notes: [START_HERE_v2.10.40_iPHONE_LAYOUT_FIX.txt](docs/release-notes/START_HERE_v2.10.40_iPHONE_LAYOUT_FIX.txt)

### 2.10.38 — Iphone + android voice entry
- Notes: [START_HERE_v2.10.38_MOBILE_VOICE.txt](docs/release-notes/START_HERE_v2.10.38_MOBILE_VOICE.txt)

### 2.10.36 — Quick task save flow
- Notes: [START_HERE_v2.10.36.txt](docs/release-notes/START_HERE_v2.10.36.txt)

### 2.10.35 — Voice day part
- Notes: [START_HERE_v2.10.35.txt](docs/release-notes/START_HERE_v2.10.35.txt)

### 2.10.34 — Voice date handling
- Notes: [START_HERE_v2.10.34.txt](docs/release-notes/START_HERE_v2.10.34.txt)

### 2.10.33 — Quick task crash fix
- Notes: [START_HERE_v2.10.33.txt](docs/release-notes/START_HERE_v2.10.33.txt)

### 2.10.17 — Website whatsapp auto reply
- Notes: [START_HERE_v2.10.17_WHATSAPP_AUTO_REPLY.txt](docs/release-notes/START_HERE_v2.10.17_WHATSAPP_AUTO_REPLY.txt)

### 2.10.13 — Complete bill header – samara logo
- Notes: [START_HERE_v2.10.13.txt](docs/release-notes/START_HERE_v2.10.13.txt)

### 2.10.03 — Discharge WhatsApp sending state and exact Inbox copy
- Notes: [DEPLOY_v2.10.03.txt](docs/release-notes/DEPLOY_v2.10.03.txt)

### 2.10.02 — Discharge WhatsApp Inbox guarantee
- Notes: [DEPLOY_v2.10.02.txt](docs/release-notes/DEPLOY_v2.10.02.txt)

### 2.10.01 — Discharge nurse names and automatic family WhatsApp
- Database: `98_discharge_nurse_names_auto_whatsapp.sql`
- Notes: [DEPLOY_v2.10.01.txt](docs/release-notes/DEPLOY_v2.10.01.txt)

### 2.10.00 — General follow-up reply menu
- Notes: [START_HERE_V2_10_00_REPLY_MENU.txt](docs/release-notes/START_HERE_V2_10_00_REPLY_MENU.txt)

### 2.9.99 — Whatsapp sent/received parity
- Notes: [START_HERE_V2_9_99_WHATSAPP_PARITY.txt](docs/release-notes/START_HERE_V2_9_99_WHATSAPP_PARITY.txt)

### 2.9.98 — Whatsapp logo header
- Notes: [START_HERE_V2_9_98_WHATSAPP_LOGO.txt](docs/release-notes/START_HERE_V2_9_98_WHATSAPP_LOGO.txt)

### 2.9.94 — Shift medication and compact tasks
- Notes: [START_HERE_v2.9.94.txt](docs/release-notes/START_HERE_v2.9.94.txt)

### 2.9.93 — Employee welcome inbox display
- Notes: [START_HERE_v2.9.93.txt](docs/release-notes/START_HERE_v2.9.93.txt)

### 2.9.92 — Employee welcome template format fix
- Notes: [START_HERE_v2.9.92.txt](docs/release-notes/START_HERE_v2.9.92.txt)

### 2.9.91 — Employee welcome template parameter fix
- Notes: [START_HERE_v2.9.91.txt](docs/release-notes/START_HERE_v2.9.91.txt)

### 2.9.90 — Employee welcome whatsapp api
- Notes: [START_HERE_v2.9.90.txt](docs/release-notes/START_HERE_v2.9.90.txt)

### 2.9.89 — Direct message layout fix
- Notes: [START_HERE_v2.9.89.txt](docs/release-notes/START_HERE_v2.9.89.txt)

### 2.9.88 — Direct messages + templates
- Notes: [START_HERE_v2.9.88.txt](docs/release-notes/START_HERE_v2.9.88.txt)

### 2.9.87 — Startup fix
- Emergency whatsapp communication
- Notes: [START_HERE_v2.9.87.txt](docs/release-notes/START_HERE_v2.9.87.txt), [META_TEMPLATES_AND_INSTALL.txt](docs/release-notes/META_TEMPLATES_AND_INSTALL.txt)

### 2.9.86 — Relevant files only
- Notes: [START_HERE_v2.9.86.txt](docs/release-notes/START_HERE_v2.9.86.txt)

### 2.9.85 — Family portal whatsapp resend
- Notes: [START_HERE_v2.9.85.txt](docs/release-notes/START_HERE_v2.9.85.txt)

### 2.9.84 — Whatsapp template branding + automated badge
- Notes: [START_HERE_v2.9.84.txt](docs/release-notes/START_HERE_v2.9.84.txt)

### 2.9.83 — Automatic daily payable test + family portal button
- Notes: [START_HERE_v2.9.83.txt](docs/release-notes/START_HERE_v2.9.83.txt)

### 2.9.82 — Whatsapp inbox + daily payable button fix
- Notes: [START_HERE_v2.9.82.txt](docs/release-notes/START_HERE_v2.9.82.txt)

### 2.9.81 — Payment / daily payable whatsapp chat logging
- Notes: [START_HERE_v2.9.81.txt](docs/release-notes/START_HERE_v2.9.81.txt)

### 2.9.80 — Payment whatsapp automation
- Database: `98_payment_whatsapp_auto.sql`
- Notes: [START_HERE_v2.9.80.txt](docs/release-notes/START_HERE_v2.9.80.txt)

### 2.9.79 — Family portal whatsapp presentation
- Notes: [START_HERE_v2.9.79.txt](docs/release-notes/START_HERE_v2.9.79.txt)

### 2.9.78 — Whatsapp inbox logging fix
- Notes: [START_HERE_v2.9.78.txt](docs/release-notes/START_HERE_v2.9.78.txt)

### 2.9.77 — Whatsapp acceptance verification
- Notes: [START_HERE_v2.9.77.txt](docs/release-notes/START_HERE_v2.9.77.txt)

### 2.9.76 — Medication admission boundary reliability
- Notes: [START_HERE_v2.9.76.txt](docs/release-notes/START_HERE_v2.9.76.txt)

### 2.9.74 — Leave & permission workflow
- Database: `97_leave_permission_workflow.sql`
- Notes: [START_HERE_2.9.74.txt](docs/release-notes/START_HERE_2.9.74.txt)

### 2.9.73 — Nurse medication window
- Notes: [START_HERE_ERP_2_9_73_NURSE_MEDICATION_WINDOW.txt](docs/release-notes/START_HERE_ERP_2_9_73_NURSE_MEDICATION_WINDOW.txt)

### 2.9.70 — Mobile clinical usability
- Notes: [START_HERE_ERP_2_9_70_MOBILE_CLINICAL_USABILITY.txt](docs/release-notes/START_HERE_ERP_2_9_70_MOBILE_CLINICAL_USABILITY.txt)

### 2.9.69 — Admission resume recovery
- Notes: [START_HERE_ERP_2_9_69_ADMISSION_RESUME_RECOVERY.txt](docs/release-notes/START_HERE_ERP_2_9_69_ADMISSION_RESUME_RECOVERY.txt)

### 2.9.68 — Management escalation auto-hide
- Notes: [START_HERE_ERP_2_9_68_MANAGEMENT_ESCALATION_AUTO_HIDE.txt](docs/release-notes/START_HERE_ERP_2_9_68_MANAGEMENT_ESCALATION_AUTO_HIDE.txt)

### 2.9.58 — Automatic email footer
- Notes: [START_HERE_ERP_2_9_58_MAIL_SIGNATURE_FOOTER.txt](docs/release-notes/START_HERE_ERP_2_9_58_MAIL_SIGNATURE_FOOTER.txt)

### 2.9.54 — Whatsapp chat layout + media archive
- Notes: [START_HERE_ERP_2_9_54_WHATSAPP_CHAT_MEDIA_ARCHIVE.txt](docs/release-notes/START_HERE_ERP_2_9_54_WHATSAPP_CHAT_MEDIA_ARCHIVE.txt)

### 2.9.48 — Whatsapp inbox media + approved template reply
- Notes: [START_HERE_ERP_2_9_48_WHATSAPP_MEDIA_TEMPLATE.txt](docs/release-notes/START_HERE_ERP_2_9_48_WHATSAPP_MEDIA_TEMPLATE.txt)

### 2.9.47 — Mobile background push notifications
- Database: `97_mobile_background_push.sql`
- Notes: [START_HERE_ERP_2_9_47_MOBILE_BACKGROUND_PUSH.txt](docs/release-notes/START_HERE_ERP_2_9_47_MOBILE_BACKGROUND_PUSH.txt)

### 2.9.14 — Changes
- Notes: [README_v2.9.14.txt](docs/release-notes/README_v2.9.14.txt)

### 2.9.13 — One-time neural voice setup
- Notes: [SETUP_v2.9.13_NEURAL_VOICE.txt](docs/release-notes/SETUP_v2.9.13_NEURAL_VOICE.txt)

### 2.9.03 — Tamil Clinical Voice Wording Update
- Notes: [START_HERE_ERP_2_9_03_TAMIL_URGENT_REQUEST_VOICE.txt](docs/release-notes/START_HERE_ERP_2_9_03_TAMIL_URGENT_REQUEST_VOICE.txt)

### 2.9.01 — Branded expanded clinical alerts
- Notes: [START_HERE_ERP_2_9_01_BRANDED_EXPANDED_CLINICAL_ALERTS.txt](docs/release-notes/START_HERE_ERP_2_9_01_BRANDED_EXPANDED_CLINICAL_ALERTS.txt)

### 2.9.00 — Smart hover + notification centre
- Notes: [START_HERE_ERP_2_9_00_SMART_HOVER_NOTIFICATION_CENTRE.txt](docs/release-notes/START_HERE_ERP_2_9_00_SMART_HOVER_NOTIFICATION_CENTRE.txt)

### 2.8.99 — Clinical alert test
- Notes: [START_HERE_ERP_2_8_99_CLINICAL_ALERT_TEST.txt](docs/release-notes/START_HERE_ERP_2_8_99_CLINICAL_ALERT_TEST.txt)

### 2.8.98 — Nurse clinical alerts → escalation action
- Notes: [START_HERE_ERP_2_8_98_NURSE_ESCALATION_ACTION.txt](docs/release-notes/START_HERE_ERP_2_8_98_NURSE_ESCALATION_ACTION.txt)

### 2.8.97 — Escalation corrective package
- Database: `111_FREEZE_ORIGINAL_CLINICAL_REGULARISATION_14_ITEMS.sql`
- Notes: [START_HERE_ERP_2_8_97_ESCALATION_CORRECTIVE.txt](docs/release-notes/START_HERE_ERP_2_8_97_ESCALATION_CORRECTIVE.txt)

### 2.8.96 — Clinical escalations dashboard
- Database: `110_CLINICAL_ESCALATION_DASHBOARD_MANAGER_ADMIN.sql`
- Notes: [START_HERE_ERP_2_8_96_CLINICAL_ESCALATIONS.txt](docs/release-notes/START_HERE_ERP_2_8_96_CLINICAL_ESCALATIONS.txt)

### 2.8.95 — Clinical alert regularisation
- Database: `109_CLINICAL_ALERT_REGULARISATION_ONE_BACKLOG_THEN_NORMAL.sql`
- Notes: [START_HERE_ERP_2_8_95_CLINICAL_REGULARISATION.txt](docs/release-notes/START_HERE_ERP_2_8_95_CLINICAL_REGULARISATION.txt)

### 2.8.94 — Medication alert count logic only
- Notes: [START_HERE_ERP_2_8_94_MEDICATION_ALERT_COUNTS.txt](docs/release-notes/START_HERE_ERP_2_8_94_MEDICATION_ALERT_COUNTS.txt)

### 2.8.93 — Medication / nursing dashboard only
- Database: `108_MEDICATION_CLEANUP_ACTIVE_PATIENT_DASHBOARD.sql`
- Notes: [START_HERE_ERP_2_8_93_MEDICATION_DASHBOARD.txt](docs/release-notes/START_HERE_ERP_2_8_93_MEDICATION_DASHBOARD.txt)

### 2.8.83 — Automatic Accountant Handover
- Database: `87_accountant_auto_handover_financial_control.sql`
- Notes: [README_2.8.83_FINANCIAL_HANDOVER.txt](docs/release-notes/README_2.8.83_FINANCIAL_HANDOVER.txt)

### 2.8.80 — Discharge refund & financial security
- Database: `85_discharge_refund_dual_control_security.sql`
- Notes: [START_HERE_ERP_2_8_80_FINANCIAL_SECURITY.txt](docs/release-notes/START_HERE_ERP_2_8_80_FINANCIAL_SECURITY.txt)

### 2.8.79 — Clinical dashboard & erp alert fix
- Database: `84_clinical_notification_visibility_fix.sql`
- Notes: [README_2.8.79_CLINICAL_FIX.txt](docs/release-notes/README_2.8.79_CLINICAL_FIX.txt)

### 2.8.78 — Mobile login scrolling fix
- Notes: [START_HERE_2_8_78.txt](docs/release-notes/START_HERE_2_8_78.txt)

### 2.8.74 — Change
- Notes: [START_HERE_ERP_2_8_74_THREE_ADMINS_SEPARATED.txt](docs/release-notes/START_HERE_ERP_2_8_74_THREE_ADMINS_SEPARATED.txt)

### 2.8.71 — Fixes
- Notes: [START_HERE_ERP_2_8_71_EMPLOYEE_DASHBOARD_FIX.txt](docs/release-notes/START_HERE_ERP_2_8_71_EMPLOYEE_DASHBOARD_FIX.txt)

### 2.8.70 — Employee Department Dashboard + System Administrator Separation
- Notes: [START_HERE_ERP_2_8_70.txt](docs/release-notes/START_HERE_ERP_2_8_70.txt)

### 2.8.69 — Global mobile header update
- Notes: [START_HERE_ERP_2_8_69_STICKY_MOBILE_HEADER.txt](docs/release-notes/START_HERE_ERP_2_8_69_STICKY_MOBILE_HEADER.txt)

### 2.8.67 — Purpose
- Notes: [START_HERE_ERP_2_8_67.txt](docs/release-notes/START_HERE_ERP_2_8_67.txt)

### 2.8.66 — Reliable Mobile Update
- Notes: [START_HERE_2_8_66.txt](docs/release-notes/START_HERE_2_8_66.txt)

### 2.8.65 — 1
- Notes: [START_HERE_2_8_65.txt](docs/release-notes/START_HERE_2_8_65.txt)

### 2.8.64 — Mobile patient list
- Notes: [START_HERE_ERP_2_8_64.txt](docs/release-notes/START_HERE_ERP_2_8_64.txt)

### 2.8.62 — Mobile compact patients + touch dashboard
- Notes: [START_HERE_ERP_2_8_62_MOBILE_COMPACT_TOUCH.txt](docs/release-notes/START_HERE_ERP_2_8_62_MOBILE_COMPACT_TOUCH.txt)

### 2.8.60 — Change
- Notes: [START_HERE_ERP_2_8_60_EMPLOYEE_ROW_TOUCH.txt](docs/release-notes/START_HERE_ERP_2_8_60_EMPLOYEE_ROW_TOUCH.txt)

### 2.8.59 — Mobile auto update prompt
- Notes: [START_HERE_ERP_2_8_59_AUTO_UPDATE_PROMPT.txt](docs/release-notes/START_HERE_ERP_2_8_59_AUTO_UPDATE_PROMPT.txt)

### 2.8.58 — Mobile patient row navigation
- Notes: [START_HERE_ERP_2_8_58_MOBILE_PATIENT_ROW.txt](docs/release-notes/START_HERE_ERP_2_8_58_MOBILE_PATIENT_ROW.txt)

### 2.8.57 — Formatted titan email viewer
- Notes: [START_HERE_ERP_2_8_57_FORMATTED_HTML_MAIL.txt](docs/release-notes/START_HERE_ERP_2_8_57_FORMATTED_HTML_MAIL.txt)

### 2.8.52 — Fast titan mail
- Notes: [START_HERE_ERP_2_8_52_FAST_TITAN_MAIL.txt](docs/release-notes/START_HERE_ERP_2_8_52_FAST_TITAN_MAIL.txt)

### 2.8.51 — Whatsapp inbox
- Database: `87_whatsapp_inbox_public_conversations.sql`
- Notes: [START_HERE_ERP_2_8_51_WHATSAPP_INBOX.txt](docs/release-notes/START_HERE_ERP_2_8_51_WHATSAPP_INBOX.txt)

### 2.8.50 — Family portal whatsapp template length fix
- Notes: [START_HERE_ERP_2_8_50_FAMILY_PORTAL_TEMPLATE_LENGTH_FIX.txt](docs/release-notes/START_HERE_ERP_2_8_50_FAMILY_PORTAL_TEMPLATE_LENGTH_FIX.txt)

### 2.8.47 — Family/patient whatsapp api mapping
- Notes: [START_HERE_ERP_2_8_47_FAMILY_WHATSAPP_API.txt](docs/release-notes/START_HERE_ERP_2_8_47_FAMILY_WHATSAPP_API.txt)

### 2.8.45 — Return / rectification fix
- Database: `85_hr_return_rectification_legacy_contact_fix.sql`
- Notes: [START_HERE_ERP_2_8_45_RETURN_RECTIFICATION.txt](docs/release-notes/START_HERE_ERP_2_8_45_RETURN_RECTIFICATION.txt)

### 2.8.44 — Whatsapp chat log
- Database: `84_hr_whatsapp_chat_log.sql`
- Notes: [START_HERE_ERP_2_8_44_WHATSAPP_CHAT.txt](docs/release-notes/START_HERE_ERP_2_8_44_WHATSAPP_CHAT.txt)

### 2.8.43 — HR Applicant File + WhatsApp Confirmation Fix
- Database: `83_hr_whatsapp_history_policy_fix.sql`
- Notes: [START_HERE_ERP_2_8_43_HR_APPLICANT_FILE.txt](docs/release-notes/START_HERE_ERP_2_8_43_HR_APPLICANT_FILE.txt)

### 2.8.42 — Hr whatsapp communication history
- Database: `82_hr_whatsapp_communication_history.sql`
- Notes: [START_HERE_ERP_2_8_42_HR_WHATSAPP_HISTORY.txt](docs/release-notes/START_HERE_ERP_2_8_42_HR_WHATSAPP_HISTORY.txt)

### 2.8.38 — Daily moments (7-day family video clips)
- Database: `81_daily_moments_7_day_family_videos.sql`
- Notes: [START_HERE_DAILY_MOMENTS_2_8_38.txt](docs/release-notes/START_HERE_DAILY_MOMENTS_2_8_38.txt)

### 2.8.35 — Inauguration invitation
- Notes: [UPLOAD_INSTRUCTIONS.txt](docs/release-notes/UPLOAD_INSTRUCTIONS.txt)

### 1.3.51 — Individual clinical charges module patch
- Database: `55_clinical_charges_revenue_management.sql`
- Notes: [START_HERE_1_3_51.txt](docs/release-notes/START_HERE_1_3_51.txt)

### 1.1.4 — Compact Medication Time Picker
- Notes: [START_HERE_ERP_1_1_4.md](docs/release-notes/START_HERE_ERP_1_1_4.md)

### 1.1.3 — Medication Time Dropdown
- Notes: [START_HERE_ERP_1_1_3.md](docs/release-notes/START_HERE_ERP_1_1_3.md)

### 1.1.2 — Login Layout & Existing Patient Care-Plan Upgrade
- Notes: [START_HERE_ERP_1_1_2.md](docs/release-notes/START_HERE_ERP_1_1_2.md)

### 1.1.1 — Password Recovery & Security
- Database: `28_password_recovery_security.sql`
- Notes: [START_HERE_ERP_1_1_1.md](docs/release-notes/START_HERE_ERP_1_1_1.md)

### 1.1.0 — Master Database Baseline
- Medication Frequency and Duration
- Database: `26_medication_frequency_duration.sql`, `27_master_database_baseline.sql`
- Notes: [START_HERE_ERP_1_1_0.md](docs/release-notes/START_HERE_ERP_1_1_0.md), [START_HERE_ERP_1_0_26.md](docs/release-notes/START_HERE_ERP_1_0_26.md)

### 1.0.25 — Role-Based Nursing Workspace
- Notes: [START_HERE_ERP_1_0_25.md](docs/release-notes/START_HERE_ERP_1_0_25.md)

### 1.0.24 — Corrected Schema Repair
- Database: `25_complete_schema_compatibility.sql`
- Notes: [START_HERE_ERP_1_0_24.md](docs/release-notes/START_HERE_ERP_1_0_24.md)

### 1.0.23 — Consolidated Compatibility Fix
- Database: `24_consolidated_module_compatibility.sql`
- Notes: [START_HERE_ERP_1_0_23.md](docs/release-notes/START_HERE_ERP_1_0_23.md)

### 1.0.21 — Patient Dropdown Access Fix
- Database: `23_patient_dropdown_access_only.sql`
- Notes: [START_HERE_ERP_1_0_21.md](docs/release-notes/START_HERE_ERP_1_0_21.md)

### 1.0.20 — First Login and Version Cache Fix
- Database: `22_first_login_completion_resilience.sql`
- Notes: [START_HERE_ERP_1_0_20.md](docs/release-notes/START_HERE_ERP_1_0_20.md)

### 1.0.19 — Password Change Only Fix
- Database: `21_password_change_completion_only.sql`
- Notes: [START_HERE_ERP_1_0_19_PASSWORD_CHANGE_ONLY_FIX.md](docs/release-notes/START_HERE_ERP_1_0_19_PASSWORD_CHANGE_ONLY_FIX.md)

### 1.0.18 — Nurse/Caregiver Login-Only Fix
- Database: `20_login_only_profile_link_repair.sql`
- Notes: [START_HERE_ERP_1_0_18_LOGIN_ONLY_FIX.md](docs/release-notes/START_HERE_ERP_1_0_18_LOGIN_ONLY_FIX.md)

### 1.0.17 — Clinical Vitals Compatibility
- Database: `19_vital_signs_complete_compatibility.sql`
- Notes: [START_HERE_ERP_1_0_17.md](docs/release-notes/START_HERE_ERP_1_0_17.md)

### 1.0.16 — Clinical Dashboard & Vital Signs
- Notes: [START_HERE_ERP_1_0_16.md](docs/release-notes/START_HERE_ERP_1_0_16.md)

### 1.0.15 — Dashboard Visual Refresh
- Hospital-style Intelligent Patient Report layout
- Notes: [START_HERE_ERP_1_0_15.md](docs/release-notes/START_HERE_ERP_1_0_15.md), [START_HERE_ERP_1_0_14.md](docs/release-notes/START_HERE_ERP_1_0_14.md)

### 1.0.13 — Final Resident Overview alignment update
- Notes: [START_HERE_ERP_1_0_13.md](docs/release-notes/START_HERE_ERP_1_0_13.md)

### 1.0.12 — Intelligent Report final layout
- Notes: [START_HERE_ERP_1_0_12.md](docs/release-notes/START_HERE_ERP_1_0_12.md)

### 1.0.11 — V3-style Intelligent Patient Report
- Notes: [START_HERE_ERP_1_0_11.md](docs/release-notes/START_HERE_ERP_1_0_11.md)

### 1.0.10 — Corrected Version Label
- Focused Intelligent Report correction
- Notes: [START_HERE_ERP_1_0_10_CORRECTED.md](docs/release-notes/START_HERE_ERP_1_0_10_CORRECTED.md), [START_HERE_ERP_1_0_10.md](docs/release-notes/START_HERE_ERP_1_0_10.md)

### 1.0.8 — Build Diagnostics
- Notes: [START_HERE_ERP_1_0_8.md](docs/release-notes/START_HERE_ERP_1_0_8.md)

### 1.0.7 — Vitals Engine Fix
- Notes: [START_HERE_ERP_1_0_7.md](docs/release-notes/START_HERE_ERP_1_0_7.md)

### 1.0.6 — Blank Vitals Stable Fix
- Notes: [START_HERE_ERP_1_0_6.md](docs/release-notes/START_HERE_ERP_1_0_6.md)

### 1.0.5 — Intelligent Report corrections
- Notes: [START_HERE_ERP_1_0_5.md](docs/release-notes/START_HERE_ERP_1_0_5.md)

### 1.0.4 — Patient Edit Photo & Documents
- Notes: [START_HERE_ERP_1_0_4.md](docs/release-notes/START_HERE_ERP_1_0_4.md)

### 1.0.3 — Intelligent Reports Version 2
- Notes: [START_HERE_ERP_1_0_3.md](docs/release-notes/START_HERE_ERP_1_0_3.md)

### 1.0.2 — Simple Names & Global Search
- Notes: [START_HERE_ERP_1_0_2.md](docs/release-notes/START_HERE_ERP_1_0_2.md)

### 1.0.1 — Title Fields Fix
- Database: `18_erp_1_0_titles_onboarding.sql`
- Notes: [START_HERE_ERP_1_0_1.md](docs/release-notes/START_HERE_ERP_1_0_1.md)

### 1.0 — Compassion Onboarding
- Database: `18_erp_1_0_titles_onboarding.sql`
- Notes: [START_HERE_ERP_1_0.md](docs/release-notes/START_HERE_ERP_1_0.md)

### V9.5 — Employee Role Persistence Fix
- Notes: [START_HERE_V9_5.md](docs/release-notes/START_HERE_V9_5.md)

### V9.4 — Admissions and Employee Role Fix
- Notes: [START_HERE_V9_4.md](docs/release-notes/START_HERE_V9_4.md)

### V9.3 — V3 Style & Compact Readability
- Notes: [START_HERE_V9_3.md](docs/release-notes/START_HERE_V9_3.md)

### V9.2 — Human Intelligent Reports
- Notes: [START_HERE_V9_2.md](docs/release-notes/START_HERE_V9_2.md)

### V9.1 — Intelligent Reports
- Notes: [START_HERE_V9_1.md](docs/release-notes/START_HERE_V9_1.md)

### V9 — Stabilization Foundation
- Notes: [START_HERE_V9_0.md](docs/release-notes/START_HERE_V9_0.md)

### V8.2 — Controlled Room Dropdowns
- Notes: [START_HERE_V8_2.md](docs/release-notes/START_HERE_V8_2.md)

### V8.1 — Rooms & Beds Master
- Database: `17_v8_1_rooms_beds_master.sql`
- Notes: [START_HERE_V8_1.md](docs/release-notes/START_HERE_V8_1.md)

### V8 — Professional UI Refresh
- Notes: [START_HERE_V8_0.md](docs/release-notes/START_HERE_V8_0.md)

### V7.8 — Patient Profile, Edit and Clinical ID Card
- Notes: [START_HERE_V7_8.md](docs/release-notes/START_HERE_V7_8.md)

### V7.7 — Unified Patient Master
- Notes: [START_HERE_V7_7.md](docs/release-notes/START_HERE_V7_7.md)

### V7.6 — Patient Media, Patient ID Card & Automatic IDs
- Database: `16_v7_6_auto_ids.sql`
- Notes: [START_HERE_V7_6.md](docs/release-notes/START_HERE_V7_6.md)

### V7.5 — Admission Page Fix
- Notes: [START_HERE_V7_5.md](docs/release-notes/START_HERE_V7_5.md)

### V7.4 — Employee Photo Retention
- Notes: [START_HERE_V7_4.md](docs/release-notes/START_HERE_V7_4.md)

### V7.3 — Persistent Employee Photo
- Notes: [START_HERE_V7_3.md](docs/release-notes/START_HERE_V7_3.md)

### V7.2 — Photo Persistence Fix
- Notes: [START_HERE_V7_2.md](docs/release-notes/START_HERE_V7_2.md)

### V7.1 — Production Foundation
- Notes: [START_HERE_V7_1.md](docs/release-notes/START_HERE_V7_1.md)

### V7 — V3 Baseline Unified
- Full github package
- Samara Care ERP V7
- Database: `15_V6_5_MASTER_INSTALL_OR_REPAIR.sql`, `55_clinical_charges_revenue_management.sql`
- Notes: [V7_FEATURE_MATRIX.md](docs/release-notes/V7_FEATURE_MATRIX.md), [START_HERE_V7_CLINICAL_CHARGES.txt](docs/release-notes/START_HERE_V7_CLINICAL_CHARGES.txt), [START_HERE_V7.md](docs/release-notes/START_HERE_V7.md)

### V6.5 — One-Time Consolidated Repair
- Database: `15_V6_5_MASTER_INSTALL_OR_REPAIR.sql`
- Notes: [RUN_THIS_FIRST_V6_5.md](docs/release-notes/RUN_THIS_FIRST_V6_5.md)

### V6.4 — Employee Documents Access
- Notes: [UPGRADE_TO_V6_4_EMPLOYEE_DOCUMENTS.md](docs/release-notes/UPGRADE_TO_V6_4_EMPLOYEE_DOCUMENTS.md)

### V6.3 — Camera and Webcam Capture
- Notes: [UPGRADE_TO_V6_3_CAMERA_CAPTURE.md](docs/release-notes/UPGRADE_TO_V6_3_CAMERA_CAPTURE.md)

### V6.2 — Stable Foundation
- Database: `14_v6_2_stable_auth_foundation.sql`
- Notes: [UPGRADE_TO_V6_2_STABLE_FOUNDATION.md](docs/release-notes/UPGRADE_TO_V6_2_STABLE_FOUNDATION.md)

### V6.1 — Login ID Authentication
- Database: `13_login_id_authentication.sql`
- Notes: [UPGRADE_TO_V6_1_LOGIN_ID.md](docs/release-notes/UPGRADE_TO_V6_1_LOGIN_ID.md)

### V6 — Trial
- Database: `12_v6_patient_master_enquiries.sql`
- Notes: [UPGRADE_TO_V6_TRIAL.md](docs/release-notes/UPGRADE_TO_V6_TRIAL.md)

### V5.7 — Photo whatsapp id card
- Database: `11_employee_photo_whatsapp_id_card.sql`
- Notes: [UPGRADE_TO_V5_7_PHOTO_WHATSAPP_ID_CARD.md](docs/release-notes/UPGRADE_TO_V5_7_PHOTO_WHATSAPP_ID_CARD.md)

### V5.6 — Employee Personnel & Account Recovery
- Database: `10_employee_personnel_documents.sql`
- Notes: [UPGRADE_TO_V5_6_EMPLOYEE_PERSONNEL.md](docs/release-notes/UPGRADE_TO_V5_6_EMPLOYEE_PERSONNEL.md)

### V5.5 — Reliable Employee Creation
- Database: `09_reliable_employee_creation.sql`
- Notes: [UPGRADE_TO_V5_5_RELIABLE_EMPLOYEES.md](docs/release-notes/UPGRADE_TO_V5_5_RELIABLE_EMPLOYEES.md)

### V5.4 — Employee Account Recovery
- Database: `08_employee_auth_recovery.sql`
- Notes: [UPGRADE_TO_V5_4_ACCOUNT_RECOVERY.md](docs/release-notes/UPGRADE_TO_V5_4_ACCOUNT_RECOVERY.md)

### V5.3 — Login roles
- Database: `07_restore_employee_access.sql`
- Notes: [UPGRADE_TO_V5_3_LOGIN_ROLES.md](docs/release-notes/UPGRADE_TO_V5_3_LOGIN_ROLES.md)

### V5.2 — Accordion menu
- Notes: [UPGRADE_TO_V5_2_ACCORDION_MENU.md](docs/release-notes/UPGRADE_TO_V5_2_ACCORDION_MENU.md)

### V5.1 — Role-Based Sectional Menu
- Notes: [UPGRADE_TO_V5_1_ROLE_MENU.md](docs/release-notes/UPGRADE_TO_V5_1_ROLE_MENU.md)

### V5 — Simple Upgrade
- Database: `06_v5_unified_modules.sql`
- Notes: [UPGRADE_TO_V5_FOR_BOOMI.md](docs/release-notes/UPGRADE_TO_V5_FOR_BOOMI.md)

### V3.1 — Upgrade for boomi
- Database: `05_safe_admission_risk_tasks.sql`
- Notes: [UPGRADE_FOR_BOOMI.md](docs/release-notes/UPGRADE_FOR_BOOMI.md)

### Undated — Intelligent patient report pdf whatsapp fix
- A4 intelligent report + automatic daily whatsapp
- Safe update 135
- Simple Setup Instructions
- Minimal erp patch
- Database: `01_complete_setup.sql`, `02_first_admin.sql`, `105_patient_family_daily_whatsapp_reports.sql`, `135_received_stock_charge_link.sql`
- Notes: [START_HERE_FULL_PDF_WHATSAPP_FIX.txt](docs/release-notes/START_HERE_FULL_PDF_WHATSAPP_FIX.txt), [START_HERE_DAILY_INTELLIGENT_REPORT_WHATSAPP.txt](docs/release-notes/START_HERE_DAILY_INTELLIGENT_REPORT_WHATSAPP.txt), [START_HERE_135_RECEIVED_BEFORE_CHARGE.txt](docs/release-notes/START_HERE_135_RECEIVED_BEFORE_CHARGE.txt), [SETUP_FOR_BOOMI.md](docs/release-notes/SETUP_FOR_BOOMI.md), [README_FIRST.txt](docs/release-notes/README_FIRST.txt)
