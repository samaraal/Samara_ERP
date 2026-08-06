# Samara Care ERP V7.4 – Employee Photo Retention

This update keeps only the newest **3 Employee Photo** records per employee.

When a fourth employee photo is saved, the oldest photo is removed from both:

- Supabase Storage (`employee-documents`)
- `public.employee_documents`

ID proof, qualification, experience and all other documents are not deleted.

## Deploy

1. Replace the GitHub files with this package.
2. Commit and wait for GitHub Pages.
3. Refresh with `Ctrl + Shift + R`.
4. Save one new employee photo. The app will automatically reduce existing Employee Photo history to the newest three.

No SQL update is required.
