Samara Care ERP v2.11.29 — Mobile Notification Button Fix

Replace ONLY:
- app.js
- config.js
- index.html
- service-worker.js

Fix:
- Enable Mobile Notifications now always gives visible feedback.
- Explicit iPhone guidance when notification permission is blocked.
- 8-second service-worker readiness timeout instead of appearing to hang.
- Re-registers the mobile push subscription using the new VAPID public key.
- Shows a clear success message after the device is saved.

No clinical scheduling, medication, vitals, nursing care, billing or HR logic changed.

After upload:
1. Update/repair Samara Care to v2.11.29.
2. Login as Boomi R.
3. Clinical Alerts -> Enable Mobile Notifications.
4. If iPhone says notifications are blocked, enable:
   Settings -> Notifications -> Samara Care -> Allow Notifications.
5. Tap Enable Mobile Notifications again.
