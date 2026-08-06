# Samara Care ERP V5.6 – Employee Personnel & Account Recovery

## Step 1 – Run the SQL upgrade

1. Open **Supabase → SQL Editor → New query**.
2. Open `supabase/sql/10_employee_personnel_documents.sql` from this package.
3. Copy the full contents, paste into Supabase and click **Run**.

This adds the complete employee personnel fields, employee document records, and the private `employee-documents` Storage bucket.

## Step 2 – Update the admin-users Edge Function

1. Open **Supabase → Edge Functions → admin-users**.
2. Replace all existing code with `supabase/functions/admin-users/index.ts` from this package.
3. Deploy the function.

The function provides Authentication Status, immediate employee creation, Reset Password, Enable/Disable and Repair Account.

## Step 3 – Upload the application

Replace the files in the `Samara_AL_V5` GitHub repository with this package and commit the changes.

After GitHub Pages publishes, refresh using **Ctrl + Shift + R**. On mobile, close and reopen the installed app.

## Employee module features

- Complete personnel form
- Father/guardian name
- Residential address and mobile contacts
- ID card type and number
- Qualification and previous workplace
- Direct/reference source and referee details
- Authentication Status
- Reset Password
- Repair Account
- Enable/Disable account
- Upload certificates and ID documents
- Mobile camera / supported webcam capture
- Secure private document storage
