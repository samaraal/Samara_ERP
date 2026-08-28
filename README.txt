Samara Care ERP v2.9.49 - Repeating Update Prompt Fix v2

Replace ONLY: app.js

Cause fixed:
The ERP was treating service-worker lifecycle events (controllerchange/updatefound/activated)
as proof that a newer version existed. Those events can occur even when both the app and
service worker are already version 2.9.49, causing the same update dialog to reappear.

New behaviour:
The update dialog is shown ONLY when the remote service-worker semantic version is actually
newer than APP_VERSION.

No SQL / Edge Function / service-worker replacement required.
