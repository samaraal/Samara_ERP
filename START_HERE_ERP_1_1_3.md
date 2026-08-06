# Samara Care ERP 1.1.3 — Medication Time Dropdown

## What changed
- Renamed **Times** to **Time**.
- Added a 24-hour medication-time selector displayed in 12-hour AM/PM format.
- Allows multiple times for the same medicine.
- Frequency automatically suggests standard times for OD, BD, TDS, QID, every 6 hours, every 8 hours and every 12 hours.
- Staff may change the suggested times to match the doctor's prescription.
- Applied to both new admissions and existing-patient Edit.

## Deployment
1. Upload all files in this folder to the existing GitHub repository, replacing matching files.
2. No Supabase SQL is required.
3. Close all ERP windows and reopen the app.
4. Confirm the displayed version is **1.1.3**.

No other module or database structure was changed.
