# Samara Care ERP V7.2 — Photo Persistence Fix

This release is based on the working V7.1 package and corrects employee photograph persistence.

## Changes

- Captured/uploaded employee photo is saved in Supabase Storage.
- `profiles.photo_storage_path` is treated as the primary saved reference.
- When the profile path is absent, the app finds the latest `Employee Photo` record in `employee_documents`.
- The Personnel File reloads the saved photograph every time it is opened.
- The ID Card resolves the same saved photograph before printing.
- A timestamp is appended to signed image URLs to avoid stale browser images.
- Service-worker cache is updated to `samara-v7-2-photo-persistence`.

## Deployment

1. Replace the files in the `Samara_AL_ERP_V7` repository with this package.
2. Commit the changes and wait for GitHub Pages deployment.
3. Open the app and press `Ctrl + Shift + R`.
4. Reopen the Employee Personnel File and test Print ID Card.

No new SQL is required if `profiles.photo_storage_path`, the `employee_documents` table, and the `employee-documents` bucket already exist.
