Samara Care ERP v2.11.32 — Corrected Mobile Notification Toggle + Bell Navigation

Replace ONLY:
- app.js
- config.js
- index.html
- service-worker.js

Verified:
- GREEN + ✓ Mobile Notifications Enabled
- RED + ✕ Mobile Notifications Disabled
- Old plain Enable Mobile Notifications label removed
- Button status is based on the device's actual PushManager subscription
- Green button disables the device and deactivates its push subscription
- Red button enables/re-registers the device
- Top-right bell opens Clinical Alerts directly filtered to Escalated when escalations exist

No medication, vitals, nursing-care, escalation timing, billing, HR, or other ERP workflow changed.
