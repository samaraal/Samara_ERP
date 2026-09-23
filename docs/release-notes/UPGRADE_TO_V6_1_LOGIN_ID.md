# Samara Care ERP V6.1 — Login ID Authentication

This upgrade lets every employee sign in with their visible **Login ID + Password**, even when an older V3 account uses a different Supabase Authentication email.

## Step 1 — Run the SQL

In Supabase, open **SQL Editor → New query** and run:

`supabase/sql/13_login_id_authentication.sql`

The final report should show `READY` for working accounts. An account showing `AUTH USER MISSING` must be repaired from the Employee module after the updated `admin-users` function is deployed.

## Step 2 — Update the Edge Function

Open **Edge Functions → admin-users**. Replace all code with:

`supabase/functions/admin-users/index.ts`

Then deploy it.

## Step 3 — Update GitHub

Replace the files in the `Samara_AL_V5` or current trial repository with this package and commit the changes.

After GitHub Pages publishes, press **Ctrl + Shift + R**.

## Login behaviour

Employees enter only their Login ID, for example `rajaiahboomi`, and their password. Samara Care securely resolves the linked Supabase Authentication email in the background.
