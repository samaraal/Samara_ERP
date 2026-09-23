# Samara Care ERP V7.1 — Production Foundation

This milestone retains the working V3/V7 operational modules and applies the requested Employee Photo corrections.

## Included in `app.js`

1. Employee photo preview appears immediately in the top-right of the Create Employee and Personnel File forms.
2. Existing stored employee photo loads when the Personnel File opens.
3. Captured/uploaded photo is automatically used on the printed ID card; `SC` remains only as a fallback.
4. Employee photo records are saved with both `category` and `document_type` set to `Employee Photo`.
5. Other uploaded employee documents receive compatible category, document name, file path and profile identifiers.
6. A timestamp is added to refreshed signed-photo URLs to prevent stale browser images.

## Startup diagnostics

Open the browser developer console and enter:

```javascript
SAMARA_HEALTH
```

The report checks React, Supabase configuration, camera support, core tables and Storage buckets.

## Deployment target

Repository: `Samara_AL_ERP_V7`

Live path: `https://rajaiahboomi-crypto.github.io/Samara_AL_ERP_V7/`

Upload all files from this folder to the repository root. Then refresh with `Ctrl + Shift + R`.
