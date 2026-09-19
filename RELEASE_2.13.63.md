# Samara ERP 2.13.63 - persistent Accounts navigation

Accounts Home, Charge Approvals, Payments, Patient Ledger, Final Billing, Discharge Clearance, Refunds, Accounts Reports and Package Expiry remain reachable through a shared navigation bar on each Accounts screen. The current screen stays highlighted and is identified with aria-current. Buttons wrap into two columns on phones. Only destinations already allowed for the current user's duties are shown.

The bar uses existing navigation handlers and does not alter payment, billing or discharge operations. Publish app.js, styles.css, index.html, service-worker.js and this release note together. No database migration is required.
