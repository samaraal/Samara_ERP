# Samara Care ERP 2.13.76

## Leave approval enhancement
- Adds **Approve with Modification** for Admin/Director on pending leave requests.
- Management can shorten or shift the approved dates, but only within the dates originally requested by the employee.
- The original requested dates are retained for audit/history.
- Leave Calendar, Duty Calendar and automatic Leave Cover continue to use the final approved dates.
- Existing normal Approve/Reject, Return to Duty, Leave Cover, Temporary Duty Swap and Additional Duty Assignment are unchanged.

## Installation
1. Deploy `index.html`, `app.js`, and `service-worker.js` over the current 2.13.75 files.
2. Run `134_partial_leave_approval.sql` once in the Samara Supabase SQL Editor.
3. Use App Help / Repair once after deployment.
