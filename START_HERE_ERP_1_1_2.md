# Samara Care ERP 1.1.2 — Login Layout & Existing Patient Care-Plan Upgrade

## What changed

- Enlarged login layout, fonts, fields and vertical spacing on desktop, tablet and mobile.
- Changed Forgot Password into a clean centred text link.
- Existing patients can now be updated through **Patients → Edit** with:
  - Current medicines and prescription verification
  - Frequency, route, times, food, duration and start date
  - Master care plan
  - Diet and feeding instructions
  - Risk flags and special nurse requirement
- Medication order is now: Medicine, Strength, Frequency, Route, Times, Food.
- The duplicate Dose field was removed. For database compatibility, the existing `dose` column is automatically populated from Strength.

## Deployment

No new SQL is required because Version 1.1.0 already created the required tables and columns.

1. Upload all files in this package to the existing GitHub repository, replacing files when asked.
2. Wait for GitHub Pages deployment to finish.
3. Close all Samara ERP windows and reopen the application.
4. Confirm the displayed version is **1.1.2**.
5. Test **Patients → Edit** using an existing patient.

Existing records, login, dashboard, billing, reports and clinical workflows are not removed.
