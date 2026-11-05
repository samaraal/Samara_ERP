# WhatsApp template for the Google rating request (ERP 2.19.67)

Submit in **Meta Business Manager → WhatsApp Manager → Message Templates → Create Template**.

| Field | Value |
|---|---|
| Name | `samara_google_review` (exactly) |
| Category | **Marketing** (Meta treats review requests as marketing) |
| Language | English (`en`) |
| Header | none (or Image: the Samara logo) |
| Footer | `Samara Assisted Living • Compassion • Comfort • Dignity` |
| Button | **Visit website** → Button text `Rate us on Google` → URL type **Static** → `https://g.page/r/CXoUtxcNGKqfEAI/review` |

Body (copy exactly):
```
Dear {{1}},

Thank you for trusting Samara Assisted Living with the care of {{2}}. We hope they are comfortable at home.

If you have a minute, please share your experience on Google. Your words help other families find the right care.

உங்கள் அனுபவத்தை Google-ல் பகிர்ந்தால் மற்ற குடும்பங்களுக்கு உதவியாக இருக்கும். நன்றி!

Samara Health Care LLP
```

Sample values for Meta: `{{1}}` Renuka · `{{2}}` Mrs. Shylaja Nanu

## After Meta approves it
Open **Discharge → ⭐ Google rating request after discharge** (Admin / Director) and tick
**"Meta has approved template samara_google_review"**. Nothing is sent before that tick.
