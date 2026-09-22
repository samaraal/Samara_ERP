Samara ERP v2.14.04 — Global Family Phone Correction

Replace these 3 files in the ERP root:
- app.js
- index.html
- service-worker.js

No SQL is required.

Changes only:
1. Family Contact 1 and Family Contact 2 now use the ERP country/dial-code dropdown.
2. India (+91) requires exactly 10 local digits.
3. Other countries are not forced to 10 digits; validation uses the selected dial code and E.164 maximum length.
4. Existing +country-code family numbers are split correctly when editing; legacy bare 10-digit numbers remain treated as India.
5. Removed the erroneous global 10-digit validation that caused the reported save failure.
