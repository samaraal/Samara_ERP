Samara Care ERP v2.9.14

Changes:
1. Azure clinical-tts dependency removed from active ERP voice path.
2. Clinical voice works locally using the best available Tamil/India browser voice.
3. Actual overdue time is recalculated from due_at every refresh. A stale 30-minute escalation threshold will no longer be announced as the delay after more time has elapsed.
4. Delay display/voice supports minutes and hours (e.g. 37 min; 1 hr 12 min; 2 hrs 5 min).
5. Human-recorded voice clips can be added in a later version after approved recordings are supplied.

Upload: app.js, index.html, service-worker.js
No SQL required.
