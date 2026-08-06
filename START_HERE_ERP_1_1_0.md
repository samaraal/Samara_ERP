# Samara Care ERP 1.1.0 — Master Database Baseline

This package synchronises the current ERP clinical and operational modules with Supabase without deleting existing data.

## Step 1 — Supabase

1. Open **Supabase → SQL Editor → New query**.
2. Open this file from the package:
   `supabase/sql/27_master_database_baseline.sql`
3. Copy the entire contents and paste them into the new query.
4. Click **Run**.
5. If Supabase shows a warning, choose **Run without RLS**. The script itself enables RLS and installs the required authenticated policies.
6. At the bottom, confirm every verification field shows **true**.

## Step 2 — GitHub

Upload all files from this package to the existing Samara ERP repository, replacing files when asked.

## Step 3 — Refresh

Close all ERP windows, reopen the application, and accept **App update available** if shown. Confirm the displayed version is **1.1.0**.

## Test order

1. Patient dropdown
2. Daily Care save
3. Vital Signs save
4. Shift Handover save
5. Incident save
6. Food & Diet save
7. Billing save
8. Medication prescription with Frequency and Duration
9. Medication Administration Record

This migration does not delete tables, records, patients, employees, documents, billing history, or clinical history.
