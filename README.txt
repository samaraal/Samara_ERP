Samara Care ERP v2.9.51 — Login Hang Fix

Replace only:
1. index.html
2. app.js
3. service-worker.js

What changed:
- Prevents optional login security Edge Function from leaving the button forever on “Signing in…”.
- Adds a 6-second timeout to the optional security pre-check / login audit request.
- Adds bounded timeouts to Login ID resolution and Supabase authentication.
- Always restores the Sign in button and shows an error if a network/auth request fails or times out.
- Keeps the v2.9.50 update-prompt permanent fix.

No SQL or Edge Function deployment is required.
