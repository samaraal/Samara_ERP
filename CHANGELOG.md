## 2.18.139 — Nursing Notes (separate from Shift Handover)
- New **NURSING → Nursing Notes** page (Nurse, Caregiver, Nursing Manager, Admin): a card for every Guest showing this shift's notes "n / 2" (green when done), the last note, and **＋ Add Note** / **📖 View Notes**. Second tab "All notes (register)" with Guest / Today / Last 3 days / This Week / This Month / period / Focus filters + Apply; every note opens its full details. Print / PDF (Samara logo, signature lines).
- **Single click from the Patient card**: "📝 Nursing Notes" beside Reports — timeline grouped date → Day / Night shift, this-shift count, ＋ Add Note, Print / PDF.
- Note form with a switch **D · A · R** (Focus · Data · Action · Response) or **Quick note**; Focus list (General condition, Sleep, Pain, Fall, Incident, Behaviour, Breathing, Skin / Wound, Bowel / Bladder, Eating, Mobility, Medication response, Family, Doctor, Other); late entry within 24 hours with its real time.
- **Voice assistant**: 🎤 Speak in Tamil / English for the whole note — Gemini writes it in simple English and arranges it into D / A / R (nothing invented); the nurse checks every field (unfilled ones yellow) before Save. The heard speech is kept with the note. If the new voice function is not deployed yet, the existing Tamil → English voice service fills "Data".
- **Minimum 2 notes per Guest per shift** (1 if admitted more than 6 h into the shift): nurse reminder 5 PM / 5 AM, Managers + Admin escalation 6 PM / 6 AM (pop-up, voice, phone notification, WhatsApp), closed automatically when the notes are written. Starts from the first shift after SQL 297 is run.
- **Fall / Incident** focus or "Inform the Nursing Manager now" → Nursing Manager + Admin / Director alerted at once (Clinical Escalations, phone, WhatsApp stage NOTE_ALERT_NOW).
- Notes are **never edited or deleted** — corrections are Addenda (text, reason, who, when). Notes are internal: not in the Family Portal or the family Daily Report.
- **Doctor's Daily Clinical Report**: new "Nursing notes" section (alert notes first, then the latest, with addenda) and the notes are given to the AI observations.
- Shift Handover: "📝 Add this shift's Nursing Notes to the summary".
- **SQL 297 required. Edge Functions: new nursing-note-voice; redeploy daily-patient-report and clinical-escalation-dispatch.**

## 2.18.138 — Doctor's report: website in the header, Intake / Output chart
- Top right: the email line is replaced by the website samaraassistedliving.com with a small globe icon (clickable in the PDF).
- Guests on I/O charting get an "Intake / Output chart" section: daily intake vs output bars for the report period, the balance (intake - output) under each date, and days charted, average intake / output, net balance and stools beside it. Edge Function daily-patient-report. No SQL.

## 2.18.137 — Doctor's report: courteous closing note
- The reply note at the bottom of the doctor's report now reads: "Respected Doctor, we would be grateful for any instructions you may wish to give for <Guest>. Kindly reply on this WhatsApp chat at your convenience; your message will reach our nursing team promptly. Thank you for your guidance. - Samara Assisted Living". The existing-WhatsApp message text to the doctor uses the same tone. Edge Function daily-patient-report + Patient card. No SQL.

## 2.18.136 — Reports popup: PDF opens reliably
- "Print / Save PDF" in Patient card → Reports (Daily Report for family / Report for Doctors) used to open an empty new tab and fill it after the server answered; browsers often block or leave that tab empty. Now the PDF is prepared first, then "📄 Open PDF" (a normal link) and "⬇ Download PDF" appear in the popup. No SQL, no Edge Function change.

## 2.18.135 — Doctor's report medication table: one row per medicine
- Versions of the same medicine (time corrections, doctor's changes) are now one row — doses given / due are added up, times and dose shown from the current version, "(stopped)" only when no version is active. Each version counts only the doses between its own start and stop time. Ranjith Kumar's Emrok (4 versions) and Piptaz (5) were filling the page; the report now fits on one page more often. Scale-to-fit now goes down to 82%. No SQL.

## 2.18.134 — Doctor's report fits on ONE page
- When the report runs a little over one A4 page, it is now drawn slightly smaller (down to 87%) so it fits on one page. Only when it still does not fit does a 2nd page appear (at normal size). Edge Function daily-patient-report. No SQL.

## 2.18.133 — Admission Prescription vs Modification History; Edit with reason
- Patient card → Medicines: the old combined "Prescription / Modification History" is split:
  - **Admission Prescription** — medicines entered at admission, with a list of **Corrections to admission entries** (who, when, old → new, reason).
  - **Modification History (after Doctor's Review)** — only real doctor's changes, showing just Added / Modified / Stopped (no long "Continue" lists).
- **Edit with reason** for wrong admission entries — Nurse, Nursing Manager, Admin — within **48 hours of admission**: Edit (medicine, strength, frequency, route, time, food, instruction), "+ Add medicine missed at admission", Remove (wrong entry). The order keeps its MAR link; nothing is called a doctor's review. After 48 hours every change goes through "Doctor's Review — Add / Modify" (button renamed).
- SQL 296: correction table + functions (48-hour check in the database), and Ranjith Kumar's 12 entries of 22–24 Oct (saved as Doctor Review by mistake) re-marked as admission corrections — nothing deleted.
- Doctor's Daily Clinical Report, family Daily Report, Discharge Summary and the Medicines → Prescription History register no longer count admission corrections as doctor reviews; the doctor's report shows only real changes.
- **SQL 296 required. Edge Functions daily-patient-report and discharge-summary redeployed.**

## 2.18.132 — Doctor's report PDF opens fast (page 2 no longer slow)
- The report used the full-size Samara logo (1536 px PNG with transparency), making the PDF ~400 KB and slow to draw in the PDF viewer. It now uses a small pre-cropped logo (assets/samara-logo-report.jpg, 36 KB): the PDF is ~45 KB and both pages open at once. Same look. Edge Function daily-patient-report. No SQL.

## 2.18.131 — Doctor's report: much faster Print / Save PDF
- The Guest's documents (prescription, discharge summary, lab reports) are now read by Gemini once and kept as a short fact list; they are read again only when documents are added or changed.
- The Clinical Observations for a date are saved and reused while the records are unchanged, so opening, printing and sending the same report again takes a few seconds.
- The Reports → Report for Doctors popup starts preparing the PDF as soon as it opens, so it is usually ready when Print / Save PDF is pressed.
- Edge Function daily-patient-report + Patient card. No SQL.

## 2.18.130 — Doctor's report: condition labels fit their boxes
- Clinical Observations: long condition labels (e.g. "Rehabilitation & Mobility") now wrap inside the coloured label instead of spilling out; Gemini is asked for short 1-2 word labels. Edge Function daily-patient-report only. No SQL.
- Checked live: SQL 295 run (Ranjith Kumar → clinical report, Dr. Kenny Robert); doctor report generated for 25-10-2026 with AI observations.

## 2.18.129 — Patient card: one "Reports" button
- At the top of the Patient card, "📑 Reports" (Admin, Manager, Nurse) opens:
  1. Daily Report (for family) — the same daily Intelligent Patient Report the family gets; Print / Save PDF, WhatsApp API to the family (Admin / Manager), existing WhatsApp. Report itself unchanged.
  2. Report for Doctors — the Doctor's Daily Clinical Report; Print / Save PDF, WhatsApp API to the doctor (Admin / Manager), existing WhatsApp.
  3. Discharge Summary — the existing popup (enabled after the final discharge).
- Replaces the separate "Discharge Summary" and "🩺 Doctor's Report" buttons in the card header. No SQL beyond 295.

## 2.18.128 — Doctor's Report in the Patient card: Print PDF / WhatsApp
- Patient card (active Guests): new "🩺 Doctor's Report" button beside Admission Details / Consent (Admin, Manager, Nurse). The popup has a report date, the doctor's name and WhatsApp number (taken from the Guest's daily-report settings), and:
  - Print / Save PDF,
  - Send PDF to Doctor · WhatsApp API (Admin / Manager; recorded in WhatsApp Inbox),
  - Existing WhatsApp: share the PDF into the doctor's chat on a phone, or download it and open the chat.
- The family's Daily Intelligent Report is unchanged. Needs SQL 295 and the daily-patient-report Edge Function from 2.18.127.

## 2.18.127 — Doctor's Daily Clinical Report (trial: Ranjith Kumar)
- New report for the Guest's treating doctor, separate from the family's Intelligent Report: title "Daily Clinical Report" (centred), larger Samara logo with "Centre for Nursing Excellence" beneath, Dr. name (bold), Patient Name and Report Period on separate lines, Samara address and phone numbers at top right. No Vitals box at the top.
- Sections: Clinical Observations (AI) · Vital signs trend (up to 7 days; out-of-range values in red) · Medication doses given / due with doses not given and why · Physiotherapy in detail (plan, every session, therapist, status, notes) · Doctor reviews in the period · Nursing summary (meals, intake/output, incidents, care notes) · reply-on-WhatsApp note. One A4 page; a 2nd page only when the records need it.
- Clinical Observations are prepared by Gemini from Samara's own records and the Guest's uploaded prescription / discharge / lab documents, grouped by the Guest's own conditions (Neurology, Orthopaedics, Diabetes …). Strict: observations only — any line that advises or recommends is removed automatically. If Gemini is unavailable, the report is still sent without the box.
- Trial per Guest: SQL 295 adds "doctor report style" (family copy / clinical) and turns "clinical" on for Ranjith Kumar only. All other doctors keep getting the family copy. The doctor's report is not listed in the Family Portal.
- Intelligent Reports (Resident-wise, Admin / Manager): new "🩺 Doctor's Report (PDF)" preview and "Send to Doctor" buttons.
- **SQL 295 required. Edge Function daily-patient-report must be redeployed.**

## 2.18.126 — Physio reschedule / correction requests: notifications that open the request
- Nursing Manager and Admin: pending physiotherapy requests are counted in the 🔔 bell and listed at the top of Clinical Alerts and in Notifications. Tapping one opens only that request with Approve / Reject ("Show all" returns to the full page). No top pop-up (owner's choice of 24-Oct kept).
- Phone notification (SQL 294 + Edge Function physio-approval-alert-dispatch): sent once per request to Admin and Nursing Manager phones; tapping it opens that request. The requester never gets it — the Nursing Manager's own request goes to Admin only.
- The Nursing Manager's own request now shows "Your request — waiting for Admin" instead of an Approve button that failed.

## 2.18.125 — All physiotherapist numbers; On Duty Today without repeated names
- On Duty Today: staff shown under "On duty now" are no longer listed again under their shift.
- New "All physiotherapists" list (On Duty Today, and "📞 Physiotherapist phone numbers" at the top of the Physiotherapy page): every active physiotherapist and desk with Call / WhatsApp, so staff can pick anyone.
- Names with initials (e.g. "ANISHA.U") now find their number. One-time SQL 293 saves Dr. Anisha's number on "ANISHA.U".

## 2.18.124 — Physiotherapist phone numbers: 📞 Call / 💬 WhatsApp
- Staff (Nurses, Nursing Manager, Admin, STD) can call or WhatsApp the physiotherapist from: Physiotherapy plan list, pending sessions, the Record Session form, the Guest file → Physiotherapy tab, physiotherapy alerts / escalations, and a new "Physiotherapy today" list in On Duty Today. Outsourced organisations show the therapist's mobile and the desk number.
- On a phone "Call" dials; on a laptop the number is shown and a click copies it. WhatsApp opens the staff member's own WhatsApp.
- Numbers stay in Physiotherapy → Therapist Accounts (Admin only); a phone must be a 10-digit mobile. SQL 292 (run once): staff phone lookup + numbers for Dr. Lukkysh Kumar, Dr. Hemavathi, Dr. Anisha and Vinayaga Physio Point.

## 2.18.123 — Physiotherapy: recording the 2nd session of the day is clear
- When the morning session is already done, the Record form now says "Session 1 of 2 is already done today … This form records the next session — 4:00–6:00 PM. Enter the Actual Session Time and press Save Session." The "Open Session options" button (which opened the morning session for correction) is no longer shown there; it appears only for a real duplicate, renamed "Correct this entry". No SQL.

## 2.18.122 — Physiotherapy approvals no longer at the top
- Removed the "🔔 Physio approvals (N)" button, its pop-up and the "₹ Physio unbilled" button from the top bar. Pending corrections remain in Notifications and Physiotherapy Dashboard → Physiotherapy Correction Approvals; unbilled sessions remain flagged in Patient Rates & Billing.
- One-time SQL 291 closes correction requests left Pending although already reviewed (sessions unchanged). No other SQL.

## 2.18.121 — Phone: "Physio approvals" / "Physio unbilled" buttons on one line
- On phones the top "🔔 Physio approvals (N)" button was squeezed into a narrow column (one letter per line). It now stays on one line. No SQL.

## 2.18.120 — Physiotherapy statement: centred title, WhatsApp button back on top
- PDF statement heading "Samara Assisted Living" is centred.
- "📲 Send Statement on WhatsApp (PDF)" sits beside "Print Statement (PDF)" at the top of Therapist Accounts. On phones it shares the PDF to WhatsApp; on a computer it downloads the PDF and opens the WhatsApp chat of the physiotherapist (or organisation) using their saved phone number, with a short message — attach the PDF and send. No SQL.

## 2.18.119 — Therapist Accounts: "not yet posted" count follows the selected physiotherapist
- With a physiotherapist selected in "Statement for", the red count shows only that physiotherapist's completed sessions not yet posted (it showed the whole organisation's). No SQL.

## 2.18.118 — Physiotherapist fee agreed case by case per Guest (SQL 289)
- Choosing "Session fee" no longer asks for one fixed fee. Admin / Director enters the fee agreed for that Guest when posting the session ("Fee agreed for this Guest").
- The last fee agreed for the same physiotherapist and Guest is filled in automatically next time; "Post all at agreed fee" posts only sessions whose fee for that Guest is already known.
- A "usual session fee" on the physiotherapist is optional (only a starting suggestion). Panel shows "Per Guest (at posting)".
- **SQL 289 required** (after 285).

## 2.18.117 — Physiotherapist Panel "Paid by" dropdown; statements for every physiotherapist; tap rows for details
- Physiotherapist Panel (Samara own team): a **Paid by** dropdown on each row — Salary or Session fee (asks for the fee when switching to Session fee).
- "Statement for" lists every physiotherapist, marked (salary) or (per session). Salaried physiotherapists — and an all-salaried Samara team — get a **Work Statement**: sessions done with Guest, room, scheduled / actual time and status, counts, Print / WhatsApp PDF. Per-session ones keep the fee statement, now also with the sessions done in the period.
- Tap any statement row (sessions or fee / payment entries) to see its full details. No SQL.

## 2.18.116 — Therapist Accounts: clear message when SQL 285 is missing
- For a Samara own-team organisation, Therapist Accounts now says when SQL 285 is not installed (Samara per-session physiotherapists' sessions cannot be listed before it), instead of showing an empty list. No SQL.

## 2.18.115 — Finished admissions no longer shown as "Unfinished"
- An admission draft stayed in "Unfinished Admissions" when the signed-consent step was not completed in the same sitting, even though the admission was saved. Drafts whose Guest admission is already saved are now closed automatically when the list loads. Pending signed consent is still tracked by "Pending Signed Consent". No SQL.

## 2.18.114 — Admission form: Physiotherapy as its own section
- Section 6 is now "Risks and special nurse" (the "Physiotherapy advised" tick is removed from it).
- New **Section 7. Physiotherapy** with a "Physiotherapy required" tick; when ticked: therapy, physiotherapist, frequency, From–To session windows and precautions.
- "Package, room and activation" becomes Section 8. No SQL.

## 2.18.113 — Physiotherapy session windows entered as From–To (SQL 288)
- Admission and Patient Edit → Physiotherapy Plan: each session is entered as a window, **From – To** (e.g. 7:00 AM – 9:00 AM, 4:00 PM – 6:00 PM), instead of one fixed time. "To" must be after "From"; windows must not overlap.
- Saved as "07:00-09:00" in session_times; existing plans with a single time open as that time ±1 hour until edited.
- Reminders / escalations start at each window's own end. Rescheduled sessions keep their exact time.
- **SQL 288 required** (after 287).

## 2.18.112 — Physiotherapy approval pop-up shows once per request
- The "Physiotherapy approval needed" pop-up kept returning after every refresh / reopen. Each request now pops up once per device; the "Physio approvals (N)" top button stays until the requests are approved or rejected. No SQL.

## 2.18.111 — Physiotherapy "Until Dr. Review"; session windows on every table
- Patient Edit → Physiotherapy Plan: "Continue until" = **Until Dr. Review** (default, no end date) or **Until a date** (date picker, required).
- Physiotherapy plan table: columns "Session Window" (e.g. 7:00–9:00 AM, 4:00–6:00 PM) and "Continue until" (date or Until Dr. Review).
- Recent Sessions: "Session Window / Time" — plan sessions show their window; rescheduled sessions show their exact set time. Patient file shows the windows and "Until Dr. Review". No SQL.

## 2.18.110 — Physiotherapy: ended plans shown clearly
- A plan whose End Date has passed shows "⚠ Plan ended DD-MM-YYYY — no sessions expected, no reminders" on the Physiotherapy plan row (it previously looked active).
- Session time labels no longer show a double "* *". No SQL.

## 2.18.109 — Physiotherapy session window (7–9 AM instead of a fixed 8 AM) (SQL 287)
- Each plan time is now the middle of a 2-hour window: 8:00 AM → 7:00–9:00 AM, 5:00 PM → 4:00–6:00 PM. Any time inside the window is on time.
- Reminders / escalations for plan sessions start only at the window end (9:00 AM / 6:00 PM). Reschedule is unchanged — a rescheduled session keeps its exact time.
- Windows shown on the Physiotherapy plan rows ("Next: 4:00–6:00 PM"), the Record Session form, Shift Tasks, the patient file, and under each time box in Admission / Patient Edit.
- Shift Tasks count sessions in order, so a late morning session still covers the morning window.
- **SQL 287 required** (after 286).

## 2.18.108 — Physiotherapy: Guest rate case by case only; 5 PM second session; calmer reminders (SQL 286)
- Guest physiotherapy charges come only from the rate Admin / Director sets for each Guest. The organisation-wide Guest fee (2.18.106) is removed; any Pending charge created from it returns to "waiting for Guest rate".
- Twice-daily plans holding only one time get 5:00 PM as the 2nd session time.
- Physiotherapy reminders / escalations count sessions in order: a morning session recorded late (e.g. 11:50) covers the 8:00 AM slot, and the 5:00 PM session is not due before 5 PM. Plan row shows "Next: 5:00 PM" calmly until then.
- **SQL 286 required** (after 284 / 285).

## 2.18.107 — Physiotherapist Panel (Salary / Session fee), physiotherapist-wise statements, session details (SQL 285)
- "Physiotherapists" tab is now the **Physiotherapist Panel**: Paid by (Salary / Session fee), session fee, monthly salary (for records) and balance payable per physiotherapist. Samara own team can mix salaried and per-session physiotherapists; outsourced ones are always per session.
- Samara per-session physiotherapists get fee posting, payments (choose the physiotherapist), ledger and statement like outsourced ones. Salaried ones never get session fees.
- "Statement for": whole organisation or one physiotherapist — Print Statement (PDF), WhatsApp and CSV follow it. "Statement" button on each panel row.
- Session Counts: tap a row to see every session — date, Guest, room, scheduled / actual time, status, notes, recorded by, and (Admin / Accounts) Guest charge and physiotherapist fee. Total row added.
- **SQL 285 required** (after 284). Existing Samara physiotherapists without a session fee are set to Salary.

## 2.18.106 — Physiotherapy fees: Samara own team vs Outsourced, Guest fee, statement (SQL 284)
- Organisations have a Type: **Samara own team** (staff — no per-session fee, payment or statement) or **Outsourced** (fee paid per completed session). Each also has a **Chargeable Guest fee per session**.
- Guest price per completed session = the Guest's own agreed rate if Admin / Director set one, otherwise the organisation's Guest fee. Saving a Guest fee sends that organisation's waiting sessions to Accounts; "Send waiting sessions to Accounts" does the same for all.
- Outsourced: "Post all at default fee" posts every unposted session at each physiotherapist's default fee (unmatched ones stay for manual posting). "🖨 Print Statement (PDF)" at the top; the statement now lists sessions by physiotherapist and warns about sessions not yet posted.
- Admin / Accounts: "₹ Physio unbilled (N)" chip for completed sessions not billed after 24 h, with the reason; red banner in Patient Rates & Billing.
- Session options warns when the session is already charged to the Guest or its therapist fee is posted (those must be reversed before a correction can be approved).
- **SQL 284 required** (supabase/sql/284_physio_samara_outsourced_guest_fee.sql). Organisations named "Samara…" are set to Samara own team.

## 2.18.105 — Physiotherapy: today's progress on each plan, no duplicate sessions
- Physiotherapy Plan rows show "Today: X of N done (times)". The button names the next session ("Record 5:00 PM session" / "Record 2nd session") and becomes a grey "✓ All done today" when every session is recorded.
- Twice / Thrice daily plans with a missing session time are flagged "second time missing — Admin please add in Patient Edit" (new plans already require all times).
- Recording today: the session is chosen from the plan's own times (recorded ones shown "✓ recorded"); staff type only the Actual time, so the plan time is no longer overwritten.
- Before saving, the form lists sessions already recorded for that date with "Open Session options", and warns when the session or the whole day is already recorded. Today's progress is read separately, so it is correct whatever period is filtered. No SQL.

## 2.18.104 — Compact filter rows across the ERP
- Filter dropdowns no longer stretch across the whole screen. Every filter group (registers, reports, dashboards) shows as one row of short boxes — about 4 per row on a laptop, 2 on a tablet, 1 on a phone — with Apply at the end. Pop-ups and entry forms are unchanged.
- Bills & Charges Register: new "Search Guest" (3 letters: name / ID / room) narrows the Patient list; Patient, Status, Category and Period change only when Apply is pressed. Quick-view boxes and notifications still apply at once. No SQL.

## 2.18.103 — Accounts Dashboard boxes open the right view; Outstanding Guest list
- Outstanding Receivables (and Financial Position › Net Outstanding) opens a Guest-wise list on the dashboard: S.No · Guest Name · Room No. · Outstanding Amount, alphabetical, with total. Tapping a row shows full details (Guest ID, room/bed, admission date, status, charges, discounts, received, refunds, every entry) with Receive Payment / Final Billing buttons.
- Unadjusted Advances opens the same kind of Guest-wise list (was the blank Payments form).
- Accounts Reports now opens with the matching period and section: Collections Today → today's payments; month boxes → this month; Gross Charges / Discounts / Net Charges → Detailed Register filtered to that type; Realised / Average → Guest ledger. New "Register Type" filter.
- Package Expiry opens with "Attention Required" (expired / expiring within 3 days) — the same Guests it counts. No SQL.

## 2.18.102 — Restore dashboard figures to their individual colors
- KPI figures use their existing green, blue, red, purple, amber, teal or pink category color. Baby-pink gradient boxes, labels, banner and navigation stay as in 2.18.101. No SQL.

## 2.18.101 — Readable dashboard banner; Outside Bills at the top
- Banner heading and supporting text use dark maroon on baby pink. Outside Bills Paid by Samara is a prominent first dashboard box, before the banner and financial totals. No SQL.

## 2.18.100 — Outside Bills dashboard navigation + baby-pink boxes
- Outside Bills Paid by Samara moves from Charge Approvals to a separate Accounts Dashboard box and register. Every outside-bill total opens its contributing bills; each bill opens full details and existing actions.
- Accounts Dashboard and Outside Bills boxes use Samara baby-pink gradients. Access remains Accounts / Admin. No SQL.

## 2.18.99 — Editable Provider defaults to Samara
- New Bills & Charges requests prefill Provider / Organisation as Samara; staff can change it before saving. No SQL.

## 2.18.98 — Charge requests fit the screen; notifications focus the request
- Bills & Charges Approval uses responsive request cards on desktop and mobile, keeping amounts, decisions and approval actions visible without a wide table.
- Charge notifications clear the date filter, highlight and scroll to the matching request, and focus Approve (pending) or Decision (already processed). No SQL.

## 2.18.97 — Updates never wipe a staff entry + auto-saved drafts (no SQL)
- Cause: the "New version" box reloaded the page while staff were typing, so half-filled entries were lost.
- The box now has **Later – finish my entry**, and it does not appear at all while a form has unsaved typing; a small "New version ready" chip stays at the top instead (tap to update when ready). A waiting update is applied by itself only when nothing is typed, no popup is open and the screen has been idle 2 minutes (or the tab is in the background); a green "Samara Care updated" note confirms it.
- Every form keeps a **draft on this device** every few seconds (per signed-in user). After an update, reload, crash or the 30-minute idle sign-out, opening the same form shows "Unsaved entry from 9:42 PM — Restore / Discard / Not now" (with the Guest and the first values typed). The draft is deleted once the entry is saved, after 12 hours, or on Sign Out. Search / filter boxes are ignored; the Admission form keeps its own draft system.

## 2.18.96 — "Alternate Days" medicines (every other day) (needs SQL 283)
- New Frequency **Alternate Days** in Admission (Section 3), Doctor Review / Modify / Add New Medicine and Spot Assessment; the prescription scan also reads "alternate days / EOD / A/D".
- Choosing it asks for a compulsory **Dose day** (any day the medicine is given — first dose, or the last dose taken before admission; quick buttons Start day / Next day) and shows the coming dose dates. It is written into the instruction ("Alternate days from 23-10-2026") and saved as medication_orders.dose_anchor_date, so a later Doctor Review keeps the same cycle.
- MAR, Shift Tasks, screensaver and Medicines list show the dose only on its days ("Next due …" on the off day). Server alerts / escalations skip the off days after SQL 283.
- Run supabase/sql/283_alternate_day_medicines.sql (after 279), then publish the app. Optional: redeploy the prescription-scan Edge Function so the scanner suggests Alternate Days.

## 2.18.95 — Payment receipts go to the FAMILY, never to the Guest's own mobile
- Fix: Mr. S. Swaminathan's advance receipts (23-10-2026) went to the Guest's own mobile (labelled "Family Member") instead of Mrs. Vijayalakshmi (wife, primary) and Mr. Bharath Ram (son). The Accounts login could not read the family contact list directly, so it came back empty and the screen fell back to the patient's own mobile.
- Accounts payment receipts and the outstanding-bill reminder now load the registered family contacts through the secure server lookup (the same one the payment link already uses), send to every active family contact (primary first), and never use the Guest's own mobile. With no family contact registered, a clear message asks to add one in Patients → Edit. No SQL.

## 2.18.94 — Physiotherapy plan: a time for EACH session (Twice daily = 2 times) (needs SQL 282)
- Admission form (Section 6) and Patients → Edit → Physiotherapy Plan: the Frequency is now a list (Once daily, Twice daily, Three times daily, Alternate days, Weekly, As advised). Twice daily shows **Session 1 time** and **Session 2 time** (Three times daily: 3 times); all are compulsory and must differ. Saved in physiotherapy_plans.session_times; Preferred Time keeps the first time for older screens.
- Record Physiotherapy Session opens with the next session time of the day not yet recorded (e.g. morning, then evening).
- Shift Tasks shows one task per session time in its own shift ("session 1 of 2", "session 2 of 2"); Complete / Postpone opens the form with that session's time.
- Alerts / escalations (SQL 282) expect each session time separately; plans with one time keep the old rule, and plans past their End Date no longer alert.
- Existing Twice daily plans: open Patients → Edit → Physiotherapy Plan once and enter both session times.
- Run supabase/sql/282_physio_session_times.sql (after 280 / 281), then publish the app.

## 2.18.93 — Physiotherapy: Twice / Thrice daily plans record every session (needs SQL 280)
- Fix: a "Twice daily" plan (Mr. Ranjithkumar, 23-10-2026) could record only ONE session a day — the second was refused with "A session exists for this date" (the database allowed one session per plan per day).
- Now each session of the day is its own record, identified by its Scheduled Time. The number per day follows the plan's frequency (Daily 1, Twice daily 2, Thrice daily 3). For the next session of the day the form leaves Scheduled Time empty when the plan time is already used — enter that session's time (e.g. the evening time). A clear message appears if all sessions of the day are already recorded or the same time is used twice.
- Shift Tasks shows "(1 of 2 sessions today)" and keeps a Twice daily plan pending until both sessions are recorded. Each session is billed separately, as a single session is today.
- Run supabase/sql/280_physio_multiple_sessions_per_day.sql, then publish the app.
- Follow-up SQL 281: also removes the older one-per-day constraint physiotherapy_sessions_order_date_key (file 36), which still refused the second session with "This record already exists". Run supabase/sql/281_physio_remove_old_one_per_day_rule.sql.

## 2.18.92 — Medicine Route: "NG / Ryles Tube"
- "NG / Ryles Tube" added to the medicine Route list in the Admission form, Doctor Review (Add / Modify) and the prescription scan. No SQL.

## 2.18.91 — Weekly / Monthly medicines are due on their OWN day (missed Inj. Anfoe, 23-10-2026) (needs SQL 279)
- ROOT CAUSE: a Weekly medicine had no "day of week". The ERP counted every 7 days from the date the current prescription version started. Mrs. Shanthi T's Inj. Anfoe 4000 IU started on Sunday 18-10 (admission note "every Sunday"); the Doctor Review on 18-10 changed the note to "EVERY FRIDAY FOR 4 WEEKS" but the start date stayed Sunday 18-10, so the MAR, Shift Tasks, nurse screensaver, Clinical Dashboard and the Medicine Due alerts / escalations all expected Sundays — the Friday 23-10 dose appeared nowhere.
- FIX: Weekly medicines now need a compulsory **Day of week** (Admission, Doctor Review Add / Modify, prescription scan); Monthly ones may have a **Day of month**. The day is written into the instruction ("Every Friday · …"), saved as dose_weekday / dose_month_day (SQL 279) and carried to every new version by Doctor Review. Every screen and the server alerts use that fixed day. The form shows the actual dose dates for the chosen Duration and warns when only one dose falls in it (e.g. "for 4 weeks" → choose 28 Days, now in the Duration list).
- Existing Weekly / Monthly prescriptions take the day from their instruction (Anfoe → Friday), else from the previous version, else from the first dose date.
- Run supabase/sql/279_weekly_medicine_fixed_weekday.sql, then publish the app.

## 2.18.90 — Intake / Output PDF: clear colour key
- The chart key on the Intake / Output PDF now reads "Pink bar = Intake (fluids taken in)" and "Blue bar = Output (fluids passed out)", matching Family Portal 1.0.50. No SQL.

## 2.18.89 — Family Portal Admin Preview shows the Intake / Output history
- "Preview Family Portal" now sends the Guest's Intake / Output history (last 93 chart days, same figures as the family sees via SQL 278), so the Intake / Output box and page appear in Admin Preview too (with Family Portal 1.0.48). No SQL.

## 2.18.88 — "Medicine Given Late" card no longer repeats
- Fix: the in-app alert card (Remind in 5 min / Open to Resolve) kept showing "Medicine Given Late" every few minutes for doses already given. Information-only items (Medicine Given Late, Poor Meal Intake) now show on that card once per device, with a **Noted** button (and "For information — already recorded"). Real pending tasks keep the normal Remind in 5 min behaviour. The item stays in Clinical Escalations for the Nursing Manager to close. No SQL.

## 2.18.87 — Intake / Output: Print / Save PDF + Family Portal history (needs SQL 278 for the Family Portal)
- Intake / Output chart → **🖨 Print / PDF** (beside the chart date): choose This chart day / Last 7 days / This month or From–To (up to 3 months). The PDF has the Guest details, reason, alert limits and treating doctor; total intake / output / net balance; a bar chart per day; day-wise totals (Oral, IV, Tube, Other · Urine, Drain, Vomit, Stool, Other) with Day / Night shift in / out and low-urine / over-limit flags; every entry with time, item, amount and nurse (tea / milk / juice from Food Intake marked); signature lines for Nurse, Nursing Manager and Treating Doctor.
- New SQL 278 family_portal_io_history for Family Portal 1.0.47 (day totals + breakdown for the family's own Guest; no staff names, remarks or limits). Run supabase/sql/278_family_portal_io_history.sql.

## 2.18.86 — Recorded medicines stop alerting; "Medicine Given Late" pops up once (needs SQL 277)
- Fix: a "Medicine Due … overdue" escalation stayed open after the dose was recorded (Daily Care and Meals already closed by themselves). Now any MAR entry for that medicine, date and time (Given, Refused, Withheld, Missed, Delayed) closes it automatically. SQL 277 also closes the already-recorded ones still open (22 found, some from September); doses with no MAR entry stay open for the Nursing Manager.
- "Medicine Given Late" and "Poor Meal Intake" are information only: the pop-up / voice now comes ONCE per device (heading "FOR INFORMATION"), instead of repeating every few minutes. The Nursing Manager still reviews and closes them in Clinical Escalations.
- Run supabase/sql/277_medication_escalations_autoresolve.sql, then publish the app.

## 2.18.85 — Correct today's "given at" time · reason compulsory for late doses (needs SQL 276)
- **Correct given time:** tap a GIVEN dose in Today's MAR → **Correct given time**. Nurses, the Nursing Manager and Admin can change the actual time the medicine was given, for doses recorded **today** only. A reason is compulsory; the old time, new time, staff name and reason are added to the record's remarks (and the audit log). The time cannot be later than when it was recorded, and must be within 12 hours of the scheduled time. If the corrected time is more than 30 minutes before the recording time, the dose shows as a late entry (recorded later than given).
- **Reason for giving late:** whenever a dose is saved as Given **30 minutes or more** after its scheduled time (MAR form or a time correction), a reason is compulsory — Guest asleep · Medicine not available · Guest refused at first, took it later · Guest away (hospital visit / outing) · Busy with an emergency · Doctor's instruction · Other (with details).
- The **Nursing Manager is informed at once**: ERP pop-up / voice, Clinical Alerts and the Clinical Escalations register ("Medicine Given Late: … — reason"). She closes it with remarks. Not sent on WhatsApp; not on Admin / Director pop-ups (still visible in the register). Correcting the time back to on time closes it automatically.
- "Administer now" switches to the full form if the dose has meanwhile become 30 minutes late. The reason is shown in dose details and Medication History.
- Run supabase/sql/276_medicine_given_late_reason.sql, then publish the app.

## 2.18.84 — MAR shows whether a medicine was GIVEN on time (not only recorded on time)
- Fix: a dose given 3 h 39 min after its scheduled time showed "On-time entry", which only meant it was recorded at the moment of giving. That label is replaced.
- Dose details (Today's MAR and Medication History) now show two separate lines: **Given on time?** — "Given on time" or "Given late — 3 h 39 min after the scheduled 10:00 AM" (or "Given early" when 1 h or more before), and **Recording** — "Recorded at the time of giving" or "Late entry — recorded … after giving".
- Late = 30 minutes or more after the scheduled time (same rule as the red "Administer (late)" button). A late-given dose shows a red "Given … late" note on its MAR line and in Medication History; the Excel / PDF / print have a new "Given on time?" column. Past records are shown correctly too. No SQL.

## 2.18.83 — Time is typed as  hh : mm  with AM/PM (no more hour-only picker)
- Every time field in the ERP (including Actual Administration Time in Medication Administration and all date-and-time fields) now has two small boxes  **hh : mm**  with the colon fixed in place, and an **AM / PM** dropdown.
- Staff type the hour, the cursor moves to the minutes by itself (typing 9 → 09; a ":" also jumps to minutes). Any minute can be entered (e.g. 1:17 PM) — the old pop-up allowed only whole hours.
- Hours 1–12 and minutes 00–59 only; a full box can be typed over without deleting. Saved values are unchanged (24-hour). No SQL.

## 2.18.82 — Meal times are now periods (needs SQL 275)
- Breakfast **7:30–9:30 AM**, Lunch **12:30–2:30 PM**, Dinner **7:30–9:30 PM**, for all Guests (existing and new). Staff may serve and record the meal any time within the period.
- Nurse reminder 30 minutes before the period ends (9:00 AM / 2:00 PM / 9:00 PM) if the meal is not yet recorded.
- Nursing Manager + Admin / Director escalation **at the end of the period itself** (9:30 AM / 2:30 PM / 9:30 PM) — same channels as before (escalation register, phone, WhatsApp). "Critical pending" 30 minutes after the period ends.
- The nursing screensaver shows each meal with its period and marks it late only after the period ends.
- Open meal escalations made under the old fixed times (8 AM / 1 PM / 8 PM) are closed automatically; a still-unrecorded meal follows the new period rule.
- Run supabase/sql/275_meal_periods.sql, then publish the app. Poor-intake alerts are unchanged.

## 2.18.81 — Nurses can reschedule any medicine dose to any time, with a reason
- Today’s MAR now shows a **Reschedule** button beside every dose that is not yet given (as well as on Refused / Missed / Delayed doses). Nurses, the Nursing Manager and Admin can move that one medicine for that one Guest and time.
- Any new time may be chosen (the earlier 15 minutes–12 hours limit is removed). A time later than the original falls on the same date; an earlier clock time falls on the next date. The form shows the resulting date and time before saving.
- The reason is compulsory and is recorded on the original dose, which stays in MAR history as “Rescheduled”. The dose then appears again at the new time (Today’s MAR, Shift Tasks, screensaver, alerts) and can be rescheduled again if needed.
- No administration time or late-entry justification is asked when only rescheduling. No SQL.

## 2.18.80 — Medication rescheduling with required reason
- Nurses and clinical managers can reschedule a new dose or an existing delayed, refused or missed dose from Medication Administration.
- A new time and reason are required; existing MAR entries are retained, and the rescheduled dose and reason appear in medication history.

## 2.18.78 — AM/PM dropdown and frequency-matched medicine times
- Time fields now use a separate AM/PM dropdown while staff enter the hour and minute; saved values stay unchanged.
- Medicine times are limited to the selected frequency. Choosing another time replaces the prior selection for once-daily medicines.

## 2.18.77 — Manual time entry across the ERP
- Time fields now accept staff entry in h:mm AM/PM format and retain the existing 24-hour values for saving.
- Date and time fields keep the calendar picker for the date while the time is typed manually.

## 2.18.76 — Form errors take you to the field
- Submitting a form with missing required information now scrolls to and focuses the first field that needs attention, including checkbox and radio requirements.
- Error notifications identify likely matching fields and focus them automatically; a **Go to field** button is available when the message matches a field.

## 2.18.75 — Master Care Plan changes reach the screensaver
- Patient edit now retires the previous active care plan before saving and stops if that replacement fails.
- Screensaver, Shift Tasks and the patient Nursing view use the newest saved plan; shift-specific entries replace stale “Both shifts” duplicates.
- Existing duplicate active rows remain available as history and are no longer treated as the current plan.

## 2.18.74 — Clinical alerts and tasks start at admission time
- Medication, care, vital-sign, meal and procedure tasks scheduled before a same-day admission are excluded from the nursing screensaver and Shift Tasks until their next eligible slot.
- Clinical Alerts and Escalations use the admission-time boundary so pre-admission tasks are not marked late or escalated during the new stay.
- Apply Supabase SQL migration 274, then publish the rebuilt ERP app.

## 2.18.73 — Daily Intelligent Report can optionally include the doctor
- Authorized staff can opt in a doctor by name and WhatsApp number from the resident's daily report settings; doctor delivery is off by default.
- Scheduled report logs and retry checks track family and doctor delivery separately.
- Adds optional doctor-recipient fields (SQL 273). No report is sent unless a recipient is explicitly enabled.

## 2.18.72 — Read reviewed prescriptions into Doctor Review medication changes
- Doctor Review / Modify can read the selected written prescription and prefill proposed medication changes using the existing prescription reader.
- Current medicines matched by name are marked Modify; unmatched current medicines stay unchanged; newly read medicines are marked Add. Staff must verify and complete fields before applying.

## 2.18.71 — Bills & Charges opens on Pending items; history stays available
- Bills & Charges now opens with Pending requests only, so completed approvals and historical charges do not crowd the action queue.
- Use the Status filter’s All option to view the full retained history. No records are deleted or changed.

## 2.18.70 — Swipe machine scan reads like a QR scanner, closes and enters by itself (Edge Function pos-screen-scan 1.2.0)
- Fix: the camera kept waiting ("scan keeps continuing") because it captured only when the picture was perfectly still. Now the live picture is read every 1–2 seconds; the **TRANSACTION APPROVED** and **FULL SUMMARY** screens are recognised by themselves (any order), each ticks ✓ with a short vibration.
- When both are read the full check runs; if verified the scanner **closes by itself** and the payment is filled in — no buttons. If the Guest is already selected (Payment / Advance), the payment is **saved automatically** (ledger + WhatsApp receipt with PDF). With Scan with phone, the phone shows "Sent to the laptop" and the laptop saves.
- A declined screen is shown as "cannot be recorded"; after 25 s a tip appears (distance, glare). Failed checks still show ✗ with Scan again.
- Fix: the × (close) on the phone scan page did nothing visible — now it closes the camera and offers Scan again / Open the ERP.
- The **உதவி / Help** button can be **dragged** anywhere (tap still opens Help; the place is remembered on each device), and it hides while the swipe-machine camera is open, so it no longer covers buttons.
- Deploy Edge Function pos-screen-scan (1.2.0), then publish the app. No SQL.

## 2.18.69 — HDFC swipe machine: "Scan with phone" from the laptop (needs SQL 272 + Edge Function pos-screen-scan 1.1.0)
- Beside **📷 Scan machine screen** there is now **📱 Scan with phone**. On the laptop it shows a QR; the staff member scans it with their phone, signs in there with the SAME ERP login if asked, and the phone opens straight into the machine-screen camera.
- After the two machine screens are scanned and verified on the phone, the payment (amount, Card / UPI, RRN, Txn ID) appears **on the laptop by itself** within 2 seconds; Save there as usual. The phone shows "✓ Sent to the laptop".
- The QR is one-time: only for the login that made it, valid 10 minutes, carries one verified scan. Opened by another login, expired or used → a clear message, nothing happens. All 2.18.68 checks apply unchanged.
- Run supabase/sql/272_pos_scan_handoff.sql, deploy Edge Function pos-screen-scan (1.1.0), then publish the app.

## 2.18.68 — HDFC swipe machine: SCAN THE MACHINE SCREEN (no typing, no made-up codes) (needs SQL 271 + 2 Edge Functions)
- **Payments → Card / UPI – HDFC swipe machine** now has a big **📷 Scan machine screen** button. The phone camera opens INSIDE the ERP (no gallery / no uploads, so old photos, screenshots or WhatsApp-forwarded pictures cannot be used) and captures by itself when the picture is steady:
  1. **TRANSACTION APPROVED** screen (amount, SAMARA, date-time, RRN, Transaction ID, BQR / card, Processed by HDFC)
  2. then tap **VIEW FULL SUMMARY** on the machine → Sale Amount, UTR No, **MID, TID**.
- The server (new Edge Function **pos-screen-scan**) reads both and checks: Approved · merchant SAMARA · processed by HDFC · Samara's own machine **MID KSA098 / TID 68357686** · same amount on both screens · payment **today, within the last 15 minutes** · machine clock at the top matches the time now (live screen, not an old photo) · **UTR time** matches the payment time · live photo of the machine (not a screenshot / another display) · **RRN / Transaction ID never used before**. The result shows ✓ / ✗ for each check.
- Only a passed scan can be saved: amount, RRN, Transaction ID, Card / UPI and approval code are taken from the scan on the server (SQL 271 record_pos_card_payment_scan) — staff cannot type or change them. A scan can be used once, within 30 minutes. Then ledger credit + CARDV voucher + automatic WhatsApp receipt with PDF as in 2.18.67 (receipt says "verified from the machine screen"; UPI shows RRN).
- Every scan attempt (passed or not) is kept with both pictures in pos_screen_scans (private bucket pos-screen-scans) — proof for Admin.
- **Typed slip entry is now Admin only** ("Screen not available? Type slip details (Admin only)"), for when a screen cannot be scanned.
- Run supabase/sql/271_pos_screen_scan.sql, deploy the NEW Edge Function pos-screen-scan and the updated staff-payment-request, then publish the app.

## 2.18.67 — HDFC swipe machine (Mosambee POS): one-step entry, ledger credit + automatic WhatsApp receipt with PDF (needs SQL 270 + Edge Function)
- **Payments → Payment Mode** "Card Payment" is now shown as **Card / UPI – HDFC swipe machine**. For a Payment or Advance, Accounts picks **Card** or **UPI QR shown on the machine**, types the **Approval Code** (card) or **RRN** (UPI) from the slip, and optionally the card's last 4 digits.
- On Save the ledger is credited with its CARDV voucher and the slip is recorded together (never half). The **same slip cannot be entered twice** (same day + approval code is blocked, showing the voucher it was already entered under).
- The family gets the WhatsApp receipt **automatically with the PDF** (Samara logo, amount in words, Approval code / RRN, card ending, account after this payment) — every active family contact, logged in WhatsApp Inbox as "Payment Receipt · <category>". If WhatsApp fails, the server retries by itself (every 2 minutes check, after 10 minutes, 3 tries).
- Slip register: new table pos_card_slips (approval code, card last 4, Card / UPI, terminal, voucher, ledger entry) — ready to match against the HDFC / Mosambee settlement report later, or to switch to full machine integration when Mosambee provides it.
- Refunds by card and all other payment modes work exactly as before.
- Run supabase/sql/270_hdfc_pos_card_payments.sql, deploy the Edge Function staff-payment-request, then publish the app.

## 2.18.66 — AUTOMATIC WhatsApp receipt for ALL Razorpay payments (Guest advance / outstanding too) (needs SQL 269 + Edge Function)
- Until now only Outside Samara Nursing payments got the automatic receipt. Now **every Guest Razorpay payment** (Advance or Outstanding, by payment link or UPI QR) sends the family the WhatsApp receipt automatically — sent ONCE, logged in WhatsApp Inbox ("Payment Receipt · Online (automatic)").
- Same message as the Accounts receipt (approved template samara_payment_receipt with Samara logo): amount, Guest, date (DD-MM-YYYY), Receipt No. = payment request no. / Razorpay payment id, mode Razorpay (Online). Receipt **PDF** attached (Samara logo, amount in figures and words, Advance / Outstanding, Razorpay payment id, Guest account after this payment: balance due / advance held) — via template samara_payment_receipt_pdf once Meta approves it, otherwise as a direct document inside WhatsApp's 24-hour window.
- Sent to the family number used for the payment link (Family Portal primary contact first).
- **Every 2 minutes** the server records Guest payments by itself (even if no one has the ERP open) and sends the receipt; failed sends retried after 10 minutes (3 tries).
- Payments made before this version are marked "Before auto receipt" and never messaged — except PAY-EF9B336B55 (₹10,000 advance, 22-10-2026), whose missed receipt is sent once.
- The GitHub copy of staff-payment-request is now the live code (the repo copy was out of date). Run supabase/sql/269_guest_payment_auto_receipt.sql, then deploy the Edge Function staff-payment-request. No app.js change.

## 2.18.65 — Outside nursing: receipt PDF attached to the automatic WhatsApp receipt (Edge Function + new template)
- The automatic Razorpay receipt now carries a **PDF receipt** (Samara logo, receipt no. SNR-…, patient, invoice, amount in figures and words, Razorpay payment id, invoice total / received / balance), made on the server — same content as the ERP receipt.
- Uses the new WhatsApp template **samara_payment_receipt_pdf** (Utility, Document header, same 6 values as samara_payment_receipt). Until Meta approves it: the approved receipt message is sent as now, and the PDF goes as a direct document when the family has written to Samara in the last 24 hours; otherwise the payment panel says "PDF not attached yet".
- Also fixed: samara_payment_receipt needs its Samara logo image header (Meta 132012).
- Update the Edge Function outside-nursing-payment; create the template in WhatsApp Manager (text in the backup's TEMPLATE-samara_payment_receipt_pdf.txt).

## 2.18.64 — Outside nursing: baby-pink dashboard + AUTOMATIC WhatsApp receipt for Razorpay payments (needs SQL 268 + Edge Function)
- Outside Nursing Dashboard uses the screensaver baby-pink gradient (no dark maroon header); boxes in soft pink.
- **Automatic receipt:** as soon as a Razorpay payment is recorded, the family gets the WhatsApp receipt (approved template samara_payment_receipt: amount, patient, date, Receipt No. = invoice / Razorpay payment id, mode Razorpay (Online)) — sent ONCE, logged in WhatsApp Inbox. Sent to the number the payment link went to, else the patient's number.
- **Every 2 minutes** the server checks unpaid links, so a payment is recorded (and the receipt sent) even if the family closes the browser — no need to press Sync.
- A failed WhatsApp send is retried after 10 minutes (3 tries). The online payment panel shows "✓ Receipt sent automatically on WhatsApp to … · time" or why it was not sent.
- Payments made before this version are marked "Before auto receipt" and never messaged.
- Run supabase/sql/268_outside_nursing_auto_receipt.sql and update the Edge Function outside-nursing-payment (supabase/functions/outside-nursing-payment/index.ts).

## 2.18.63 — Outside Samara Nursing: Start a New Procedure (needs SQL 267)
- Big green **+ Start a New Procedure** button on the Outside Nursing Dashboard and the procedure register (nurses, and the Nursing Manager in Nurse mode). One form: patient (search, or **+ New patient** in the same form), procedure, where, **Source** (Doctor's prescription / Family request / Hospital referral / Director / Admin, with name), **Approved by** + **how** (Phone call / WhatsApp / Written / In person), optional **proof photo** (prescription / message), notes. Not blocked — Admin still checks the charge before any invoice.
- **To finish** list (dashboard and register): **Finish** opens the usual completed-procedure form already filled (used items as before) and saves + links it in one step → goes to Admin as before. **Cancel** (nurse who started it, Nursing Manager or Admin) keeps the record with the reason.
- Nurse dashboard simplified: Start button + three boxes — **To finish**, **Returned to me**, **With Admin** (no date filter). Admin / Accounts / Manager dashboards unchanged plus a "Started — to finish" box and list.
- Each procedure's details show **Source / approved by** (and the proof photo). Hover pop-up over the dashboard boxes removed.
- Run supabase/sql/267_outside_nursing_start_procedure.sql once (after SQL 266). Until then the old "Add outside patient / Submit completed procedure" buttons stay.

## 2.18.62 — MAR: a button for every half-hour of the shift
- **Today's MAR** time buttons now cover the **whole shift every 30 minutes** (Day 7:00 AM … 6:30 PM, Night 7:00 PM … 6:30 AM), whether or not medicines fall at that time. Empty times are greyed with "—"; the current half-hour is marked **NOW**. Tapping an empty time shows "No medicines at this time". Compact 4-per-row grid on phones.
- Fixed: insulin with a **fixed dose** (e.g. "Inj. Human Actrapid 10 units") was wrongly flagged "Sliding scale" when its note mentioned GRBS / RBS. Now only insulin without a fixed strength, or a prescription saying sliding scale / as per sugar without a dose, gets "Sugar + units"; fixed doses get the normal green Administer now. No SQL.

## SQL 266 — Nursing Manager Nurse mode: full Nurse access on the server (no app change)
- With **Switch to Nurse ON**, the Nursing Manager is now accepted by **every** server check that allows only Nurses (SQL 259 covered only 8 named functions). Fixes e.g. **Outside Samara Nursing Procedures** ("Only nurses can enter procedures and indents"), requesting a nursing procedure, confirming indent receipt, and the nursing discharge steps.
- How: the shared role helper accepts Nurse mode wherever Nurse is allowed (duty-swap logic kept); nurse-only checks on the signed-in person's role are patched in every live function; two discharge checks patched by exact text. Checks that look up OTHER staff (e.g. lists of nurses to notify) are never changed. Switch OFF = exactly as before; her Manager rights are unchanged.
- Run supabase/sql/266_nurse_mode_full_nurse_access.sql once in the Supabase SQL Editor (needs SQL 259). Safe to run again; the result lists every change.

## 2.18.61 — Medicines: MAR time buttons for the current shift + Administer now
- **Today's MAR** now shows **only the current shift** (Day 7 AM–7 PM / Night 7 PM–7 AM) as a row of **time buttons** (30-minute steps; only times that have medicines; 8:15 goes under 8:00). Each button shows its state: green ✓ all given, amber due now, red late / awaiting doctor, plain "n to give". The page opens on the late or due-now time automatically.
- Tap a time → **Guest-wise (room order), medicine-wise** list. **Administer now** (green) → small confirm (medicine, room, Guest, scheduled time) → saved as Given now; the button turns **grey "Given ✓ time"** and cannot be pressed again. Confirm also offers **Other…** (full MAR form for a different time / Refused / Missed).
- Not one-tap, by design: **Administer (late)** (red, 30+ min late) and **Sugar + units** (sliding-scale insulin) open the full MAR form; **Check BP / sugar first** (amber) appears when recent vitals warn. **Withhold** beside every dose not yet given. "Give checked" removed — every medicine is given one at a time.
- **Night shift after midnight**: a 10 PM dose recorded at 1:30 AM is now saved under its own date (was saved under the new day). The full MAR form shows "Dose of DD-MM-YYYY (night shift)".
- Nurses on phones get the same time-button screen (Doctor Review / Medication History / Refresh on top).
- **Fix (Medication History, 2.18.60):** a given dose also appeared as a second "Not recorded" line (database time 09:00:00 vs prescription 09:00). Now matched correctly.
- The pink hover popup no longer appears over the MAR time buttons (new `data-no-hover` switch in the global hover helper). No SQL.

## 2.18.60 — Medicines: Today's MAR by dose time + Medication History
- **Today's MAR** is now grouped by **dose time** (6 AM, 8 AM, 9 AM, 1 PM …) instead of one long wide table. Inside each time: **room (large) → Guest name once → one line per medicine** with a small status chip and the time given. No more horizontal scrolling.
- Rounds that are fully recorded, and rounds in the other shift, **fold to one line** ("✓ 9 of 9 given"); overdue and due-now rounds stay open and coloured. Top bar: Overdue / attention (tap to show only those), Due now, Given x / y, **Jump to now**, Open / Fold all, and **room buttons** in place of the patient dropdown.
- **Give checked**: per Guest per round, the doses due now are pre-ticked; untick one to Withhold or Record it separately, then confirm to record the rest as Given now. Sliding-scale insulin and any dose with a low-vitals warning are never included — they keep their own **Record** (sliding scale asks for the **blood sugar reading and units given**).
- Tap any recorded dose for the full audit (given at, entry time, late entry, withhold / doctor's instruction, remarks).
- New **Medication History** (tab, and a button for nurses): every scheduled dose with what happened — Given / Withheld / Refused / Missed / Delayed / **Not recorded**. Filters with Apply: Guest (search from 3 letters), Today / Selected Date / This Week / This Month / Month / Selected Period (from 27-08-2026), Status, Medicine. Shown date → time → Guest; summary boxes on top. **Print, Download PDF and Download Excel** follow the applied filter (A4 landscape, Samara logo, signature lines for Nurse / Nursing Manager / Treating Doctor).
- Tabs simplified to **Today's MAR · Active Prescriptions · Medication History · Prescription History** (Missed → Medication History status filter; Completed and Discontinued are a "Show" choice inside Prescription History). Period filter shown only on Prescription History. No SQL.

## 2.18.59 — Statement: choose the view, summary box on top
- **ACCOUNTS / BILLING → Statement** now starts with a **View** choice (then Apply):
  - **Collections — amount received**: Guest Name · Status · Advance Received · Payment Received · **Total Collected** (only Guests who paid in the period).
  - **Full statement**: Guest Name · Status · Total Bill · Discount · Advance Received · Payment Received · **Total Collected** · Balance Due — reads left to right like a bill.
- A **summary box** at the top shows the key totals in large figures, with **Total Collected** highlighted and split as Samara + Outside Nursing (Collections: Advance, Payment, Total Collected; Full: Total Billed, Discount Given, Total Collected, Balance Due). The Total Collected column is shaded in the tables. Print, Download PDF and Download Excel follow the chosen view (Collections A4 portrait, Full statement A4 landscape).
- Samara was inaugurated on **27-08-2026**: the Date / From / To pickers and the Month list start there, and no earlier date is counted. No SQL.

## 2.18.58 — Statement: Status, Total Bill, Discount, Balance Due
- **ACCOUNTS / BILLING → Statement** columns are now **Sl. · Guest Name · Status (Active / Discharged; "Outside visit" in section 2) · Total Bill · Advance Received · Payment Received · Discount · Balance Due**, for both sections, their TOTALs and the GRAND TOTAL (1 + 2). All figures are for the chosen Date / Month / Period. Balance Due = Total Bill − Advance − Payment − Discount (+ any refund paid back); a negative balance shows as "Cr" (advance held).
- Guests listed **A → Z by name, ignoring the title** (Mr. / Mrs. / Dr. …) — earlier "Mr." names came before all "Mrs." names. A Guest appears when there is any bill, payment or discount in the period. Tap a Guest to see every entry (Date, Particulars, Debit, Credit).
- Print / PDF: "Accounts / Billing" now sits in the centre of the header; A4 landscape so all 8 columns fit. Room-tariff adjustments are folded into the bill (never shown as discounts). No SQL.

## 2.18.57 — Statement: Samara + Outside Nursing sections
- **ACCOUNTS / BILLING → Statement** now has two sections for the chosen Date / Month / Period: **1. Samara** (Guests: Advance Received, Amount Received, Total) and **2. Outside Samara Nursing Procedures** (amount received per person, all their invoices together), each with its own TOTAL, then **GRAND TOTAL (1 + 2)**. Same in Print, Download PDF and Download Excel.
- The Guest list has "All (Samara + Outside Nursing)", then Samara Guests and Outside Nursing patients, so one person can be chosen from either. Outside nursing has no advances (shown as ₹0). No SQL.

## 2.18.56 — Statement: amount received only
- **ACCOUNTS / BILLING → Statement** is now a simple statement of money received from Samara Guests for a chosen Date / Month / Period: **Sl. · Guest Name · Advance Received · Amount Received · Total**, with a TOTAL row. Only Guests who paid in the period are listed (A → Z); Trial Guests are left out.
- Filters: **Guest** (All Guests or one Guest), **Date / Period** and **Apply**. Buttons: **Print**, **Download PDF** (real .pdf file, A4) and **Download Excel**. Tap a Guest to see each receipt (date, Advance / Payment with voucher / reference, mode, amount).
- Advance Received = Advance entries (and payments in the Advance category); Amount Received = all other payments. Charges, discounts and refunds are not part of this statement. No SQL.

## 2.18.55 — Statement: simpler filters
- **ACCOUNTS / BILLING → Statement** now has only **Search Guest**, **Guest** (All Guests, or pick one or more — each picked Guest shows with × to remove; "All Guests" in the list clears them), **Date / Period** and **Apply**. The Status, Trial and Hide options are gone: the statement always covers Active + Discharged Guests, leaves out Trial Guests (unless you pick one) and hides Guests with no entries and ₹0.
- The Guest entries window (tap a row) now fits without sideways scrolling, so Debit and Credit are always visible. No SQL.

## 2.18.54 — Accounts: new "Statement" page
- New **ACCOUNTS / BILLING → Statement** (right under Accounts Dashboard), for Admin / Director and Accounts. One table of Guests with **Opening Balance, Charges, Received (payments + advances), Discount, Refund and Balance**, plus a TOTAL row.
- **Guests:** All Guests (Active + Discharged, Active only, or Discharged / Inactive) or **Selected Guests** (search by name / ID from 3 letters, add one or more). Trial Guests are left out unless "Include Trial Guests" is ticked; Guests with no entries and ₹0 balance are hidden unless unticked.
- **Date / Period:** Today, Selected Date, This Week, This Month, Month (choose), Selected Period (From – To), with the **Apply** button. Opening Balance = everything before the start date.
- **Print** (A4 landscape, opens the print dialog), **Download PDF** (saves a real .pdf file; amounts show as "Rs." because PDF fonts have no ₹ sign) and **Download Excel**, all following the applied filter. Tap a Guest row to see that Guest's entries for the period.
- Same figures as the Guest Ledger: room-tariff adjustments are folded into the room charge (not shown as discounts), dates are DD-MM-YYYY, names A → Z. No SQL.

## 2.18.53 — Discount no longer shows as "Cash"
- In **Accounts → Billing & Payments**, a **Discount** entered right after a Cash payment was saved with that payment's mode and voucher number, so the Guest Ledger showed it as "Cash · CV-…". A Discount (and a manual Charge) is not money received: it is now always saved as **Not applicable** with no voucher / reference, and the Payment Mode and Reference boxes are hidden for these two types. Changing the Transaction type also clears any leftover voucher number. Cash totals and reports were never affected (they count only Payment / Advance / Refund).
- **SQL onetime_265_fix_discount_shown_as_cash.sql** (run once): corrects the ₹6,587 Final Settlement discount of 21-10-2026 that was saved as Cash · CV-2026-000012. Amount and balance unchanged.

## 2.18.52 — Phone: screensaver task boxes fully visible
- On phones the screensaver's **Vital Signs, Nursing Procedure, Meals and Care** boxes were squeezed to a thin strip and overlapped each other (the Medicines box was fine). Each box now shows in full, one under the other, below the Medicines box: task name, next time, details, Room and the Guest's full name on its own line. Care keeps its scrolling list. Computer / tablet screens unchanged. No SQL.

## 2.18.51 — Phone: "Start Screen Saver" button fully visible
- On phones (Nurse / Nursing Manager) the **Start Screen Saver** button was squeezed into the narrow ⌂ Home column of the header and showed only half ("Star…"). It now sits on its own row under the page title, full size, easy to tap. Desktop unchanged. No SQL.

## 2.18.50 — Pharmacy & Stores lists in alphabetical order
- **Stock Report** (Simple and Detailed, screen, Excel and PDF) now lists items **A → Z by item name** within each section (Consumables, Pharmacy, Housekeeping, Kitchen), instead of by item code.
- Same A → Z order (capital / small letters ignored, so "VENFLON" and "Vacuum" sit together) in: Current Stock of every Stores section, Stores Master, the issue / indent item lists, the Excel stock backup, Stock Reset history, Kitchen stock and Equipment types. Charge Master and Bills & Charges were already alphabetical. No SQL.

## 2.18.49 — Stock Report: removed items no longer listed
- An item that has been **removed** (switched off) from Stores and has **no stock left** no longer appears in the Stock Report (Simple or Detailed), even if it had a stock movement in the chosen period (e.g. the write-off when it was removed). A removed item that still shows stock is listed, so nothing is hidden by mistake. Current Stock already worked this way. No SQL.

## 2.18.48 — Kitchen & Food Stores: Nursing Manager can view / monitor
- The STD now handles the Kitchen & Food Stores account. The **Nursing Manager** now sees the full **Kitchen & Pantry** workspace (PHARMACY & STORES → Kitchen / Food Stores): Overview, Purchase Register with receipts, Cash Requests, Kitchen Stock and usage history, In-charge & Handover, Cash Book & Reports (CSV), Ledger & Statement — instead of only the Hand Over Cash screen.
- **View / monitor only**: a note at the top says so. She cannot record purchases, usage, cash counts, add items or do Admin steps; her only action stays **Hand Over Cash** (from her Petty Cash, as before).
- **SQL 263_kitchen_nursing_manager_view.sql** (run once): gives the Nursing Manager read access in `kitchen_access()`. All action checks are unchanged. Until it is run she keeps the old Hand Over Cash screen.

## 2.18.47 — Stock Report: Date / Period filter for both reports
- **Simple** report now has a Date / Period filter too: it shows the remaining quantity **as on the end of the chosen date** (Today, a Selected Date, or the last day of the chosen week / month / period).
- Both reports: Today · Selected Date · This Week · This Month · Month (choose) · Selected Period (From – To), with Apply. Future dates are blocked. The Excel / PDF heading shows the date or period.
- Compact layout: all filters on one row, smaller buttons beside the item count, slimmer table rows with the heading fixed while scrolling; the tick box sits beside its text. No SQL.

## 2.18.46 — Stock Report in the left menu
- **PHARMACY & STORES → ⤓ Stock Report** is now its own left-menu item (below Receive from Vendor), for everyone who has Stores. Choose Simple / Detailed, the Section (or All sections) and the period, press Apply, then Download Excel or PDF. The dashboard box stays too.
- Receive from Vendor also gets a proper menu icon (it showed a plain square). No SQL.

## 2.18.45 — Pharmacy & Stores: Stock Report download (Excel / PDF)
- New box **⤓ Stock Report (Excel / PDF)** on every Pharmacy & Stores dashboard. Two reports, both with serial numbers (S.No.):
  - **Simple** — S.No., Item Code, Item Name, Unit, Remaining Quantity.
  - **Detailed** — S.No., Item Code, Item Name, Unit, Opening Stock, Received from Vendor, Used to Guests, Adjustments (±), Balance — for Today / This Week / This Month / Selected Period (with Apply).
- Used to Guests = handed over to Guests minus unused items returned. Adjustments = Stock Reset, corrections, Department Issue, so Balance always adds up and matches Current Stock. Option to hide zero-stock items; tap a row to open that item's usage register. PDF opens the print page (A4, Samara logo) → Save as PDF. No SQL.

## 2.18.44 — Nurse mode is now exactly the Nurse login
- In **Switch to Nurse**, the Nursing Manager now sees exactly what a Nurse sees — same menu, pages, Alerts page, alert bell and buttons. Removed what was still showing from her manager login: Enquiries and other extra menus (extra-duty / leave-cover / kitchen / food / payments menus), the manager sections of the Alerts page, the discharge banner, Store In-charge buttons on Patient Consumables and the Biomedical Equipment admin view. The role badge reads "Nurse".
- Kept from 2.18.43: the Switch button itself and the approval pop-ups (store indents, charge / discharge approval requests) so nothing waits for her; opening one switches her back to Nursing Manager. No SQL.

## 2.18.43 — Nursing Manager: "Switch to Nurse" (one login)
- The Nursing Manager gets a **🩺 Switch to Nurse** button at the top (beside her role badge). It changes her screens to exactly what a nurse sees (nurse menu, Clinical Dashboard, nurse task lists, screensaver); **↩ Back to Nursing Manager** returns her. Same login, same employee record, same name on every entry — no duplicate employee.
- Manager alerts stay on while in Nurse mode (store indents, approval / charge pop-ups, discharge banner, clinical bell, Notifications). Opening a manager-only page from an alert switches her back automatically.
- Only Nurse Manager / Nursing Manager designations see the switch. Each switch is written to the audit log.
- **SQL 259_nursing_manager_nurse_mode.sql** (run once): records the switch on the server and lets the Nursing Manager pass the nurse-only server checks ONLY while it is ON — Nursing Procedure request / Confirm & Start, approval requests, outside-procedure indents, Guest item use, unused-item returns, equipment start, final nursing discharge clearance. Switch OFF = exactly as before. Until the SQL is run, the switch changes the screens only.

## 2.18.42 — Patient file → Billing: coloured figures
- The five Billing boxes now use the Accounts page colours: Charges teal, Advance blue, Payments green, Discounts purple, Outstanding red (green when nothing is due or when it shows Advance Balance (Cr)). No SQL.

## 2.18.41 — Patient file → Billing: Advance now counted
- The Billing tab in the Guest's file left out Advance entries, so Payments showed ₹0 and Outstanding showed the full charges even when an advance was paid. Advance is now counted (same rule as Accounts and the Patient Ledger), shown in its own **Advance** box (not as Payment), and deducted from **Outstanding**. When the advance is more than the charges, the last box shows **Advance Balance (Cr)**.
- Totals now use up to 1,000 ledger entries (was 200), so a long stay is not undercounted. No SQL.

## 2.18.40 — Backup & Fresh Start stays open after the reset
- After pressing Reset the section closed and reopened, so the result vanished and it looked as if the page went back. Now it stays open, and a green "✓ Stock reset done — RST-nnnn" banner with the next steps shows at the top for 24 hours. Method choice (radio buttons) laid out properly. No SQL.

## 2.18.39 — Backup & Fresh Start opens without timing out
- The step 2 check table no longer reads the whole Stock Movement register into the browser (it timed out: "statement timeout"). Recorded Guest use is now summed on the server, and an index on the register speeds up the reset. **SQL 258_store_recorded_use_summary.sql** (run once).

## 2.18.38 — Stock Reset: "Bills − recorded use" method
- Backup & Fresh Start → step 3 now offers two methods. **Bills − recorded use (recommended)**: old purchase entries (vendor receipts and old adjustments) stop counting, while everything handed over to Guests / departments (less returns) stays — each item starts below zero by what was used; scanning ALL purchase bills (old and new) in Receive from Vendor then brings each item to purchased − used = what should be on the shelf. **Zero, then physical count** is still available. The check table shows the recorded Guest use per section; Reset history and the snapshot show the method, recorded use and balance after reset. **SQL 257_stock_reset_bills_minus_used.sql** (run once).

## 2.18.37 — Pharmacy & Consumables: fresh start of stock
- **⤓ Excel** on every Pharmacy & Stores dashboard: downloads Current Stock, Vendor Receipts and Stock Movements of that section as one Excel file (backup of the present entries, any time).
- New box **Backup & Fresh Start** (Pharmacy, Consumables): 1) download the Excel backup, 2) check items with a balance and open indents, 3) **Stock Reset** (Admin / Director only, type RESET) — every item's balance is set to 0 by ONE permanent "Stock Reset RST-nnnn" adjustment line. Nothing is deleted: item names, codes, units, Charge Master rates (MRP) and every Guest record (indents, charges, bills, Family Portal) stay as they are. A full snapshot of the old balances is kept in the ERP (tap a reset in Reset history → download it).
- New box **Opening Stock – Physical Count** (Store In-charge): enter shelf stock that has no invoice, item by item / batch with expiry; new items are added without a price. Shown as an adjustment "Opening Stock – Physical Count", not a vendor purchase.
- Receive from Vendor: if the bill has no vendor name, type it (or choose a vendor used before) — same in the manual form. Bill MRP different from the Charge Master rate (or a new item with no rate): the Charge Master rate is kept and the line goes to the new **MRP Review** box, where Admin / Director keeps the rate or sets a new one.
- Expiry Watch ignores receipts of stock that was reset to zero. **SQL 256_stock_fresh_start.sql** (run once).

## 2.18.36 — Usage Register: discharged Guests tagged
- Item Usage Register patient-wise search covers active AND inactive / discharged Guests (Patient status "All" by default; choose "Inactive / Discharged residents" for only them). Discharged Guests are now tagged "(Inactive / Discharged)" in the patient-wise list. No SQL.

## 2.18.35 — Item Usage Register: patient-wise search
- Pharmacy & Stores → (Consumables / Pharmacy / Housekeeping / Kitchen) → Item Usage Register: **Search patient / ID** (3 characters), **Patient status** and **Patient / procedure** are now at the top. Searching a Guest lists only the items that Guest used — issued, received, actually used, charged, returned and remaining balance for that Guest — tap an item for its full history (the patient filter stays applied). Clear the search to see all items and store balances. No SQL.

## 2.18.34 — Screensaver: next-shift tasks within 4 hours
- The screensaver now also shows tasks of the NEXT shift that are due within 4 hours, with a blue **Next shift** tag — e.g. at 4:20 PM the 7:00 PM Nebulization / Blood Glucose and the 8:00 PM Dinner (Night shift). Before, they were hidden and the box said "Nothing due in the next 4 hours". Applies to medicines, vital signs, nursing procedures and meals. The footer "This shift: N of N tasks done" still counts only the current shift. No SQL.

## 2.18.33 — Screensaver fits laptop screens (Edge)
- On short screens (e.g. a 1366×768 laptop at 125% in Edge with toolbars) the screensaver now uses a compact layout: smaller header, one-line overdue bar, and "Nothing due" boxes (Vital Signs, Meals) shrink to one line so the Nursing Procedure and Care boxes get the room — no more text cut off. Large monitors are unchanged. No SQL.
- SQL 255 applied 19-10-2026 (one care record per scheduled time for fixed-time procedures).

## 2.18.32 — Nursing procedure times in clock order
- Procedure times are now listed in clock order everywhere (form chips, patient file, Shift Tasks): 6:00 AM, 7:00 AM … 10:00 PM. Before, they started from the 7 AM shift change, so 6:00 AM came last. 6:00 AM still shows "Night" — the Night shift is 7 PM–7 AM (the form says so). Family Portal v1.0.43 lists them the same way. No SQL.

## 2.18.31 — Edit Nursing Procedure plan
- Patient file → Nursing → Nursing Procedures: an **Edit** button beside Stop (Admin / Nursing Manager) opens the same form filled in — change the procedure, Timing, times (add / remove), instruction — then **Save Changes**. Shift and Frequency follow the times. Changes apply from now on; records already made keep their own time. Every edit is in the Audit Trail (before → after). No SQL.

## 2.18.30 — Charge request timestamps and full details
- Bills & Charges Approval shows the request creation timestamp. Clicking a request row or mobile card opens its full recorded details, including patient, service, billing, provider and approval fields. Decision buttons do not open the detail view; Nursing still cannot see financial amounts. No SQL.

## 2.18.29 — Nursing procedure list layout
- Patient file → Nursing → Nursing Procedures: each planned procedure shows the name on one line and the times underneath, with the Tamil button and **Stop** on the right (Stop was pushed out of view when an instruction was present). No SQL. (SQL 254 applied 19-10-2026; SQL 255 prepared, not yet run.)

## 2.18.28 — Nursing Procedures in the Family Portal
- Family Portal (v1.0.42) now shows Nursing Procedures: planned procedures recorded by nurses (with scheduled time) and procedures started via Approval Requests; planned procedures no longer counted under Care. ERP "Preview Family Portal" sends the same data. **SQL 253 `family_portal_nursing_procedures`** (installed 19-10-2026).

## 2.18.27 — Nursing Procedures at fixed times (like medicines)
- Nursing procedure form: new **Timing** — "Fixed times" (default) or "Any time in shift". With fixed times, add as many times as needed (e.g. 8:00 AM, 2:00 PM, 8:00 PM) or use a quick pick (Once / Twice / 3 times / Every 6 h / Every 4 h). The **Shift is locked** and set from the times (Day 7 AM–7 PM, Night 7 PM–7 AM, or Both); Frequency is set too (e.g. "3 times daily").
- Each time is a **separate task**: screensaver Nursing Procedure box shows it at its time (late after 1 hour); Shift Tasks lists "2:00 PM · Nebulization" with Complete / Exception; Daily Care records which time was done (picked directly in Daily Care → the nearest time). Patient file → Nursing shows the times and each record's time.
- **SQL: run `supabase/sql/252_nursing_procedure_fixed_times.sql`** (after 251): care_orders.scheduled_times, care_logs.scheduled_time.

## 2.18.26 — Nursing Procedure plan (Admission Section 5, patient file → Nursing, screensaver)
- **Admission → new Section 5 "Nursing procedures"** (later sections renumbered 6 and 7): pick procedures from Charge Master → Nursing Procedures (same names and codes), or type one not in the list; Shift, Frequency, optional preferred time window and instruction. Saved with the draft. Optional.
- **After admission:** patient file → **Nursing** tab → "＋ Add Nursing Procedure" / "Stop" (with reason) for Admin / Nursing Manager; nurses view. The Nursing tab now shows Master Care Plan, Recent Care Records, **Nursing Procedures (planned)** and **Nursing Procedure Records** (procedures recorded from Shift Tasks / Daily Care + procedures started through Approval Requests). Overview shows "Nursing Procedures: N planned". Edit Patient keeps the planned procedures when the care plan is saved.
- **Screensaver:** planned procedures appear in the **Nursing Procedure** box (with code / time window), not in Care; once recorded in the shift they drop off. A Guest with only procedures still counts as "no care plan". **Shift Tasks** lists them with a "Nursing Procedure" tag ("Basic Care & Nursing Procedures"); **Daily Care** offers the Guest's planned procedures as activities.
- Charging unchanged: a procedure is still charged only through NURSING → Approval Requests. **SQL: run `supabase/sql/251_nursing_procedure_plan.sql`** (adds care_orders.order_kind / procedure_code / tariff_id / stop fields).

## 2.18.25 — Screensaver: Medication box flips late doses + the next 2 hours
- The Medication box now flips only **late doses and doses due within the next 2 hours** (if none, the next dose time), so with many Guests the round stays short. Later doses join automatically as their time comes near; the footer shows "+ N more doses later this shift".
- Each card stays 7 seconds; when more than 6 cards are flipping, 5 seconds each. "N Guests this shift · N late" still counts the whole shift. No SQL.

## 2.18.24 — Screensaver: usual care for Guests without a care plan
- For a Guest with **no Master Care Plan**, the Care box now shows their **usual care for this shift** — the care items recorded in Daily Care for the same shift (Day / Night) in the last 3 days (e.g. Bathing assistance, Oral hygiene) — each line marked **"usual · no care plan"**. Once recorded in this shift, the item drops off as done.
- The Care box header shows **"N Guest(s) without care plan"** as a reminder to fill the Master Care Plan (Edit Patient → 4. Master care plan). Guests who have a care plan are shown from the plan only, as before. No SQL.

## 2.18.23 — "Start Screen Saver" button
- A pink **Start Screen Saver** button in the top bar of every page (Nurse and Nursing Manager logins) opens the task screensaver at once, without waiting 90 seconds. Touch anywhere to return to work, as before. Tamil: "ஸ்கிரீன் சேவர் தொடங்கு". No SQL.

## 2.18.22 — Screensaver: roomier medicine list; right-side boxes equal size
- Medication box: more line space between medicines — each medicine on its own line with the route / food instruction underneath and a light divider, more space between the time, room and the list.
- The four right-side boxes (Nursing Procedure, Meals, Vital Signs, Care) are now **equal height** and together fill the same height as the Medication box; each keeps flipping Guests (Care keeps its scrolling list). No SQL.

## 2.18.21 — Screensaver: shift counts per task type
- Fixed a misleading footer: "3 Care" counted Vital Signs and Meal recordings as Care. The footer now counts each type separately — e.g. "6 Medication · 1 Vital Signs · 0 Procedures · 2 Meals · 0 Care" — so "Care" means only care-plan items (bath, position change, oral hygiene …), the same items the scrolling Care box lists. No SQL.

## 2.18.20 — Screensaver: the big left box is for Medicines only
- The big left box now shows **Medication only**, one Guest at a time (flips every 7 seconds), **late doses first, then by time**: dose time, large room number, Guest name and the **full list of medicines with serial numbers** (strength, route / food instruction; sliding-scale insulin marked "check sugar first"). "1 of 3" dots, "4 late", and the next Guest's time and room are shown. When nothing is pending: "No medicines due".
- The right side lists **Nursing Procedure, Meals, Vital Signs** as full-width boxes (more room for text), then the **Care** list scrolling bottom-to-top.
- Care shift names are matched more tolerantly (e.g. "Day", "Day Shift", "Both"), and an empty Care box now says **"No care planned for this shift"** or **"All care done this shift"** instead of "Nothing due". The Overdue strip now shows only non-medicine tasks (late medicines are in the big box). No SQL.

## 2.18.19 — Version shown on the screensaver and in the window title
- The screensaver footer shows the running version (e.g. "· v2.18.19"), and the browser window title / splash now show the current version instead of the old "2.15.13", so it is easy to see whether a PC has the latest update. No SQL.

## 2.18.18 — Screensaver: Next Task = the most immediate task; medicine names with serial numbers
- The big **Next Task** box now always shows the most immediate task of any type — Medication, Vital Signs, Nursing Procedure, Meals or Care. A **late** task comes first (the countdown becomes a red "Late 1h 15m" and the box gets a coral border); otherwise the task due now / soonest. Shift-wide care without a time is listed in the Care box instead.
- Medicines are shown **by name with serial numbers** instead of "Medicines due (3)": the Next Task box lists them one per line (1. Metformin 500 mg — After food, 2. …; sliding-scale insulin marked "check sugar first"); the Medication box shows them on up to two lines. No SQL.

## 2.18.17 — Screensaver: Care box scrolls the whole shift's care, one line each
- Care is shift-based, so the **Care** box no longer flips. It lists **all pending care of the shift**, one line each — **care · room · Guest name** (plus the preferred window when one is set, e.g. 10:00–12:00) — scrolling slowly from bottom to top when there are more lines than fit. Late care is marked Late.
- The Care box is always last and full width so each line has room. Box headers stay on one line on smaller screens. No SQL.

## 2.18.16 — Screensaver: every open Nursing Procedure request is shown
- Fixed: a Nursing Procedure (e.g. **Nebulization** for Room 109-C) did not appear when it was scheduled more than 4 hours ahead, or was still waiting for the Nursing Manager's approval.
- The Nursing Procedure box now shows **all open requests for the shift**, as in Approval Requests → Open Requests: **Approved** ("Ready to Start", with its scheduled time) and **Requested** (purple "Awaiting approval" mark). An unscheduled request still awaiting approval is never put in the Next Task box. Started / Declined requests are not shown. No SQL.

## 2.18.15 — Screensaver: larger, colour-coded task names
- Each task type now has its own colour and a much larger name: **Vital Signs** teal, **Medication** magenta, **Nursing Procedure** purple, **Care** orange, **Meals** green — in the Coming Up boxes and in the Next Task box. No SQL.

## 2.18.14 — Screensaver: medicines and care plan read reliably
- Fixed: the screensaver showed "Could not read: Medicines" and so no medicine tasks. Medicines and the care plan are now read on their own (the Guest's room and name are joined from the Guest list), with a simpler second attempt if the first read is refused.
- If anything still cannot be read, the on-screen notice now includes the exact reason, to help find it quickly. No SQL.

## 2.18.13 — Screensaver keeps the monitor on
- While the task screensaver is showing, the ERP asks the browser to **keep the screen on** (Chrome / Edge "screen wake lock"), so Windows no longer turns the monitor black after a few minutes. Released as soon as the screensaver closes, and when the 30-minute idle sign-out happens, so normal power saving returns after that. If the browser refuses, it is logged in System Health. No SQL.

## 2.18.12 — Screensaver for the Nursing Manager too; starts after 90 seconds
- The idle task screensaver now also comes on for the **Nursing Manager** login (as well as Nurses).
- It starts after **90 seconds** without activity (was 3 minutes). The 30-minute idle sign-out is unchanged. No SQL.

## 2.18.11 — Nurse screensaver: all five task boxes always shown; ready for a full house
- **Vital Signs, Medication, Nursing Procedure, Care and Meals** boxes are always shown. A type with nothing pending shows a dashed box with a tick — "Nothing due in the next 4 hours" (or "Shown in Next Task") — so the layout stays the same whether 1 or 19 Guests are in.
- Tested with **19 Guests** (full capacity): boxes with more than 8 Guests flip every 3 seconds instead of 4, so a full cycle stays short; room numbers such as "104-C" fit on smaller screens.
- If any record could not be read (internet / permission), the screen says so ("Could not read: Medicines — please check Shift Tasks") instead of showing "nothing due", and the fault is logged for Admin in System Health. No SQL.

## 2.18.10 — Nurse screensaver: task-wise boxes with flipping Guest cards
- **Coming Up** is now one box per task type — **Vital Signs, Medication, Nursing Procedure, Care, Meals** (Meals kept separate) — with the task name at the top and a summary line (e.g. "6 Guests · next 2:00 PM · 1 late").
- Inside each box the Guests **flip one at a time** (about every 4 seconds, boxes staggered so they never flip together): time, bright room number, full name, and what to do (medicine count / procedure / care item / meal). "2 of 6" with dots shows the position. Late Guests come first with a coral **Late** mark; a box whose task is due now gets a magenta border.
- Boxes are ordered by their earliest task; empty types are hidden. With 4–5 types the boxes sit in two columns. The Next Task box is not repeated on the right, and a meal Next Task flips through its pending Guests too.
- Wider layout on large monitors. No SQL.

## 2.18.9 — Nurse screensaver: light pink Next Task, big room numbers, clock seconds
- **Next Task** box is now a **light pink gradient** with dark text. The **room number is large and bright** (white badge, bright magenta) with the Guest's **full name** below it.
- Coming Up boxes: room number larger and bright magenta, then the name.
- Meal recording ("Lunch — record food intake") now shows the **room and name** of the Guest still to be recorded (up to 3 names, then "+ N more").
- Clock shows **seconds**, so it is clear at a glance that the screen is live. No SQL.

## 2.18.8 — Nurse screensaver: Guest names, larger gradient pink boxes
- Guests are shown with **Room + full name** (e.g. "Room 106 · Mr. Kumar Lakshman") instead of initials, in Next Task, Coming Up and Overdue.
- **Coming Up** boxes are larger and easier to read from a distance — 3 per page (turning every 9 seconds), bigger time, task and name text, titles up to 2 lines — with a soft **gradient pink fill**. The Next Task box now has a **gradient magenta fill**. Medicines are still shown as a count. No SQL.

## 2.18.7 — Nurse idle screensaver: upcoming tasks in Samara pink boxes
- **Nurse login only:** after **3 minutes** without activity the screen shows the current shift's tasks — big magenta **Next Task** box (time, countdown, type, Room + Guest initials), **Coming Up** boxes for the next 4 hours (5 at a time, turning every 9 seconds), and a coral **Overdue** strip when something is late. Types: **Medication** (count per Guest; sliding-scale insulin named with "check sugar first"), **Nursing Procedure** (approved, Ready to Start), **Care** (daily care with its preferred window, vital signs, meal recording).
- Gentle motion only (soft glow on Next Task, pulsing overdue border, slow drift against screen burn-in); still on devices set to reduce motion. The first touch / key only closes it — nothing underneath is pressed. A new clinical alert pop-up closes it. Not shown on Talk to Guest or while a video plays. The 30-minute idle sign-out is unchanged.
- Read only — uses the same tables as Shift Tasks; nothing is saved. No SQL.

## 2.18.6 — Scan colours simplified; Receive from Vendor in the left menu
- Scan colours (Admission ID card, prescription medicines, Stores supplier bill): fields filled by the scan now **stay white**; only fields **not filled / not clear are yellow** (no more green). A scanned medicine row is yellow only while something is still missing.
- New left-menu item **PHARMACY & STORES → Receive from Vendor** (for the Nurse Manager / Store In-charge, STD when assigned, and Admin): opens the supplier-bill scan and manual receive straight away, for all sections at once — each bill line keeps its own section; a line whose section is not clear is yellow until chosen. No SQL.

## 2.18.5 — Prescription uploaded once (Section 2), read in Section 3
- Admission: the prescription is uploaded only once — in **Section 2 → Current Prescription / Medicine List**. Section 3 no longer has its own upload. It finds the uploaded pages by itself and shows **✨ Read & Auto Fill Medicines** or **✍ Enter Manually** (like the ID card in Section 1).
- Pages already read are remembered with the draft (also after a reload), so they are never read or attached twice. A page added later in Section 2 shows as new and is read and added to the list. If nothing is uploaded yet, Section 3 says so with a **↑ Upload in Section 2** button. No SQL.

## 2.18.4 — Discard a scanned bill; filled / unfilled fields in two colours
- Stores → Receive from Vendor: **🗑 Discard this bill** (top and bottom) throws away the scanned pages and every line not yet received — e.g. when the wrong bill was scanned. Nothing that was not received is saved. Lines already received stay in stock (the confirmation says so; correct them with Physical Tally).
- Colours, as in the trial: **light green** = read from the document — check it; **light yellow** = not filled / not clear — fill or confirm it. Used on every scanned bill line and header, and after an ID scan in Admission. Colours go away when the line is ✓ Verified / received, or the field is changed. A small legend explains them. No SQL.

## 2.18.3 — Supplier bill with Pharmacy and Consumables items together
- Each scanned line is received into its OWN section (from the Stores Master, else as read from the bill), whichever Stores page the scan was opened from.
- A line whose section is not clear on the bill takes the page's section but is marked **yellow** ("Section not clear — change it if this is a Pharmacy item").
- The Receive confirmation shows the split, e.g. "Pharmacy: 3 line(s) · Consumables: 2 line(s)". No SQL.

## 2.18.2 — Scan: add several pages, Clear, yellow check boxes (as in the Scan Lab trial)
- All three scans (ID card, prescription, supplier bill) now collect pages first: **+ Add more pages** / **+ Photo of page N** (e.g. Aadhaar front + back), thumbnails with ×, **Clear**, then **✨ Read & Fill…** reads them together.
- After an ID scan, the fields it filled (to check) and the identity / address fields it could not fill are shown in **light yellow** until filled or changed, or **✓ Checked against the card** is pressed.
- District / taluk matching understands Tamil spelling variants (Thoothukkudi = Thoothukudi, Tuticorin, Srivaikundam = Srivaikuntam, Trichy, Tanjore …). No SQL.

## 2.18.1 — Sign-out on this device only
- **Idle sign-out (30 minutes)** now signs out only the device that was left idle; the same staff member stays signed in on their other devices. Activity in any ERP tab of the same browser counts, so an idle second tab no longer signs out the tab being used.
- **Sign Out** buttons (menu, mobile drawer, header) sign out this device only. A profile that fails to load because of a network problem also signs out this device only.
- Unchanged — still sign out on **all** devices: inactive staff account, login not linked to an employee profile, security identity mismatch, and password change. No SQL.

## 2.18.0 — Document scan in the live ERP (from the Scan Lab trial)
- **Admission → Section 1: 📷 Scan ID card** (Aadhaar / Passport / other ID). Fills Name, Date of Birth (age), Gender and address where still empty — Tamil Nadu district / taluk matched to the lists. Shows what was filled and what was kept. Only the last 4 digits of the ID number are ever read. The card is attached as the identity document.
- **Admission → Section 3: 📷 Scan prescription** (photo / PDF, up to 8 pages, read in parallel). Each medicine is added as a row with doctor, strength, frequency, times (Samara meal times), route (incl. Nasal), food and duration; unclear values are marked. A doctor not printed is entered once for all. Every scanned medicine must be ticked **✓ Verified** (or Edit → ✓ Done & verified) before the admission can be saved. The prescription is attached as a document.
- **Stores → Receive from Vendor: 📷 Scan supplier bill.** Vendor, invoice no. / date and every line read; lines matched to the Stores Master (code, section, unit; sizes must agree); pack-size conversion, MM/YY expiry, subtotal check. Tick ✓ Verified per line, then **Receive verified lines** — received through the same database function as the manual form. A NEW item is added to the Stores Master without a price; the Guest charge rate is fixed only by Admin / Director in Charge Master.
- Who can scan = who can already use the form. Edge Functions prescription-scan (1.1.0) and store-scan (1.2.0) now accept any active staff login. Scan Lab trial page stays (Admin only) for testing. No SQL.
- Fixed: a stray "🎤 Voice" button could stay inside an Admission medicine row after the row was locked.

## 2.17.11 — "Nasal" medicine route
- Medicine Route lists now include **Nasal** (nasal sprays / drops, e.g. Budecort nasal) in Admission, Spot Assessment and Medicines (Doctor Review / Modify). Scan Lab prescription reading fills Nasal when the prescription says so. No SQL.

## 2.17.10 — Food & Meals alerts and escalations (like medicines)
- **Meal Due**: Breakfast 8 AM, Lunch 1 PM, Dinner 8 PM. If the meal is not recorded in Resident Food Intake, the nurse gets the alert at the meal time (pop-up, voice, Clinical Alerts); Nursing Manager + Admin / Director are escalated 30 min later (Clinical Escalations, phone notification, WhatsApp; "Critical pending" at 60 min). Saving the meal (any intake) closes it automatically. Not raised for Tube-feeding Guests or for a meal time before admission. Starts from the time SQL 249 is run.
- **Poor Meal Intake**: saving a meal as Consumed partially / Tasted only / Refused / Vomited alerts Nursing Manager + Admin / Director at once (escalation, phone, one WhatsApp). Close it in Clinical Escalations with remarks; closes by itself if the entry is corrected.
- Tapping a meal alert opens Resident Food Intake with that Guest (and meal / date) selected. Clinical Escalations has a new **Food & Meals** tile. Requires SQL 249 + redeploy of Edge Function clinical-escalation-dispatch.

## 2.17.9 — Emergency discharge with dues pending
- Patient Discharge / Discharge Clearance: Admin / Director can use **🚨 Allow Departure – Dues Pending** (reason compulsory) when a Guest must leave before paying, e.g. emergency transfer to hospital. All charge requests must be resolved first. Nothing is discounted — the balance stays in the Patient Ledger / Family Portal as due. The nurse then completes Final Discharge as usual (room / bed released, discharge WhatsApp + Discharge Summary as usual).
- New **Discharged – Dues Pending** list (Admin, Director, Accounts): dues at departure, balance now, Receive Payment (opens Payments with the Guest selected), Send Reminder Now, Pause / Resume reminders. Marked **Settled** automatically when the balance becomes zero.
- Family gets the existing **samara_bill_reminder** WhatsApp every 3 days (10 AM–6 PM IST) until paid — new Edge Function discharge-dues-reminder-dispatch, run hourly by pg_cron. Requires SQL 248.

## 2.17.8 — Bill file picker fix when adding several charges
- Bills & Charges: after "+ Add Charge" the file picker is cleared, so it no longer shows the previous charge's file name, and choosing the next bill (even the same file name) is always attached. A line under the picker now shows exactly which file(s) are attached to the current charge. No SQL.

## 2.17.7 — Bills & Charges in the Nursing Manager menu (2.17.6 + page access)
- Nursing Manager (Manager role): NURSING OVERVIEW now has **Bills & Charges** (raise outside bills and other charges with "+ Raise Bill / Charge"). Charge Register stays as the view-only list. No SQL.

## 2.17.5 — Outside Services paid by Samara
- Bills & Charges → new category **Outside Services** (outside pharmacy, lab, scan / X-ray / ECG, ambulance, taxi / auto, hospital OPD / bill). Nurse / Nursing Manager enters the shop / lab / hospital, bill no. + date, bill amount, who paid (NM Petty Cash, Admin / Director, Samara Bank / UPI, On credit - pay later, Family paid directly) and uploads the bill (compulsory); From → To for ambulance / taxi.
- Accounts verifies the bill amount → Guest bill gets the item "(at actual)" plus a separate "Handling charge" line. Handling fee is set per item in Charge Master → Outside Services (fixed ₹ or % of bill). NM Petty Cash bills are written into her petty cash book automatically (not for Trial Guests). Family-paid bills are recorded only, never charged, and do not block discharge.
- New "Outside Bills Paid by Samara" register in Bills & Charges (Accounts / Admin): Guest / status / period filters with Apply, totals, payables to vendors (all dates) with Mark Paid, full details and View Bill. "Hospital Bill Paid by Samara" and "Outside Pharmacy Purchase" under Hospital Visits are turned OFF (now under Outside Services).
- Family Portal 1.0.40 shows outside bills with the original bill (View Bill). Requires SQL 247.

## 2.17.4 — Replace later room tariffs; clean item names on bills
- Rooms → Edit: when the room has later dated tariffs, they are listed and a tick box "Replace all later tariffs from this date" applies the new rate from the chosen date up to today (each later tariff is superseded and adjusted; nothing deleted).
- Bills (Final Bill, Bill with Breakup, Guest Ledger) no longer show internal remarks typed into a charge description (e.g. "admission …", "user-authorised consolidation; correction recorded …", "100 Nos x Rs15"); real item details such as "Suction Catheter - 14 Fr" stay. Family Portal 1.0.39 matches. No SQL.

## 2.17.3 — Room rent shows only the final rate
- Final Bill, Bill with Breakup and Guest Ledger: after a room tariff revision, each day's room / nursing charge is shown at the final rate only (e.g. "Room rent (13-10-2026 to 17-10-2026) 5 days × ₹6,000"). The old rate and separate "Room tariff adjustment" charge / discount lines are no longer shown. Totals and net payable unchanged; ledger entries not altered. Family Portal 1.0.38 matches. No SQL.

## 2.17.2 — Charge rate history and dated multi-rate bill lines
- Charge Master → new "Rate Change History" tile: every patient charge-rate change (Stores / Pharmacy items and service tariffs) is recorded automatically with old rate, new rate, who and when. Requires SQL 246.
- Final Bill and Bill with Breakup: when the same item was charged at different rates during the stay, each rate line shows its dates, e.g. "Suction Catheter - 14 Fr (02-10-2026 to 04-10-2026)". Item names unchanged, so ERP and Family Portal still match.

## 2.17.1 — Guest Bill with Breakup (PDF)
- Complete Patient Bill: new "Bill with Breakup (PDF)" — choose Guest, choose period (Whole Stay / This Month / Month / Period), Apply, preview, then Download.
- PDF carries the Samara logo and shows charges by category (Room Rent, Nursing, Pharmacy, Consumables, …) with item lines (Qty × Rate = Amount), payments in the period, previous balance, balance payable and amount in words. Same simple item names as the Final Bill / Family Portal. No SQL needed.

## 2.17.0 — Stores quantities and usage reconciliation
- Whole-number stock quantities for receipts, indents, handovers, returns, resident use and Housekeeping. Currency precision is unchanged.
- Item Usage Register separates actual resident / Outside Nursing use, Housekeeping holdings and charged quantity; all-history view avoids treating prior-period balances as additional receipts.
- Superseded stock entries are excluded from active register calculations while audit history is retained.

## 2.16.99 — Housekeeping indent and usage workflow
- STD has permanent Housekeeping request, receipt and usage access. Nursing Manager approval and assigned Stores In-charge handover remain separate stages.
- Handover deducts stock once; STD records dated usage and remaining Housekeeping balance with full staff history and audited corrections. No patient billing.
- Added period/item/status filters and Housekeeping usage to Item Usage Register. Requires SQL 242.

## 2.16.98 — Actual patient item consumption
- Nurses record dated patient consumption against received indents, with quantities, remarks, staff history and audited void/correction.
- Patient remaining balance subtracts actual use and confirmed returns; pending returns reserve availability. Charged quantity remains separate, with no additional billing or stock deduction.
- Item Usage Register includes resident recorded use, remaining balances and full consumption history. Requires SQL 241.

## 2.16.97 — Item Usage Register
- Added item-wise stock reconciliation and patient / Outside Nursing procedure / department breakdowns, with full linked details on tap.
- Added patient and item search, status filters and Today / This Week / Month / From–To periods; charged quantities remain separate from recorded use and wastage.
- Current Stock item names open their usage register; stock balances stay organisation-wide.

## 2.16.96 — Discharged patient ledger and bill search
- Added Active, Inactive / Discharged and All patient selection to Guest Ledger and Final Billing.
- Search the selected status by name or resident ID from three characters; retain full financial history for discharged residents.

## 2.16.95 — Payment patient search
- Added Active, Inactive / Discharged and All patient filters with name / ID search from three characters in payment history and manual entry.
- Kept patient selection consistent between history and payment entry, including discharged residents.

## 2.16.94 — Completed staff return notifications
- Stop login action popups for staff already marked back on duty; retain their recorded return in Notifications and leave history.
- Continue action alerts for staff who have not returned after leave.

## 2.16.93 — Menu order by daily workflow
- Prioritised patient care for clinical roles, billing for Accounts, and the patient workflow for Admin; specialist modules now follow core daily tasks.
- Preserved page permissions, dedicated dashboards and Accounts subgroups across desktop and mobile navigation.

## 2.16.92 — Physiotherapy patient and period filters
- Added patient dropdown and name / ID search from three characters across the dashboard, sessions and patient billing.
- Added Today, This Week, Month and custom From / To periods with matching counts and totals; retained organisation-scoped therapist reports.

## 2.16.91 — Dedicated Physiotherapy Dashboard

- Consolidate physiotherapy into one sidebar section. Sessions and clinical review, patient rates and billing, and Admin therapist accounts open inside one dashboard with role-specific tabs. Old task links continue to open the sessions workspace.
- Admin sets patient-specific rates; Accounts reviews and approves session charges directly within the dashboard. Clinical staff see session tasks and counts without patient prices or supplier accounts.
- Replace the embedded physiotherapy panel in Accounts Dashboard with a shortcut to the dedicated dashboard; remove duplicate Nursing and Accounts menu entries. Existing Supabase permissions and pricing rules stay in force.

## 2.16.90 — Patient-specific physiotherapy billing

- Admin / Director sets each patient’s agreed session rate with an effective date and approval notes. Accounts can view pricing and approve resulting session charge requests. No generic tariff fallback.
- Completed sessions without a patient rate remain visible as awaiting pricing. Saving a rate queues eligible completed sessions; later completions queue automatically. Duplicate requests and existing manual charges are guarded. Existing requests retain their rate.
- Add the patient billing panel to Accounts Dashboard and Admin’s Physiotherapist Accounts. Supplier fees remain separate. Apply 240_patient_physio_billing.sql before this release.

## 2.16.89 — Collection Breakup

- Add a navigable Accounts Dashboard box with month/category drilldowns and Total Charges (after discounts), Realised and Pending. General receipts and advances settle oldest charges first per patient; discounts are proportional, refunds reduce receipts, and outside nursing invoices remain separate. Unused advances are shown separately.
- Load complete resident billing history with pagination; suppress the breakup on partial data errors. Read-only reporting, with no bill or receipt changes.

## 2.16.88 — Dedicated Outside Nursing dashboard

- Add an Outside Nursing menu with a dedicated dashboard and filtered procedure register. Admin sees the full overview; nurses see procedure and correction tasks; managers see clinical and item queues; Accounts sees approved invoices, receipts and balances. Existing server permissions remain in force.
- Date and patient filters apply throughout. Voided records are excluded, consolidated item links are respected, and collections use receipt dates. No resident charges are mixed into these totals. Load failures are shown explicitly.

## 2.16.87 — Tube feeds in Family Portal preview

- Include the selected guest's non-voided tube-feed entries in Preview Family Portal, showing the same item, volume and entry time as the family portal.
- Wait for feed loading before sending preview data; no staff identities or internal clinical remarks are sent.
- Family Portal code and family_portal_tube_feeds SQL migration are maintained in Samara_Family_Portal.

## 2.16.86 — STD Communication Inbox access

- STD can view all inbox conversations, replies, payment messages and attachments; hide/restore messages and refresh approved templates.
- Server checks require an active STD profile. Other ERP roles and financial permissions are unchanged.
- Requires SQL 239 and deployment of whatsapp-send, whatsapp-media and whatsapp-templates-sync.

## 2.16.85

- Include approved outside nursing invoices and saved receipts in Accounts dashboard, reports, payment-mode totals and CSV exports using one read-only projection of canonical records. SN invoice identifiers keep outside care separate from resident accounts.
- Main Dashboard includes outside nursing receivables and a direct summary card. No duplicate ledger postings or changes to resident census / discharge billing.
- Reports provide Resident Billing / Outside Nursing filters; exclude pending and voided invoices and expose load failures.

## 2.16.84

- Refresh the current balance before manual payment recording. Settled invoices and already-saved retries open the existing receipt without another entry; gateway settlement races recover to the receipt.
- Green success confirmation after saving; grey inactive payment button for fully paid invoices and completed receipt actions. Prevent concurrent form submissions and retain server overpayment protection.
- Receipt payment selector uses DD-MM-YYYY.

## 2.16.83

- Outside nursing: every saved payment opens a branded receipt panel automatically. Download the receipt PDF or share the prepared PDF and payment acknowledgement through WhatsApp.
- Existing saved payments remain available through Payment receipts. Each receipt identifies its payment, amount, date, mode, invoice and current balance; unrecorded payments cannot produce a receipt.

## 2.16.82

- Outside care: nurses enter items already used; Stores approval completes the indent and posts stock usage once, without a nurse receipt step. In-house receipt workflow retained.
- Rename manual collection to Record payment received; display invoice balance and a saved-payment confirmation. Payment recording validated with rollback-only partial/full settlement and overpayment tests.

## 2.16.81

- Outside nursing: nurse submits procedure and used-item indents together, without prices. Stores retains indent approval and handover.
- Admin / Director enters one procedure charge and approves; item prices and totals are calculated on the server from Store Master. Standard procedure tariffs and manual invoice item-rate entry removed. Existing invoices preserved.

## 2.16.80 - Approval-gated direct WhatsApp invoice sending

Prepare the direct API route for sender 7395961616 and samara_invoice_payment. Keep current phone sharing until Meta reports APPROVED Utility with the expected document header. Recheck readiness while the panel is open. Direct sends use the saved family number, a privately stored invoice PDF, canonical invoice/request details and recorded family opt-in confirmation. Serialize sends and block uncertain outcomes from automatic retry. Record acceptance and use existing Inbox delivery updates separately. No real patient test messages are sent during deployment.

## 2.16.79 - Invoice attachment through phone sharing

Send via WhatsApp opens the native share sheet with the prepared full Samara invoice PDF and payment message included. Staff choose WhatsApp, select the family contact and send. The invoice itself includes the secure link. Use the same file-sharing flow for verified receipts. Do not download or open a text-only draft; unsupported browsers explain how to use iPhone Safari. Highlight Send via WhatsApp in green with white text. Keep Create payment link and Send via WhatsApp together and visible, with Send disabled while a link or PDF is unavailable.

## 2.16.78 - Simple WhatsApp invoice and payment request

Keep Create payment link and Send via WhatsApp as the payment actions. Prepare the full branded invoice with nursing and consumables/pharmacy charges and the secure Razorpay link. Send via WhatsApp downloads the PDF and opens a recipient-specific draft for staff to attach and send. Reuse active links and refresh payment status when returning from WhatsApp and every 30 seconds while the panel is open; verified paid receipts use the same Send via WhatsApp action. Remove separate share, copy, cloud-send, status-check and cancel buttons.

## 2.16.77 - Visible online payment panel on mobile

Bring the online payment panel into view and focus it whenever Online payment is tapped, including repeated taps on the same invoice. Prevent the above-register panel from appearing unresponsive on iPhone. Opening the panel does not create a link or send a message.

## 2.16.76 - Compact nursing register, document dates and footer icons

Use the existing ERP-wide DD-MM-YYYY display formatter in shared nursing/physiotherapy invoice, receipt and statement PDFs and payment statement text. Payment statement CSV date columns also use DD-MM-YYYY. Database dates, filters and gateway payloads remain ISO. Draw phone and envelope icons beside Samara footer contacts so PDF icons do not depend on emoji fonts.

Keep the nursing register compact with expandable procedure summaries. Move clinical notes, reasons, detailed actions and invoice balances into View details; collapse voided history, procedure rates and the indent register by default. Preserve role restrictions, audit history and financial amounts.

## 2.16.75 - Nursing invoice column layout

Widen the Procedure column and narrow the Reference column; rename Location / Reference to Reference. Place Samara phone numbers and email below the single-line footer address, remove repeated Samara contact details from the header, and reserve footer space on every page. Make Outside Nursing tables wrap within the page and stack as labelled cards on smaller screens, eliminating horizontal register scrolling. Invoice values remain unchanged.

## 2.16.74 - Audited consolidation of nursing invoice items

Admin may review received items from another unbilled record for the same patient/date into an unpaid approved invoice, with an amendment reason and explicit item rates. Retain original nursing notes, indent links and stock movements; void the source as consolidated, record previous/new totals in audit, and mark the PDF amended. Payments and active online links block amendments. Requires SQL 235. Includes the pending charge-label correction from 2.16.73.

## 2.16.73 - Clear nursing charge labels

Rename the approval fields to Nursing procedure charge (INR) and Item rate (INR). These are existing nursing and material charges, not an additional administration fee. Calculations and database rules are unchanged.

## 2.16.72 - Nurse-only procedure entries and duplicate review

Only nurses may create outside patients, procedure entries and used-item indents or confirm indent receipt. Admin reviews, sets fees, approves, returns or voids unbilled duplicates with a reason and retained-record reference. Same-day patient care requires a separate-care reason, including concurrent submissions. Voided records retain history and cannot be billed or edited. Indent and payment safeguards prevent discarding stock or financial records. Requires SQL 234. Existing records are not automatically changed.

## 2.16.71 - Verified nursing receipts for WhatsApp Web

Paid online requests prepare a Samara-branded PDF acknowledgement from verified nursing receipt entries. Admin/Accounts can download it or open an existing WhatsApp Web draft for the checked patient/family number. Staff attach the PDF and press Send. No automatic WhatsApp delivery, browser-session credentials, or new Meta template. Unverified/pending requests cannot produce a receipt.

## 2.16.70 - Outside nursing online payments

Approved outside nursing invoices have a Razorpay payment-link workspace for Admin/Accounts, explicit branded WhatsApp sharing to a checked patient/family number, partial-amount requests, status checks, cancellation and synchronisation. Server-side captured-payment verification posts atomic, idempotent receipts to outside nursing statements only. Manual receipts are blocked while a link is open. Requires SQL 233 and outside-nursing-payment Edge Function. No automatic messages or real payment tests.

## 2.16.69 — Training menu opens sample screens

Clicking a training sidebar section opens its first sample screen and expands the matching submenu. Individual module buttons continue to open their screens. On small screens, navigation brings the content into view. Version training assets to refresh cached scripts.

## 2.16.68 — Read-only staff training walkthrough

Add a separate training.html login with 94 sample module screens and fictional records. Browse/search/detail views and sample billing period totals only; no production configuration, Supabase SDK, live authentication or messaging. Content Security Policy blocks network connections and form submissions. Add a training link to staff sign-in. Demo identity: training.viewer; public demo access code: SamaraDemo2026. This is a walkthrough, not a full functional copy of the ERP.

## 2.16.67 — Restore Bills & Charges register loading

Move paginated register loader into ClinicalCharges scope so requests load successfully. Manual patient/status/category/date changes clear notification request focus; dashboard quick views clear period focus.

## 2.16.66 — Bills & Charges period filters and totals

Add day, Monday–Sunday week, month and inclusive custom date filters alongside Patient, Status and Category. Show matching entry count and request/approved totals; preserve nursing amount privacy. Load all register pages so totals include older entries. Fix Approved Today filtering initialization.

## 2.16.65 — Samara branded bills, invoices and statements

Outside nursing invoices and statements use the Samara logo, magenta headers, pink accents and single-line Samara address footer. Patient name, address and mobile appear above the charge table. Shared physiotherapy PDFs and food supplier statements use the same branding. Resident complete bills and patient ledgers now include patient address above their tables. Logo loading failures prevent unbranded nursing/physiotherapy PDF generation. Financial calculations and stored invoice snapshots are unchanged.

## 2.16.61 — Scheduled and actual physiotherapy session time

Completed entry forms collect Actual Session Time (IST) separately from Scheduled Time, with minute precision. Actual occurrence updates the session event timestamp; recorded/updated timestamps remain separate. New completions require a real, non-future actual time. History, Admin session accounts, posted fee snapshots, ledger, statement PDFs and CSV include both times. Old records show actual time as Not recorded; existing save timestamps are not backfilled as treatment time. Modify uses approval; approved Reschedule/Pending/Not Done clears actual time. Active supplier fees must be reversed before actual-time corrections change their snapshot. Historical deleted entries can be restored without inventing actual time. Install SQL 230 after 229.
## 2.16.60 — Nurse-entered physiotherapist directory

Nurse selects an organisation and enters the attending therapist. Saving a session atomically registers or reuses the name under that organisation and links the session to the directory ID. Admin sees it under Physiotherapist Accounts > Physiotherapists and can set the fee without retyping the name. Clinical autocomplete suggests matching names after three letters, scoped to active people within the selected organisation; switching organisation clears the previous name. Capitalisation/extra spaces reuse canonical names. Pending correction proposals register new names only upon approval. Existing session-linked individual names populate the directory without rewriting clinical history or money entries. Safe clinical lookup exposes only IDs, organisation IDs and names; rates remain Admin-only.

SQL 229 installs the directory and atomic link trigger. Posted fees protect provider IDs, and fee posting uses the recorded attendee. Failed or rejected saves roll back automatically created names.
## 2.16.59 — Individual physiotherapist session rates

Admin can set an optional positive default fee for each physiotherapist. Blank uses the organisation default. Post session fee selects the recorded therapist when matched and fills that person's default; changing the attending therapist refreshes the default. Admin can override the agreed fee for a session. SQL also falls back to therapist/organisation rates when a fee is omitted. Updating defaults does not rewrite posted fees. Rates remain inaccessible to nurses. Install SQL 228 after 227.
## 2.16.58 — Existing Pending physiotherapy entry

Existing Pending entries expose Record Session directly beside Session options. Both plan entry and the Pending-row action retain the session's approved scheduled time. Legacy Vinayaga organisation labels default to Vinayaga Physio Point in Record Session and Modify, without putting the organisation into the attending therapist name. Nurses enter the actual attending name. Clinical outcome changes still follow the existing recording/approval rules. No SQL migration needed.
## 2.16.57 — Filtered physiotherapy statements

Admin Physiotherapist Accounts > Statement: select Organisation and From/To period; review opening/closing payable and patient-linked ledger entries. Print / Save PDF and Send WhatsApp (PDF) use the exact same paginated PDF. Native sharing is available on supported devices; desktop fallback downloads the PDF for manual WhatsApp attachment, matching Food Vendor. Files are generated locally and are not automatically sent. Nurses retain count-only access.
## 2.16.56 — Organisation selection and attending physiotherapist

Record Session includes an organisation dropdown from Admin-managed active organisations and a manual attending physiotherapist name. Completed sessions require both, preserve organisation IDs, and appear in counts and Admin accounts before fee posting. Initial organisation: Vinayaga Physio Point. Admin can add more using Physiotherapist Accounts > Add organisation. Provider corrections use the existing approval workflow and posted-fee guard. Older sessions retain their original details.

SQL 227 exposes only organisation IDs/names to clinical staff and links session/account queries by organisation ID. Financial access remains Admin-only.
## 2.16.55 — Physiotherapy escalation and outsourced accounts

Pending sessions remain due at their scheduled time. Approved future reschedules suppress the old slot; completed, not-done and moved slots close stale physiotherapy escalations. Reverted due slots reopen through the existing escalation processor and configured thresholds.

Admin: Accounts / Billing > Physiotherapist Accounts. Organisation and practitioner details, agreed fees per completed session, patient/resident/room snapshots, payments/refunds, vouchers, reversible ledger entries, CSV and print/PDF. Rates are frozen when fees are posted. Posted fees must be reversed before clinical deletion or outcome/date changes. Duplicate postings and payment retries are protected.

Nurses see organisation/practitioner session counts under Physiotherapy; financial tables and RPCs enforce Admin-only access. Install SQL 225 and 226 after SQL 222–224.
## 2.16.54 — Reschedule directly from session entry

- Add Reschedule to Record Session: enter new date/time and reason, then submit for Nursing Manager/Admin approval and notification.
- SQL 224 retains the original scheduled session as Pending; no false completion required. Existing recorded outcomes continue through Session options.

## 2.16.53 — Physiotherapy approval notifications

- Notify Nursing Manager/Admin inside ERP when a correction awaits their review, with a badge, notice and Notifications-page shortcut.
- Refresh on live request events, window focus and every 30 seconds; clear reviewed alerts and suppress duplicate notices and self-review.
- SQL 223 scopes pending alerts to eligible reviewers.

## 2.16.52 — Nurse correction requests and approval

- Session options: Delete, Modify or Reschedule, one reason, Submit for approval.
- Nursing Manager/Admin review; database enforces approval, keeps snapshots and supports restoring approved deletions. Normal outcomes for planned Pending sessions remain available.
- SQL 222 adds the request queue, permissions and atomic actions; rollback-only database workflow tests passed.

## 2.16.51 — Simple physiotherapy corrections

- Use one reason field for correction and rescheduling, retain audit history, and keep the reason visible while changing status.
- Expose Physiotherapy to Admin and Nursing Manager using existing database permissions.

## 2.16.50 — Visible physiotherapy status actions

- Replace Status dropdown with Completed, Pending and Not Done buttons for direct status selection in session recording and correction.

## 2.16.49 — Physiotherapy corrections

- Add Correct Session to revert an incorrectly completed session to Pending with a mandatory correction reason and preserved original date.
- Preserve prior values in audit details; reject concurrent edits and billing-linked corrections.
- Apply physiotherapy_timestamp_repair.sql in Supabase to permit empty completion timestamps for Pending / Not Done.

## SQL 221 (database only, no app change) — Erase Trial Guest leaves nothing behind

- Found: Admin → Rooms → **Room Shift History** still listed erased Trial Guests. Those rows pointed to a Guest record that no longer existed (e.g. an earlier duplicate record of the same Trial Guest), so the erase — which looks for the Guest's own id — never saw them. The audit log also kept every Trial Guest's name.
- **Run supabase/sql/221_trial_erase_complete.sql** (installs the fix, then shows a PREVIEW — no data changed), then **onetime_221_trial_leftovers_STEP2_erase.sql** once to remove the earlier leftovers.
- From now on "Erase Trial Guest" and "Erase all Trial Guests" also remove: rows in any table that carry the Guest's name / id but point to no Guest record (and every other row of those records, e.g. ledger rows), and every audit-log entry about the Guest. Stock history keeps quantities but loses the name.
- The one TRIAL_GUEST_PURGED audit record stays for accounts (Resident ID, receipt voucher numbers, PAID Razorpay IDs) but never the Guest's name (database trigger).
- Real Guests are never touched; their tariff adjustments stay permanent. Tested on a Postgres copy: real Guest and unrelated rows kept; preview changes nothing; safe to run again.

## 2.16.46 — Tamil brand spelling: சமரா

- The Tamil (தமிழ்) screens now spell the brand **சமரா** everywhere (was சமாரா in 30 places, e.g. "சமரா கேர் — ஸ்பாட் அசெஸ்மென்ட்").
- Files: src/app/global-ui/09-tamil-dictionary.js, version files, app.js (rebuilt). No SQL, no Edge Function change.

## 2.16.45 — Guests from other states and other countries; name and relationship separate (SQL 220)

- **Run supabase/sql/220_guest_country.sql** once in Supabase → SQL Editor (safe to run again). It adds a "country" column to patients. Until it is run, admissions still save; the country is then kept inside the written address.
- **Same address fields in Spot Assessment, Admission and Patients → Edit** (one shared file, guest-address.js): **Country** first (India, Bangladesh, Nepal, Sri Lanka, Bhutan, Myanmar, Maldives, Gulf countries, UK, USA … or "Other country" typed), then:
  - India – Tamil Nadu: District and Taluk lists (as before).
  - India – other states: State / UT list (all 36); District and Taluk / Tehsil / Mandal typed.
  - Bangladesh: Division list (8), District list (64, by division), Upazila / Thana typed, 4-digit Postcode.
  - Other countries: State / Province, District / City typed, Postal code.
  - Street and Door No. are compulsory only for Indian addresses. The full address shows the country for Guests from outside India. Earlier Guests are read as India.
- **Phones with country code** in Spot Assessment too (Person, Contact 1, Caller, Contact 2), same list as Admission (+880 Bangladesh, +977 Nepal, +975 Bhutan, +95 Myanmar, +960 Maldives added). Empty phone boxes take the code of the address country. A leading 0 (e.g. Bangladesh 01712…) is dropped automatically. Checks: India 10 digits, Bangladesh 10 digits after +880.
- **Fix — family WhatsApp numbers outside India**: Admission and Patients (Daily Report recipient / quick edit) cut every number to its last 10 digits, so a Bangladeshi family's messages would have gone to a wrong Indian number. Numbers outside India now keep their country code (e.g. "+880 1712345678"); Indian numbers are stored as before. "Send Login PIN (Existing Method)" no longer forces +91.
- **Name and relationship separate** (staff no longer type both in one box): Spot Assessment "Permission given by" → name + relationship list; photo consent "Agreed by" → name + relationship list. Older records ("Ravi, son") are split automatically when opened.
- **Spot Assessment matches Admission**: Title / Salutation added, name in capitals, same Gender order and relationship list (with "Other"). Convert to Guest now carries Title, Country, the whole address and phones with their country code.
- **Identity document** wording follows the country: Aadhaar / Identity Card for India; Passport / National ID card (and visa page) for others.
- Tamil words added for the new labels.
- Files: guest-address.js (new), index.html, spot-assessment.js, src/app/patients/admissions.js, src/app/patients/patients.js, src/app/global-ui/09-tamil-dictionary.js, supabase/sql/220_guest_country.sql (new), tests/guest-address.test.mjs (new), version files, app.js (rebuilt). No Edge Function change.

## 2.16.43 — System Health: the ERP notices its own problems; Talk to Guest adjusts itself (SQL 219)

- **Run supabase/sql/219_system_health.sql** once in Supabase → SQL Editor (safe to run again). It adds details and "resolved" marks to the existing fault log (client_errors) and lets only Admin mark faults resolved. Until it is run, faults are still recorded (details inside the message) and the page shows a note.
- **Automatic fault log** (everyone, silently): besides page crashes, the ERP now records **failed saves** (database refused a save), **server errors**, **server unreachable / offline**, **slow requests (> 8 s)** and **Talk to Guest events**. Only the table / function name, status and timing are kept — never what was typed or saved; phone numbers and e-mails in messages are masked. Up to 60 per session, same fault at most once a minute. Kept 90 days.
- **New Admin page: ADMIN → System Health** — tiles (faults, open problems, staff affected, most affected page), Period Today / This Week / This Month / Selected period and Show Open / Resolved / All with **Apply**, faults grouped with counts and first / last time (DD-MM-YYYY), tap a group for every occurrence (date & time, staff, role, page, version, details), **Mark resolved** with a short note. Admin only (not Managers).
- **Talk to Guest adjusts itself while in use** (each adjustment recorded):
  - Live **echo**: if a translator hears the other's voice again, the echo is dropped and muting made stronger automatically.
  - Live **missed speech**: people talking but nothing heard for 12 s → both translators restart by themselves; twice in 5 minutes → continues in Standard mode.
  - Standard: **3 sentences in a row not caught** → the wait after the speaker stops is raised one step automatically.
  - Live drops, Live unavailable, slow translations (> 7 s), errors and microphone problems are recorded.
  - When Live falls back, the Standard settings (wait, voice) are shown.
- Files: bootstrap-error.js, src/app/core/09-error-safety.js, src/app/global-ui/12-system-health.js (new), src/app/communication/talk-to-guest.js, navigation + menu icon, manifest, supabase/sql/219_system_health.sql (new), tests/system-health.test.mjs (new), version files, app.js (rebuilt). No Edge Function change.

## 2.16.42 — Talk to Guest Live: two-way conversation no longer freezes

- Found in a recorded real test: Google's live translator streams near-silent audio non-stop and never sends an end-of-sentence signal. The protection that mutes one translator while the other is speaking took that silence for speech, so once both directions were open **each kept muting the other** and neither heard anyone (Guest worked alone; staff replies — or anything after the second translator opened — were lost).
- Now only **audible** translated speech counts as speaking (near-silence is neither played nor counted), the two translators are **never muted at the same time**, and a sentence is finished after a 1.6 s pause in the translated text (no end signal needed).
- Staff speak first: Google reports the language only after the sentence, so the "send what staff just said" step now goes back 6 s (was 0.8 s) — the first staff sentence is no longer missed.
- Screen only — no Edge Function or SQL change. Browser test reproducing Google's real behaviour: staff-first → tap language → guest → staff → guest, all translated.

## 2.16.41 — Talk to Guest Live: staff replies now translated

- Fix: in ⚡ Live mode the Guest was translated but staff Tamil replies were not, because the Guest's language was not recognised from Google's reply, so the staff → Guest translator never opened.
- The Guest's language is now taken from Google's code **or** language name (e.g. "Bengali"), and otherwise from the **script of the Guest's words** (Bangla / Devanagari / Malayalam / Telugu / Kannada / English letters). If it still cannot tell, the language buttons appear immediately so the reply can be translated.
- Screen only — no Edge Function or SQL change. Browser tests: language as code, as name and missing → staff reply translated in all three.

## 2.16.40 — Talk to Guest: ⚡ Live mode (translates while the person is speaking)

- New **Mode: ⚡ Live (fastest) / Standard** (Live is the default, remembered per phone). Live uses Google **Gemini Live Translate** (preview model gemini-3.5-live-translate-preview): the translation streams **while the person is still speaking**, a moment behind, in a voice like the speaker's (male / female kept automatically). No waiting for a pause, no buttons.
- How it works: two live translators share the microphone — one turns anything into Tamil (silent for Tamil), the other turns anything into the Guest's language (silent for that language). The Guest's language is detected from their speech and the second translator switches automatically. Each translator is muted while the other is speaking its translation, so they never translate each other.
- **Staff speak first**: the language buttons appear; after one tap the last few seconds of what staff said are translated straight away (no repeating). If Google does not report the Guest's language, it asks once.
- The text of the sentence being translated is shown live; finished sentences are listed as before ("Live" tag); Listen again uses the normal voice.
- **Automatic fallback**: if Live is not available for the account (preview) or the connection keeps dropping, the conversation continues in Standard mode with a note.
- Security: the Gemini key stays on the server. The Edge Function gives the phone a 30-minute Live token (mode "live_token") with the model locked, after the same staff / role / budget checks.
- Optional secret GEMINI_LIVE_TRANSLATE_MODEL to change the model name. **Redeploy the talk-to-guest Edge Function** (dashboard single-file index.ts) to enable Live; until then the screen falls back to Standard. No SQL. 43 mocked tests; browser tests with a simulated Gemini Live (guest-first, staff-first, fallback) passed.

## 2.16.39 — Talk to Guest: waits for the speaker to finish, smoother voice

- **No more cutting off**: softer / quieter voices are picked up (once speech starts, a lower level keeps the sentence open); thinking pauses inside a sentence are allowed; up to 45 s per turn; the listener no longer resets after 8 s when a quiet voice was not picked up (now 15 s of real silence).
- **Wait after speaker stops: 0.8 s / 1.2 s / 2 s** (default 1.2 s, remembered on the phone). In the first 2 s of speech it waits 0.5 s longer (people often pause after the first words).
- **✓ Translate now** button while someone is speaking — sends at once without waiting.
- **Smoother voice**: a short buffer (about 0.35 s) before playing, and again if the network falls behind, so there are no gaps; the voice is asked for a natural, brisk pace instead of "calm".
- Each translation also shows the **AI time**: "Text 1.6 s (AI 1.4 s) · Voice 2.0 s".
- Redeploy the talk-to-guest Edge Function (dashboard single-file index.ts) for the brisker voice; everything else is in the screen. Either order works. No SQL.

## 2.16.38 — Talk to Guest: faster replies (streamed voice)

- **Voice starts while it is still being made**: the server streams the spoken translation in small pieces and the phone plays from the first piece, instead of waiting for the whole voice file. The translated **text appears the moment it is ready**.
- Server checks faster: after the login is verified, the staff profile and request budget are read **at the same time**. Gemini uses its fastest thinking setting (minimal → low → default if a model refuses).
- **Warm-up** when Start is tapped, so the first sentence is not slowed by the server waking up (no AI call, no budget used).
- Pause before translating: 0.9 → 0.8 s.
- Each translation shows **how long it took** ("Text 1.4 s · Voice 1.9 s", counted from the end of the sentence) — please share these numbers for further tuning.
- Listen again replays the saved voice instantly. Screen and Edge Function work in either order (older function → whole reply at once, as before).
- **Redeploy the talk-to-guest Edge Function** (dashboard single-file index.ts) to get the speed-up. No SQL. 41 mocked tests.

## 2.16.37 — Talk to Guest: translation spoken in a voice matching the speaker (male / female)

- When a man speaks, the translation is read in a **male voice**; when a woman speaks, in a **female voice** — automatically, for staff and Guest.
- How: the AI judges how the voice sounds while translating (no extra delay); if it is unsure (or the OpenAI backup is used) the phone's measured voice pitch decides (below ~165 Hz = male). Default female.
- **Voice: Auto (match speaker) / Female / Male** buttons to override if it guesses wrong. Each translation shows "male voice" / "female voice". Listen again and the staff-first language tap keep the same voice.
- The voice judgement is used only to choose the synthetic voice for that reply — never saved.
- Voices: female "coral", male "ash" (change with Supabase secrets TALK_VOICE_FEMALE / TALK_VOICE_MALE if wanted).
- **Redeploy the talk-to-guest Edge Function** (dashboard single-file index.ts) to switch voices on. Screen and function work in either order. No SQL. 34 mocked tests.

## 2.16.36 — Talk to Guest: 6 guest languages (English, Hindi, Bangla, Malayalam, Telugu, Kannada)

- Staff speak **Tamil** (Tamil with English words mixed in still counts as staff). The Guest can speak **English, Hindi, Bangla, Malayalam, Telugu or Kannada** — detected automatically each sentence; the Tamil reply goes back in the Guest's latest language.
- **English now counts as a Guest language** (before 2.16.36 English was treated as staff speech).
- Staff speak first: the sentence is translated into all six at once, and the six language buttons appear — one tap speaks it (no repeat). Language chips at the top for all six; consent line shown in all six languages.
- Menu subtitle / dashboard button: "6 languages".
- **Redeploy the talk-to-guest Edge Function first** (dashboard single-file index.ts), then the ERP files. No SQL. 28 mocked tests.

## 2.16.35 — Talk to Guest: hands-free conversation, staff can speak first, faster replies

- **One button**: tap **Start conversation** once. The microphone stays open; each sentence is translated automatically after a short pause (about 1 second). No Guest / Nurse buttons — the spoken language decides who is talking: **Tamil or English = staff**, **Bangla or Hindi = Guest**.
- **Staff can speak first**: if the Guest's language is not known yet, the sentence is translated into both Bangla and Hindi at once; staff tap **বাংলা** or **हिन्दी** one time and the same sentence is spoken straight away (no repeating). If the Guest answers first instead, the earlier sentence is shown in the detected language automatically. The language can also be preset with the chips at the top.
- **Faster**: translation and spoken voice come back in ONE reply (one round trip instead of two); Gemini runs with low thinking for speed. The microphone does not record while the translation is being spoken, so the phone does not translate itself.
- Live level bar and status (Listening / Hearing / Translating / Speaking); option to switch off reading the Tamil translation aloud; Listen again replays without a new request. Coughs / short noises are ignored; screen switch stops the conversation; repeated service errors stop it with a clear message.
- **Redeploy the talk-to-guest Edge Function** (dashboard: single-file index.ts) BEFORE this frontend — the new screen needs the new function. No SQL.
- Files: src/app/communication/talk-to-guest.js, supabase/functions/talk-to-guest/handler.mjs, src/app/global-ui/09-tamil-dictionary.js, tests/talk-to-guest.test.mjs (25 tests), version files, app.js (rebuilt).

## 2.16.34 — Talk to Guest: automatic Bangla / Hindi interpretation

- New nursing workspace page and clinical dashboard shortcut for nurses, caregivers and managers. **STD** also has it (under Communication; Admin sees it there too).
- Guest language is detected automatically every time. Spoken Hindi that the recogniser labels "Urdu" is accepted as Hindi.
- AI: uses the current Gemini models in the same order as the Help assistant (gemini-3.8-flash → 3.5-flash → 3.5-flash-lite → 2.5-flash; a retired model is skipped automatically and the working one remembered). If no Gemini model answers, OpenAI (Whisper + text model) takes over.
- Consent line shown in English, Bangla and Hindi so the Guest can read what they agree to. Tamil words added for the EN | தமிழ் switch.
- Staff switched off in either the is_active or the older active column cannot use it.
- Guest audio detects Bangla/Bengali or Hindi; translation is displayed and spoken in Tamil. Tamil nurse replies return in the latest detected guest language.
- Short turns stop after a pause or the Stop & translate button. New guest clears the language and conversation; cancellation/navigation stops capture and playback.
- Reuses GEMINI_API_KEY, OPENAI_API_KEY and SAMARA_TTS_MODEL from the existing Samara AI services in a dedicated authenticated function. No conversation logging or ERP record changes.
- Before enabling: run supabase/sql/talk_to_guest_rate_limit.sql and deploy supabase/functions/talk-to-guest. Staff role checks, origin restrictions and a shared request budget apply.
- Live Bengali/Hindi/Tamil accuracy, latency and mobile microphone/playback checks remain required after deployment.

## 2.16.33 — Discharge Approval: Trial Guest discount fills in automatically

- **Trial (test) Guests only**: when Admin opens Discharge Approval, the **Discount Amount** is filled with the full outstanding amount and the **Discount Reason** with "Trial (test) Guest — full amount waived, not a real bill". Admin can still change or clear both before approving.
- Real Guests are unchanged — the discount stays empty and optional.
- If Accounts still has pending charge requests, nothing is filled (a discount is blocked then); a note says to reopen the review after Accounts clears them.
- No SQL. Files: src/app/patients/discharge.js, version files, app.js (rebuilt).

## 2.16.32 — Kitchen: hide "Dinner (Meals)" item (SQL 218)

- **Run supabase/sql/onetime_218_hide_kitchen_dinner_meals.sql** once in Supabase → SQL Editor (safe to run again). It hides KIT-0001 "Dinner" (unit Meals) — meals come through Food Vendor Management, not kitchen stock. Nothing is deleted; its old purchase / cash / movement entries stay in history.
- Kitchen Stock, the Low Stock box and the old-unit note now show only active items (hidden items were already left out of the purchase dropdown).
- A meal bought with kitchen petty cash is recorded as "Other expense (not a stock item)".
- Files: src/app/stores/kitchen-cash.js, supabase/sql/onetime_218_hide_kitchen_dinner_meals.sql (new), version files, app.js (rebuilt).

## 2.16.31 — Kitchen / Food Stores: one unit per item, fixed pack sizes, standard South Indian item list (SQL 217)

- **Run supabase/sql/217_kitchen_units_standard.sql** once in Supabase → SQL Editor (safe to run again). It also gives kitchen items their KIT- codes if SQL 190 was never run, converts existing kitchen items kept in Grams → Kg and ml → Litres (balance, low-stock level and past stock movements ÷ 1000 — real quantity unchanged), allows new kitchen items only in Kg / Litres / Nos, and lists any item still in another unit (Packets, Bottles …) for Admin to decide.
- **One unit per kitchen item** — Kg, Litres or Nos. Stock is never kept two ways (e.g. Milk only in Litres).
- **Record Purchase**: after choosing the item, choose the **Pack size** from that item's fixed list (Milk: 500 ml or 1 L only; Oil: 500 ml / 1 L / 5 L; Tea powder: 100 g / 250 g / 500 g / 1 kg …), then **Number of packets** and **Price per packet**. The ERP converts it (4 × 500 ml = 2 Litres) and shows "Adds 2 Litres to kitchen stock" before saving. Vegetables, rice, dal etc. also allow **Loose** (enter Kg directly).
- **Add Kitchen Items**: dropdown of ~115 standard South Indian kitchen items in groups (Rice & Flour, Dals, Oil & Ghee, Milk & Dairy, Tea / Coffee, Spices & Masala, Vegetables, Fruits, Eggs / Bread / Snacks, Gas / Disposables / Cleaning) with the unit fixed automatically; items already in the list are greyed out. **Quick add** — tick several items at once. "Other item" still allowed, unit limited to Kg / Litres / Nos.
- **Record Usage / Wastage**: enter in the item's unit or as whole packets (2 × 500 ml = 1 Litre); shows the balance and "Reduces stock by …".
- Kitchen Stock shows a note for items still in an old unit until SQL 217 is run.
- Files: src/app/stores/kitchen-cash.js, supabase/sql/217_kitchen_units_standard.sql (new), version files, app.js (rebuilt).

## 2.16.30 — Spot Assessment: photos with consent, decision & outcome, get-ready list, legal wording (SQL 216)

- **Run supabase/sql/216_spot_assessment_enquiry_sync.sql** once in Supabase → SQL Editor (safe to run again). Until it is run, everything works except the automatic enquiry update (a note asks staff to tell Akshi / Admin).
- **Visit photos** (Section 4): Wound / bedsore, Prescription, Discharge summary / report, Other — "Take photo" (phone camera) or "Choose photo / PDF". Only after **photo consent** is recorded (tick + "Agreed by" name and relationship; stamped with who recorded it and when). Each photo is stamped with date, time and staff name, kept privately in storage (opened with a 15-minute link), saved at once. Only Admin / Director can remove a photo from the list — the file itself is kept.
- **Decision** (Section 5): "Can Samara take this person?" Suitable / Suitable with conditions / Not suitable. Not suitable needs a care-related main reason; conditions / reason in detail needed for both. Required to complete the assessment.
- **Outcome**: Waiting for family decision / Not converted (reason = the Enquiry Register closing reasons) — saved at once, without changing the assessment status. Convert to Guest sets "Admission started" automatically. A **linked enquiry is updated automatically** (Admitted / Closed with the reason, written in the enquiry history) — no second entry by Akshi.
- **Get ready before arrival**: list built from what was ticked (Room / bed, air mattress, oxygen, suction, wheelchair, consumables, dressing / feeding supplies). Each tick saves at once with name and time. The **Nursing Manager gets a pop-up** from 2 days before the proposed admission date (and the day after) until all items are ticked; tapping it opens that assessment. Not shown for Not suitable / Not converted.
- **Permission for assessment**: "given by (name and relationship)" when obtained from a representative.
- **Print**: decision, outcome, photo list, get-ready list; a "Please note" block (care-needs assessment, not a medical diagnosis; conditions incl. wounds / bedsores present at the visit; tariff is an estimate; details kept confidential) and signature lines for the assessor and the person / family representative.
- Admission (Convert to Guest / Fill from Spot Assessment): linked enquiry → Admitted; the pink box says how many visit photos are kept in the Spot Assessment.
- An alert or link for one assessment now opens that assessment directly.
- Files: spot-assessment.js, src/app/global-ui/06-bell-notifications-popups.js, src/app/patients/admissions.js, supabase/sql/216_spot_assessment_enquiry_sync.sql (new), version files, app.js (rebuilt).

## 2.16.29 — Spot Assessment medicines in the same entry as the Admission form

- **Taking prescribed medicines?** Yes / No / Not known. On **Yes**, medicines are entered row by row exactly like Admission Section 3: Medicine, **Strength** (number + unit list), **Frequency** (sets the usual times automatically), Route, **Time** (same time picker), Food, Duration (+ custom days), Prescribed Doctor, Special instruction. **+ Add Medicine** / Remove. The Strength and Time pickers are the very same ones Admission uses (shared, so they can never differ).
- **Convert to Guest / Fill from Spot Assessment** copies every medicine row into Admission Section 3 (and sets "Undergoing prescribed medication" to Yes, or No when the visit recorded No). Rows stay open so the nurse checks each against the prescription; "Starts from" defaults to the admission time as before. Nothing is copied if medicines were already typed in the Admission form.
- To complete an assessment with "Yes": at least one medicine, each with strength + unit, a time (except STAT / SOS) and days for a Custom duration. Empty rows are dropped on save.
- Older assessments: the free-text medicine note is shown read-only ("Medicines noted earlier") and is kept; staff can re-enter it as rows.
- Print shows one line per medicine.
- No SQL. Files: spot-assessment.js, src/app/patients/medication-helpers.js, src/app/patients/admissions.js, version files, app.js (rebuilt).

## 2.16.28 — Spot Assessment address in the same parts as the Admission form

- The Spot Assessment "Home address" box is replaced by the **same address fields as Admission**: State (Tamil Nadu by default), **District** (dropdown), **Taluk** (dropdown for the chosen district — clears when the district changes), Village / Town / City, Locality / Area, Street / Road Name, Door / House No., Apartment / Building, Flat No., Landmark, PIN Code (6 digits only). Same district / taluk list as Admission (one shared list, so the two can never differ).
- **Convert to Guest / Fill from Spot Assessment** now copies every address part straight into the Admission form — nurses no longer re-type the address; the pink box just says "check it".
- To complete an assessment: District and Village / Town / City are needed.
- Older assessments: the free-text address is shown read-only ("Address noted earlier") until the parts are filled; after that it is kept under "Earlier format details". The full address line is still saved for print and for the database check.
- No SQL. Files: spot-assessment.js, src/app/patients/admissions.js, version files, app.js (rebuilt).

## 2.16.27 — Fix: "Save completed assessment" refused (visit_address)

- Cause: the database still requires two fields of the older Spot form before an assessment can be **Completed** — *Visit address* and *Bedsores present?*. The simplified form (2.16.24) merged them into **Home address** and **Wounds / bedsores present?**, so Completed was refused with "Complete required assessment field: visit_address". Drafts were not affected.
- Now these two are filled automatically on every save (visit address = home address; bedsores answer from the wound list), kept in step whenever the new fields change, and not shown as "Earlier format details". Old records with their own visit address are left as they were.
- No SQL. Files: spot-assessment.js, version files, app.js (rebuilt).

## 2.16.26 — Fix: Spot Assessment "Unable to save" after Admission started

- Cause: **Convert to Guest** and **Fill from Spot Assessment** stamp the assessment "Admission started", which saves a new version of it. A Spot Assessment that was open (or reopened from an older screen) still held the older version, so the next Save was refused as "Another staff member changed this assessment".
- Now: if the only change since opening was that stamp, the Save goes through automatically and keeps the stamp. Convert to Guest also keeps the new version on screen.
- If a save is still refused, the message now says the real reason: another staff member really edited it, a permission block (ask Admin), or the record no longer exists.
- No SQL. Files: spot-assessment.js, version files, app.js (rebuilt).

## 2.16.25 — Admission form: Fill from Spot Assessment (optional)

- New dashed box at the top of the Admission form: **Fill from Spot Assessment**. Search by name / visiting staff, pick the assessment (name · visit date DD-MM-YYYY · status · "admission already started" where it applies) and tap **Fill the form**.
- Uses exactly the same filling as **Convert to Guest** on the Spot page (same fields, same pink "left to fill" box), and stamps the Spot Assessment "Admission started by … on …".
- Safety: warns if an admission was already started from that assessment (to avoid admitting a Guest twice); on a form already being typed, anything entered is kept and only empty boxes are filled.
- The Admission form works fully without it — the box is optional and disappears once a Spot Assessment has been used.
- No SQL. Files: src/app/patients/admissions.js, version files, app.js (rebuilt).

## 2.16.24 — Spot Assessment simplified (5 sections), matched to the Admission form

- **8 sections → 5:** 1. Visit and enquiry · 2. Guest and family · 3. Health · 4. Care needs · 5. Decision and follow-up. About 15 repeated fields removed.
- **Family contacts asked once:** Family Contact 1 and Contact 2 with the **same relationship list as Admission** (they become Contact 1 / Contact 2 there). Tick **"The caller is Contact 1"** (on by default) — caller fields appear only when unticked. Contact phones checked for 10 digits.
- **Linked enquiry:** pick from the Enquiry Register instead of typing a reference — fills name, age and Contact 1.
- Visit time fills itself; hospital / facility name appears only when the person was seen in a hospital / other facility; oxygen settings appear only when breathing support is not room air.
- **One "Wounds / bedsores present?"** question opens the wound list (Type: Wound / Bedsore).
- **"Care needed"** uses the Admission patient-category list (replaces Stay requirement + Care requirements). "Why assisted living / current support at home" carries into Admission's reason field (direct / respite admissions).
- **Review notes:** one box with **Add note** — name, role and time stamped automatically (replaces the four review boxes and "review required from").
- **Old assessments open unchanged:** anything recorded in the old 8-section form that has no place in the new layout shows under **"Earlier format details (read only)"** on screen and in print — nothing lost. Old free-text relationships stay visible.
- Completing an assessment now also needs the home address and Contact 1 name + phone. Register rows are clickable; all dates DD-MM-YYYY.
- **Admission form works independently as before** — the Spot details are only an optional pre-fill via Convert to Guest; opened directly, the form is unchanged. The pink box now also reminds staff to mark a linked enquiry "Admitted".
- No SQL. Files: spot-assessment.js, src/app/patients/admissions.js, version files, app.js (rebuilt).

## 2.16.23 — Spot Assessment: Convert to Guest (Start Admission)

- New button **Convert to Guest (Start Admission)** inside a saved Spot Assessment (shown to staff who can do admissions). It opens a new Admission form with everything already recorded at the visit filled in, and stamps the assessment "Admission started by … on …" (register shows "→ Admission started").
- Filled automatically: name, age, gender, Guest phone, admission source (hospital / direct / respite) and patient category, hospital name, condition / diagnosis (numbered), treating doctor, allergies (numbered), daily care needs (mobility, ADLs, continence, memory, falls, pain), feeding instructions / tube feeding, risk ticks (fall, pressure sore, aspiration), oxygen, wound dressing (with wound details), physiotherapy, **Family Contact 1** (primary family contact, or the caller) and **Family Contact 2** (emergency contact / caller, if a different number).
- A pink **"From Spot Assessment"** box at the top of the Admission form lists only what staff still have to fill: address fields, relationship (if not matched), attendant staying, photo / Aadhaar, family communication option, **current medicines** (with the visit's medicine note shown for reference — medicines are entered one by one, never copied blindly), master care plan, package and room / bed. Vitals, care level and tariff noted at the visit are shown for reference.
- Spot Assessment register visit date now DD-MM-YYYY.
- No SQL (the conversion stamp is kept inside the assessment's details). Files: spot-assessment.js, src/app/patients/admissions.js, src/app/shell/01-app-main.js, version files, app.js (rebuilt).

## 2.16.22 — Ledger & Statement for Petty Cash and Kitchen petty cash

- New tab **Ledger & Statement** in **Petty Cash** (Nursing Manager, Admin) and in **Kitchen / Food Stores** (STD, Admin, Accounts).
- Period: **Today / This Week / This Month / Pick period** (From – To) with **Apply**.
- Shows Opening balance, Cash in, Cash out, Closing balance (red when below zero), totals by type (Cash received, Purchase, Expense, Kitchen cash to STD …), and the ledger with a running balance between an Opening and a Closing row; tap a row for full details. Closing balance in words.
- **Print / Save PDF:** Samara statement with logo, period, summary, ledger, closing balance in words and signature lines (Prepared by / Verified by Admin / Received). **Download CSV** for the same period.
- No SQL. Files: src/app/shared/04-cash-ledger-statement.js (new), src/app/manifest.json, src/app/stores/nursing-petty-cash.js, src/app/stores/kitchen-cash.js, version files, app.js (rebuilt).

## 2.16.21 — Fix: Petty Cash page crashed on opening

- The Petty Cash page (2.16.19) showed "This page had a problem" for everyone: a small row-click helper was missing in the page. Fixed; all pages changed today were re-checked for any other missing names (none).
- No SQL. Files: src/app/stores/nursing-petty-cash.js, version files, app.js (rebuilt).

## 2.16.20 — Nursing Manager menu: own PETTY CASH section

- The Nursing Manager's side menu now has a separate **PETTY CASH** section (after Pharmacy & Stores) with the Petty Cash page. Her menu has no MANAGER section, so the page was not reachable from it in 2.16.19. Admin still finds it under MANAGER → Petty Cash.
- No SQL. Files: src/app/core/04-supabase-roles-navigation.js, src/app/core/03-brand-theme-css.js (section icon), version files, app.js (rebuilt).

## 2.16.19 — Nursing Manager Petty Cash (SQL 215)

- **Run supabase/sql/215_nursing_manager_petty_cash.sql** in Supabase → SQL Editor (needs 214; safe to run again). Until it is run, the new page shows a "apply SQL 215" note and the kitchen handover works as before.
- New page **MANAGER → Petty Cash** (Nursing Manager and Admin / Directors). Only the Nursing Manager maintains it.
- Flow: Nursing Manager **Request Cash** → Admin / Director **Approve & Hand Over** (or Approve only, then Hand Over Cash later; Decline / Cancel with reason) → Nursing Manager **Confirm Cash Received** (counted amount must match) → added to her cash book.
- **Record Expense** (Nursing Manager): date, amount, purpose, paid to, bill number, optional bill photo / PDF. Admin can **Review / Query** or **Reverse** (adds the amount back).
- **Kitchen cash to STD:** when the Nursing Manager taps Hand Over Cash in Kitchen / Food Stores, the amount is **deducted from her Petty Cash automatically** ("Kitchen cash to STD" line). Admin's backup handover does not touch her book.
- The balance may go **below zero** — shown in red with a "needs a top-up" message.
- Cash Book: running balance, period filter (Today / This Week / This Month / Selected period / All) with Apply, Export CSV, tap a row for full details. Boxes: Cash in Hand, Expenses This Month, Kitchen Cash to STD This Month, Open Requests, Expenses to Review.
- Pop-up alerts: request → Admin / Director (approve, then hand over); handed over → Nursing Manager (confirm); expense query → Nursing Manager.
- Tested on a copy of the database: nurses / STD / generic Managers have no access; only Admin approves, hands over, reviews or reverses.
- Files: src/app/stores/nursing-petty-cash.js (new), src/app/manifest.json, src/app/shell/01-app-main.js, src/app/core/04-supabase-roles-navigation.js, src/app/global-ui/06-bell-notifications-popups.js, src/app/stores/kitchen-cash.js, version files, app.js (rebuilt), supabase/sql/215_nursing_manager_petty_cash.sql.

## 2.16.18 — Family Portal personal login link (with Family Portal 1.0.35)

- The WhatsApp texts that send Family Portal login details (Send Login PIN / Send PIN by Existing Method / Existing Method, and the fallback text when the API fails) now say **Guest ID** (not Resident ID) and carry a **personal link**, e.g. https://family.samaraassistedliving.com/?id=MOG-2026-10-008 — opening it fills the Guest ID, so the family enters only the PIN.
- The approved WhatsApp API template keeps its fixed portal button (Meta template); after the first login the portal remembers the Guest ID on that phone anyway.
- No SQL. Files: src/app/core/05-whatsapp-phone-helpers.js, src/app/patients/admissions.js, src/app/patients/patients.js, version files, app.js (rebuilt).

## 2.16.17 — Kitchen petty cash: Nursing Manager hands over the cash (SQL 214)

- New flow: **STD requests → Admin / Director approves → Nursing Manager hands over the cash → STD confirms cash received.**
- **Run supabase/sql/214_kitchen_cash_nursing_manager_handover.sql** in Supabase → SQL Editor (safe to run again). Until it is run, everything works as before.
- Nursing Manager: Kitchen / Food Stores opens **"Kitchen Petty Cash — Hand Over Cash"** with only the cash requests (no cash book, purchases, receipts or balance). Approved requests show **Hand Over Cash** (note filled as "Cash ₹… given to Akshi").
- Admin / Director approves (or declines / changes the amount) as before; Admin keeps a backup button "Record Cash Handed Over (Nursing Manager away)".
- STD sees "Waiting for Admin / Director approval" → "waiting for the Nursing Manager to hand over" → **Confirm Cash Received** (cash book increases only then, as before).
- Cash Requests now show **Handed over by** (name + time).
- Pop-up alerts at each step: new request → Admin / Director; approved → Nursing Manager; handed over → STD. "Open & Take Action" opens that one request.
- Tested on a copy of the database: nurses / Nursing Manager cannot approve; Nursing Manager cannot spend or see the cash book; STD cannot hand over to herself.
- Files: src/app/stores/kitchen-cash.js, src/app/global-ui/06-bell-notifications-popups.js, src/app/global-ui/09-tamil-dictionary.js, version files, app.js (rebuilt), supabase/sql/214_kitchen_cash_nursing_manager_handover.sql.

## 2.16.16 — Nursing Manager: approve / hand over all items of a Guest together

- At the top of the Indent Register, the Nursing Manager now sees **Approve together**: one box per Guest who has 2 or more items waiting, listing every item with the store balance and an **Approve qty** box (filled with the requested quantity).
- Untick any item to leave it for later, change quantities if needed, then **Approve ticked (N)** or **Reject ticked (N)** — one remarks / reason for all.
- After approval the same Guest's items appear under **Hand over together** with **Hand over qty** (filled with the approved quantity) → **Hand over ticked (N)**. Store balance turns red when it is less than the quantity.
- Each item is still approved / handed over exactly as before (same checks, same stock deduction, same 20-minute receipt alert). If one item fails (e.g. not enough stock), the others still go through and the message names the item that was not done.
- The single-row Approve / Reject / Hand Over buttons are unchanged. Tamil words added. No SQL.
- Files: src/app/stores/patient-consumables.js, src/app/global-ui/09-tamil-dictionary.js, version files, app.js (rebuilt).

## 2.16.15 — Raise Indent: several items in one indent

- Nurses can now request **many items at once** for a Guest: choose Patient → Category → Item → Quantity → **+ Add item to list**, repeat for each item, then tap **Initiate N Indents**.
- The list shows each item with its code, category, quantity (can be changed) and the current store balance (red when the store has less than asked), with **Remove** for a wrong line.
- Adding the same item again adds the quantity to the existing line. An item still selected in the boxes when Initiate is tapped is included too.
- Patient and Reason / Remarks apply to all items in the list. All items are saved together (all or none).
- Each item is still its own indent, so Nursing Manager approval, handover, nurse receipt, Received / Used Balance, returns, charging and the 20-minute receipt alert work exactly as before. A single item works as before ("Initiate Indent").
- Tamil words added for the new buttons. No SQL.
- Files: src/app/stores/patient-consumables.js, src/app/global-ui/09-tamil-dictionary.js, version files, app.js (rebuilt).

## 2.16.14 — Intake / Output chart: simple grid entry (like the Duty Roster)

- The long Intake / Output form is replaced by a **grid**: rows = 2-hour slots for the chart day (7–9 AM … 5–7 AM), columns = **Oral · IV · Tube** (intake) and **Urine · Drain · Vomit · Stool** (output), plus **Other**.
- **Tap a box** → choose **what** (Water / Juice / Soup / Kanji … ; IV: NS / DNS / RL … ; Tube: Ensure / Kanji / Milk … ; Urine: Passed urine / Catheter bag — Catheter is pre-selected when the chart reason says catheter) → tap an **amount** (or type ml) → **Save**. Stool: number of times + type.
- The time is taken from the slot (or "now" in the current slot); it can still be changed under "change time / add remarks".
- Each box shows the total ml for that slot; ☕ marks tea / milk / juice coming automatically from Resident Food Intake. Tapping a filled box shows what is in it, with **Remove** for wrong entries.
- **Day total / Night total** rows with In · Out · Urine · Balance for each shift, and the 24-hour balance at the bottom (red when beyond the limit).
- The full list of entries is still there under "All entries — Show the list".
- Works on phones (fits the screen, no sideways scrolling). Tamil words added for the new screen.
- Same data as before (io_entries): alerts, limits, the Daily Intelligent Report line and the Family Portal are unchanged. No SQL.
- Files: src/app/clinical/intake-output.js, src/app/global-ui/05-hover-clickable-cards-mobile-tables.js, src/app/global-ui/09-tamil-dictionary.js, version files, app.js (rebuilt).

## 2.16.13 (update) — delete employee Rajee (SQL 213)

- **Rajee — permanent delete (cannot be undone):** run **onetime_213_delete_employee_rajee_STEP1_preview.sql** first (read only), then **onetime_213_delete_employee_rajee_STEP2_delete.sql**. Same safety as Rama's (SQL 212): stops and changes nothing unless exactly one Rajee / Raji is found, or if a record that must be kept depends on her. No app change.

## 2.16.13 — Ramya off the Duty Roster (login kept); delete employee Rama (SQL 212)

- New list **duty_roster_exclusions**: staff on it are left out of the Duty Roster grid, the Duty list / Assign Duty, and On Duty Today. Their login and all their other pages are unchanged.
- **supabase/sql/212_duty_roster_exclusions_ramya.sql** puts **Ramya** on that list and cancels her duties from today onward. It stops without changing anything unless exactly one employee named Ramya is found. To put her back: the one-line delete at the end of the file.
- **Rama — permanent delete (cannot be undone):** run **onetime_212_delete_employee_rama_STEP1_preview.sql** first (read only, shows the matching employee), then **onetime_212_delete_employee_rama_STEP2_delete.sql**. It removes her login, employee record, duty and leave rows. Entries she made elsewhere stay and just no longer show her name. It stops and changes nothing if more than one Rama is found, or if a record that must be kept depends on her.
- If SQL 212 has not been run yet, nobody is left out (the screens work as before).
- Files: src/app/core/04-supabase-roles-navigation.js, src/app/nursing/duty-assignment.js, src/app/nursing/duty-roster-grid.js, src/app/global-ui/11-on-duty-today.js, version files, app.js (rebuilt), the 3 SQL files.

## 2.16.12 — Duty Roster on phones: Next week / This week / Save no longer hidden

- On a phone, the "No changes yet / Save roster" box under the roster floated on top of the roster's own buttons. It covered **› (next week), This week, Save roster, Copy previous period and Reload**, and the date row and staff cells sat behind it — so a fresh roster for next week could not be made, and this week's duties could not be changed, from a mobile.
- On phones that box is now a normal box under the grid (on computers it still floats at the bottom). Save roster is also at the top of the roster, as before.
- Extra space after the roster so the last staff rows can be scrolled above the bottom menu, Back and Help buttons.
- Checked on a phone-size screen: next week — tap a cell, Save roster creates the duty; this week — today's cell can be changed (Day → Night) and saved.
- Files: src/app/nursing/duty-roster-grid.js, version files, app.js (rebuilt). No SQL.

## 2.16.11 — Intake / Output (fluid balance) chart for nurses

- New page **Nursing → Intake / Output Chart** (Nurse, Caregiver, Nursing Manager; Admin / Manager can view). Also a quick-action tile on the Nursing Dashboard.
- The chart is switched ON per Guest only (reason + alert limits). The Nursing Manager / Admin can change the limits or stop the chart.
- Intake: Oral fluids, IV fluids, Tube feed, Other. Output: Urine, Catheter urine, Drain, Vomit, Stool (count + type, ml optional), Other.
- Tea / coffee / milk / juice from Resident Food Intake count automatically as oral intake (ml as entered; cup 150, tumbler 200, glass 250, mug 250 ml; partly taken = half; refused = 0).
- Totals: Day shift 7 AM–7 PM, Night shift 7 PM–7 AM and 24 hours (chart day 7 AM to 7 AM), with balance and a warning when beyond the limit. Date bar with Previous / Apply / Next / Today; rows open for full details. Wrong entries are removed with a reason (kept in the audit).
- Alerts (pop-up for the nurse and Nursing Manager, list in Alerts): low urine in the shift that just ended, and a big 24-hour imbalance. Tapping opens that Guest's chart for that day.
- Daily Intelligent Report: one line "Fluid chart (7 AM to 7 AM): intake X ml, output Y ml" when the Guest is on the chart.
- Family Portal 1.0.34 (other repo) shows the same simple daily line.
- Needs SQL 211_intake_output_chart.sql.

## 2.16.10 (update) — Daily Intelligent Report: built on the LIVE function

- The repo copy of **daily-patient-report** was older than the function actually running in Supabase (the live one has the Nursing Procedures section and the Family Portal "existing reports" list; the copy did not). Redeploying the old copy would have removed both. The copy is now the **live function** plus:
  - withheld doses shown to the family only after the doctor's instruction, in simple words (as in 2.16.10);
  - beverage servings (Tea / Coffee / Milk / Boost / Horlicks / Fresh Juice) in Food / Fluid Intake — this 2.15.34 change had never reached the live function;
  - dates as DD-MM-YYYY (was DD:MM:YYYY, which looked like a time).
- Deploy: redeploy Edge Function **daily-patient-report** from supabase/function-copies/daily-patient-report-inbox.ts (this file replaces the one in Backup_145). No SQL beyond 210.

## 2.16.10 — Medicines WITHHOLD: family sees it in simple words; phone alert; time fixes (SQL 210)

- **Family (Daily Intelligent Report on WhatsApp + Family Portal 1.0.33):** a withheld dose is no longer shown raw. It is shown **only after the doctor's instruction is recorded**, in simple words — e.g. "Held because the blood pressure was low (BP 90/58 mmHg). Dr. Kumar was informed and advised to give it at 12:00 PM." In the report table: status "Held - Dr. informed" with a short line. No staff names, no internal remarks, nothing while the doctor's reply is pending. (Discharge Summary unchanged — withheld doses still not printed.)
- **"Give at a later time" across midnight fixed:** a time earlier than the dose time is now the **next day** (10 PM dose, doctor says 6 AM → 6 AM tomorrow). Before, it was silently changed to 10:01 PM the same night. The form shows the date the dose will be due; a time already passed is refused with a clear message.
- **Low-vitals warning:** now reads the latest reading of **each** of BP, sugar and pulse from the last 12 hours (before, only the single latest vitals entry — a low sugar at 7:00 was missed if only BP was entered at 7:30). Zero readings are treated as not taken.
- **Phone notification** to Nurses, Nursing Manager, Managers and Admin / Directors as soon as a dose is withheld, **repeated every 30 minutes** until the doctor's instruction is recorded (new Edge Function withheld-dose-alert-dispatch, every minute; setting withheld_dose_alert_settings.repeat_minutes). The ERP pop-up also comes back every 30 minutes and now covers 3 days (was 2).
- **Opens only that dose:** "Open & Take Action" on the pop-up opens Medicines showing only that withheld dose (Show all to return).
- Re-checks that the clinical alert engine raises "Re-medication Due" for a dose the doctor said to give later.
- Deploy: run **supabase/sql/210_medicine_withhold_fixes_family_push.sql**; create Edge Function **withheld-dose-alert-dispatch** from supabase/functions/withheld-dose-alert-dispatch/index.ts (legacy JWT ON, existing push secrets); redeploy Edge Function **daily-patient-report** from supabase/function-copies/daily-patient-report-inbox.ts; upload Family Portal 1.0.33 to repo Samara_Family_Portal.
- Files: src/app/clinical/medicines.js, src/app/patients/medication-helpers.js, src/app/global-ui/06-bell-notifications-popups.js, src/app/global-ui/09-tamil-dictionary.js, version files, app.js (rebuilt).

## 2.16.9 — Full Tamil for nurse screens

- About 1,450 more Tamil phrases for the screens nurses use: Nursing Dashboard, Clinical Alerts, Shift Tasks, Medication Administration (MAR, doctor review, withheld dose), Vital Signs, Daily Care, Patients / Patient file, Discharge, Available Beds, Approval Requests, Equipment / Oxygen, Physiotherapy, Special Nurse, Shift Handover, Incidents, My Leave, To-Do, alerts and pop-ups.
- Style as agreed: simple Tamil, with widely used work words kept (BP, MAR, டியூட்டி, ஷிஃப்ட், கெஸ்ட்). Food names, consumable item names, staff / Guest names and anything typed by staff stay as entered.
- Safety: dropdown choices keep their English saved value when shown in Tamil, so forms save exactly as before.
- Applies to everyone with the EN | தமிழ் switch (Akshi, Dharshini, Admin). No SQL.

## 2.16.8 — EN | தமிழ் switch for ANM Dharshini

- The language switch (top bar, **EN | தமிழ்**) is now also shown to **Miss Dharshini (ANM, EMP-0018)** — the Tamil trial so far was STD (Akshi) and Admin. Her choice is remembered on every device.
- A few more Tamil words added (BP, pulse, temperature, Duty Roster buttons). Nursing screens not yet fully covered show some English words; tell us which screens she uses most to translate next.
- More staff can be added to the trial by name / employee ID (one line in the code).
No SQL.

## 2.16.7 — On Duty Today for Nurses and Caregivers

- The **On Duty Today** button (top bar) is now also shown to **Nurses and Caregivers** — the same view as Admin / Manager / STD: who is on duty now, today's shifts, weekly off and leave today, with tap-to-call mobile numbers.
No SQL.

## 2.16.6 — Roster grid: Save roster always visible

- **Save roster** is now always shown — at the top (next to Copy previous period, with the number of changes) and in the bar below the grid. It is greyed until a cell is changed; before, it appeared only after the first change, so it looked missing.
No SQL.

## 2.16.5 — Roster grid: equal columns really applied

- 2.16.4's equal widths were overridden because the Discharge Register already used the same style names ("dr-…": its column widths 20% / 18% / 10%… were applied to the roster). The roster grid now has its own names ("rg-…"), so every date column is the same width and the roster fits the screen.
- This also stops the roster's styles from affecting the Discharge Register table after the roster had been opened.
- Phones keep the roster as a grid (not turned into cards) and stay on 7 days (30 days is disabled on phones — a month cannot fit without sideways scrolling).
No SQL.

## 2.16.4 — Roster grid: equal column widths, no sideways scrolling

- All date columns are the same width and the whole roster fits the screen — no horizontal scrolling, on computer or phone.
- 30 days (and phones) show short letters: **D** Day · **N** Night · **O** Off · **L** Leave, with 2-letter weekday and date number in the header.
- On phones the All Day / All Night buttons are hidden to save space.
No SQL.

## 2.16.3 — Assign Duty = Roster grid (no long form)

- For Admin and the Nursing Manager, **＋ Assign Duty** now opens the **Roster grid** (tick Day / Night / OFF per staff per day) instead of the long weekly form. Tabs renamed: **＋ Assign Duty (Roster grid)** and **Duty list**.
- The Duty list (view, acknowledge, details, modify one day) is unchanged.
No SQL.

## 2.16.2 — Roster grid where the Nursing Manager assigns duty

- The Nursing Manager's **Nursing Staff › Staff Duty Assignment** now opens on the **Roster grid** (nursing staff); the previous day list and weekly form are in the second tab.
- Admin: **HR › Duty Assignment** and **Staff Duty Assignment** open on the grid (all staff).
- The Nursing Manager's own **My Duty** page is unchanged (no grid there). Duty Calendar is unchanged.
No SQL.

## 2.16.1 — Duty Roster grid (Excel-style)

Duty Assignment now opens on a **Roster grid** for **Admin / Director** (all staff, grouped by department) and the **Nursing Manager** (nursing staff). The existing list and weekly form stay in the second tab, **List & weekly form**.
- Staff in rows, dates (with day) in columns. **Tap a cell: Day (7 AM–7 PM) → Night (7 PM–7 AM) → OFF → empty** — each day can differ; the weekly off can be any day.
- **7 days / 30 days** switch, From date with Apply, ‹ › to move by the period, This week.
- **Approved leave** (current and future) shows as a locked LEAVE cell; ⚠ = leave pending approval; P = approved permission (a few hours). Past dates are view only.
- **Copy previous period** fills empty cells from the previous 7 / 30 days; **All Day / All Night** under each name fills that row.
- Bottom row counts **On duty (Day · Night)** per date; set **Minimum per shift** to highlight short days in red.
- Changes are drafted (dashed outline) and saved together with **Save roster** (or Discard). Before saving, the roster is re-read: cells changed by someone else, or now on approved leave, are skipped and listed.
- Saves into the same duty records as before (one per staff per day), so My Duty, acknowledgement (✓), On Duty Today, Back on Duty and leave checks work unchanged. Changing an acknowledged shift asks the staff to acknowledge again; clearing a cell cancels that duty (kept in history).
No SQL.

## 2.16.0 — Discharge Summary button at the top for Nurses

- The **Discharge Summary** button now sits at the top of the Patient file, beside **Admission Details · Consent**, for **Nurses** as well as Admin / Manager (for Guests whose discharge is completed). The extra tab added in 2.15.99 is removed (one place only).
- Sending by WhatsApp from the summary stays with Admin / Manager.
No SQL.

## 2.15.99 — Discharge Summary in the Patient file tabs (also for Nurses)

- A **Discharge Summary** tab now sits beside *Admission Details · Documents · Consent* in the Patient file, for discharged Guests (completed discharge). It opens the summary with **Open / Save PDF**.
- Visible to **Admin, Manager and Nurse** (the Discharge Summary service allows these three). Sending the PDF by WhatsApp from this window stays with Admin / Manager, as before.
No SQL.

## 2.15.98 — My Patients: Inactive / discharged list for Nurses

For Nurse and Caregiver logins, discharged Guests were removed from every list, so "Inactive / discharged" always showed 0 (Admin saw them correctly).
- Nurses / Caregivers now see discharged Guests when they choose **Inactive / discharged** or **All records**. The default **Active patients** list and the other lists still show only current Guests.
- Personal details remain view-only for nurses, as before.
No SQL.

## 2.15.97 — WhatsApp Inbox: load only a chosen period

- The inbox now loads only the **last 30 days** by default, so it opens faster. Choose **Show: Last 7 days / 30 days / 3 months / 6 months / All messages** and press **Apply**; the choice is remembered for each user on that device.
- **Show older messages** in an open chat loads that contact's full history.
- A chat opened from the Enquiry Register, Enquiries & Feedback, a patient file or an alert pop-up always loads that contact's full history.
- Fix (from 2.15.94): opening a chat from the Enquiry Register / pop-up again selects that chat (part of the line had been commented out by mistake).
- Note: unread messages older than the chosen period are not counted; for STD, an enquiry whose last incoming message is older than the period shows after choosing a longer period.
No SQL (SQL 209's date index makes the period load fast).

## 2.15.96 — "Back on duty" pop-up stays closed

The "Miss Saranya S is back on duty" pop-up came back after every page refresh / app update for 24 hours, because Close was remembered only until the page reloaded.
- Information-only pop-ups — **staff back on duty** and **new food-vendor WhatsApp** — now stay closed after **Close** or **Open & Take Action**, also after refresh, re-login or an app update (remembered on that device for 3 days).
- Action pop-ups (discharge, charges, indents, "Not back on duty", etc.) are unchanged: they still repeat until the work is done.
No SQL.

## 2.15.95 — WhatsApp Inbox loads fast again

The inbox had become slow to open. Cause: the food-vendor security rules (SQL 125/130/183) tested every WhatsApp message, for every user, against the whole food-orders table, and the inbox reloaded everything again on each change.
- **SQL 209**: vendor phone is indexed; the "food-vendor message?" test does cheap checks first; the same rules now work out "who is signed in / food in-charge" once per load instead of once per message. Nobody gains or loses access.
- Inbox: several changes arriving together (e.g. messages marked read) now cause one reload, not one per message; opening a chat marks it read on screen without reloading the whole inbox; the Food Vendors folder uses a small vendor-phone list instead of a second full fetch; STD's folder sorting no longer re-scans all messages per chat.
**SQL 209** (run after SQL 208).

## 2.15.94 — Food-order WhatsApp inbox goes to whoever is assigned Food Management

Food vendor WhatsApp conversations were shown only in the Nursing Manager's food inbox, so Akshi (STD), who now handles Food Management, could not see the vendor's order replies.
- **WhatsApp Inbox → "Food Vendors" folder** for the person currently assigned Food Management (Admin › Food Vendor Management assignment) — STD sees *Admission Enquiries · Food Vendors · Other*; Admin / Director also get the folder. Order, revised and received messages show with their coloured header pictures.
- **Automatic**: when Admin assigns Food Management to another staff member (or the assignment ends / is revoked), the folder moves to the new person within about 30 seconds — nothing to set per user. Any role can be the in-charge; WhatsApp Inbox appears in their menu automatically.
- **New message pop-up**: each new WhatsApp from the food vendor gives the assigned person a pop-up with **Open WhatsApp chat** (opens that chat directly). Existing Returned / Needs Modification / No reply alerts are unchanged.
- In a vendor chat the in-charge can reply (24-hour window), send photos / PDFs and the *Food Vendor Callback* template; other templates are hidden for vendor chats. Opening a chat marks it read; vendor photos / documents can be opened.
**SQL 208** + redeploy Edge Function **whatsapp-media** (lets the in-charge open vendor photos / documents; permission still checked per file).

## 2.15.93 — Final Nursing Discharge: realistic handover checklist

Every handover box had to be ticked, even when the Guest had no take-home medicines or reports and Samara held no belongings / valuables.
- **Discharge summary**: no tick — a green line says it is sent to the family automatically on WhatsApp after this step; optional tick "Printed copy also handed over".
- **Medicines** and **Reports / documents**: choose *Handed over* or *None to hand over*.
- **Personal belongings**: *Handed over* or *None held by Samara*. **Valuables**: *Handed over* or *None held*.
- Every item must still be answered (unanswered items are highlighted); **Instructions explained** and **Patient condition fit for departure** must still be ticked.
- The answers are saved with the nurse's name and time, shown in Discharge history ("Belongings: None held by Samara"), and printed in the Discharge Summary PDF as "Belongings - none" instead of a tick.
- Default final remark is now "Patient left the facility." (no longer claims medicines and belongings were received).
**SQL 207** (new confirm_patient_departure_v5; v4 is unchanged and still does the bed release) + redeploy Edge Function **discharge-summary**.

## 2.15.92 — Duty Calendar: change a Weekly Off day to a working duty

Saranya's week was saved with Weekly Off on Thursday (the day she came back), and a Weekly Off row had no Edit / Modify button, so it could not be changed to Night Shift.
- Weekly Off rows now show **Change to Working Duty** (Manager / Nursing Manager / Admin) in the list and in View details.
- It opens the duty form for that day with the shift and duty type she works on the other days of that week (e.g. Night Shift), status Assigned — check and save.
No SQL.

## 2.15.91 — Duty Assignment: staff back from leave mid-week can be assigned

Saranya came back on duty on Thursday after approved leave Monday–Wednesday, but Assign Duty for the week refused to save ("Approved leave / permission overlaps this assignment") because the weekly form covers all 7 days.
- Weekly Assign Duty now skips the days on approved leave and assigns the other days; the message lists the skipped leave days.
- If every working day of the week is on approved leave, nothing is assigned and the message says so.
- Editing a single day that is on approved leave is still refused (mark Back on Duty first if she returned early).
- Approved permission (a few hours) no longer blocks the day — it is shown as a warning.
No SQL.

## 2.15.90 — Staff back on duty after approved leave

How Admin knows a staff member has rejoined after leave:
- **Mark Back on Duty** (replaces "Record Early Return"): the Manager — Nursing Manager for nursing staff — or Admin opens the leave on Staff Leave Calendar / Leave Approvals and enters the actual date & time she reported, with remarks. Works for early (leave shortened as before), on-time and late returns.
- **Due back** = her first rostered working shift after the leave (Duty Assignment, up to 7 days ahead); if no roster, the day after the leave ends.
- **Not back**: if nobody has marked her back 2 hours after that shift starts (10 AM if no roster) → Admin / Director get a pop-up (repeats hourly), an Alerts-page row and a phone notification; her Manager (same department or reporting superior) gets the pop-up and Alerts row to mark her.
- **Back on duty**: when a Manager marks it → Admin / Director get a pop-up, an Alerts-page row (24 hours) and a phone notification (not the Admin who marked it).
- **Staff Leave Calendar**: an extra line on the due-back day — amber "Due back", green "Back on duty 09-10-2026 07:05 AM" (with "N days late" if late) or red "Not back on duty"; the leave details show Due Back and status. Tapping an alert opens only that leave (Show all to return).
- The Nursing Manager's own return (Stores In-charge handover) still uses Approve Return to Duty.
**SQL 206** + new Edge Function **staff-return-alert-dispatch** (existing push secrets; runs every minute). Settings: staff_return_alert_settings (hours_after_shift 2, default_time 10:00).

## 2.15.89 — Nursing Indent: alert when the nurse has not pressed Received within 20 minutes

Indent flow: Nurse requests → Nursing Manager approves → Store hands over → Nurse presses **Received**.
If the indent is still "Handed Over" 20 minutes after the handover:
- **The nurse who raised the indent** and **the Nursing Manager** get a pop-up in the ERP (it comes back every 20 minutes until Received is entered) and a phone notification (repeated every 20 minutes while still not received).
- Alerts page: new section "Indents Handed Over — Not Received by Nurse (over 20 minutes)". The nurse sees only her own indents; the Nursing Manager sees all; Admin / Director can also view the list (no pop-up, no phone notification).
- Tapping the pop-up or a row opens Patient Consumables showing only that indent (Show all button to return); in the Indent Register the late indent shows "Not received · N min" in red under its status.
- Indents handed over before SQL 205 was run are listed but get no phone notification.
- Times are in settings (indent_receipt_alert_settings: minutes 20, repeat_minutes 20; 0 = remind only once).
**SQL 205** + new Edge Function **indent-receipt-alert-dispatch** (uses the existing push secrets; runs every minute).

## 2.15.88 — Food Vendor Settings: one choice per message

The two rows of template tick boxes (old + _v2) were confusing. Settings now shows one line per message — New order · Order changed / cancelled · Food received — with a single choice: **New simplified (_v2)** / **Old** / **Off**. Choosing New automatically keeps the sending permission the database needs (the old tick is handled behind the scenes). No SQL.

## 2.15.87 — Food orders: delivery time must suit the meal

An Evening Tea / Coffee order went to the vendor with 12:30 PM because the form always started at 12:30. Now:
- Each meal has an allowed delivery window (India time): Breakfast 6:00 AM – 10:30 AM · Morning Tea / Coffee 6:00 AM – 11:30 AM · Lunch 11:30 AM – 3:00 PM · Evening Tea / Coffee 3:00 PM – 7:00 PM · Dinner 6:00 PM – 10:30 PM.
- Choosing the meal fills its usual time (Breakfast 7:30 AM, Morning Tea 10:30 AM, Lunch 12:30 PM, Evening Tea 4:30 PM, Dinner 7:30 PM) unless the time already entered suits it.
- The allowed window shows under the time; a wrong time turns red and Save / Finalise / Modify is refused with a clear message.
No SQL.

## 2.15.86 — WhatsApp Inbox shows food messages exactly as sent

The simplified food messages (_v2) go to the vendor with a coloured header picture (NEW ORDER pink, ORDER CHANGED purple, CANCELLED grey, RECEIVED blue, with the Samara Main tag or the AppGeo logo). The Inbox showed the plain Samara logo instead; it now shows the same picture the vendor received, above the same wording. No SQL.

## 2.15.85 — Food Vendor: receipts not sent automatically (fix)

Cause: in Food Vendor › Settings the older template ticks (samara_food_order / _modification / _receipt) had been switched off when the _v2 ticks were switched on. The database still needs the older tick before any message is sent, so today's receipts stayed "Pending" silently.
- Saving Settings now keeps the older tick on automatically whenever its _v2 tick is on (label says so).
- If a receipt is saved while sending is not allowed, the screen now says clearly that WhatsApp was NOT sent and what to tick, instead of staying silent.
No SQL.
- **SQL 203 (added later the same day):** WhatsApp Inbox showed the new _v2 food messages under the old template name, so the Inbox copy read "Date and meal: 5:30 PM". The vendor received the correct message; the Inbox copy was overwritten by the food-message trigger. SQL 203 keeps the real template name and repairs the last 30 days of Inbox rows. Sends nothing.
- **SQL 204:** the live database relabels food messages through its own copy step, so a guard now sits on the Inbox table: once a message is recorded as a _v2 template, nothing can change it back to the old name. Also repairs the 04:17 PM cancellation. Sends nothing.

## 2.15.84 — Food Vendor: time stamps on orders

Food Vendor Management › Orders and History lists now show when each step happened, under the numbers (DD-MM-YYYY, India time):
- **Ordered** column: "Ordered · 06-10-2026 07:42 PM" (Draft saved for drafts), plus "Modified · …" when the order was changed.
- **Received** column: time of the delivery receipt ("Last of 2 · …" when received in parts).
- **Status** column: "Closed / Cancelled / Reopened · …" when that was done by staff. Orders auto-closed by the system have no stamp.
Taken from the order history already stored. No SQL.

## 2.15.83 · SQL 202 · Edge Function discharge-summary — Discharge Summary PDF

- **Automatic:** when the nurse completes the Final Discharge, right after the discharge confirmation WhatsApp, the Guest's **Discharge Summary PDF** is sent to the same family number as a WhatsApp attachment (Meta template `samara_discharge_summary`, header = PDF). The success message says whether the PDF went; if not, the reason is shown.
- **Patient card:** discharged Guests have a new **Discharge Summary** button (Admin / Manager) next to Family Details: Open / Save PDF, choose a registered family number, **Send PDF · WhatsApp API**, or **Existing WhatsApp** (phones: share the PDF straight into WhatsApp; computers: download the PDF and open the chat with the message ready). Status "WhatsApp PDF sent ✓" with date/time.
- **Discharge register:** completed discharges show **Discharge Summary** in the details popup (Nurses can open the PDF / use Existing WhatsApp there).
- The PDF is built from ALL records of the stay (admission → departure): Guest and stay details, diagnosis, allergy, risk flags, an automatic written course of the stay (from vitals, medicines, doctor reviews, meals, nursing handovers), headline figures, admission vs discharge vitals, blood-pressure chart, day-wise vitals, doses given per medicine, doctor review changes, medicines at discharge, daily care and nutrition, condition at discharge, advice & follow-up, handover checklist and sign-off names. Dates DD-MM-YYYY. Billing is not included (Final Bill). Doses withheld by nurses stay internal and are not printed.
- Stored privately in the patient-reports bucket (`<guest>/discharge/…`); the path is kept on the discharge record and in Patients.discharge_summary_url. WhatsApp sends appear in WhatsApp Inbox with the PDF attached.
- Only registered numbers of the Guest can receive it. Nurses can send only on the day of discharge (the automatic send).
- SQL 202 adds discharge_summary_* columns to patient_discharges. Meta template text: docs/META_TEMPLATE_discharge_summary.md.

## 2.15.82 — Final Billing: search Guest by name / mobile

On Accounts › Final Billing the read-only "Bill / Invoice Number" box is replaced by **Search Guest** — type any 3 characters of the name, mobile number (Guest or attendant) or Resident ID and tap the Guest to open the bill. The Bill No still prints on the bill and shows under the search once a Guest is chosen. The Patient dropdown stays. No SQL.

## 2.15.81 — Final Bill: amount in words

The Final / Complete Bill shows the Net Payable in words (Indian system — Thousand, Lakh, Crore, with Paise), e.g. "Rupees Nine Hundred Thirty Only", and the Advance Balance / Refundable in words when there is one. Shared helper billAmountInWords (core/08-date-utils.js); the Family Portal Ledger PDF uses the same wording. No SQL.

## 2.15.80 — Back button on print / PDF pages (mobile)

Final Bill, Guest Ledger PDF, Payment QR, Resident ID card, employee print and Medication Safety Report open as a new tab; on phones there was no way back. They now have a top bar with "← Back to ERP" (closes the tab, or returns to the ERP) and "Print / Save PDF"; the bar is hidden when printing. Shared helper samaraPrintBar (shared/02-apply-filter-row-details.js). No SQL.

## 2.15.79 — Guest Ledger: readable cells, tap a row for full details

- Source / Reference column no longer shows system keys (e.g. "ROOM:ae736b2e-…:06-10-2026"); it shows the source (Daily Room Charge, Cash, UPI…) and the payment reference only.
- Daily room / nursing charges show their date (06-10-2026) instead of a confusing "05:30 AM IST" time.
- A running balance in the Guest's favour shows as "₹2,130 Cr" in green instead of "₹-2,130" (screen, PDF, Excel).
- Tap any ledger row: full details — particulars, quantity, unit price, debit / credit, balance after, payment mode, reference, raised by / at, service date, Accounts decision, decided by / at, remarks, bill number, entered by, full internal description and system key. No SQL.

## 2.15.78 — Final Bill itemised: Qty × Rate = Amount

Charges Summary on the printed Final / Complete Bill now lists every item under its category with Qty, Rate and Amount columns (the "Entries" column is removed):
- Room rent in date runs at the same rate, e.g. "Room rent (30-09-2026 to 01-10-2026) · 2 days × ₹3,200 = ₹6,400", "Room rent (02-10-2026 to 07-10-2026) · 6 days × ₹2,500 = ₹15,000".
- Bills & Charges items by item and unit price, e.g. "Examination Gloves · 17 × ₹30 = ₹510". Items without a recorded quantity count each entry as 1 at its amount.
- Category row keeps the subtotal. Shared helper billChargeLines (core/08-date-utils.js). No SQL.

## 2.15.77 — Patient Ledger simple lines; units × price

- Patient Ledger (screen, PDF and Excel) uses the same lines as the Family Portal: item name with quantity × unit price, e.g. "Examination Gloves (2 × ₹30)", "Room rent · 06-10-2026 · Room 109-B", "Advance received · Ref …". Accounts names, approvals and remarks are not shown (they stay in Bills & Charges with time stamps). Type · Category shown below in small text; "Not applicable" hidden.
- Final Bill charge summary: "Examination Gloves (17 × ₹30), Glucometer Strips (2 × ₹50)".
- SQL 201: family_portal_bill_units — lets the Family Portal show the same quantity × price (own Guest only, no staff names).

## 2.15.76 — Final Bill: simple lines, Advance shown as Advance

- Final / Complete Bill (print and screen) now uses the same simple lines as the Family Portal: item names only, grouped with counts (e.g. "Glucometer Strips × 2 · Examination Gloves × 9"). Accounts names, "Admin-fixed tariff", approval remarks and internal discount notes are no longer printed.
- Payments section: the ₹ advance recorded as Payment / category Advance now shows as **Advance** and is totalled under Advance Received (was Payments Received). Discounts show "Room tariff adjustment · date · Room (₹3,200 → ₹2,500 per day)", dated by day; Mode shows "—" instead of "Not applicable".
- Shared helpers billLineLabel / billIsAdvance / billItemsSummary (core/08-date-utils.js) — must stay in step with the Family Portal. No SQL.

## 2.15.75 · SQL 199 — Daily room rent posts automatically at 12:05 AM

- Room rent, nursing and special-nurse daily charges now post by themselves every night at **12:05 AM (India time)**, with a safety re-run at **6:05 AM**. Staff no longer need to log in for the day's rent to appear.
- Fixed: between 12:00 AM and 5:30 AM the database (UTC clock) rejected today's rent as a "future charge". The check now uses the India date.
- Login and the payable WhatsApp still run the same billing as a backup. All runs are duplicate-safe. SQL only (supabase/sql/199_daily_rent_ist_auto_post.sql); no app files changed.

## 2.15.75 — Tamil screens: much wider coverage

The தமிழ் word list grows from about 1,200 to about 2,250 phrases, covering Akshi's pages far more fully: Director's Office, Enquiry Register, Enquiries & Feedback, WhatsApp Inbox, Food & Diet and Food Vendor, Stores / Kitchen, Duty Assignment, Leave & Permission, Duty Swap / Leave Cover, Spot Assessment, Notifications, My Profile, voice input, pop-ups, confirmations and error messages. Mixed lines are now translated part by part (for example "This Week · 05-10-2026", "Unread 0", "Status: New"), and status values inside detail windows are translated too. Names, notes, codes and dates stay as entered. No SQL.

## 2.15.74 — Food Vendor statement: simpler lines, AppGeo logo

- The statement table is now one line per date + meal + Guest / Employee: Date · Meal · Guest / Employee · Ordered · Received · Rate ₹ · Amount ₹ (Employee lines lightly shaded; lines with nothing ordered or received are left out; Total row at the bottom). Same on screen, PDF, WhatsApp PDF and Excel. Quantities-only view: Date · Meal · Guest / Employee · Ordered · Received.
- AppGeo - Saidapet statements show the AppGeo logo (assets/appgeo-logo.png) instead of the Samara logo, on screen and in the PDF. No SQL.

## 2.15.73 — Food Vendor statement: Guest and Employee in separate columns

The statement table (screen, Print / Save PDF, Send WhatsApp PDF and Export Excel) now shows, for each date and meal: Guest ordered, Guest received, Guest rate, Guest amount, Employee ordered, Employee received, Employee rate, Employee amount, Total received and Total ₹ — with totals for every column. The quantities-only view shows Guest / Employee ordered and received. The meal summary below is unchanged. No SQL.

## 2.15.72 — Phone layout: On Duty Today and EN | தமிழ் in one row

On phones the language switch was squeezed into a narrow column (E/N stacked). The 👥 On Duty Today button and the EN | தமிழ் switch now sit together in their own full-width row under the search box (button with its label on the left, switch on the right). Desktop unchanged. No SQL.

## 2.15.71 — On Duty Today

New **👥 On Duty Today** button in the top bar (Admin, Manager, STD). Shows who is **on duty now** (by shift time; last night's Night Shift until 7 AM), today's duty by shift (Day, Night, Morning, Evening, General) with duty type / room / task, **weekly off**, and staff on **approved leave / permission** (not counted as on duty). Department chips, ‹ › for other days, and 📞 tap-to-call mobile numbers. Uses the existing Duty Assignment and Leave records — no SQL. Tamil wording included.

## 2.15.70 — EN | தமிழ் screen language (trial for STD)

- New **EN | தமிழ்** switch at the top (next to the role badge) for STD — Admin also sees it to check the wording. தமிழ் shows the menu, page titles, boxes, buttons, labels, filters, statuses and short messages in simple Tamil with common English work words (Guest = கெஸ்ட் (Guest)); names, notes, WhatsApp messages, item names and other typed data stay as entered; dates stay DD-MM-YYYY.
- First version covers STD's pages (Director's Office, Enquiry Register, Enquiries & Feedback, WhatsApp Inbox, Food & Diet, Stores, Leave, Notifications, menu and top bar) — about 1,180 phrases in src/app/global-ui/09-tamil-dictionary.js; anything not yet in the list stays in English (nothing breaks). Server error messages stay English for now.
- The choice is remembered per user on every device. Apply supabase/sql/198_ui_language.sql (after 197); until then it is remembered on that device only.

## 2.15.69 — Enquiries: open WhatsApp chats, "Not an enquiry" category

- Director's Office → Enquiries & Feedback: each WhatsApp enquiry conversation now opens its chat (tap the row or 💬 Open chat — the Inbox opens on that conversation) and shows its Enquiry Register entry (▤ ENQ-… · status), or **+ Add to Enquiry Register** when it is not in the register yet.
- Enquiry Register: **⇲ Not an enquiry** moves a Website / WhatsApp entry that is not an admission enquiry (job seeker, vendor, Guest's family, staff, wrong number, spam, general question, other) out of the register lists and reminders. WhatsApp never re-adds that number. New dashboard box and chip **Not enquiries** to check them; **↩ Restore as enquiry** brings one back as New. 💬 WhatsApp chat in an enquiry opens that conversation.
- Apply supabase/sql/197_enquiry_not_an_enquiry.sql (after 196).

## 2.15.68 — Enquiry Register opens as a dashboard

Director's Office → Enquiry Register now opens with boxes, like Pharmacy & Stores: New Enquiry, Enquiry Register — View All, New — Not Yet Contacted, Follow-up Due, In Progress, Admitted, Closed and This Month by Source (live counts). Each box opens the register already filtered, with the period / source / person filters + Apply, search and status chips; "← Back to Dashboard", × or the phone's Back button return to the boxes. Admin sets the default person from the dashboard (⚙ Default person). No SQL.

## 2.15.67 — Samara Enquiry Register

New DIRECTOR'S OFFICE → **Enquiry Register** (replaces ADMISSION → Enquiries; old links open the register).
- One register for every admission enquiry: Website / Family Portal (as before) and **WhatsApp — now automatic**: a new WhatsApp chat about admission, rooms, cost, nursing etc. becomes an enquiry (staff, Guests' families, applicants, the food vendor and payment chats are skipped); later messages from the same number are noted in its timeline. WhatsApp enquiries from the last 14 days are added once when the SQL is run.
- **+ New Enquiry** for Walk-in / Phone call / Reference / Hospital referral: Guest name and age, contact, relation, where the Guest is now, care needed, room preference, expected admission date, how they heard about Samara, notes. Warns when the mobile number is already in the register.
- Enquiry number (ENQ-00001…), status New → Contacted → Visit / Assessment Scheduled → Estimate Sent → Bed Reserved → Admitted / Closed (closing needs a reason), next follow-up date, assignment, and a dated timeline of every follow-up (who and what).
- Filters: Today / This Week / This Month / Last Month / All / Selected period, source and assigned person, with Apply; search; chips All / New / In progress / Follow-up due / Admitted / Closed. Tap a row for full details, follow-up, Call, Edit and **Start Admission** (opens the Admission form with the Guest and attendant details).
- Who: STD (Akshi), Admin and Manager add and update; Admin chooses the **default person** for new enquiries (⚙ Default person — choose Akshi; can also assign the open unassigned ones).
- Reminders in **Notifications** ("Enquiries — Follow-up Needed"): the assigned person sees new enquiries and follow-ups due; Admin also sees New enquiries untouched for 24 hours or not assigned. STD now has Notifications in the menu. Director's Office → Enquiries & Feedback shows an Enquiry Register tile.
- Apply supabase/sql/196_enquiry_register.sql (after 195). No Edge Function change.

## 2.15.66 — Food Vendor messages: only the numbers in bold

In the simplified vendor messages only the quantities are bold (Standard meal *18* • Soft meal *4*). Templates to submit to Meta are unchanged. Edge Function food-whatsapp: redeploy from supabase/function-copies/food-whatsapp-inbox.ts. No SQL.

## 2.15.65 — Food Vendor messages: Guest / Employee split, AppGeo logo only

- New simplified vendor messages (not yet submitted to Meta) now show the Total plus separate Guest (கெஸ்ட்) and Employee (ஊழியர்) quantities, for order, order change and received.
- The "Deliver to" / "Received at" line is removed: the header picture shows the place. AppGeo pictures now carry only the AppGeo logo (no Samara logo).
- A place without its own picture (anything other than Samara Main and AppGeo) keeps the older wording, which names the place.
- Food Vendor screens say "Guests" instead of "Residents".
- Meta: submit the updated texts in docs/META_TEMPLATES_food_v2.md (they replace the 2.15.64 texts). Edge Function food-whatsapp: redeploy from supabase/function-copies/food-whatsapp-inbox.ts. No SQL.

## 2.15.64 — Food Vendor: simpler, colour-coded WhatsApp messages

The vendor was confusing the Order and Received messages. New simplified messages (English + Tamil, short lines, place / time / quantities in **bold**) with a coloured header picture: pink band = NEW ORDER, purple = ORDER CHANGED, grey = ORDER CANCELLED, blue = RECEIVED; magenta tag = Samara Main – Mogappair, AppGeo logo on a pale green strip = AppGeo – Saidapet. The Received message now says "This is NOT a new order", shows only what was received and what is still to send (no repeated ordered quantities, no buttons). The place is no longer fixed as Mogappair in the order wording.
- Meta: submit samara_food_order_v2, samara_food_modification_v2, samara_food_receipt_v2 (exact text in docs/META_TEMPLATES_food_v2.md). Until each is approved and ticked in Food Vendor → Settings, the ERP keeps sending the older template. Manual WhatsApp already uses the new wording.
- Edge Function food-whatsapp: redeploy from supabase/function-copies/food-whatsapp-inbox.ts. No SQL.
- New pictures: assets/food-wa/*.jpg (upload with the ERP files).

## 2.15.63 — Food Vendor: no duplicate rates

Only one rate per place + meal (Guest / Employee) + effective date. Saving the same price again is refused ("already saved"); saving a different price for the same date corrects that date's rate after confirmation (old price kept in Billing History). Existing duplicates are removed (the latest saved row, which is the one in use, is kept). Apply supabase/sql/195_food_rate_no_duplicates.sql (after 194).

## 2.15.62 — Food Vendor: separate Guest and Employee prices

Breakfast, Lunch and Dinner now have a Guest (resident) price and an Employee price (Billing → Rates → "Price for"); Coffee/Tea keeps one price. Until an Employee price is saved, employees are charged the Guest price. Saving a rate can recalculate receipts already entered from its effective date (tick box, on by default); receipts corrected by hand are not changed, and the recalculation is recorded in Billing History. Receipt prices shows Guest / Employee quantities and lets Admin correct both prices. The statement shows "G ₹ / E ₹" rates and the meal summary has separate Guest and Employee rows. A negative closing balance now reads "Advance with vendor in words" instead of "Minus Rupees…". Apply supabase/sql/194_food_employee_rates.sql (after 104, 178 and 193).

## 2.15.61 — Food Vendor: late receipt entry for auto-closed orders

Orders with no receipt 3 hours after delivery are auto-closed (SQL 150) and closed orders are not billed, so food that came but was not entered was lost from the statement. Admin/Director now see "Reopen for late receipt" on a Closed (not cancelled) order from the last 30 days: enter a reason and the order reopens for 24 hours; staff then press Receive and enter the actual time and quantities (time defaults to the delivery time). Billing / ledger entries are made for the original supply date. For many days at once, Orders has "Reopen auto-closed orders in period (late receipt)" (Admin/Director): it reopens every auto-closed order in the selected From–To period, both places, for 48 hours (cancelled and manually closed orders are not touched). Late receipts do not send WhatsApp to the vendor automatically. The reopen and reason appear in the order history; if nothing is entered within 24 hours the order auto-closes again. Apply supabase/sql/193_food_late_receipt_reopen.sql (after 150 and 178).

## 2.15.60 — Fix: "Manage item list" no longer crashes Food & Diet

Opening ⚙ Manage item list showed "This page had a problem" (a helper used by the window was not available to it). Fixed; no SQL.

## 2.15.59 — Food item list managed by Admin

Resident Food Intake → Meal now has "⚙ Manage item list" for Admin: per Breakfast / Lunch / Dinner and group (Main item, Sides / curries, Others) Admin can add, rename, reorder (↑ ↓) and remove items, restore removed items, and turn staff-typed "Added earlier" items into list items or hide wrong spellings. Removing or renaming never changes saved meal entries. The list is stored in the new table food_item_list (filled with the current standard list); until supabase/sql/192_food_item_list.sql is run the built-in list is used. Only Admin can change the list.

## 2.15.58 — Accounts / Billing menu reorganised

Accounts Dashboard is now first, followed by three labelled groups: Guest Billing · money in (Bills & Charges Approval, Guest Payments / Receipts, Guest Ledger, Final Billing, Discharge Clearance, Refunds, Package Expiry), Outgoing Payments · money out (Payment Requests, Approved — Ready to Pay, Payment Vouchers, Payment Statements) and Reports (Accounts Reports). "Payments & Vouchers" is no longer listed separately (it opened the same screen as Payment Requests; old saved links still work). Outgoing items have proper icons. Guest Ledger and Final Billing appear only under ACCOUNTS / BILLING (removed from PATIENTS). Nurses still see "Bills & Charges". The Accounts tab bar uses the same names and order. Help assistant knowledge refreshed. Menu only — no page, data or permission changes; no SQL.

## 2.15.57 — Erase Trial Guest works when the Guest has room-tariff adjustments

"Erase Trial Guest" stopped with "Tariff adjustments are permanent audit entries" when a dated room-tariff change had added adjustment rows to the Trial Guest's ledger. The tariff guard now allows those rows to be removed only inside the Trial Guest erase, only for that Guest, and only if the Guest is Trial. Real Guests' tariff adjustments stay permanent; the room's tariff history is kept. Apply supabase/sql/191_trial_purge_tariff_adjustments.sql (after 182 and 171).

## 2.15.56 — Discharge: open Trial Guest cases no longer hidden silently

The Nursing / main Dashboard counted Trial (test) Guest discharges, but the Discharge page shows "Real only" by default, so open Trial cases (e.g. "2 awaiting Management") seemed to be missing for Admin. Now: each stage box shows "+N 🧪 Trial" for hidden Trial cases, an amber note above the register lists them by stage with a one-tap "Show Trial cases" button, and the Dashboard discharge line says how many are Trial (e.g. "2 awaiting Management (🧪 all Trial)"). Frontend only — no SQL.

## 2.15.55 — Kitchen / Food Stores item list with automatic codes

Kitchen items now have automatic codes (KIT-0001, KIT-0002 …, same KIT- series as Stores). "＋ New Kitchen Items" (Record Purchase and Kitchen Stock tabs; kitchen in-charge or Admin) adds several items in one save — name, unit from the list, optional low-stock level; duplicate names are refused. Record Purchase now picks each item from the coded list (unit filled automatically), with "Other expense (not a stock item)" for things like auto fare. Kitchen Stock, Purchase Register and stock history show the codes. Existing kitchen items are numbered automatically. Apply supabase/sql/190_kitchen_item_codes.sql before this frontend.

## 2.15.54 — Bills & Charges escalation repeats every 30 minutes

While charge requests stay Pending with Accounts beyond 30 minutes, Admin / Director get the summary WhatsApp ("N Bills/Charges raised are unattended in Accounts ... pending since 12:30 PM on DD-MM-YYYY. Please take necessary action.") again every 30 minutes, and the ERP pop-up re-appears every 30 minutes. Stops automatically once Accounts attends to all of them. Apply supabase/sql/189_bill_charge_escalation_every_30_min.sql (after 188) and redeploy bill-charge-escalation-dispatch.

## 2.15.53 — Bills & Charges escalation to Admin after 30 minutes

If a charge request raised in Bills & Charges is still Pending with Accounts (not approved, partly approved or rejected in Charge Approvals) 30 minutes after it was raised, Admin / Director get an ERP pop-up and a new "Bills & Charges — Not Attended by Accounts" list in Notifications (tap a row to open that exact charge). WhatsApp to Admin / Director (one short summary: number of unattended charges and since when, no Guest details; sent again only when more charges become overdue) runs every minute through the new Edge Function bill-charge-escalation-dispatch and stays silent until the Meta template samara_billing_escalation is approved and BILLING_WHATSAPP_ENABLED=true is set. Apply supabase/sql/188_bill_charge_accounts_escalation.sql. Charges already pending before SQL 188 is run are listed in the ERP but not sent on WhatsApp.

## 2.15.52 — Simple Add Equipment

Create a new equipment type and its physical pieces in one Add Equipment form, or add pieces to an existing type. Store staff enter equipment and purchase details; Admin manages resident billing separately in Equipment & Billing. SQL 187 saves types and pieces atomically, prevents duplicate retry receipts, and protects billing links from non-Admin changes.

## 2.15.51 — STD stores menu

Remove Consumables, Pharmacy, Biomedical Equipment and Oxygen Cylinders from the STD role menu. Keep Kitchen / Food Stores and the other STD modules. No SQL change.

## 2.15.50 — Mobile kitchen cash actions

Move Kitchen Back to the toolbar on phones and show card actions first so navigation cannot cover cash confirmation. Explain that Admin must record actual handover after approval. No SQL change.

## 2.15.43 — Resident tariff dates and adjustment visibility

Show the resident-applicable tariff date from admission or the later tariff date. Preserve original audit entries and balances. Family Portal displays discount credits, refund debits and a separate discount total. No additional SQL migration is required; migration 182 remains the billing prerequisite.

# Samara Care ERP — Changelog

Newest first. From 2.14.15 onwards, add each release here (a few lines) instead of creating a new START_HERE / RELEASE file.
The full original notes for older releases are kept in [`docs/release-notes/`](docs/release-notes/).

## 2.15.42 — Backdated room tariffs with audited account adjustments
- Edit Room / Bed & Tariff now has an Effective from date (today or earlier) and a change reason.
- SQL 182 saves dated tariff history and posts only the difference as a linked Charge or Discount. Original automatic entries, payments and receipts are preserved. Repeat saves do not duplicate adjustments.
- Applies by historical room occupancy and tariff date; package coverage, reviewed departure cutoffs and later dated tariffs remain respected. Room transfers preserve previously adjusted originals.
- Automatic catch-up uses the tariff applicable on each service date, including historical nursing rates when the current rate is zero. Patient Ledger verification includes adjustments; Final Bill refreshes when entries change.
- Apply supabase/sql/182_room_tariff_effective_dates.sql before deploying this frontend. Migration requires existing billing safeguards 131 and 132; installation itself does not reprice any ledger entries.

## Family Portal v1.0.24 (separate repo Samara_Family_Portal) — beverages in Food & Diet
- SQL (shared database): supabase/sql/180_family_portal_beverages.sql — family_portal_beverages(session token) returns the family's own Guest's beverage servings (session checked through the existing family_portal_dashboard; no staff names).
- Portal: beverages listed in the Care Timeline under Food & Diet ("Food & Diet: Beverage — Fresh Juice (Mosambi) — Consumed fully · 150 ml"); meals show "Breakfast" instead of "Tiffin".

## 2.15.40 — Beverage quantity with a unit dropdown
- Beverage entry: Quantity + Unit (ml, cup, glass, tumbler, mug, tsp, tbsp, g, mg). Any number is accepted, including decimals (e.g. 0.5 cup). Fixes the "Quantity is not valid" error for values like 100 ml (the old box only allowed 1, 11, 21 …).
- Shown as "2 tsp", "150 ml", "1 cup" in the Food & Beverage Register, Patient File → Diet, the Intelligent Report and (after redeploy) the WhatsApp Daily Report. Earlier entries keep their ml.
- SQL: supabase/sql/179_beverage_quantity_unit.sql (run once). Until then, ml entries still save; other units ask for the update.

## 2.15.39 — Beverage entry: clear notice when the database update is missing
- If supabase/sql/177_beverage_records.sql has not been run, the Beverage Save button now says "Cannot save yet — database update needed" with the instruction right below it (previously only a faded button on phones). No SQL change.

## 2.15.38 — Discharge page: medication review list removed
- "Discharged Patients — Medication Review" (doses still unrecorded at departure, for Nursing Manager / Admin to review) is no longer shown on Patient Discharge. It is a medication task and remains on the Medicines page. No SQL.

## 2.15.37 — Food WhatsApp: quantities and place of delivery in bold
- Food vendor WhatsApp (order, revision, receipt, confirmation, cancellation): every quantity (e.g. "Standard meal: *2*"), the outstanding portions and the place ("Deliver to: *Samara Main - Mogappair*") are sent in WhatsApp bold. Same approved templates and number of values.
- ERP WhatsApp Inbox and the Food Vendor "Review message" preview now show WhatsApp formatting like the phone (*bold*, _italic_, ~strike~) instead of the asterisks.
- Edge Function food-whatsapp: redeploy from supabase/function-copies/food-whatsapp-inbox.ts (includes the 2.15.36 place / DD-MM-YYYY / Breakfast changes). No SQL.

## 2.15.36 — Food Vendor: two delivery places (Samara Main - Mogappair, AppGeo - Saidapet)
- Each place is its own vendor account: separate orders (one per date + meal per place), WhatsApp, receipt, cancellation, rates, statement and balance. Mrs. Yuvashree supplies both for now; Settings → Delivery places → "Change vendor" sets another vendor for AppGeo later (a new account starts; Samara Main is untouched).
- New order: "Deliver to" buttons for the two places (fixed once an order is placed). Orders / History: place shown under each order, plus a "Place" filter (Both places / Samara Main / AppGeo). Receive and Messages show the place.
- WhatsApp: the place is added to the approved "Date and meal" line, e.g. "02-10-2026 / Lunch / Deliver to: AppGeo - Saidapet" — no new Meta template needed.
- Statement / Vendor Ledger / Billing: the Vendor selector lists each place ("Mrs. Yuvashree · AppGeo - Saidapet"). AppGeo starts with the same current rates as Samara Main; change either separately in Billing → Rates.
- All existing orders, receipts, rates and balance stay with Samara Main - Mogappair.
- Edge Function food-whatsapp (checked line by line against the live version — only these changes): place in "Date and meal"; API messages now say "Breakfast" (not Tiffin) and show dates as DD-MM-YYYY like the manual WhatsApp; receipt time as "02-10-2026, 07:35 AM IST". Same templates and number of values.
- SQL: supabase/sql/178_food_two_places.sql (required; all-or-nothing, stops without changes if fv_rpc is not as expected). Edge Function food-whatsapp: redeploy from supabase/function-copies/food-whatsapp-inbox.ts so API-sent messages include the place (manual WhatsApp already does).

## 2.15.35 — Resident Food Intake: Guest-wise Food & Beverage Register
- "Recent Food & Beverage Records" is replaced by the Food & Beverage Register: choose a Guest and a Period — Today (default), Yesterday, This Week, This Month, Last Month or Select period (From / To) — and press Apply. Shows only that Guest's meals and beverages for that period, loaded from the database (no 100-row limit).
- For a single day, a summary row shows Breakfast / Lunch / Dinner (intake, time, items — or "Not recorded") and the beverage servings.
- Choosing a Guest in the entry form also opens that Guest in the register; a different Guest can still be picked there. Times shown the same way for meals and beverages. No SQL.

## 2.15.34 — Resident Food Intake: item-by-item meals + separate Beverage entry
- Meal entry: food items are added one by one from a dropdown (Main item / Sides & curries / Others, per Breakfast, Lunch, Dinner — e.g. Idli, then Sambar, then Coconut Chutney), shown as chips that can be removed or moved. "✎ Other — type your own item" adds any item; items typed before appear again under "Added earlier". Saved as "Idli, Sambar, Coconut Chutney".
- Beverage entry (☕ Beverage switch): Tea, Coffee, Milk, Boost, Horlicks, Fresh Juice (staff type which juice), time given, optional quantity (ml), consumed fully / partially / refused, remarks. Any number of servings per day, each recorded separately. Beverages are no longer part of the meal form (old meal records keep theirs).
- Recent Food & Beverage Records lists meals and beverages together (intake colour-coded, 🧪 TRIAL badge). Patient File → Diet tab and the Intelligent Report (Food / Fluid Intake) include the beverage servings.
- SQL: supabase/sql/177_beverage_records.sql (new table beverage_records). Edge Function daily-patient-report: redeploy from supabase/function-copies/daily-patient-report-inbox.ts so the WhatsApp Daily Report also lists the beverage servings (until then it shows meals only).

## 2.15.33 — Discharge Register: Guest record filter (Real only by default)
- New "Guest record" filter: ✓ Real only (default) / 🧪 Trial only / All (Real + Trial). Box counts, the register and the Excel (CSV) export follow it, so test discharges never mix into real figures.
- The line under "Discharge Register" shows the scope and how many Trial discharges are hidden (e.g. "Real Guests · All dates · 3 Trial hidden"). Clear resets to Real only. No SQL.

## 2.15.32 — Discharge Register: filter results always visible
- Pressing Apply (or Enter in Search) now switches to the "All discharges" box, so results are never hidden behind an empty stage box (e.g. Returned to Nursing).
- When a period has no discharges, the register says so and lists the discharge dates on record (e.g. "No discharges in This Month … Discharge dates on record: 22-09-2026, 21-09-2026"). No SQL.

## 2.15.31 — Discharge Register: period filter + boxes follow the filter
- "Discharge period": All dates (default), Today, This Week, This Month, Last Month, This Year, or Select period (From / To appear only then). Applied with the Apply button.
- Discharge date used for the period = actual departure date once departed, otherwise the proposed discharge date.
- Stage box counts now follow the applied search / basis / period, so you can see which box holds the results.
- When the chosen box is empty but other boxes match, the register says where they are (e.g. "Found in: Completed (2)") with a "Show all discharges" button. No SQL.

## 2.15.30 — Patient Discharge reorganised: stage boxes + Discharge Register
- Header: title, workflow line and the main buttons together (＋ Initiate Discharge; Admin's "Erase discharged Trial Guests" moved into a small "⋯ Admin" menu).
- Stage boxes with live counts: Open cases (default), Awaiting Management, Discount Pending, With Accounts, Final Nursing Clearance, Returned to Nursing, Completed, All discharges. Tap a box to see only those cases. Discharge Clearance (Accounts) shows All / Discount Pending / With Accounts.
- Discharge Register replaces the 14-column table: Guest (name, Resident ID, room, ✓ REAL / 🧪 TRIAL), Basis (+ doctor / requester), Discharge date, Initiated (by + time), Current step (coloured), Departed, Action. Tap a row → full details popup (all fields, handovers, review appointment, WhatsApp) with that case's action buttons. Completed rows show the WhatsApp status; WhatsApp buttons are in the popup.
- Filters with Apply: Search Guest (name, ID, room, doctor / relative), Initiation basis, Discharge date from / to; Clear. ⬇ Excel (CSV) exports the rows shown (DD-MM-YYYY).
- Discharge timeline & departure follow-up is now a collapsed section; Discharged Patients — Medication Review moved to the bottom.
- All approval / payment / final-clearance / WhatsApp actions and rules are unchanged. No SQL.

## 2.15.29 — Patient Master shows Real / Trial clearly
- Every Guest in the Patient Master list now carries a badge under the name: green "✓ REAL" or amber "🧪 TRIAL"; Trial rows are also lightly tinted with an amber left edge.
- The "Showing: …" bar shows the split, e.g. "✓ REAL 1 · 🧪 TRIAL 4".
- Patient File → Admission Details shows "Guest Record: Real Guest / Trial (test) Guest". No SQL.

## 2.15.28 — Active Trial Guests kept for testing
- "🧪 Erase discharged Trial Guests (N)" now erases only Trial Guests who are no longer active (discharged). Active Trial Guests stay, still used for testing; discharge them when testing is over, then erase them with this button or the single "Erase Trial Guest" button.
- For now: 175 marks all 14 test Guests as Trial (4 active stay for testing: 0012, 0013, 0014, 0016); the button erases the 10 discharged ones with confirmation "ERASE 10".
- SQL: run the revised supabase/sql/176_erase_all_trial_guests.sql (instead of the 2.15.27 version). Tested on a local copy: active Trial and Real Guests and their beds untouched.

## 2.15.27 — Erase all Trial Guests at one time
- Patient Discharge (Admin only): "🧪 Erase all Trial Guests (N)" button. Shows one dry-run list of every Trial Guest (records per Guest, active ones flagged "bed freed", stored files, stock items issued to them by indent), then asks to type "ERASE N" and erases them all in ONE all-or-nothing step. No discharge needed for this; active Trial Guests' beds become Available. Real Guests are never touched. Refused while equipment / oxygen cylinders are still issued.
- Stock history (consumable store ledger / receipts, equipment and oxygen movements) is now kept and unlinked on every Trial erase (single or all), never deleted. Recount the listed stock items afterwards.
- Audit log: one TRIAL_GUEST_PURGED entry per Guest (with receipt voucher numbers and paid Razorpay IDs) + one TRIAL_GUESTS_BULK_PURGED entry.
- SQL: supabase/sql/175_mark_test_guests_trial.sql (one-off: marks the 14 test Guests MOG-2026-09-0002…0017 as Trial; Real Guests 0001, 0006, 0018 untouched) then supabase/sql/176_erase_all_trial_guests.sql (required). Tested on a local copy: dry run changes nothing, wrong confirmation refused, real Guest untouched, a failure part-way erases nothing, single erase unchanged.

## 2.15.26 — Food Vendor Statement charges received portions only
- The statement's Meal summary counted ORDERED portions, so an order not yet received (e.g. the next day's breakfast) was added to "Food charges" and the closing balance. It now counts RECEIVED portions only (0 until received; received quantity, not ordered, once received), using the receipt's own priced amount where recorded. Heading now "Meal summary · received portions". Screen, PDF and Excel all use this.
- The opening balance and vendor ledger were already receipt-based (unchanged). No SQL.

## 2.15.25 — WhatsApp Inbox: Reply to a specific message
- "↩ Reply" on every message (inside the 24-hour window): the message is quoted above the typing box; the text / photo / document sent arrives on the recipient's phone as a WhatsApp reply to that message (Meta "context").
- Quotes shown inside bubbles for Samara's replies and for the relative's replies to a specific message; tap a quote to jump to the original.
- Edge Function whatsapp-send: +10 lines (reply_to → context.message_id). Redeploy it; until then replies send normally without the quote on the phone. No SQL.

## 2.15.24 — WhatsApp Inbox works like a real WhatsApp inbox
- Original messages: templates are shown exactly as the recipient received them (image/text header, body with the values filled in, footer, buttons), using Samara's approved templates copied from Meta (new Edge Function whatsapp-templates-sync; needs secret WHATSAPP_BUSINESS_ACCOUNT_ID). Auto-refreshed daily; "Refresh templates" button for Admin / Manager. Conversation list previews use the real text too.
- Delete: Admin and Manager can delete a message from the Samara inbox (with optional reason); Admin sees "Show deleted" and can Restore. Meta cannot delete a business message from the recipient's phone. Every delete/restore is in the audit log.
- Attachments: 📎 sends a photo (JPG/PNG, 5 MB) or document (PDF/Word/Excel, 15 MB) with optional caption, inside the 24-hour reply window. Samara keeps its own copy; sent and received files open from a WhatsApp-style file card.
- whatsapp-media now also serves Samara's stored copies (sent attachments, archived files, Daily Report PDFs) — only for files an Inbox message refers to.
- SQL: supabase/sql/174_whatsapp_inbox_real.sql. Edge Functions to deploy: whatsapp-templates-sync (new), whatsapp-send and whatsapp-media (updated; source in supabase/function-copies/*-food-scope.ts, mirrored in supabase/functions/).

## 2.15.23 — WhatsApp button shows the WhatsApp logo (from icons/)
- Uses the WhatsApp icon uploaded to icons/whatsapp-logo-png-icon.png, resized to icons/whatsapp-96.png (7.5 KB instead of 200 KB) so the page stays fast on phones. Button: white with green border, logo on top, "WhatsApp" below. No SQL.

## 2.15.22 — WhatsApp button: plain green button with the word "WhatsApp"
- Guest Overview → 📞 Call: the WhatsApp button is now a plain green text button (no icon); the ERP's pink theme can no longer recolour it. No SQL.

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













## 2.18.79 — Responsive date and time pickers across the ERP
- Date fields open their calendar from an explicit, accessible button, including compact medication rows.
- Effective-from date/time fields use the same single-choice hourly time picker as medication times.
- Time-selection dialogs render above the full application so nearby controls cannot cover them.

