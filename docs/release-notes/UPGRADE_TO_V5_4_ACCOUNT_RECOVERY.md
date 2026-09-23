# Samara Care ERP V5.4 — Employee Account Recovery

This update adds:

- Authentication Status in the Employees table
- Admin/Manager Enable and Disable controls
- Admin/Manager Reset Password button
- Automatic unblocking and reactivation after password reset
- Compatibility between the older `active` column and the newer `is_active` column

## Step 1 — Run the SQL upgrade

1. Open the **Samara Assisted Living** project in Supabase.
2. Open **SQL Editor**.
3. Click **New query**.
4. Open this package file:

   `supabase/sql/08_employee_auth_recovery.sql`

5. Copy all its contents into Supabase and click **Run**.
6. The result table will show each employee's Authentication Status.

## Step 2 — Replace the Admin Users Edge Function

The updated Edge Function is located at:

`supabase/functions/admin-users/index.ts`

Deploy this function using the same method used for the existing `admin-users` function. It must replace the earlier function.

The function now supports:

- `auth_status`
- `reset_password`
- `toggle`
- `create`

## Step 3 — Upload the application to GitHub

Replace the files in the `Samara_AL_V5` GitHub repository with the contents of this package and commit the changes.

## Step 4 — Reset an employee password

1. Sign in as Admin or Manager.
2. Open **ADMIN → Employees**.
3. Check the **Authentication Status** column.
4. Click **Reset Password** for the employee.
5. Enter a new password of at least 8 characters.
6. Give the employee the new password.

The account will automatically be enabled and unblocked.

## Authentication Status meanings

- **Connected** — profile and Supabase login are correctly linked.
- **Blocked** — Supabase Authentication has banned the account.
- **Unconfirmed** — the authentication user exists but is not confirmed.
- **Auth user missing** — a profile exists but there is no matching Supabase Authentication user. The Reset Password button remains disabled for that record.
