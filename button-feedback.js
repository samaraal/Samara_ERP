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

/* v2.14.88: after a successful save, the Save button that was used is locked ("✓ Saved", greyed,
   not clickable) until something is changed in the same form / window. Works on every page:
   it watches for the ERP's green success confirmation instead of changing each page. */
(() => {
  'use strict';
  const SAVE_LABEL = /\b(save|submit|update|record)\b/i;
  const NOT_SAVE = /saving|recording|voice|dictat|complete\s*\/\s*record|open|view|print|download/i;
  const SUCCESS = '.samara-save-confirmation.success,.samara-toast.success,.toast.success,.message.success,[data-toast-type="success"]';
  const WINDOW_MS = 20000;
  let pending = null;          // {button, scope, at}
  const locked = new Map();    // button -> scope

  const style = document.createElement('style');
  style.textContent = `
    .samara-saved-lock{opacity:.55!important;filter:grayscale(.35)!important;cursor:not-allowed!important;position:relative}
    .samara-saved-lock::after{content:"✓ Saved";margin-left:8px;padding:1px 7px;border-radius:999px;
      background:#dff3e4;color:#176b35;font-size:.78em;font-weight:800;white-space:nowrap}`;
  (document.head || document.documentElement).appendChild(style);

  const labelOf = el => String(el?.value || el?.textContent || el?.getAttribute?.('aria-label') || '').trim();
  const isSaveButton = el => el instanceof Element && el.matches('button,input[type="submit"]') &&
    SAVE_LABEL.test(labelOf(el)) && !NOT_SAVE.test(labelOf(el));
  // Prefer the whole form, then the popup window, then the page section, so any edit in it unlocks Save.
  const scopeOf = el => el.closest('form') || el.closest('.modal-card,[role="dialog"],.modal-backdrop') || el.closest('section') || el.closest('.card') || document.body;

  function lock(button, scope) {
    if (!button.isConnected) return;
    button.classList.add('samara-saved-lock');
    button.setAttribute('aria-disabled', 'true');
    button.dataset.samaraSavedTitle = button.title || '';
    button.title = 'Saved. Change something in this form to save again.';
    locked.set(button, scope);
  }
  function unlock(button) {
    button.classList.remove('samara-saved-lock');
    button.removeAttribute('aria-disabled');
    button.title = button.dataset.samaraSavedTitle || '';
    delete button.dataset.samaraSavedTitle;
    locked.delete(button);
  }
  function unlockWithin(target) {
    if (!(target instanceof Node)) return;
    for (const [button, scope] of [...locked]) {
      if (!button.isConnected) { locked.delete(button); continue; }
      if (scope === document.body || scope.contains(target)) unlock(button);
    }
  }

  // Remember the save button that was pressed (mouse, touch or keyboard).
  document.addEventListener('click', event => {
    const el = event.target instanceof Element ? event.target.closest('button,input[type="submit"]') : null;
    if (!el) return;
    if (el.classList.contains('samara-saved-lock')) {
      // Already saved and nothing changed: do not save the same entry again.
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    if (isSaveButton(el)) { pending = { button: el, scope: scopeOf(el), at: Date.now() }; return; }
    // Other actions inside a saved form (Add row, Remove, Delete document…) count as a change.
    if (!/^(close|cancel|back|ok|×)$/i.test(labelOf(el))) unlockWithin(el);
  }, true);

  document.addEventListener('submit', event => {
    const form = event.target;
    const submitter = event.submitter || form.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
    if (submitter && submitter.classList.contains('samara-saved-lock')) {
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    if (submitter && isSaveButton(submitter) && (!pending || pending.button !== submitter)) {
      pending = { button: submitter, scope: scopeOf(submitter), at: Date.now() };
    }
  }, true);

  // Any edit in the same form / window unlocks its Save button again.
  ['input', 'change'].forEach(type => document.addEventListener(type, event => unlockWithin(event.target), true));

  // Lock when the green success confirmation appears shortly after the save was pressed.
  const seen = node => node instanceof Element && (node.matches(SUCCESS) || node.querySelector(SUCCESS));
  new MutationObserver(list => {
    if (!pending) return;
    if (Date.now() - pending.at > WINDOW_MS) { pending = null; return; }
    for (const m of list) {
      for (const n of m.addedNodes) {
        if (seen(n)) { lock(pending.button, pending.scope); pending = null; return; }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
