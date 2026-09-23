# Samara Care ERP 1.0.18 — Nurse/Caregiver Login-Only Fix

This package changes only the employee-login profile-linking process.

## Not changed

Dashboard, Patient, Employee, Rooms, Vitals, Blood Sugar, Medicines, Daily Care,
Reports, Intelligent Reports, Billing, Documents, photographs, print layouts and
all other completed work remain unchanged.

## Two simple deployment steps

1. In Supabase, open **SQL Editor**, copy the complete contents of:
   `supabase/sql/20_login_only_profile_link_repair.sql`
   and press **Run** once.
2. Upload all files in this package to the existing GitHub repository, replacing
   files when asked.

After GitHub Pages finishes updating, close the old ERP tab, reopen the site and
sign in using the Nurse/Caregiver Login ID and password.
