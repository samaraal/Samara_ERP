# Samara Care ERP 1.1.0

## Medication Frequency and Duration

This update changes only the medication prescription/MAR information.

### Added
- Frequency dropdown: OD, BD, TDS, QID, hourly options, SOS/PRN, weekly and monthly.
- Duration dropdown: single dose, fixed-day courses, until doctor review, long term and custom days.
- Start date and automatically calculated end date for fixed-duration medicines.

## Installation
1. In Supabase SQL Editor, run `supabase/sql/26_medication_frequency_duration.sql` once.
2. Upload all package files to the existing GitHub repository.
3. Close and reopen the ERP and confirm version **1.1.0**.

No other module or layout was changed.
