Samara Care ERP v2.11.28 — VAPID Re-registration

Replace ONLY these four files in the ERP web root:
1. app.js
2. config.js
3. index.html
4. service-worker.js

What changed:
- New VAPID public key placed in config.js.
- Version bumped to 2.11.28 so the PWA/service worker receives the change.
- When a mobile user taps Enable Browser Alerts, any old VAPID subscription
  is deactivated/unsubscribed and a fresh subscription is created with the new key.
- No medication, vitals, nursing care, billing, HR, or other ERP workflow was changed.

After deployment on Boomi's phone:
1. Open Samara Care once and accept/update to v2.11.28.
2. Sign in as Boomi R.
3. Clinical Alerts -> Enable Browser Alerts.
4. Allow notifications.
5. Confirm the success notification.
6. Then lock the phone and test clinical-push-dispatch.
