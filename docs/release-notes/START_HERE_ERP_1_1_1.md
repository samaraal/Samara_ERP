# Samara Care ERP 1.1.1 — Password Recovery & Security

This is an isolated security upgrade. It does not redesign or change Patients, Dashboard, Clinical, MAR, Vitals, Daily Care, Food & Diet, Billing, Reports, Rooms or the Nursing Workspace.

## Step 1 — Run one SQL file

1. Open **Supabase → SQL Editor → New query**.
2. Open `supabase/sql/28_password_recovery_security.sql` from this package.
3. Copy the full contents, paste them and click **Run**.
4. Both verification results should show **true**.

## Step 2 — Redeploy the existing `admin-users` Edge Function

Replace the existing function code with:

`supabase/functions/admin-users/index.ts`

Deploy the function with **Verify JWT turned OFF**. The function still performs its own secure login and role checks for all Admin/Manager actions; JWT is turned off only so a signed-out employee can request a recovery email.

## Step 3 — Supabase Authentication URL settings

Under **Authentication → URL Configuration**, add your live Samara ERP address to **Redirect URLs**. Use the same GitHub Pages URL that opens the ERP.

## Step 4 — GitHub

Upload all package files to the existing repository, replacing files when asked. Close all ERP tabs and reopen. Confirm **Samara Care ERP 1.1.1**.

## How staff use it

- Click **Forgot Password?** on the login page.
- Enter Login ID or registered employee email.
- Open the secure email and set a new password.
- Staff without a registered email should ask Admin to use **Employees → Reset Password → Generate Temporary Password**.

## Security included

- Generic recovery response that does not reveal whether an account exists.
- Temporary 15-minute lock after 5 failed attempts.
- 30-minute inactivity sign-out.
- Password recovery and reset audit events.
- Admin-generated temporary password still forces the employee to create a private password.

Important: Self-service email recovery requires a valid **Employee Email** in the employee’s Personnel File.
