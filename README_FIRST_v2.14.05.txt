Samara ERP v2.14.05 — Global Family Mobile backend fix

1. Run 136_global_family_portal_mobile.sql ONCE in Supabase SQL Editor.
2. Replace app.js, index.html and service-worker.js in GitHub.
3. After deployment, use App Help / Repair -> Check for Updates if needed.

Fixes:
- Removes the legacy database/RPC rule that rejected non-Indian family numbers as not exactly 10 digits.
- India (+91) remains exactly 10 local digits in the ERP UI.
- Other selected countries retain their international dial code and full local number.
- Family communication preference and PIN reset no longer strip international numbers to the last 10 digits.
