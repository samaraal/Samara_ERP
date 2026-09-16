# Food Vendor Management — ERP 2.12.83

Installed under Food & Diet → Vendor Orders. Resident Intake remains available.

## First setup (Admin/Director)
1. Open Settings; confirm vendor Mrs. Yuvashree, 918072992457.
2. Enter agreed modification cutoffs for each slot. Unconfigured cutoffs block revisions.
3. Mark each English image-header template approved only after Meta approval.
4. Enter exact item names and effective-dated unit prices in Billing.
5. Use Check WhatsApp server connection. This does not send a message.

## Workflow
Create items and separate resident/employee counts for one of five slots. Save draft or finalise. When approved, finalisation sends the immutable order snapshot through the API. Pending approval: use Messages → manual WhatsApp and confirm only after sending. API failures remain visible; unknown outcomes require checking before an administrator authorises a retry.

Receive actual accepted and rejected quantities. Partial receipts stay open. Accepted quantities create billing entries; shortages/rejections are not charged. Close an outstanding balance with a reason when appropriate. Missing prices are explicitly Unpriced. New rates do not silently reprice earlier receipts; explicit corrections retain their earlier values and reason in audit history.

Billing supports arbitrary From/To dates, opening/closing balances, payments, signed adjustments, historical vendor selection and Print / Save PDF. Statements with any unpriced entries are provisional. Quantities only, no resident/employee names.

Nursing Manager is primary. STD follows the existing active Stores delegation. Admin and the assigned Director retain full control and private billing access. English/Tamil browser voice input is available where supported; use keyboard dictation or typing otherwise.

Manual WhatsApp includes a public Samara link. Logo preview and app/Web selection are controlled by WhatsApp and the device. The staff must press Send. Manual confirmed is distinct from API delivery confirmation.

## Deployment
The accompanying backend ZIP contains the exact additive migration, new food-whatsapp function, shared message builder and updated deployed whatsapp-webhook source. The existing live webhook had newer features than GitHub; its authentication and existing features were preserved.

No food message was sent to the vendor during development. Meta delivery still needs a controlled authorised test after approval. Rates and cutoffs are intentionally not invented.

## Validation
PostgreSQL-compatible local tests covered authority/leave cover, Director access, duplicate/stale operations, cutoffs, partial/over receipts, historical pricing, unpriced totals, payments and direct-table access denial. Sender tests mocked all outbound traffic and covered all logo/template counts, auth, provider rejection and uncertain outcomes. Live migration verified all eight tables have RLS enabled and direct authenticated SELECT denied.
