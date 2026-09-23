# Samara Care ERP

Assisted-living ERP for Samara Health Care. React (loaded from CDN) + Supabase, published with GitHub Pages.

## Where things are

| Path | What it is |
|---|---|
| `index.html`, `app.js`, `styles.css`, `*.js` at the top level | The live website. **Do not move or rename these.** |
| `src/app/` | The editable source of `app.js`, split into small files. See `src/app/README.md`. |
| `tools/build-app.js` | Joins `src/app/` into `app.js`. |
| `.github/workflows/build-app.yml` | Rebuilds `app.js` automatically when `src/app/` changes. |
| `supabase/sql/` | Database scripts (run in Supabase → SQL Editor). Next new number: **138**. |
| `supabase/functions/` | Supabase Edge Function sources. |
| `supabase/function-copies/` | Older loose copies of Edge Function code, kept for reference. |
| `assets/`, `icons/`, `vendor/` | Images, app icons, bundled libraries. |
| `docs/release-notes/` | Old per-release notes (START_HERE, RELEASE, UPGRADE …), kept for history. |
| `archive/` | Old files the site no longer uses. |
| `CHANGELOG.md` | One list of every release, newest first. |

## Making a change

1. Edit the matching file in `src/app/` (never `app.js` directly).
2. Bump the version in `src/app/0-start/01-app-constants.js`, `index.html`, `service-worker.js` and `bootstrap-error.js`.
3. New database script? Save it as `supabase/sql/138_short_name.sql` (next number), run it in Supabase first.
4. Add a few lines at the top of `CHANGELOG.md`. **Do not add new START_HERE / RELEASE files.**
5. Commit, then check the **Actions** tab for a green tick.

## Seeing errors staff hit

Supabase → Table Editor → `client_errors_recent` (Admin only).
