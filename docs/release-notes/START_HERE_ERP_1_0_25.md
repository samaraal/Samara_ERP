# Samara Care ERP 1.0.25 — Role-Based Nursing Workspace

This is a user-interface and access-visibility update only. No database SQL is required.

## Changes

- Admin and Manager retain patient editing and Patient ID printing.
- Nurse and Caregiver patient access is view-only.
- Edit Patient and Print ID Card controls are hidden from Nurse/Caregiver accounts.
- Nurse/Caregiver billing details are hidden inside the patient file.
- Nurse/Caregiver accounts receive a short, dedicated **Nursing Workspace** menu.
- Their landing page is now **Nursing Dashboard**.
- Clinical menu labels include **My Patients**, **Medication Administration**, and **Alerts**.
- Employee search is removed for Nurse/Caregiver; their search is patient-only.
- Existing Admin, Manager and other-role screens remain unchanged.

## Deployment

1. Upload all files in this folder to the existing GitHub repository, replacing the current files.
2. Wait for GitHub Pages deployment to finish.
3. Close all open Samara ERP windows and reopen the application.
4. Confirm the application displays **Samara Care ERP 1.0.25**.
5. Test once as Admin/Manager and once as Nurse/Caregiver.

No Supabase SQL needs to be run for this update.
