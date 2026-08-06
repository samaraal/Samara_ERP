# Samara Care ERP V5.3 Upgrade

## 1. Restore employee logins

In Supabase, open **SQL Editor → New query**. Open the file:

`supabase/sql/07_restore_employee_access.sql`

Copy the complete contents, paste them in the SQL Editor and click **Run**.

This reactivates existing employee profiles and removes any earlier authentication ban. Existing passwords remain unchanged.

## 2. Upload the application

Replace the files in the `Samara_AL_V5` GitHub repository with this package and commit the changes.

## 3. Login behaviour

The app no longer stores the Supabase login session after the page or installed app is closed/reloaded. Every user, including Admin, must enter the password again.

## 4. Role landing pages

- Admin and Manager: Dashboard
- Nurse: Shift Tasks
- Caregiver: Shift Tasks
- Accounts: Billing & Payments
- Kitchen: Food & Diet

Only Admin and Manager have the management Dashboard. Dashboard cards are clickable and open their detailed modules.
