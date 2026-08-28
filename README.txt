Samara Care ERP v2.9.52 - Startup Hang Fix

Replace only:
- index.html
- app.js
- service-worker.js

Fixes:
- Prevents indefinite Loading Samara Care screen if Supabase session restore stalls.
- Adds bounded employee-profile startup lookup.
- Falls back to sign-in with a clear message instead of hanging.

No SQL or Edge Function changes required.
