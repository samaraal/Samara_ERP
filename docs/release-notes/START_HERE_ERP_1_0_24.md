# Samara Care ERP 1.0.24 — Corrected Schema Repair

The earlier 1.0.23 SQL stopped because `care_orders` did not yet exist. No partial changes were committed because PostgreSQL cancelled that run.

## Do only these steps

1. In Supabase **SQL Editor**, open a new query.
2. Copy the full contents of:
   `supabase/sql/25_complete_schema_compatibility.sql`
3. Click **Run**. If the warning appears, choose **Run without RLS** because this script enables RLS and creates the required policies itself.
4. The final result must show **TRUE** in every column.
5. Upload this package to the existing GitHub repository and reopen the ERP.

This release changes only database compatibility and the displayed/cache version. Existing screens and business logic are unchanged.
