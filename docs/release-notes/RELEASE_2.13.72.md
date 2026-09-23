# Samara ERP 2.13.72 — Additional STD / Nursing Manager Duty

## Added
- Admin/Director can assign **additional** STD duties to the Nursing Manager.
- Admin/Director can assign **additional** Nursing Manager duties to STD.
- The receiving employee keeps all regular duties; this is **not a swap**.
- Assignment can have an optional end date/time or continue until Admin/Director ends it.
- Reason, assigning manager, start/end and audit history are retained.
- Active additional duty expands both navigation and database permission-role membership.

## Unchanged
- Automatic approved-leave cover in `130_mutual_department_leave_cover.sql` is unchanged.
- Temporary Duty Swap remains unchanged.
- Return-to-duty behavior remains unchanged.

## Installation
1. Deploy `index.html`, `app.js`, and `duty-swap.js`.
2. In the same Samara Supabase project, run `132_additional_department_duty.sql` once after migration 130.
