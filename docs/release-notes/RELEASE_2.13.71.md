# Samara ERP 2.13.71

Allow synthetic bold specifically for Food & Diet Open/Closed status text. The global typography rule disables font synthesis, which can render requested bold weights as regular on devices with a regular-only font face. Display CLOSED in bold red and OPEN in bold green, in both the cutoff summary and order form. Keep the existing font, separate meal rows and cutoff rules.

Publish food-vendor.js, food-vendor.css, app.js, index.html and service-worker.js. No backend changes.
