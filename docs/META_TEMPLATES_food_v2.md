# Simplified Food Vendor templates to submit to Meta (v2.15.64)

Submit these 3 templates in **Meta Business Manager → WhatsApp Manager → Message Templates → Create Template**.
They are **new, separate** templates. The current `samara_food_order`, `samara_food_modification` and
`samara_food_receipt` keep working until you tick the new ones in the ERP, so ordering never stops.

Common settings for all three:

| Field | Value |
|---|---|
| Category | Utility |
| Language | English |
| Header | Image (upload the sample picture named below, from `assets/food-wa/`) |

Copy each Body **exactly** (including the `*` and `_` marks, emojis and blank lines).
If Meta rejects one because of the Tamil text under "English", resubmit the same template with Language **Tamil**
and tell Claude, so the ERP sends it with language code `ta`.

---

## 1. `samara_food_order_v2`  — NEW ORDER

Header sample picture: `assets/food-wa/order-samara.jpg`

Body:
```
🍽️ *NEW FOOD ORDER / புதிய உணவு ஆர்டர்*

Dear {{1}},

📍 Deliver to / இடம்: *{{2}}*
📅 Date / தேதி: *{{3}}*
⏰ Time / நேரம்: *{{4}}*

🍛 Quantity / அளவு: {{5}}
📝 Note / குறிப்பு: {{6}}

Order No: {{7}}

👉 Please tap *Acknowledged* below.
கீழே உள்ள *Acknowledged* பட்டனை அழுத்தவும்.
Thank you – Samara Assisted Living
```

Samples: {{1}} `Mrs. Yuvashree` · {{2}} `Samara Main - Mogappair` · {{3}} `16-09-2026 – Lunch` · {{4}} `12:30 PM` ·
{{5}} `Standard meal 18 • Soft meal 4` · {{6}} `Pack soft meals separately` · {{7}} `FOOD-1A2B3C4D`

Buttons: Quick Reply × 3 — `Acknowledged`, `Returned`, `Needs Modification` (same as today).

---

## 2. `samara_food_modification_v2`  — ORDER CHANGED / CANCELLED

Header sample picture: `assets/food-wa/revised-samara.jpg`
(The ERP sends the purple "REVISED ORDER" picture for a change and the grey "ORDER CANCELLED" picture for a cancellation.)

Body:
```
✏️ *ORDER CHANGED / ஆர்டர் மாற்றம்*
_Use this in place of the earlier order._
_முந்தைய ஆர்டருக்கு பதிலாக இதைப் பின்பற்றவும்._

Dear {{1}},

📍 Deliver to / இடம்: *{{2}}*
📅 Date / தேதி: *{{3}}*
⏰ Time / நேரம்: *{{4}}*

🍛 NEW quantity / புதிய அளவு: {{5}}
Earlier / முன்பு: {{6}}
📝 Reason / காரணம்: {{7}}

Order No: {{8}}

👉 Please tap *Acknowledged* below.
கீழே உள்ள *Acknowledged* பட்டனை அழுத்தவும்.
Thank you – Samara Assisted Living
```

Samples: {{1}} `Mrs. Yuvashree` · {{2}} `AppGeo - Saidapet` · {{3}} `16-09-2026 – Lunch` · {{4}} `12:30 PM` ·
{{5}} `Standard meal 16 • Soft meal 4` · {{6}} `Standard meal 18 • Soft meal 4` · {{7}} `2 guests on outing` · {{8}} `FOOD-1A2B3C4D / Rev 2`

Buttons: Quick Reply × 3 — `Acknowledged`, `Returned`, `Needs Modification`.

---

## 3. `samara_food_receipt_v2`  — FOOD RECEIVED (information only)

Header sample picture: `assets/food-wa/received-samara.jpg`

Body:
```
✅ *FOOD RECEIVED / உணவு பெற்றுக்கொண்டோம்*
_This is NOT a new order. இது புதிய ஆர்டர் அல்ல._

Dear {{1}},

📍 Received at / இடம்: *{{2}}*
📅 Date / தேதி: {{3}}
⏰ Received time / நேரம்: {{4}}

✔️ We received / பெற்றது: {{5}}
📦 Still to send / இன்னும் அனுப்ப வேண்டியது: {{6}}
📝 Remarks / குறிப்பு: {{7}}

Order No: {{8}}
Thank you – Samara Assisted Living
```

Samples: {{1}} `Mrs. Yuvashree` · {{2}} `Samara Main - Mogappair` · {{3}} `16-09-2026 – Lunch` · {{4}} `12:25 PM` ·
{{5}} `Standard meal 17 • Soft meal 4` · {{6}} `Standard meal 1 – please send / அனுப்பவும்` · {{7}} `None` · {{8}} `FOOD-1A2B3C4D`

Buttons: none.

---

## After Meta approves

Food Vendor Management → Settings → "Confirm Meta template approval": tick
`samara_food_order_v2`, `samara_food_modification_v2`, `samara_food_receipt_v2` (each one only after it is approved)
and press Save. **Keep the older three ticks on** — the ERP still checks them before sending.

If a v2 message would be too long (very long notes), the ERP automatically sends the older template for that one message.

## Header pictures (sent automatically by the ERP)

| | Samara Main – Mogappair | AppGeo – Saidapet | Any other place |
|---|---|---|---|
| New order | pink band, magenta "SAMARA MAIN – MOGAPPAIR" tag | pink band, AppGeo logo on pale green | pink band, no tag |
| Order changed | purple band | purple band | purple band |
| Order cancelled | grey band | grey band | grey band |
| Received | blue band | blue band | blue band |

Files: `assets/food-wa/<order|revised|cancelled|received>-<samara|appgeo|other>.jpg`
(served from https://app.samaraassistedliving.com/assets/food-wa/).
