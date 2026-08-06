# Samara Care ERP V5.7 Upgrade

## Included
- Employee photo upload from gallery/file picker.
- Employee photo capture from mobile camera or supported webcam.
- Employee photograph stored privately in Supabase Storage.
- Printable employee ID card with photograph and personnel details.
- WhatsApp welcome-message button for each employee.
- After successful employee creation, the app attempts to open WhatsApp with a prepared welcome message.

## Important WhatsApp limitation
Web browsers cannot silently send a WhatsApp message. The app opens WhatsApp with the message already prepared; the Administrator must tap **Send**. Fully automatic delivery requires a separately approved WhatsApp Business API account.

## Upgrade
1. In Supabase SQL Editor, run `supabase/sql/11_employee_photo_whatsapp_id_card.sql`.
2. Replace the GitHub `Samara_AL_V5` files with this package.
3. Commit and wait for GitHub Pages deployment.
4. Refresh with Ctrl + Shift + R.

No Edge Function change is required beyond the V5.6/V5.5 `admin-users` function already deployed.
