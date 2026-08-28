Samara ERP v2.9.49 - WhatsApp General Follow-up UI

Replace these ERP files:
- app.js
- index.html
- config.js
- service-worker.js

No SQL required.
No Edge Function change from v2.9.48.

WhatsApp Inbox expired conversations now use:
Template: samara_general_followup
Language: en
{{1}} = customer/contact name automatically
{{2}} = editable 'Regarding' field, default: your assisted living enquiry
A preview is shown before sending.

IMPORTANT: Sending will work only after Meta marks samara_general_followup as Approved.
