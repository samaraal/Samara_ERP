# Samara Care ERP 1.0.1 – Title Fields Fix

This focused update makes **Title / Salutation** visible in both Employee and Patient forms.

## Visible fields
- Employee Create form: Title / Salutation, Employee Name, Called As / Preferred Name
- Employee Personnel File: Title / Salutation, Employee Name, Called As / Preferred Name
- Patient Admission: Title / Salutation, Patient Name, Called As / Preferred Name
- Edit Patient: Title / Salutation, Patient Name, Called As / Preferred Name

Titles are stored separately and automatically used on lists, ID cards, reports and welcome messages.

## Database
Run `supabase/sql/18_erp_1_0_titles_onboarding.sql` only if it was not run earlier.

## Deployment
Replace the GitHub files, commit, wait for Pages deployment, then use Ctrl+Shift+R. The service-worker cache is updated to 1.0.1.
