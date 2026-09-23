# Samara Care ERP 1.0.23 — Consolidated Compatibility Fix

This repair covers the six errors shown in the screenshots:

- Vital Signs — `blood_sugar` and all current vital-sign fields
- Daily Care — missing `care_logs` table/fields
- Shift Handover — missing `handover_date`
- Incidents — missing `severity`
- Food & Diet — missing `consumption_status`
- Billing & Payments — missing `category`

Existing records are preserved. No screen, workflow, report, patient record, employee record, room, login or design has been changed.

## Step 1 — Supabase

1. Open **Supabase → SQL Editor**.
2. Open this file from the package:
   `supabase/sql/24_consolidated_module_compatibility.sql`
3. Copy the complete contents into SQL Editor.
4. Click **Run** once.
5. At the bottom, seven confirmation columns should display **true**.

## Step 2 — GitHub

Upload all files from this package to the existing GitHub repository, replacing files when asked.

## Step 3 — Reopen ERP

1. Close every Samara Care ERP browser/app window.
2. Reopen it.
3. Confirm the displayed version is **1.0.23**.
4. Test one entry in each of the six modules.

