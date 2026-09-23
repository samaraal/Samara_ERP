# Samara ERP 2.13.53

Nursing Manager now has Communication → WhatsApp Inbox, restricted to food-vendor conversations. It supports reading order history and vendor replies, unread/read markers, reply-window messaging, approved callback requests, and available vendor attachments. STD navigation and permissions remain unchanged.

Vendor numbers come from Food & Diet settings and historical food orders. Explicit patient/family, HR, payment and admission records are excluded, including records sharing a vendor number. The restrictive database policy intersects the existing general Manager policies. The UI uses a dedicated scoped RPC and ignores stale patient inbox context. The send and media endpoints check the verified caller through a service-only database guard before provider access. Nursing Manager formal food order templates remain routed through the cutoff-protected Food & Diet workflow.

Deployment: apply 125_nursing_food_whatsapp.sql, deploy whatsapp-send-food-scope.ts as whatsapp-send and whatsapp-media-food-scope.ts as whatsapp-media, then publish app.js, index.html and service-worker.js. Keep existing function authentication settings unchanged. The root TypeScript files archive the deployed self-contained sources.

Validation: isolated PostgreSQL tests cover restrictive RLS, unrelated numbers, shared-number patient/HR exclusions, updates/inserts, inactive and legacy identities, media, template restrictions and migration reruns. Mocked edge tests confirm denial before Meta access, including database failures. Frontend tests verify the scoped Nursing Manager load and unchanged STD load. No test WhatsApp messages were sent.
