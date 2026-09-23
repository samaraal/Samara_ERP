# Samara Care ERP V9.4 – Admissions and Employee Role Fix

This focused update corrects two confirmed issues:

1. **Admissions blank page** – the Admission component now loads `room_beds` before rendering the Room/Bed selector and listens for live master changes.
2. **Nurse saved as Caregiver** – the `admin-users` Edge Function now validates the selected role, includes it in Authentication metadata, upserts the employee profile safely, and verifies that the exact selected role was saved.

## Deployment order

1. Replace the GitHub application files with this package and commit.
2. In Supabase, open **Edge Functions → admin-users**.
3. Replace its code with `supabase/functions/admin-users/index.ts` from this package.
4. Deploy the function.
5. Open the app in an Incognito window first, then use Ctrl+Shift+R in the normal browser.

No SQL migration is required.
