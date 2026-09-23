# 2.13.56 — Management review of raised charges

Management Discharge Review now includes all raised charge requests alongside the complete posted ledger. Pending requests show their item, quantity, raised time and status; unset amounts display “Amount awaiting Accounts”. A warning explains that pending requests are excluded from posted outstanding.

Final discharge discounts require Accounts to resolve every charge request and its matching ledger posting. Approval without a discount can still forward the request to Accounts. A server-generated review token detects any ledger, request or discharge change since the review was loaded. Changed accounts require refresh and another review.

Approval, discount and a financial-review audit record are saved in one transaction. Older screens cannot bypass this workflow with separate approval/discount writes. Existing role permissions are preserved. No existing patient balances, payments, discounts or discharge statuses are altered by this migration.

Deploy `127_management_charge_review.sql` before the frontend files. Existing open screens must refresh. The migration is repeatable.

Validation: PostgreSQL-compatible isolated tests cover pending and unposted requests, null amounts, stale review, same-balance changes, permissions, excess discounts, direct legacy writes, atomic rollback, retry protection, completed discharge and more than 1,100 ledger rows. UI tests cover blocking states, the single approval RPC, rejection, refresh after a stale review and unknown charge amounts. Existing billing-display tests and JavaScript syntax checks pass.
