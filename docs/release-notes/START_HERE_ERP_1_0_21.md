# Samara Care ERP 1.0.21 — Patient Dropdown Access Fix

This update fixes only the issue where Nurse/Caregiver login succeeds but no patients appear in clinical dropdowns.

## Step 1 — Supabase
1. Open **Supabase → SQL Editor → New query**.
2. Open the file: `supabase/sql/23_patient_dropdown_access_only.sql`
3. Copy all its contents into the SQL Editor.
4. Click **Run** once.
5. The result should show: `patient_read_access_ready = true` when run while the role linkage is valid. A successful SQL execution is the main requirement.

## Step 2 — GitHub
Upload all files in this package to the same ERP repository, replacing the existing files.

## Step 3 — Refresh
Close the installed ERP completely and reopen it. The title should show **Samara Care ERP 1.0.21**.
Log in as Priya/Ramya and open **Daily Care**. Active patients should appear in the dropdown.

## Scope protection
No changes were made to patient data, employee data, dashboard design, clinical forms, vitals, reports, billing, rooms, documents or print layouts. The only functional repair is the role-link check used by the existing patient read permission.
