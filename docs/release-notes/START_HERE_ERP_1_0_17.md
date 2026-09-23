# Samara Care ERP 1.0.17 — Clinical Vitals Compatibility

## Mandatory first step
Run this file in **Supabase → SQL Editor**:

`supabase/sql/19_vital_signs_complete_compatibility.sql`

This safely adds all Vital Signs fields, including:

- Respiration
- Blood Sugar Type: Not Taken / FBS / PPBS / RBS
- Blood Sugar value
- Weight
- Pain Score
- Clinical remarks
- Alert level and audit fields

Existing records are preserved. After SQL success, replace the GitHub application files, commit, wait for GitHub Pages deployment and hard-refresh with **Ctrl + Shift + R**.
