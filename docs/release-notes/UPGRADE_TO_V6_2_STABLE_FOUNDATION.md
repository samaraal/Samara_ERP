# Samara Care ERP V6.2 – Stable Foundation

This upgrade fixes the repeated employee login and Repair Account problem without deleting existing employee profiles.

## What changed

- Existing employee profile IDs are preserved.
- A separate `auth_user_id` securely links each employee profile to Supabase Authentication.
- Repair Account creates or reconnects only the missing Authentication account.
- Repair Account no longer inserts a duplicate profile row.
- Reset Password, Enable and Disable use the linked Authentication account.
- Login ID resolution uses the linked Authentication account.
- Old automatic `auth.users` profile triggers are removed because the protected `admin-users` function now manages employee creation.

## Step 1 – Run one SQL migration

Open Supabase → SQL Editor → New query.

Open this file and copy everything:

`supabase/sql/14_v6_2_stable_auth_foundation.sql`

Paste it into Supabase and click Run.

The final result lists each employee as READY, AUTH USER MISSING, AUTH LINK BROKEN or DISABLED.

## Step 2 – Replace the admin-users function

Open Supabase → Edge Functions → admin-users.

Replace the full contents of `index.ts` with:

`supabase/functions/admin-users/index.ts`

Deploy the function.

## Step 3 – Upload the app

Replace the files in the current Samara Care GitHub repository with this package and commit the changes.

After deployment press Ctrl + Shift + R.

## Step 4 – Repair missing accounts

Sign in as Admin → ADMIN → Employees.

For a row showing Auth user missing, click Repair Account, enter a temporary password of at least eight characters and confirm.

The existing employee profile is retained and linked to the new Authentication account.
