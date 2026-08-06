# Samara Care — Simple Setup Instructions

This package is already configured with your Supabase URL and public publishable key. Do not edit `config.js`.

## A. Prepare Supabase database

1. Open your **Samara Assisted Living** Supabase project.
2. Click **SQL Editor** on the left.
3. Click **New query**.
4. Open `supabase/sql/01_complete_setup.sql` from this package, copy all its contents, paste into Supabase, then click **Run**.

## B. Create the first administrator

1. In Supabase, click **Authentication → Users**.
2. Click **Add user → Create new user**.
3. Email: `admin@users.samaracare.local`
4. Enter your chosen admin password.
5. Turn ON **Auto Confirm User**, then create the user.
6. Open that user and copy the **User UID**.
7. Return to **SQL Editor → New query**.
8. Open `supabase/sql/02_first_admin.sql`, paste it, replace `YOUR_AUTH_USER_UUID` with the copied UID, and click **Run**.

Your app login will be:
- Login ID: `admin`
- Password: the password you selected

## C. Deploy the employee-creation function

This is the part that removes the email rate-limit problem.

1. In Supabase, click **Edge Functions**.
2. Click **Deploy a new function** or **Create function**.
3. Function name: `admin-users`
4. Replace the sample code with the complete contents of `supabase/functions/admin-users/index.ts`.
5. Click **Deploy**.

Do not add any secret keys manually. Supabase automatically provides the required project secrets to its own Edge Function.

## D. Replace GitHub files

1. Open your GitHub repository used for `Samara-AL_09`.
2. Remove the old app files.
3. Upload every file and folder from this package to the repository root.
4. Commit the changes.
5. In **Settings → Pages**, select **Deploy from a branch**, `main`, `/(root)`.
6. Wait 2–3 minutes and open:
   `https://rajaiahboomi-crypto.github.io/Samara-AL_09/`

## E. Test

1. Sign in with Login ID `admin`.
2. Open **Employees → Create Employee**.
3. Create a staff account.
4. Open the app on another phone and sign in with that employee's Login ID and password.

No confirmation email is sent, so the employee can sign in immediately.
