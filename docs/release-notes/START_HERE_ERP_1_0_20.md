# Samara Care ERP 1.0.20 — First Login and Version Cache Fix

This package changes only:
- first-login secure-password completion;
- prevention of the repeated password-change loop;
- displayed version and browser/PWA cache from 1.0.18 to 1.0.20.

No dashboard, patient, employee, room, clinical, vitals, reports, billing, documents or layout code was redesigned.

## Simple deployment
1. In Supabase SQL Editor, run `supabase/sql/22_first_login_completion_resilience.sql` once.
2. Upload all files in this package to the existing GitHub repository, replacing the old files.
3. Wait for GitHub Pages deployment to finish.
4. Open the site and press `Ctrl + Shift + R` once. On mobile/PWA, close and reopen the app.
5. Sign in with the temporary password and create a completely different new password of at least 8 characters.

The login page must show `Samara Care ERP 1.0.20`.
