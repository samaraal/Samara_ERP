# Samara Care ERP V5.5 – Reliable Employee Creation

This update corrects incomplete employee creation and adds an Admin-side Repair Account action.

## Step 1 — Run the safe SQL

1. Open Supabase.
2. Select **SQL Editor → New query**.
3. Open `supabase/sql/09_reliable_employee_creation.sql` from this package.
4. Copy all contents, paste them into Supabase and click **Run**.

The result lists each employee as **CONNECTED** or **AUTH USER MISSING**.

## Step 2 — Replace the `admin-users` Edge Function

1. Open Supabase → **Edge Functions**.
2. Open the existing function named `admin-users`.
3. Replace all its code with `supabase/functions/admin-users/index.ts` from this package.
4. Deploy the function.

This is essential. Uploading only the GitHub files will not correct employee creation.

## Step 3 — Upload V5.5 to GitHub

Replace the files in the `Samara_AL_V5` repository with this package and commit.

After GitHub Pages completes deployment, refresh with `Ctrl + Shift + R`.

## How to create an employee

1. Sign in as Admin.
2. Open **ADMIN → Employees → Create Employee**.
3. Enter a unique Login ID, Employee ID and a temporary password of at least 8 characters.
4. The app will show success only after both the Supabase Authentication user and employee profile are verified.

## Repair an incomplete employee

When **Authentication Status** shows `Auth user missing`:

1. Click **Repair Account**.
2. Enter a temporary password of at least 8 characters.
3. The app rebuilds and enables the login account.

For employees shown as `Connected`, use **Reset Password** instead.
