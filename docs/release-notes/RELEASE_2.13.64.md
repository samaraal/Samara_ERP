# Samara ERP 2.13.64 - Refresh on every page

Every authenticated ERP module now has a shared Refresh button beneath the header. It remounts the current page to run its existing data loaders, preserving the signed-in session and current module. It also refreshes the discharge follow-up banner. Page filters and local form state reset. When fields have been changed, a confirmation protects unsaved entries; cancelling keeps them intact.

Publish app.js, styles.css, index.html, service-worker.js and this release note. No database migration is required.
