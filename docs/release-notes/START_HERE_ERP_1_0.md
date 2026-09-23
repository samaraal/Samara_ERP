# Samara Care ERP 1.0 – Compassion Onboarding

## 1. Run SQL
In Supabase SQL Editor run:

`supabase/sql/18_erp_1_0_titles_onboarding.sql`

## 2. Redeploy Edge Function
Replace the complete `admin-users` function with:

`supabase/functions/admin-users/index.ts`

Then deploy.

## 3. Upload GitHub files
Replace the application files in the repository and commit. After deployment use Ctrl+Shift+R.

## Included
- Title and Called As fields for Employees and Patients
- Formal names on ID cards and records
- Warm Samara Family WhatsApp welcome message
- Mandatory personal password creation at first login
- Password reset/repair again requires employee to choose a new password
