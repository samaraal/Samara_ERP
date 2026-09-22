SAMARA CARE ERP v2.14.02 — TWO FAMILY CONTACTS

Replace only these 3 files in the ERP root:
1. app.js
2. index.html
3. service-worker.js

No SQL is required for this update. The existing family_portal_access structure already supports multiple access rows.

Implemented:
- Patient Edit now preserves/edits Alternative Mobile No.
- Family Portal Access supports Family Contact 1 (primary) and optional Family Contact 2.
- Contact 2 gets a separate Family User ID / PIN and independent active status.
- Alternative Mobile No. is prefilled into Contact 2 when available.
- Contact 2 must have a different mobile number from Contact 1.
- Patient > Family Portal already renders each authorised family access separately, so each contact has its own Portal Access WhatsApp, Admission WhatsApp and PIN reset controls.
- Primary Family Contact remains Contact 1; existing Daily Patient Report recipient behavior is unchanged.

After deployment, use App Help / Repair > Check for Updates if an older cached version remains visible.
