Samara Care ERP v2.11.30 — Mobile Notification Enable/Disable Status

Replace ONLY:
- app.js
- config.js
- index.html
- service-worker.js

Changes:
- Clinical Alerts now shows the actual mobile push registration state.
- GREEN + tick: ✓ Mobile Notifications Enabled
- RED + cross: ✕ Mobile Notifications Disabled
- Tapping the green enabled button disables this device and deactivates its push_subscriptions row.
- Tapping the red disabled button registers/re-registers this device for locked-screen push alerts.
- Status is checked from the browser's actual PushManager subscription, not merely from a global setting.

No medication, vitals, nursing-care timing/escalation logic, billing, HR, or other ERP workflow changed.
