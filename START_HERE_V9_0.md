# Samara Care ERP V9.0 — Stabilization Foundation

This release deliberately starts from the last syntactically valid V8.2 application.
It does not add database modules. Its purpose is to restore predictable startup before further development.

## Improvements
- Fresh versioned loading for app.js, styles.css, config.js and diagnostics.
- New service-worker cache name and network-first loading for critical files.
- Visible startup-error panel instead of an unexplained blank white page.
- Existing Supabase database and operational data remain unchanged.

## Deployment
1. Delete/replace the files in the GitHub repository root with this package.
2. Commit and wait for GitHub Pages to complete.
3. Open the site once in an Incognito window.
4. Then use Ctrl + Shift + R in the normal browser.
5. Do not run SQL for this release.

## Result
- If startup succeeds, the application opens normally.
- If JavaScript fails, the page displays the exact error instead of remaining blank. Send that visible error for a targeted correction.
