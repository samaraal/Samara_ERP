# Food vendor management — design review only

This branch contains an interactive design preview and template payload builder. It is NOT a production Food Vendor module. Do not replace index.html or deploy this preview as the ERP.

Open food-vendor-preview.html to review sample order, receipt, history, vendor settings and billing screens. Quantities, rates and records are fictional. Voice controls and several actions are illustrative placeholders. Manual WhatsApp links open real WhatsApp with sample text: do not send sample orders to the vendor.

Agreed scope: five daily slots; resident/employee quantities; actual receipts and discrepancies; timed modifications; typed/voice instructions; Nursing Manager authority with existing Stores STD delegation; Admin/Director full authority; private rates and billing with monthly/custom period printing and immutable history.

WhatsApp: order, modification and receipt templates submitted by the owner for Meta review (approval not verified). API headers use the Samara logo. Manual messages will include a Samara link for a logo preview; availability is controlled by WhatsApp. The preview includes the public Samara website link; its actual logo preview has not been verified in WhatsApp.

Remaining before release:
- Production database migrations, row-level access and server-authorised transitions.
- Persistent order/revision/receipt history and concurrency protection.
- Vendor settings, agreed cutoffs and authorised delegation checks.
- Private effective-dated rates, payment/adjustment ledger and correct period balances.
- Working voice input, message outbox, duplicate prevention and webhook statuses.
- Confirm Meta approval, integrate manual confirmation history, test using the owner's number.
- End-to-end permission, receipt, billing and mobile tests before merging/deployment.

No production ERP files are changed by this review branch.
