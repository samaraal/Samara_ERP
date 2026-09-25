# WhatsApp template to submit for Food Vendor button replies (v2.14.57)

Submit this in Meta Business Manager → WhatsApp Manager → Message Templates → Create Template.
This is a **new, separate** template — it does not touch `samara_food_order`,
`samara_food_modification` or `samara_food_receipt`, so ordering keeps working exactly
as it does today, whatever happens with this submission (instant approval, 24+ hours,
or a requested wording change).

| Field | Value |
|---|---|
| Template name | `samara_food_confirm_request` |
| Category | Utility |
| Language | English |
| Header type | Image (sample: `https://samaraassistedliving.com/assets/samara-logo.png`) |
| Body | `Dear {{1}},`<br>`Please confirm the food order below for Samara Assisted Living.`<br><br>`Order: {{2}}`<br>`Date and meal: {{3}}`<br><br>`Tap a button below to reply.`<br>`Thank you, Samara Assisted Living.` |
| Body variable samples | `{{1}}` = `Mrs. Yuvashree`  ·  `{{2}}` = `FOOD-1A2B3C4D`  ·  `{{3}}` = `25-09-2026 / Lunch` |
| Buttons | Quick Reply × 3: `Acknowledged`, `Returned`, `Needs Modification` |

**Why "Needs Modification" and not "Modification Requested":** WhatsApp quick-reply
buttons have a hard 20-character limit. "Modification Requested" is 23 characters and
will be rejected by Meta's form. "Needs Modification" (18 characters) fits. The app
still records and displays the full "Modification Requested" wording everywhere in the
ERP — only the button the vendor actually taps is shortened. If you'd rather use a
different short label (e.g. "Request Changes"), that's fine too — just tell me the
exact text you submitted and I'll match the webhook's recognition to it (it already
matches on "modif" or "chang" appearing anywhere in the tapped button, so common
rewordings will work without a code change; anything very different, tell me).

Once Meta approves it, tick the "samara_food_confirm_request" checkbox in Food Vendor
Management → Settings, the same way the other three templates were approved. Until
then, "Request WhatsApp Confirmation" still works via the manual WhatsApp fallback —
staff just record the vendor's reply themselves afterwards with the Acknowledged /
Returned / Modification Requested buttons already available today in the Messages tab.
