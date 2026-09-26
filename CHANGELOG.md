# Samara Care ERP — Changelog

Newest first. From 2.14.15 onwards, add each release here (a few lines) instead of creating a new START_HERE / RELEASE file.
The full original notes for older releases are kept in [`docs/release-notes/`](docs/release-notes/).

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
