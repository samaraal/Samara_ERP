SAMARA CARE ERP 2.8.79 — CLINICAL DASHBOARD & ERP ALERT FIX

What is corrected
1. Clinical Dashboard Medicines due now reads the actual unresolved MAR doses due up to the current time.
2. Medication orders are loaded without a fragile nested patient relationship; this fixes the false zero count.
3. Priority Worklist shows DUE NOW / OVERDUE / ESCALATED / CRITICAL with overdue minutes.
4. A Clinical Alerts card is shown on the Clinical Dashboard.
5. A red bell/count is shown in the ERP top bar whenever unresolved alerts exist.
6. Nurses/Caregivers receive in-app clinical alerts from due time. Manager/Admin viewers receive the same unresolved alert after the configured 30-minute escalation threshold.
7. Clinical popups cannot be permanently dismissed by Acknowledge/Snooze. The alert remains until the underlying task is actually resolved.
8. WhatsApp dispatch is intentionally deferred in this release, as requested.

UPLOAD TO ERP ROOT
- app.js
- styles.css
- index.html
- service-worker.js

SUPABASE SQL EDITOR
Run: supabase/sql/84_clinical_notification_visibility_fix.sql
This does NOT delete clinical/test data. It only updates the alert functions so unresolved clinical tasks remain visible until resolved.
