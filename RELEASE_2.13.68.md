# Samara ERP 2.13.68 - Dictate across pauses

Keep a user-controlled Dictate session open across native speech-recognition utterance boundaries, with live interim text and an explicit Stop Dictation action. Each native cycle uses single-utterance recognition and replaces its own phrase snapshot rather than appending recognition revisions. Completed cycles accumulate once; late callbacks from previous cycles are ignored. Tamil and English selection is pinned for the session.

Stop waits briefly for the final native result, cancels reconnects, and preserves visible text. Editing the field, changing context, hiding the page, errors, three empty cycles or a five-minute session limit stop listening. Existing text outside the selected insertion range is preserved. No assessment is saved automatically. Browser recognition accuracy still requires device testing; this release does not claim to reconstruct an unverified historical Spot Assessment control.

Publish dictation.js, app.js, index.html, service-worker.js and this note. No database changes.
