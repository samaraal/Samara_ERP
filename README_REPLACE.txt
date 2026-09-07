SAMARA ERP v2.10.56 — MOBILE MANAGER VOICE FIX

Replace only:
1. app.js
2. index.html
3. service-worker.js

What is fixed:
- Android/mobile no longer forces voice through MediaRecorder first.
- Chrome Android webkitSpeechRecognition is now used first for both Tamil and English.
- Spoken words appear immediately under "Heard:".
- English speech is immediately placed into Subject even if structured processing is temporarily unavailable.
- Tamil transcript is sent to the existing director-office-voice parser for Tamil -> simple English.
- MediaRecorder remains as fallback only when browser speech recognition is unavailable.
- Better permission/no-speech/error messages.
- v2.10.55 update-loop protection is retained.
- All Manager ERP roles retain the Tamil/English voice buttons.

After upload:
- Open ERP and confirm Version 2.10.56.
- If an older cached build remains, use App Help -> Repair App once.
- Test English first: say "Call Mr Kumar tomorrow at 10 AM".
- Then Tamil: say "நாளைக்கு காலை பத்து மணிக்கு குமாரை கூப்பிடணும்".
