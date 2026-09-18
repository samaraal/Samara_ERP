# Samara ERP 2.13.57 — Temporary department duty swaps

Admin/Director can interchange an active regular STD and Nursing Manager for a selected day or custom start/end period in India time. Open **Pharmacy & Stores → Temporary Duty Swap**, select both employees and enter the period and reason. The full-day shortcut ends at midnight starting the following day.

During the assignment each employee receives the other department's role, designation and department permissions. This includes nursing oversight, Stores, Food & Diet, the STD desk, corresponding WhatsApp scope, clinical notification routing and named leave-supervisor responsibilities. Existing department permission rules still apply. Personal employee records, login identity and action attribution remain with the actual employee; Admin/Director authority cannot be assigned through this feature.

Server permission checks evaluate the assignment period on every statement. Regular permissions return at the end time without a browser session or scheduled cleanup job. The app rechecks on focus, every 15 seconds and at the next assignment boundary. It blocks access if the current duty context cannot be verified. Admin/Director can end an assignment early with a recorded reason.

Overlapping swaps and conflicting Stores leave handovers are blocked. Permanent role, designation and department changes require ending a pending/active assignment first. An inactive participant suspends the swap for both employees. Assignment and cancellation history is retained.

## Deployment order

1. Apply `128_temporary_department_swap.sql` in a transaction. It creates an empty assignment table, effective-profile view and RPCs, updates permission checks and keeps private recovery copies of changed definitions.
2. Deploy the included `*-duty-swap.ts` sources to their corresponding services: `admin-users`, `clinical-push-dispatch`, `clinical-escalation-dispatch`, `director-office-voice`, `send-notifications`, `titan-mail`. Deploy `whatsapp-send-food-scope.ts` to `whatsapp-send` and `whatsapp-media-food-scope.ts` to `whatsapp-media`.
3. Publish `app.js`, `index.html`, `service-worker.js` and the new `duty-swap.js` together.

This release does not create an assignment. Admin/Director chooses employees and dates after deployment.

## Validation

Local PostgreSQL tests cover scheduling, expiry boundaries, cancellation, inactive staff, overlapping periods, leave-handover conflicts, permanent-profile protection and Admin-only creation. A second fixture uses the current production function definitions and policy expressions; the migration is idempotent and switches actual Stores, Food, WhatsApp, discharge, STD-desk and leave-supervisor access correctly. Browser tests with synthetic employees cover full-day India-time conversion, saving, staff read-only access and cancellation history. Context tests cover failed lookups, identity mismatch, request races and account changes. All eight modified service sources pass TypeScript parsing. Existing billing and management-review UI regression tests pass.

No patient records, employee records, database exports or credentials are included in the release.
