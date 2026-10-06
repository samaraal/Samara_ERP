# Simplified Food Vendor templates to submit to Meta (v2.15.65)

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
The place is not written in the text: the header picture shows it (magenta "SAMARA MAIN – MOGAPPAIR" tag, or the AppGeo logo).
If Meta rejects one because of the Tamil text under "English", resubmit the same template with Language **Tamil**
and tell Claude, so the ERP sends it with language code `ta`.

---

## 1. `samara_food_order_v2`  — NEW ORDER

Header sample picture: `assets/food-wa/order-samara.jpg`

Body:
```
🍽️ *NEW FOOD ORDER / புதிய உணவு ஆர்டர்*

Dear {{1}},

📅 Date / தேதி: *{{2}}*
⏰ Time / நேரம்: *{{3}}*

🍛 Total / மொத்தம்: {{4}}
👥 Guest / கெஸ்ட்: {{5}}
👷 Employee / ஊழியர்: {{6}}
📝 Note / குறிப்பு: {{7}}

Order No: {{8}}

👉 Please tap *Acknowledged* below.
கீழே உள்ள *Acknowledged* பட்டனை அழுத்தவும்.
Thank you – Samara Assisted Living
```

Samples: {{1}} `Mrs. Yuvashree` · {{2}} `16-09-2026 – Lunch` · {{3}} `12:30 PM` ·
{{4}} `Standard meal 18 • Soft meal 4` · {{5}} `Standard meal 12 • Soft meal 4` · {{6}} `Standard meal 6` ·
{{7}} `Pack soft meals separately` · {{8}} `FOOD-1A2B3C4D`

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

📅 Date / தேதி: *{{2}}*
⏰ Time / நேரம்: *{{3}}*

🍛 NEW total / புதிய மொத்தம்: {{4}}
👥 Guest / கெஸ்ட்: {{5}}
👷 Employee / ஊழியர்: {{6}}
Earlier total / முன்பு: {{7}}
📝 Reason / காரணம்: {{8}}

Order No: {{9}}

👉 Please tap *Acknowledged* below.
கீழே உள்ள *Acknowledged* பட்டனை அழுத்தவும்.
Thank you – Samara Assisted Living
```

Samples: {{1}} `Mrs. Yuvashree` · {{2}} `16-09-2026 – Lunch` · {{3}} `12:30 PM` ·
{{4}} `Standard meal 16 • Soft meal 4` · {{5}} `Standard meal 10 • Soft meal 4` · {{6}} `Standard meal 6` ·
{{7}} `Standard meal 18 • Soft meal 4` · {{8}} `2 guests on outing` · {{9}} `FOOD-1A2B3C4D / Rev 2`

Buttons: Quick Reply × 3 — `Acknowledged`, `Returned`, `Needs Modification`.

---

## 3. `samara_food_receipt_v2`  — FOOD RECEIVED (information only)

Header sample picture: `assets/food-wa/received-samara.jpg`

Body:
```
✅ *FOOD RECEIVED / உணவு பெற்றுக்கொண்டோம்*
_This is NOT a new order. இது புதிய ஆர்டர் அல்ல._

Dear {{1}},

📅 Date / தேதி: {{2}}
⏰ Received time / நேரம்: {{3}}

✔️ We received / பெற்றது: {{4}}
👥 Guest / கெஸ்ட்: {{5}}
👷 Employee / ஊழியர்: {{6}}
📦 Still to send / இன்னும் அனுப்ப வேண்டியது: {{7}}
📝 Remarks / குறிப்பு: {{8}}

Order No: {{9}}
Thank you – Samara Assisted Living
```

Samples: {{1}} `Mrs. Yuvashree` · {{2}} `16-09-2026 – Lunch` · {{3}} `12:25 PM` ·
{{4}} `Standard meal 17 • Soft meal 4` · {{5}} `Standard meal 11 • Soft meal 4` · {{6}} `Standard meal 6` ·
{{7}} `Standard meal 1 – please send / அனுப்பவும்` · {{8}} `None` · {{9}} `FOOD-1A2B3C4D`

Buttons: none.

---

## After Meta approves

Food Vendor Management → Settings → "Confirm Meta template approval": tick
`samara_food_order_v2`, `samara_food_modification_v2`, `samara_food_receipt_v2` (each one only after it is approved)
and press Save. **Keep the older three ticks on** — the ERP still checks them before sending.

The ERP automatically sends the older template for one message when: the v2 text would be too long (very long notes),
or the order is for a place that has no header picture yet (any place other than Samara Main and AppGeo — ask Claude
for a picture when a new place is added).

## Header pictures (sent automatically by the ERP)

| | Samara Main – Mogappair | AppGeo – Saidapet |
|---|---|---|
| New order | Samara logo + magenta place tag, pink band | AppGeo logo only, pink band |
| Order changed | purple band | purple band |
| Order cancelled | grey band | grey band |
| Received | blue band | blue band |

Files: `assets/food-wa/<order|revised|cancelled|received>-<samara|appgeo>.jpg`
(served from https://app.samaraassistedliving.com/assets/food-wa/).
