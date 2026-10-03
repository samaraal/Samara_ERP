Samara Care ERP 2.15.53 — Bills & Charges not attended by Accounts within 30 minutes
====================================================================================

WHAT IT DOES
- A charge raised in Bills & Charges stays "Pending" until Accounts approves / partly approves /
  rejects it in Charge Approvals.
- If it is still Pending 30 minutes after it was raised:
    1. Admin / Director get an ERP pop-up ("N charge requests not attended by Accounts").
    2. Notifications page (Admin / Director) shows a new list "Bills & Charges — Not Attended by
       Accounts (over 30 minutes)". Tapping a row opens that exact charge in Charge Approvals.
    3. WhatsApp to every active Admin / Director with a mobile number — ONE message per Guest,
       sent only once per charge (never repeated every minute).
- Charges already pending before SQL 188 is run appear in the ERP list but are NOT sent on WhatsApp.

STEPS (in this order)
1. Supabase > SQL Editor: run supabase/sql/188_bill_charge_accounts_escalation.sql
   (the last result should show the job "samara-bill-charge-whatsapp-dispatch").
2. Supabase > Edge Functions > Create new function named exactly:
       bill-charge-escalation-dispatch
   Paste supabase/functions/bill-charge-escalation-dispatch/index.ts and deploy.
   Turn OFF "Verify JWT" for it (same as clinical-escalation-dispatch, so the cron job can call it).
3. Upload the other files to GitHub repo Samara_ERP only (same folders). Version becomes 2.15.53.
4. Meta WhatsApp Manager > Message templates > Create template
       Name: samara_billing_escalation      Category: Utility      Language: English
       Body (copy exactly):
         *Samara ERP – Billing alert*
         {{1}} charge request(s) for Guest {{2}} ({{3}}) have not been attended by Accounts.
         Items: {{4}}
         Raised at: {{5}} by {{6}}
         Pending for: {{7}} minutes.
         Please follow up with Accounts in Charge Approvals.
       Sample values: 2 | Mr. Raman | Room 101-A | Nebulisation, Catheter care | 03-10-2026 11:05 am | Nurse Priya | 35
5. After Meta APPROVES it: Supabase > Edge Functions > Secrets > add
       BILLING_WHATSAPP_ENABLED = true
   Until then WhatsApp stays silent; the ERP pop-up and Notifications list work right away.

TO CHANGE 30 MINUTES LATER (example 45):
   update public.bill_charge_alert_settings set minutes = 45, updated_at = now();
