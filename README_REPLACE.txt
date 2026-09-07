SAMARA ERP v2.10.58 — AUTH PROFILE LOAD FIX

Replace only:
1. app.js
2. index.html
3. service-worker.js

ROOT CAUSE ADDRESSED
The previous frontend still contained an older "richer employee profile" enrichment step.
After authenticating a user, that step could search other profile rows by full name/mobile/login
and replace the authenticated profile with another employee row. This is unsafe for authentication.

v2.10.58 removes that behavior completely from login/profile loading.

NEW SECURITY RULE
- Supabase Auth user UUID must equal public.profiles.id.
- ERP loads ONLY: profiles.id = authenticated user UUID.
- No OR matching.
- No name/mobile/login-based enrichment.
- No automatic login-time profile repair.
- Login ID entered must still match that exact profile's login_id.
- On any failure, the local session state is cleared immediately and the ERP returns to Login
  instead of remaining forever on "Loading your employee profile...".

The Manager Tamil/English voice functionality is retained.

AFTER UPLOAD
1. Confirm Version 2.10.58.
2. Log out.
3. Login as chellaboomi.
Expected: Dr ChellaBoomi — Admin.
It must never load Ramya — Accounts.
