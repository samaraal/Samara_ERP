# WhatsApp template for the Discharge Summary PDF (v2.15.83)

Submit in **Meta Business Manager → WhatsApp Manager → Message Templates → Create Template**.

| Field | Value |
|---|---|
| Name | `samara_discharge_summary` (exactly) |
| Category | Utility |
| Language | English (`en`) |
| Header | **Document** (upload any sample PDF, e.g. a Discharge Summary opened from the ERP) |
| Footer | `Samara Assisted Living • Compassion • Comfort • Dignity` |
| Buttons | none |

Body (copy exactly):
```
Dear {{1}},

Please find attached the Discharge Summary of {{2}} for the stay at Samara Assisted Living from {{3}} to {{4}}.

This summary is confidential and meant only for the family and the treating doctor. Please keep it for future medical visits.

For any help, please contact the Samara nursing team on 7395961616.

Samara Health Care LLP
```

Sample values for Meta: `{{1}}` Renuka · `{{2}}` Mrs. Shylaja Nanu · `{{3}}` 30-09-2026 · `{{4}}` 07-10-2026

## Until Meta approves it
The ERP tries the template first. If Meta says the template does not exist / is not approved, it sends the
PDF as a plain WhatsApp document instead. Meta allows that only when the family has written to the Samara
WhatsApp number in the last 24 hours. Otherwise the send fails with a clear message and the PDF can still be
shared with **Existing WhatsApp** (Patient card → Discharge Summary).
After approval nothing needs to change in the ERP.
