# Samara Care ERP — staff how-to guide (source for the Help / உதவி assistant)

Edit this file in plain English when a workflow changes, then run `python3 tools/build-help-kb.py`
and upload `help/erp-help-kb.json`. The Help assistant reads the uploaded file automatically (no redeploy).

## Logging in, the menu and your role
Each staff member logs in with their employee Login ID and password. The left menu (on phones: the ☰ menu button at the top) shows only the pages allowed for your role — Admin, Manager, Nurse, Caregiver, Accounts, Kitchen or STD. If a page someone mentions is not in your menu, your role does not have it; ask your Manager or Admin. Your home page after login: Admin/Manager → Dashboard, Nurse/Caregiver → Clinical Dashboard, Accounts → Accounts Dashboard, Kitchen → Food & Diet, STD → Director's Office. "My Profile" (under MY ACCOUNT) shows your own details. If the app looks old or a button does not respond, use "App Help / Repair" at the bottom of the menu → "Check for Updates" or "Reload App"; "Repair App" clears the old copy. The version number is shown under the Samara logo.

## Dates and times
All dates in the ERP are shown as DD-MM-YYYY (for example 28-09-2026). Date boxes open a calendar when tapped. Times are Indian Standard Time (IST) with AM/PM.

## Voice typing (Tamil / English)
Many forms have a 🎙 microphone button. Tap it, speak in Tamil or English, tap again to stop; the text is converted into English and filled in for you to check before saving. Always read the filled text before pressing Save.

## Notifications and pop-ups
The bell / Notifications page lists work waiting for you (approvals, discharge steps, charge requests, food vendor replies, clinical alerts). Pop-up cards have "Open & Take Action" to go straight to the right page, or Close to see it later in Notifications.

## Vital signs and clinical alerts
Vital signs are scheduled at 6 AM, 2 PM and 10 PM. The nurse on duty gets a notification at the scheduled time. If vitals are not entered, the alert escalates to Managers after 60 minutes and to Admin / Directors after 90 minutes. Other clinical tasks (medicines, care tasks) escalate to Managers and Admin together after 30 minutes. Enter vitals from NURSING → Vital Signs (or from the alert pop-up). Clinical Alerts shows what is pending or overdue.

## Medicines — changes only through Doctor Review
A resident's medicines can be added, changed or stopped only through "Doctor Review / Modify" on the Medicines page, with the doctor's name and the prescription / verbal-order details. Do not edit the admission form to change medicines. In Doctor Review, "Add New Medicine" opens its own pop-up; you can add several medicines ("+ Add another medicine"). Strength is a number plus a unit chosen from the list (mg, ml, …). Nothing is saved to the resident's record until you press "Apply Doctor Review & Update Medication". Medicine rounds are recorded from NURSING → Medicines / Shift Tasks.

## Patient records for nurses
Nurses can view a resident's personal details but cannot edit them; personal details are changed by Admin / Admissions. Nurses do doctor reviews from the Medicines page, not from the admission form.

## Bills & Charges (Charge Approvals)
Charges come from the Admin-controlled Charge Master (same items and codes everywhere). Nurses raise charges from "Raise Bill / Charge Request" and do not see amounts. Accounts reviews every request in ACCOUNTS / BILLING → Charge Approvals and chooses Approve, Partial or Reject; approved charges are posted to the patient ledger. Categories that Admin marks as needing Nursing Manager approval (Nursing Procedures by default) cannot be raised directly — use NURSING → Approval Requests: choose the category and the item → the Nursing Manager approves → the nurse presses "Confirm & Start", which also raises the charge.

## Consumables and Pharmacy — indent flow
For Consumables / Pharmacy items a nurse cannot raise a charge directly. The flow is: Raise Indent → Nursing Manager approval → Stores hands over → nurse marks Received → item is used for the patient → unused items are returned. Example: order 10, receive 10, use 8, return 2. Only received items that are not yet charged or returned can be charged. The Nursing Manager is also the store keeper and handles indents. Pages: Raise Indent, Received Indents / Used Balance, Patient Consumables (NURSING), Consumables / Pharmacy (PHARMACY & STORES).

## Discharge — step by step
1. Nursing initiates the discharge (ADMISSION → Discharge → "Initiate Discharge"), only on the consultant/doctor's instruction or a clearly recorded voluntary request.
2. Admin / Manager reviews and approves or returns it ("Review & Decide"). If returned, Nursing uses "Rectify & Re-initiate".
3. Accounts clears the finances from Discharge Clearance → "View Payments": verify all charges, settle the balance or refund. Accounts can use "Request Discount Approval" to send a discount request to Admin / Director; clearance waits until they decide.
4. After Accounts clearance, Nursing completes "Final Discharge Clearance" and the handover; the room and bed are released.
The "Discharge timeline & departure follow-up" section shows each case with its date and time. If the patient already left before final clearance, Nursing uses "Patient already left — report late departure".

## Payments
Accounts records payments in ACCOUNTS / BILLING → Payments: cash, UPI, RTGS (a transaction reference number is mandatory for UPI/RTGS), advance payments, online payment links and QR codes, and WhatsApp payment links. Refunds at discharge go through verification by Accounts and a separate Admin approval.

## Duty, leave and swaps
HR → Duty Assignment / Duty Calendar shows and assigns duties (a voice assistant can fill the Assign Duty form from a spoken command). Staff apply for leave or permission in "My Leave & Permission"; approvers use "Leave Approvals". "Temporary Duty Swap", "Additional Duty Assignment" and "Leave Cover" handle swaps and cover duties. Staff returning early from leave submit a Return to Duty request.

## Food & Diet
Nurses record Resident Food Intake in FOOD & DIET. Food vendor orders and vendor replies are managed by the Nursing Manager and Admin / Director (Food Vendor Management). Food receipts must be recorded within the receipt window after delivery.

## Enquiries and admissions
Website enquiries and visit / call-back requests from Samara AI appear in ADMISSION → Enquiries. Admissions creates the resident record; Spot Assessment records the pre-admission assessment; Documents stores resident documents.

## Family Portal and WhatsApp
Families of residents use the Family Portal (family.samaraassistedliving.com) with login details given at admission. WhatsApp Inbox / WhatsApp Logs show messages sent to families and vendors.

## When something goes wrong
- Button does nothing or the page looks old: App Help / Repair → Reload App or Check for Updates; then log in again.
- "Not permitted" / a page missing: your role does not have that action; ask your Manager or Admin.
- A save fails with a red message: read the message — it says what is missing (for example a mandatory field, a reference number, or an approval that must come first).
- Still stuck: take a screenshot and ask the Help / உதவி assistant, or contact Admin.
