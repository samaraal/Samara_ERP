Samara Care ERP v2.11.31 — Mobile Push Status + Bell Navigation

Replace ONLY:
- app.js
- config.js
- index.html
- service-worker.js

Corrections:
1. The actual Clinical Alerts mobile notification button is now state-aware:
   - GREEN + ✓ Mobile Notifications Enabled
   - RED + ✕ Mobile Notifications Disabled
   - Tapping green disables this phone and deactivates its push subscription.
   - Tapping red enables/re-registers this phone.

2. Top-right bell:
   - Tapping the bell now opens Clinical Alerts directly filtered to Escalated items when escalations exist.
   - If there are no escalations, it opens all unresolved Clinical Alerts.

No medication, vitals, nursing care, escalation timing, billing, HR, or other ERP workflow changed.
