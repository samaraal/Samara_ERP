/* Scan Lab Stores stock-arrival trial. Preview only; this file contains no database writes. */
(function () {
  'use strict';
  const cfg = window.SAMARA_CONFIG || {}, sdk = window.supabase;
  const $ = (id) => document.getElementById(id);
  const state = { client: null, pages: [], active: 0, data: null };
  const HEAD = [
    ['vendor_name', 'Supplier / Vendor'], ['invoice_no', 'Invoice number'], ['invoice_date', 'Invoice date', 'date'],
    ['received_date', 'Received date', 'date'], ['remarks', 'Receipt remarks']
  ];
  const ITEM = [
    ['item_name', 'Item name'], ['item_category', 'Category'], ['unit', 'Unit'], ['quantity', 'Quantity', 'number'],
    ['batch_no', 'Batch / lot number'], ['expiry_date', 'Expiry date', 'date'], ['unit_cost', 'Unit cost', 'number'],
    ['generic_name', 'Generic name'], ['brand_name', 'Brand name'], ['strength', 'Strength'], ['dosage_form', 'Dosage form'],
    ['manufacturer', 'Manufacturer'], ['pack_size', 'Pack size'], ['remarks', 'Line remarks']
  ];
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'value') n.value = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  function status(text, tone) { $('store-status').textContent = text || ''; $('store-status').className = 'status' + (tone ? ' ' + tone : ''); }
  async function start() {
    if (!sdk || !cfg.supabaseUrl) return status('ERP connection did not load. Refresh the page and try again.', 'error');
    state.client = sdk.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await state.client.auth.getSession();
    if (!data?.session) return status('Please log in to the ERP as Admin first, then reopen Scan Lab.', 'error');
    wire();
  }
  function wire() {
    for (const id of ['store-file', 'store-cam']) $(id).addEventListener('change', (e) => { addPages(e.target.files); e.target.value = ''; });
    $('store-clear').addEventListener('click', clearPages);
    $('store-read').addEventListener('click', read);
    $('store-reset').addEventListener('click', () => { state.data = null; render(); status(''); });
  }
  function addPages(files) {
    for (const f of Array.from(files || [])) {
      const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''), img = /^image\//.test(f.type || '');
      if (!pdf && !img) { status(`${f.name}: upload a photo or PDF.`, 'error'); continue; }
      if (state.pages.length >= 8) { status('At most 8 pages can be read at a time.', 'error'); break; }
      state.pages.push({ file: f, pdf, url: URL.createObjectURL(f), name: f.name || 'document' });
    }
    state.active = Math.max(0, state.pages.length - 1); renderPages();
  }
  function clearPages() { state.pages.forEach((p) => URL.revokeObjectURL(p.url)); state.pages = []; state.active = 0; state.data = null; renderPages(); render(); status(''); }
  function renderPages() {
    const thumbs = clear($('store-thumbs')), viewer = clear($('store-viewer'));
    state.pages.forEach((p, i) => thumbs.append(el('div', { class: 'thumb' + (i === state.active ? ' active' : '') },
      el('button', { type: 'button', class: 'thumb-open', title: p.name, onclick: () => { state.active = i; renderPages(); } },
        p.pdf ? el('span', { class: 'pdf', text: 'PDF' }) : el('img', { src: p.url, alt: `Page ${i + 1}` }), el('small', { text: `Page ${i + 1}` })),
      el('button', { type: 'button', class: 'thumb-x', 'aria-label': `Remove page ${i + 1}`, text: '×', onclick: () => { URL.revokeObjectURL(p.url); state.pages.splice(i, 1); state.active = Math.min(state.active, state.pages.length - 1); renderPages(); } }))));
    const p = state.pages[state.active];
    if (!p) viewer.append(el('p', { class: 'empty', text: 'The supplier document you upload shows here for comparison.' }));
    else if (p.pdf) viewer.append(el('iframe', { src: p.url, title: p.name }), el('a', { href: p.url, target: '_blank', rel: 'noopener', class: 'open-link', text: 'Open PDF in a new tab' }));
    else { const img = el('img', { src: p.url, alt: p.name, class: 'zoomable' }); img.addEventListener('click', () => img.classList.toggle('zoomed')); viewer.append(img); }
    $('store-read').disabled = !state.pages.length;
    $('store-file-label').textContent = state.pages.length ? '+ Add more pages' : 'Upload file';
    $('store-cam-label').textContent = state.pages.length ? `+ Photo of page ${state.pages.length + 1}` : 'Mobile camera';
  }
  function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); }); }
  function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
  async function payload(p) {
    if (p.pdf) { if (p.file.size > 10 * 1024 * 1024) throw new Error(`${p.name} is larger than 10 MB.`); return { mime: 'application/pdf', data: await blobToB64(p.file) }; }
    try {
      const bmp = await loadImage(p.url), scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise((res) => c.toBlob(res, 'image/jpeg', .9)); if (b) return { mime: 'image/jpeg', data: await blobToB64(b) };
    } catch (_) {}
    return { mime: /^image\/(jpeg|png|webp|heic|heif)$/.test(p.file.type) ? p.file.type : 'image/jpeg', data: await blobToB64(p.file) };
  }
  async function read() {
    if (!state.pages.length) return;
    const btn = $('store-read'), started = Date.now(); btn.disabled = true;
    const tick = setInterval(() => status(`Reading ${state.pages.length} page(s)… ${Math.round((Date.now() - started) / 1000)} s`, 'busy'), 500);
    try {
      const files = []; for (const p of state.pages) files.push(await payload(p));
      const { data, error } = await state.client.functions.invoke('store-scan', { body: { files } });
      if (error) { let msg = 'Could not read the supplier document. Try again.'; try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch (_) {} throw new Error(msg); }
      if (!data?.result) throw new Error(data?.error || 'No result returned.');
      state.data = normalize(data.result); render();
      status(`Read in ${Math.round((Date.now() - started) / 1000)} s. Compare each field and item line with the original document. Nothing has been saved.`, 'ok');
    } catch (e) { status(e.message || 'Could not read the document.', 'error'); }
    finally { clearInterval(tick); btn.disabled = !state.pages.length; }
  }
  function normalize(x) {
    const header = Object.fromEntries(HEAD.map(([k]) => [k, String(x?.[k] || '')]));
    const items = (Array.isArray(x?.items) ? x.items : []).slice(0, 50).map((r) => {
      const values = Object.fromEntries(ITEM.map(([k]) => [k, String(r?.[k] ?? '')]));
      return {values, rawText: String(r?.raw_text || ''), unclear: new Set(Array.isArray(r?.unclear_fields) ? r.unclear_fields : []), confidence: ['high','medium','low'].includes(r?.confidence) ? r.confidence : 'low' };
    }));
    return { header, headerUnclear: new Set(Array.isArray(x?.unclear_fields) ? x.unclear_fields : []), items };
  }
  function field(container, key, label, value, type, unclear, onChange) {
    const input = el('input', { type: type || 'text', value: value || '', oninput: (e) => onChange(e.target.value) });
    if (type === 'number') { input.step = 'any'; input.min = '0'; }
    container.append(el('div', { class: `f${unclear ? ' flag' : ''}` }, el('label', { text: label }), input));
  }
  function render() {
    const box = clear($('store-results')), d = state.data;
    $('store-count').textContent = d ? `${d.items.length} line(s)` : '';
    if (!d) { box.append(el('p', { class: 'empty' }, 'Upload a supplier invoice or delivery note and press ', el('b', { text: 'Read & Fill Stock Arrival' }), '.')); return; }
    box.append(el('h3', { text: 'Supplier and receipt' }));
    const hg = el('div', { class: 'grid' });
    for (const [k, label, type] of HEAD) field(hg, k, label, d.header[k], type, d.headerUnclear.has(k), (v) => { d.header[k] = v; d.headerUnclear.delete(k); });
    box.append(hg);
    if (d.headerUnclear.size) box.append(el('p', { class: 'warn', text: `Check unclear header fields: ${[...d.headerUnclear].join(', ')}` }));
    if (!d.items.length) box.append(el('p', { class: 'warn', text: 'No stock lines were confidently identified. Add the items manually in the ERP.' }));
    d.items.forEach((item, i) => {
      const card = el('article', { class: 'med' + (item.confidence === 'low' ? ' low' : '') });
      card.append(el('div', { class: 'med-head' }, el('span', { class: 'num', text: String(i + 1) }), el('div', { class: 'raw' }, el('small', { text: 'Document line' }), el('code', { text: item.rawText || 'No source text returned' })), el('span', { class: `conf c-${item.confidence}`, text: `${item.confidence} confidence` })));
      const grid = el('div', { class: 'grid' });
      for (const [k, label, type] of ITEM) field(grid, k, label, item.values[k], type, item.unclear.has(k), (v) => { item.values[k] = v; item.unclear.delete(k); });
      card.append(grid);
      if (item.unclear.size) card.append(el('p', { class: 'warn', text: `Check unclear fields: ${[...item.unclear].join(', ')}` }));
      card.append(el('div', { class: 'med-actions' }, el('button', { type: 'button', class: 'btn ghost danger', text: 'Remove line', onclick: () => { d.items.splice(i, 1); render(); } })));
      box.append(card);
    });
    box.append(el('div', { class: 'med-actions' },
      el('button', { type: 'button', class: 'btn ghost', text: '+ Add line manually', onclick: () => { d.items.push({ values: Object.fromEntries(ITEM.map(([k]) => [k, ''])), unclear: new Set(), confidence: 'manual' }); render(); } }),
      el('span', { class: 'hint', text: 'This page is a review preview only. It has no Save or Submit action.' })));
  }
  document.addEventListener('DOMContentLoaded', () => { start().catch((e) => status(e.message || 'Could not open Stores trial.', 'error')); });
})();


