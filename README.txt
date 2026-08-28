Samara Care ERP v2.9.50 — Update Prompt Permanent Fix

Replace ONLY these 3 files in the ERP root:
1. index.html
2. app.js
3. service-worker.js

No SQL. No Edge Function changes.

What changed:
- Version bumped to 2.9.50 to force a clean cache break from the looping v2.9.49 build.
- Same-version service-worker install/activate/controllerchange events can no longer open the update popup.
- The popup is shown only when service-worker.js on the server contains a STRICTLY NEWER semantic version than the running app.
- Service worker no longer broadcasts an update message merely because it activated.
