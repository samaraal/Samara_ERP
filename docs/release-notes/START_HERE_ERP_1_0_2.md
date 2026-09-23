# Samara Care ERP 1.0.2 – Simple Names & Global Search

## Changes
- Removed Preferred Name / Called As from Employee and Patient forms.
- Employee titles are adult-only: Dr., Prof., Mr., Mrs., Ms., Miss, Shri, Smt., Rev., Fr., Br., Sr., Other.
- Patient titles retain child/historical options where relevant.
- Added a global search bar in the top header.
- Search employees by formal name, Employee ID, Login ID, mobile and role.
- Search patients by formal name, Patient ID, mobile/attendant phone, room/bed, diagnosis, doctor, referral doctor and hospital.

## Deployment
1. Replace the GitHub repository files with this package.
2. Commit and wait for GitHub Pages deployment.
3. Open once in Incognito.
4. Refresh the regular browser with Ctrl + Shift + R.

No SQL or Edge Function update is required. Existing preferred_name columns may remain in Supabase but are no longer used by the app.
