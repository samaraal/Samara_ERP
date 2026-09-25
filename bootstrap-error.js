(() => {
  'use strict';

  const VERSION = '2.14.49';
  let rendering = false;

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  async function reloadFresh() {
    const url = new URL(window.location.href);
    url.searchParams.set('samara_refresh', VERSION);
    url.searchParams.set('_', Date.now());
    window.location.replace(url.toString());
  }

  async function repairApp(button) {
    try {
      if (button) { button.disabled = true; button.textContent = 'Repairing…'; }

      // Only Samara's Cache Storage/service worker is reset. Supabase/local login data is untouched.
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(registrations.map(reg => reg.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.allSettled(keys.filter(key => key.startsWith('samara-erp-')).map(key => caches.delete(key)));
      }
      sessionStorage.setItem('samara-last-repair', String(Date.now()));
      await reloadFresh();
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = 'Repair App & Reload'; }
      alert(`Repair could not finish automatically. Please close Samara Care and open it again.\n\n${error?.message || error}`);
    }
  }

  const show = (title, detail) => {
    if (rendering) return;
    rendering = true;
    const root = document.getElementById('root');
    if (!root) { rendering = false; return; }

    const safeTitle = escapeHtml(title || 'Application startup error');
    const safeDetail = escapeHtml(detail || 'Unknown startup error');
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef6f4;padding:22px;font-family:Arial,sans-serif;box-sizing:border-box">
        <div style="max-width:560px;width:100%;background:white;border:1px solid #cfe0dc;border-radius:22px;padding:26px;box-shadow:0 16px 40px #0001;box-sizing:border-box">
          <h1 style="margin:0 0 12px;color:#064f43;font-size:28px;line-height:1.25">${safeTitle}</h1>
          <p style="font-size:17px;line-height:1.55;color:#334;margin:0 0 16px">Samara Care could not finish loading. Your Supabase data has not been changed.</p>
          <pre style="white-space:pre-wrap;word-break:break-word;background:#fff4f4;border:1px solid #f0caca;border-radius:12px;padding:14px;color:#8b1e1e;font-size:14px;max-height:150px;overflow:auto">${safeDetail}</pre>
          <div style="display:grid;gap:10px;margin-top:18px">
            <button id="samara-reload-btn" type="button" style="min-height:52px;border:0;border-radius:14px;background:#087667;color:#fff;font-size:17px;font-weight:700;padding:12px 16px">Reload Samara Care</button>
            <button id="samara-repair-btn" type="button" style="min-height:52px;border:1px solid #b8d3ce;border-radius:14px;background:#f4fbf9;color:#064f43;font-size:16px;font-weight:700;padding:12px 16px">Repair App & Reload</button>
          </div>
          <p style="font-size:14px;line-height:1.5;color:#566;margin:16px 0 0">On mobile, use <b>Reload Samara Care</b> first. If the same error returns, use <b>Repair App & Reload</b>. This does not delete patient or billing data.</p>
          <p style="font-size:12px;color:#789;margin:10px 0 0">Samara Care ERP ${VERSION}</p>
        </div>
      </div>`;

    document.getElementById('samara-reload-btn')?.addEventListener('click', reloadFresh);
    document.getElementById('samara-repair-btn')?.addEventListener('click', event => repairApp(event.currentTarget));
    rendering = false;
  };

  // v2.14.17: once the app is running, an error must NOT wipe the whole screen.
  // Before the app starts, the full "startup error" screen is still shown (as before).
  // After it starts, the error is logged to client_errors and a small notice is shown instead.
  const appIsRunning = () => {
    const root = document.getElementById('root');
    return window.SAMARA_APP_STARTED === true && !!root && root.childElementCount > 0;
  };
  const isHarmless = message => /ResizeObserver loop|^Script error\.?$/i.test(String(message || '').trim());
  let lastNoticeAt = 0;
  const softNotice = () => {
    try {
      const now = Date.now();
      if (now - lastNoticeAt < 20000 || !document.body) return;
      lastNoticeAt = now;
      document.getElementById('samara-soft-error')?.remove();
      const box = document.createElement('div');
      box.id = 'samara-soft-error';
      box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;max-width:min(520px,calc(100vw - 24px));background:#2f1022;color:#fff;border-radius:14px;padding:12px 44px 12px 16px;font:500 15px/1.45 Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.28)';
      box.textContent = 'Something did not finish. If you were saving, please check the record was saved before trying again.';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close');
      close.style.cssText = 'position:absolute;top:6px;right:8px;border:0;background:transparent;color:#fff;font-size:24px;line-height:1;cursor:pointer';
      close.addEventListener('click', () => box.remove());
      box.appendChild(close);
      document.body.appendChild(box);
      setTimeout(() => box.remove(), 9000);
    } catch (_) {}
  };

  window.addEventListener('error', event => {
    // Ignore failed <img>/<script> loads that bubble here without a JS error.
    if (!event.error && !event.message) return;
    if (appIsRunning()) {
      if (isHarmless(event.message)) return;
      try { window.SamaraReportError?.('window-error', event.error || event.message); } catch (_) {}
      softNotice();
      return;
    }
    const detail = event.error?.stack || `${event.message || 'JavaScript error'}\n${event.filename || ''}:${event.lineno || ''}:${event.colno || ''}`;
    show('Application startup error', detail);
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    if (appIsRunning()) {
      try { window.SamaraReportError?.('unhandled-rejection', reason); } catch (_) {}
      softNotice();
      return;
    }
    show('Application request error', reason?.stack || reason?.message || String(reason));
  });

  window.SAMARA_SHOW_STARTUP_ERROR = show;
  window.SAMARA_REPAIR_APP = repairApp;
})();
