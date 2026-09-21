# WhatsApp Inbox completeness

Every configured outgoing WhatsApp transport records an Inbox attempt before contacting its provider. Accepted, failed and uncertain outcomes remain distinguishable. Replies no longer depend on browser-side history writes. Incoming messages and automatic replies continue through the existing signed, idempotent webhook.

The Inbox pages through all authorized history, searches all messages, and shows explicit delivery labels and failure details. Existing role and food-vendor restrictions remain in force. Authentication and portal-secret values are redacted.

Apply `133_whatsapp_inbox_transport.sql` before deploying senders. It lets existing rich logs enrich transport records without duplicates or a delivery-state downgrade, and removes the vendor RPC's pagination cutoff. `134_recover_whatsapp_history.sql` recovers documented legacy outcomes without resending messages; it can be rerun safely.

Dashboard deployment sources (self-contained):

| Function | Source |
|---|---|
| whatsapp-send | whatsapp-send-food-scope.ts |
| clinical-escalation-dispatch | clinical-escalation-dispatch-duty-swap.ts |
| daily-patient-report | daily-patient-report-inbox.ts |
| daily-payable-whatsapp | daily-payable-whatsapp-inbox.ts |
| package-expiry-whatsapp | package-expiry-whatsapp-inbox.ts |
| food-whatsapp | food-whatsapp-inbox.ts |
| send-notifications | send-notifications-inbox.ts |

`whatsapp-inbox-transport.ts` is the shared helper embedded into those deployment sources. It only captures provider message POSTs; file/media downloads and SMS pass through normally. The live feedback-public function does not send WhatsApp. The existing webhook already records incoming messages and reserves automatic-reply attempts before sending.

Validation: mocked provider acceptance, rejection, network uncertainty, logging outage, authenticated actor attribution, redaction and rate limiting; a rollback-only SQL test of duplicate enrichment preserving Read status; 1,501-record pagination for ordinary and restricted Inbox queries; JavaScript and TypeScript syntax checks. No real messages were sent for testing.
