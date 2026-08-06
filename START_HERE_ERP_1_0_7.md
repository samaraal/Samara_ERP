# Samara Care ERP 1.0.7 — Vitals Engine Fix

This release fixes legacy blank vital rows stored as numeric zero and independently recalculates alert status from actual measurements.

## Changes
- Zero values in legacy BP, pulse, temperature, respiration, SpO2, sugar and weight fields are treated as not entered.
- Pain score 0 remains valid.
- Reports ignore empty/zero-only rows and no longer trust stored alert_level.
- Pulse 98 and SpO2 96 classify as Normal when no other abnormal value exists.
- The Vitals screen prevents saving a completely blank observation.
- Recent Vitals displays the recalculated status.

No SQL or Edge Function update is required.
