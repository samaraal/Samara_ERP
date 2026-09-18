# Samara ERP 2.13.58 — Daily temporary-duty notice

STD and Nursing Manager receive a large, bold notice on their first visible ERP use each India-calendar day when their temporary swap is active or starts later that day. The message enters from the bottom, pauses for reading and exits at the top over eight seconds. It names the employee's assigned department duties and the assignment end time. A Close button permits earlier dismissal; reduced-motion settings show a stationary notice.

Daily receipts are stored server-side per employee, assignment and India date, so another device or sign-in does not repeat the same daily notice. Cancelled, expired and inactive-staff assignments do not produce a notice. New assignments have their own notice. Notice failures do not change duty permissions.

Apply `129_duty_swap_daily_notice.sql`, then publish `app.js`, `duty-swap.js`, `index.html` and `service-worker.js` together. The migration creates no assignment and changes no duty schedule or permission rule.

Validation: PostgreSQL tests cover employee-specific notices, daily deduplication, next-day eligibility, upcoming assignments today, cancellation/expiry exclusions and protected receipts. Existing duty permission/context tests pass. Local browser verification covers both role messages, large bold typography, automatic dismissal and suppression on a repeated sign-in.

## Using Temporary Duty Swap

1. As Admin/Director, open **Pharmacy & Stores → Temporary Duty Swap**.
2. Select the regular STD and regular Nursing Manager.
3. Enter the start and end in India time. **Use full selected day** sets the selected start date to 00:00 and ends at 00:00 the following day.
4. Enter the training reason and select **Save Temporary Swap**.
5. Review Assignment history. Scheduled swaps begin automatically, and regular duties return at the end time. Use **Cancel assignment** before the start or **End assignment now** during an active swap to finish it early with a reason.

No employee/patient records or credentials are included in this release.
