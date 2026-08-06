# Samara Care ERP 1.0.19 — Password Change Only Fix

This package changes only the first-login password completion process.
No other ERP module has been modified.

## Step 1 — Supabase

Open **Supabase → SQL Editor → New query**.

Copy the complete contents of:

`supabase/sql/21_password_change_completion_only.sql`

Paste it into the SQL Editor and click **Run** once.

## Step 2 — GitHub

Upload this package to the same GitHub repository, replacing the existing files.
Wait for GitHub Pages deployment to finish.

## Step 3 — Test

1. Open the ERP in a private/incognito browser window.
2. Sign in using the temporary password.
3. Enter a genuinely different new password of at least 8 characters.
4. The ERP should open directly after the password change.
5. On later logins it should not ask for another password change.
