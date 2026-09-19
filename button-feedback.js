/* Global interaction feedback, including buttons rendered by optional modules. */
(() => {
  'use strict';
  const selector = 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], a.btn, summary';
  let highlighted = null;
  let timer = null;
  function clearHighlight() {
    if (highlighted) highlighted.removeAttribute('data-samara-clicked');
    highlighted = null;
    clearTimeout(timer);
  }
  // Delegation covers future React renders and dialogs without changing handlers.
  document.addEventListener('pointerdown', clearHighlight, true);
  document.addEventListener('pointercancel', clearHighlight, true);
  window.addEventListener('blur', clearHighlight);
  document.addEventListener('click', event => {
    const control = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!control || control.matches(':disabled') || control.closest('[aria-disabled="true"], [inert]')) return;
    clearHighlight();
    highlighted = control;
    control.setAttribute('data-samara-clicked', 'true');
    // Touch browsers may not focus buttons; keep feedback visible after release.
    timer = setTimeout(clearHighlight, 800);
  }, true);
})();
