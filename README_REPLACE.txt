SAMARA ERP v2.10.55 — UPDATE LOOP FIX

REPLACE ONLY:
1. app.js
2. index.html
3. service-worker.js

ROOT CAUSE FIXED:
- v2.10.54 index.html and service-worker.js reported 2.10.54,
  but app.js still internally reported APP_VERSION 2.10.52.
- Therefore the ERP kept detecting 2.10.54 as a "new" version every time.
- v2.10.55 aligns all three files to the same version.
- The update prompt is also guarded against reopening for an already acknowledged version.

Manager Tamil/English voice task changes from v2.10.54 are retained.

AFTER UPLOAD:
- Open ERP once.
- If the old loop appears one last time, tap Update Now once.
- The app should then remain on v2.10.55 without repeating the prompt.
