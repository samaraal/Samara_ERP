SAMARA ADMIN PREVIEW — MINIMAL ERP PATCH

Purpose: Fix only the Preview Family Portal hand-off from ERP to the Family Portal.

Replace ONLY:
1. app.js
2. index.html

No SQL. No Edge Functions. No other ERP files. ERP version remains 2.14.08.

What changed:
- The existing Preview Family Portal button now proactively sends the already-built preview payload to the new Family Portal tab several times during startup.
- It still keeps the existing request/response hand-off as a fallback.
- This avoids depending on window.opener, which can be unavailable for cross-origin tabs.
- The Family Portal already stores the successfully received preview in sessionStorage, so Refresh in the same tab can restore it.

Nothing else in ERP was changed.
