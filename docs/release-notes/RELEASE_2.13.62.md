# Samara ERP 2.13.62 - global button feedback

Buttons throughout the ERP now show a plum outline and gold inner highlight when pressed or clicked. The click highlight remains for 800 ms, including touch browsers that do not focus buttons. Focused controls retain a visible outline until focus moves. Existing selected tabs and navigation remain selected, and Save/Delete colours are preserved.

The shared stylesheet and delegated listener cover dashboard cards, navigation, dialogs, optional modules, button inputs, accessible custom buttons, styled action links and expandable summaries. Disabled and inert controls receive no click highlight. The listener never triggers, prevents or repeats an action and introduces no animation or layout movement. High-contrast mode uses the system highlight colour.

Publish app.js, button-feedback.js, styles.css, index.html, service-worker.js and this release note together. No database migration is required.
