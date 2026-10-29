# WhatsApp template to submit for the morning MIS summary (v2.19.11)

Submit this in Meta Business Manager → WhatsApp Manager → Message Templates → Create Template.
It is a **new, separate** template; no existing message changes.

| Field | Value |
|---|---|
| Template name | `samara_mis_daily_summary` |
| Category | Utility |
| Language | English |
| Header | None (or Text: `Samara MIS — Daily Audit`) |
| Body | `Samara Health Care — MIS audit for {{1}}`<br><br>`High-priority findings: {{2}}`<br>`Medium-priority findings: {{3}}`<br><br>`Clinical: {{4}}`<br>`Financial: {{5}}`<br>`Operational: {{6}}`<br><br>`Open MIS & Audit in the Samara ERP to see each entry and fix it.` |
| Footer (optional) | `Samara Care ERP · automatic daily report` |
| Body variable samples | `{{1}}` = `28-10-2026` · `{{2}}` = `3` · `{{3}}` = `2` · `{{4}}` = `5 × Vitals not recorded for a scheduled slot; 1 × Medicine doses with no entry` · `{{5}}` = `2 × Daily room charge missing; 1 × Charges waiting with Accounts for over 30 minutes` · `{{6}}` = `All clear ✓` |

The numbers in `{{2}}` and `{{3}}` count the **kinds** of problem found (one check can list several entries).
Each area line shows up to four findings, the most serious first, or "All clear ✓".

## After Meta approves it

1. Supabase → Edge Functions → deploy **`mis-daily-summary-dispatch`** (code in
   `supabase/functions/mis-daily-summary-dispatch/index.ts`).
2. Supabase → Edge Functions → Secrets → add `MIS_WHATSAPP_ENABLED` = `true`.
3. That's all. SQL 318 has already scheduled it at 7:31 AM IST (re-tried at 8:01, 8:31 and 9:01 AM for anyone it did
   not reach). Each Admin / Director with a mobile number in their profile gets one message a day.

Until step 2, the job runs every morning and sends nothing.
To see what went: Supabase → Table Editor → `mis_whatsapp_summaries`.
