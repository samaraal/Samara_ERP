SAMARA CARE ERP v2.9.76 - LEAVE / PERMISSION SUBMIT FIX

Fixes:
1. Correct employee identity lookup using profiles.id OR profiles.auth_user_id.
2. Correct RLS insert/read policy for linked employee profiles.
3. Submission errors/success are shown inside the Apply popup.
4. Submit button is disabled while submitting to prevent double submission.
5. On success, button displays "Submitted ✓" before popup closes.
6. Success message remains visible on My Leave & Permission page.

INSTALL:
A. Supabase SQL Editor: run the ENTIRE 97_leave_permission_workflow.sql again.
B. Replace these ERP files:
   - app.js
   - index.html
   - service-worker.js
C. Hard refresh once after deployment (Ctrl+Shift+R).

No styles.css replacement is required.

SQL fix v2.9.76: profiles.auth_user_id is TEXT, so comparisons use auth.uid()::text; profiles.id remains UUID.
