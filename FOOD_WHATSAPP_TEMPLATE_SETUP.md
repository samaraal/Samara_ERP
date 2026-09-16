# Food vendor WhatsApp templates — ready for review

Status: drafts, not submitted or approved.

For every template select **Header → Image** and upload the Samara logo. Use English (`en`), propose Utility category, and let Meta review it. No buttons are required.

Logo used when sending: https://samaraassistedliving.com/assets/samara-logo.png

The JSON file requires a real uploaded Meta sample-image handle before API submission. Do not submit the placeholder.

## samara_food_order

Dear {{1}},
Please arrange the following food order for Samara Assisted Living.

Order: {{2}}
Date and meal: {{3}}
Delivery time: {{4}}
Resident quantities: {{5}}
Employee quantities: {{6}}
Total quantities: {{7}}
Other requests / instructions: {{8}}

Please acknowledge this order.
Thank you, Samara Assisted Living.

### Sample variables (in order)

1. Mrs. Yuvashree
2. FOOD-20260916-003
3. 16-09-2026 / Lunch
4. 12:30 PM
5. Standard meal: 12; Soft meal: 4
6. Standard meal: 6
7. Standard meal: 18; Soft meal: 4
8. Pack soft meals separately.

## samara_food_modification

Dear {{1}},
Please use this revised food order for Samara Assisted Living in place of the earlier version.

Order and revision: {{2}}
Date and meal: {{3}}
Delivery time: {{4}}
Changes: {{5}}
Revised resident quantities: {{6}}
Revised employee quantities: {{7}}
Revised total quantities: {{8}}
Reason / instructions: {{9}}

Please acknowledge the revised quantities.
Thank you, Samara Assisted Living.

### Sample variables (in order)

1. Mrs. Yuvashree
2. FOOD-20260916-003 / Revision 2
3. 16-09-2026 / Lunch
4. 12:30 PM
5. Resident standard meals increased from 10 to 12
6. Standard meal: 12; Soft meal: 4
7. Standard meal: 6
8. Standard meal: 18; Soft meal: 4
9. Two additional portions required.

## samara_food_receipt

Dear {{1}},
Samara Assisted Living has recorded a food delivery against your order.

Order and receipt: {{2}}
Date and meal: {{3}}
Received at: {{4}}
Ordered quantities: {{5}}
Accepted this delivery: {{6}}
Rejected this delivery: {{7}}
Outstanding quantities: {{8}}
Remarks / instructions: {{9}}

Please review any discrepancy and acknowledge.
Thank you, Samara Assisted Living.

### Sample variables (in order)

1. Mrs. Yuvashree
2. FOOD-20260916-003 / Receipt 1
3. 16-09-2026 / Lunch
4. 12:25 PM
5. Standard meal: 18; Soft meal: 4
6. Residents: Standard 11, Soft 4; Employees: Standard 6
7. None
8. Standard meal: 1
9. Please deliver the remaining portion.

## Integration requirements

- Always send a header image component using the Samara logo.
- Persist each finalised message snapshot and an idempotency key before sending. Never rebuild an old order using new vendor details.
- Authorise on the server using Admin/Director authority or the current Stores delegation, not only a hidden UI button.
- Store prices and billing in tables inaccessible to operational roles.
- Keep Meta acceptance distinct from delivered/read webhook status.
- Never automatically retry an ambiguous timeout; reconcile the provider result first.
- Keep variable values on one line; keep instructions editable before approval.
- Block live modification until an agreed cutoff is configured.
- Retain immutable order revisions, per-delivery receipts, effective-dated rates and a payment/adjustment ledger.
