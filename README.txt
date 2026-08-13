Samara ERP v2.8.46 - WhatsApp API Failure Fallback

Replace only:
1. app.js
2. index.html
3. service-worker.js

No SQL or Edge Function change is required for this patch.

Return & Send WhatsApp API behaviour:
- Tries approved samara_application_returned template first.
- If Meta API fails, keeps the ERP page open and shows Manual WhatsApp Fallback.
- Manual fallback opens the old WhatsApp method with the same rectification message pre-filled.
- Database/status update failure no longer hides the fallback or prevents the API attempt.
- API accepted messages continue to be recorded in applicant WhatsApp history.
