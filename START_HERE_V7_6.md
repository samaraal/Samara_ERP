# Samara Care ERP V7.6 – Patient Media, Patient ID Card & Automatic IDs

1. In Supabase SQL Editor run `supabase/sql/16_v7_6_auto_ids.sql` once.
2. Replace the GitHub repository files with this package.
3. Wait for GitHub Pages deployment, then press Ctrl + Shift + R.

## Included
- Patient Photo: Upload File, Mobile Camera and Webcam.
- Patient Identity Proof and medical documents: Upload File, Mobile Camera and Webcam.
- Persistent patient photo stored in the private `patient-documents` bucket.
- Printable Patient ID Card using the saved photograph.
- Automatic Employee IDs: EMP-0001, EMP-0002, etc., when the Employee ID is left blank.
- Automatic Patient IDs: PAT-0001, PAT-0002, etc.
- Existing employees and patients without an ID are assigned one by the migration.
