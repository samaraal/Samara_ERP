# Samara ERP 2.13.55 — discharge clearance and billing display

A discarded duplicate daily-charge insert previously reopened already-cleared Accounts status because its invalidation trigger ran BEFORE INSERT. The trigger now runs AFTER actual row changes. Exact no-op updates also preserve clearance. New or changed charges, payments, refunds, and deletions still require Accounts review; the zero-balance and unresolved-charge guards remain active.

The discharge settlement screen opens with Complete Transaction History and separates Payments Received from Advance Receipts. Patient ledger loading is scoped, paginated, and fails closed: stale, failed or incomplete loads cannot initiate refund or settlement actions. A settled account explicitly states that no additional payment is due.

Deployment: apply 126_discharge_actual_financial_changes.sql, then publish app.js, index.html and service-worker.js. No ledger amounts or patient workflow records are modified by this migration. Any individual record recovery is separate, audited and requires current reconciliation checks. Nursing retains the final departure confirmation.

Validation: an isolated PostgreSQL regression test reproduces the original duplicate-insert reset and verifies the fix, real insert/update/delete invalidation, no-op update behavior, cross-patient rollback and completed-discharge preservation. Frontend tests cover settled history, separate receipt labels, zero-payment clearance, and blocked actions for stale/loading/failed ledgers. JavaScript syntax checked. No test payments, refunds or discharges were performed in production.
