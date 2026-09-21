# Samara ERP 2.13.75

Fixes only the reported application-shell issues after Additional Duty Assignment:
- Synchronises displayed APP_VERSION to 2.13.75 so title bar and logo/sidebar version agree.
- Restores service-worker version/cache progression so the existing new-version notification can detect deployments again.
- Prevents the global dictation enhancer from repeatedly decorating the Additional Duty reason field, which caused the page to grow vertically.
- Additional Duty, Leave Cover and Temporary Duty Swap business logic are otherwise unchanged.

No SQL is required for this fix if 133_general_additional_duty.sql is already installed.
