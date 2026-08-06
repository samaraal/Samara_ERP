(() => {
  'use strict';
  const show = (title, detail) => {
    const root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef6f4;padding:24px;font-family:Arial,sans-serif">
        <div style="max-width:760px;width:100%;background:white;border:1px solid #cfe0dc;border-radius:22px;padding:28px;box-shadow:0 16px 40px #0001">
          <h1 style="margin:0 0 12px;color:#064f43;font-size:28px">${title}</h1>
          <p style="font-size:17px;line-height:1.55;color:#334;margin:0 0 16px">Samara Care could not finish loading. Your Supabase data has not been changed.</p>
          <pre style="white-space:pre-wrap;word-break:break-word;background:#fff4f4;border:1px solid #f0caca;border-radius:12px;padding:14px;color:#8b1e1e;font-size:14px">${String(detail || 'Unknown startup error')}</pre>
          <p style="font-size:15px;color:#566">Refresh once using Ctrl + Shift + R. If the message remains, send a screenshot of this panel.</p>
        </div>
      </div>`;
  };
  window.addEventListener('error', event => {
    const detail = event.error?.stack || `${event.message || 'JavaScript error'}\n${event.filename || ''}:${event.lineno || ''}:${event.colno || ''}`;
    show('Application startup error', detail);
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    show('Application request error', reason?.stack || reason?.message || String(reason));
  });
  window.SAMARA_SHOW_STARTUP_ERROR = show;
})();
