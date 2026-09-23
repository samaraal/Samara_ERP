# Samara Care ERP 1.0.8 — Build Diagnostics

## What changed
- Added a single global application version.
- Added build date and database schema version.
- Added visible build information below the sidebar brand.
- Added browser-console diagnostics.
- Updated all critical asset URLs to `v=1.0.8`.
- Updated the service-worker cache name so older JavaScript is removed.

## Verify after deployment
Open the browser console and enter:

```javascript
APP_VERSION
```

Expected result: `"1.0.8"`

For full diagnostics enter:

```javascript
SAMARA_BUILD
```

Expected fields:
- version: 1.0.8
- buildDate: 03-Aug-2026 10:45 IST
- schemaVersion: 18

## Deployment
Replace the GitHub repository files, commit, wait for GitHub Pages, and refresh with Ctrl + Shift + R. No SQL or Edge Function update is required.
