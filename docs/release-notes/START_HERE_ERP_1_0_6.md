# Samara Care ERP 1.0.6 – Blank Vitals Stable Fix

This update corrects Intelligent Reports so blank or placeholder vital-sign rows are ignored.

## Correct behaviour
- Empty values, dashes, null text and non-numeric placeholders are not counted as measured vitals.
- Missing vital entry does not create Warning or Critical status.
- Critical and Warning status are calculated only from actual numeric measurements.
- When there is no serious incident or measured abnormality, the report states that the patient is clinically stable on the available records and notes that vitals were not entered.

No SQL or Edge Function update is required.
