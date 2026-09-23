# Samara Assisted Living ERP 2.13.73

## Additional Duty Assignment menu visibility fix
- Adds **Additional Duty Assignment** explicitly to the Admin menu, immediately after **Temporary Duty Swap**.
- Adds a dedicated menu icon so the item does not render as a blank icon.
- Existing **Temporary Duty Swap** logic is unchanged.
- Existing **Leave Cover / automatic leave assignment** logic is unchanged.
- Additional Duty remains additive only: the original role holder keeps normal responsibilities.

## Install
1. Deploy `index.html`, `app.js`, and `duty-swap.js`.
2. Run `132_additional_department_duty.sql` once in the same Supabase project if it has not already been run.
3. Reload/Repair the PWA or hard refresh once after deployment.
