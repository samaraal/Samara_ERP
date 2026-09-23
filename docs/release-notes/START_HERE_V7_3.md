# Samara Care ERP V7.3 — Persistent Employee Photo

This update corrects the final employee-photo persistence issue.

## What changed

- The app now updates both `profiles.photo_storage_path` and `profiles.employee_photo_path`.
- It matches the employee by either Profile ID or Authentication User ID.
- The update is verified; saving stops with a clear error if no profile row was changed.
- Existing photo document records are consolidated into one current Employee Photo record.
- On reopening or after a fresh login, the app resolves the saved profile path and falls back to the latest Employee Photo document.
- The same resolved photo is used by the Personnel File and printed ID card.

## Deployment

1. Replace the existing GitHub application files with this package.
2. Commit the changes and wait for GitHub Pages to publish.
3. Press Ctrl + Shift + R.
4. Open the employee Personnel File and save/capture the photo once.
5. Sign out, sign in again, reopen the Personnel File and print the ID card.

No SQL update is required.
