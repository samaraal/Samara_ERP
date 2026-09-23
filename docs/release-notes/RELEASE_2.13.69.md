# Samara ERP 2.13.69

Food & Diet now displays agreed order cutoffs on its main menu and Orders screen, with today's open/closed status. Breakfast is 9 PM the previous day, lunch 8 AM and dinner 5 PM IST. Existing submission enforcement remains in place.

Mobile WhatsApp conversations now open in a full-viewport portal, clear of the ERP header and bottom navigation. Back returns to conversations. The viewport tracks the on-screen keyboard, composers scroll on short screens, and send results/errors are visible inside the chat. Existing follow-latest behavior preserves scrolling through older messages.

Nursing Managers already have food-vendor reply and callback-template access in the deployed Manager sender and food-scoped database policies. This release exposes those previously obscured controls. No broader patient/HR WhatsApp access is granted. The existing 24-hour reply window and approved-template path remain intact.

Validation: JavaScript syntax; all three cutoff boundary checks including prior-day breakfast; actual extracted inbox component with mock Nurse Manager data at 390x844 and 360x480, reply and template send flows, visible latest message, Back navigation, and cutoff display. No live messages sent. Physical phone keyboard behavior still needs device confirmation.

Publish app.js, food-vendor.js, index.html and service-worker.js. No SQL migration or Edge Function deployment required.
