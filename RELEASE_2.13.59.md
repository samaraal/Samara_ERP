# Samara ERP 2.13.59 — Simple duty assignment page

The page now reads **This period → Nursing Manager / STD → Period (From / To) → Assign**. Each dropdown names the person who will hold that role during the selected period. Long explanations, the separate full-day shortcut and the compulsory reason field are removed. Assignment history uses the same role-first wording.

The existing RPC receives the standard audit reason “Temporary duty swap.” Permission checks, date validation, automatic restoration, early cancellation and daily scrolling notices are unchanged. This is a screen-only release; no database migration or assignment modification is required.

Validated JavaScript syntax and used a local browser with synthetic staff to confirm the displayed acting roles map to the correct original employee IDs and the selected India-time period is sent correctly.
