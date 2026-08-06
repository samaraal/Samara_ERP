# Samara Care ERP V8.2 — Controlled Room Dropdowns

1. Replace the existing GitHub application files with this package.
2. Commit and wait for GitHub Pages deployment.
3. Refresh with Ctrl + Shift + R.
4. Open Rooms & Beds.

Changes:
- Room number and bed code are dropdowns, not free-entry fields.
- Admission and Patient Edit use the Room & Bed Master dropdown only.
- Only Admin/Manager can edit the Room & Bed Master.
- Available is green, Occupied red, Reserved blue, Maintenance grey.
- Female patient allocations are highlighted pink.
- No SQL update is required if the V8.1 room_beds table already exists.
