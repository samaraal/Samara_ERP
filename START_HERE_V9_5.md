# Samara Care ERP V9.5 – Employee Role Persistence Fix

1. Replace the GitHub app files with this package and commit.
2. In Supabase, open **Edge Functions → admin-users**.
3. Replace the function code with `supabase/functions/admin-users/index.ts` and deploy it.
4. Refresh the app with Ctrl+Shift+R.
5. Open the employee Personnel File, select the correct Role (for example Nurse), and click **Save Employee Information** once.

The role is now written to both `public.profiles.role` and Supabase Authentication user metadata, then verified before success is shown.
