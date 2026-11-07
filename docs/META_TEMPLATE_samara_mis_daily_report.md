# WhatsApp template for the Daily Report PDF (ERP 2.19.75)

Submit in **Meta Business Manager → WhatsApp Manager → Message Templates → Create Template**
(use your own Facebook login, the one that holds the ERP's other templates).

| Field | Value |
|---|---|
| Name | `samara_mis_daily_report` (exactly) |
| Category | Utility |
| Language | English (`en`) |
| Header | **Document** (upload any sample PDF, e.g. the "⬇ PDF (WhatsApp copy)" from the Daily Report page) |
| Footer | `Samara Assisted Living • Compassion • Comfort • Dignity` |
| Buttons | none |

Body (copy exactly):
```
Good morning. Please find attached the Samara Daily Report for {{1}} ({{2}}).

{{3}}

Open Daily Report in Samara Care ERP for the PowerPoint, and MIS & Audit to fix each finding.

Samara Health Care LLP
```

Sample values for Meta: `{{1}}` 06-11-2026 · `{{2}}` Directors' copy ·
`{{3}}` 5 Guests | 1 admitted | 1 discharged | 2 escalations | 1 incidents | 3 high findings

`{{3}}` never contains money, so the same template serves the Directors' copy and the Nursing copy.

## After Meta approves it
In Supabase → Edge Functions → Secrets add **`MIS_DAILY_REPORT_ENABLED` = `true`**.
From the next morning the report goes out by itself at about 07:00 (re-tried until 09:00 for anyone it did not reach):
Admin / Directors get the full PDF, the Nursing Manager the copy without money.

## Until then
Admin can press **📲 Send on WhatsApp now** on the Daily Report page. The ERP tries the template first; if it is not
approved yet it sends the PDF as a plain WhatsApp document, which Meta allows only to someone who wrote to the Samara
number in the last 24 hours. Each attempt is listed under "WhatsApp copies for this day" on the same page.
