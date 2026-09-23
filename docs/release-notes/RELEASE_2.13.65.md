# Samara ERP 2.13.65 - quick Tamil / English dictation

Restore a quick Dictate control with a Tamil/English language selector beside field Voice controls in Spot Assessment and across authenticated ERP roles. Existing recorded Voice/translation remains available. Form-level Voice assistants have an explicit target-field selector for direct dictation; playback and voice-test controls are excluded.

Dictation uses browser speech recognition, shows interim speech and inserts each final result once into the chosen editable field. Existing text is preserved except an explicitly selected text range. No form is saved or submitted. Unsupported browsers, permission denial and network failures show an actionable message and retain Voice/typing. Recognition stops when the field closes, becomes unavailable, the user changes context, the page hides or after 90 seconds. Tamil dictation writes Tamil text without translation; Voice retains its existing conversion workflow.

Publish app.js, dictation.js, styles.css, index.html, service-worker.js and this note. No database changes.
