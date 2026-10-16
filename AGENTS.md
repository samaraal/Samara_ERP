# ERP UI conventions

Preserve the user's standard pattern when building or changing task screens:

- Provide a patient dropdown wherever the task is patient-based, plus search by patient name / ID that starts filtering at three characters.
- Provide Today, This Week, Month (with month selection), and Period (From and To) filters for dated task lists and reports.
- Apply patient and period selections consistently to the visible rows and their totals. Validate date ranges and show explicit loading/error/empty states.
- Keep organisation-level payments and supplier balances scoped to their organisation; do not imply they belong to a selected patient.
- Preserve role permissions when adding filters or shared dashboards.

Edit application source in src/app rather than the generated app.js. Follow src/app/README.md for building and versioning.
