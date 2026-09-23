# Samara Care ERP V6.5 — One-Time Consolidated Repair

This package replaces piecemeal fixes.

## Do only these steps

1. Supabase → SQL Editor → New query.
2. Open `supabase/sql/15_V6_5_MASTER_INSTALL_OR_REPAIR.sql`.
3. Copy the whole file, paste it and click **Run**.
4. Confirm the final result shows both buckets:
   - `employee-documents`
   - `patient-documents`
5. Supabase → Edge Functions → `admin-users`.
6. Replace its code with `supabase/functions/admin-users/index.ts` and deploy.
7. Replace GitHub `Samara_AL_V5` files with this package.
8. Wait for Pages deployment and press **Ctrl + Shift + R**.

## What this one script repairs

- Every Employee Personnel column used by the application
- Profile ↔ Authentication links
- Login ID resolver
- Duplicate-profile trigger problem
- Employee document table
- Employee and patient Storage buckets
- Storage and database permissions
- PostgREST schema cache

Do not rerun the older individual SQL files after this master repair.
