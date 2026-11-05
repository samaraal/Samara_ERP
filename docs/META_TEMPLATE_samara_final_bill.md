# WhatsApp template for the Final Bill PDF (ERP 2.19.67)

Submit in **Meta Business Manager → WhatsApp Manager → Message Templates → Create Template**.

| Field | Value |
|---|---|
| Name | `samara_final_bill` (exactly) |
| Category | Utility |
| Language | English (`en`) |
| Header | **Document** (upload any sample PDF, e.g. a Final Bill printed from the ERP) |
| Footer | `Samara Assisted Living • Compassion • Comfort • Dignity` |
| Buttons | none |

Body (copy exactly):
```
Dear {{1}},

Please find attached the Final Bill of {{2}} for the stay at Samara Assisted Living.

Net payable: {{3}}

For any question about this bill, please contact Samara Accounts on 7395961616.

Samara Health Care LLP
```

Sample values for Meta: `{{1}}` Renuka · `{{2}}` Mrs. Shylaja Nanu · `{{3}}` Rs.0.00

## Until Meta approves it
The ERP tries the template first. If it is not approved yet, it sends the PDF as a plain WhatsApp document, which
Meta allows only when the family wrote to the Samara number in the last 24 hours. Otherwise Accounts can send it
again from **Final Billing → 📲 Send Final Bill on WhatsApp** once the template is approved. Nothing to change in the ERP.
