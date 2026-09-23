# Samara Care ERP 1.0.10

Focused Intelligent Report correction.

- Empty vital rows are ignored even when legacy pain_score defaults to 0.
- Temperatures 70–115 are treated as Fahrenheit and converted to Celsius.
- Pulse 98 and SpO2 96 are Normal when no other abnormal measurement exists.
- Stored alert_level is ignored by Intelligent Reports.

No SQL or Edge Function update is required.
