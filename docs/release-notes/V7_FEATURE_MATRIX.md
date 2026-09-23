# Samara Care ERP V7 — V3 Baseline Unified

This release uses the stable V3 workflow as the operational baseline and consolidates the later assisted-living additions.

## V3 baseline retained
- Login ID and password authentication
- Multi-user Supabase cloud data and realtime synchronisation
- Dashboard
- Patients
- Rooms and Beds
- Daily Care
- Vital Signs and clinical alerts
- Medicines
- Food and Diet
- Incident/Fall Register
- Patient Documents
- Billing, payments, discounts and full bill
- Employees
- Reports
- Notifications
- PWA/mobile support

## Additions consolidated
- Role-based accordion menu
- Admin and Manager full access; restricted staff access
- Two shifts: 7 AM–7 PM and 7 PM–7 AM
- Guided admission routes: hospital discharge, direct admission, doctor referral and transfer
- Mandatory prescription transcription and shift-wise MAR
- Assisted-care plan: bath, restroom, feeding, mobility, diaper, positioning and monitoring
- Physiotherapy plan and tasks
- Special/dedicated nurse requirement
- Clinical risk assessment
- Patient photo and identity/medical documents
- Pre-admission enquiries
- Employee personnel file
- Authentication status, reset password and repair account
- Employee photo/document camera and webcam capture
- WhatsApp welcome and printable employee ID card

## Deployment target
Create repository `Samara_AL_ERP_V7` and enable GitHub Pages from main/root.
Expected URL: `https://rajaiahboomi-crypto.github.io/Samara_AL_ERP_V7/`

## Database
Run `supabase/sql/15_V6_5_MASTER_INSTALL_OR_REPAIR.sql` once before testing uploads and employee recovery.
