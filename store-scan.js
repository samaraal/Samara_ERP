/* Scan Lab Stores stock-arrival trial · v1.2.0 · 18-10-2026 (1.2.0: a NEW item can be added to the Stores Master from here — the only database write, after a confirm step; 1.1.1: pack-size conversion check; 1.1.3: real-bill fixes — Each/bags units, 100.00 = 100, size-safe item match, subtotal check). Stock lines themselves are preview only.
 * 1.1.0: each line is matched to the Stores / Charge Master item list (item code, section, unit) so the same
 *        item is never created twice; section and unit are dropdowns (ERP lists); whole-number quantity check;
 *        Free qty, MRP and GST % read; expiry printed as MM/YY becomes the last day of that month (flagged);
 *        all dates shown DD-MM-YYYY; per-line ✓ Verified and a Trial score for stock invoices.
 * Database: reads the Stores item list (consumable_store_items); writes ONLY through ➕ Add to Stores Master
 *   (admin_add_store_item RPC, Admin / Director; optional Guest charge rate via admin_set_store_item_charge_rate).
 */
(function () {
  'use strict';
  const cfg = window.SAMARA_CONFIG || {}, sdk = window.supabase;
  const $ = (id) => document.getElementById(id);
  const SECTIONS = ['Pharmacy', 'Consumables', 'Housekeeping & General', 'Kitchen / Food Stores', 'Biomedical Equipment'];
  const MASTER_SECTIONS = ['Pharmacy', 'Consumables', 'Housekeeping & General', 'Kitchen / Food Stores']; // Stores Master sections (Biomedical has its own register)
  const UNITS = ['Nos', 'Pieces', 'Pairs', 'Sets', 'Packs', 'Packets', 'Boxes', 'Rolls', 'Bottles', 'Strips', 'Tablets', 'Capsules', 'Vials', 'Ampoules', 'Tubes', 'Sachets', 'Inhalers', 'Kg', 'Grams', 'Litres', 'ml', 'Dozens', 'Cans', 'Cylinders'];
  const UNIT_ALIAS = { strip: 'Strips', strips: 'Strips', box: 'Boxes', boxes: 'Boxes', bottle: 'Bottles', btl: 'Bottles', bott: 'Bottles', nos: 'Nos', no: 'Nos', pcs: 'Pieces', pc: 'Pieces', piece: 'Pieces', pieces: 'Pieces', pair: 'Pairs', pairs: 'Pairs', pack: 'Packs', pkt: 'Packets', packet: 'Packets', roll: 'Rolls', rolls: 'Rolls', vial: 'Vials', amp: 'Ampoules', ampoule: 'Ampoules', tube: 'Tubes', sachet: 'Sachets', kg: 'Kg', g: 'Grams', gm: 'Grams', l: 'Litres', ltr: 'Litres', litre: 'Litres', ml: 'ml', doz: 'Dozens', tab: 'Tablets', cap: 'Capsules', each: 'Nos', ea: 'Nos', unit: 'Nos', units: 'Nos', bag: 'Packs', bags: 'Packs', packs: 'Packs', pkts: 'Packets', set: 'Sets', sets: 'Sets', can: 'Cans', cyl: 'Cylinders' };
  const state = { client: null, pages: [], active: 0, data: null, items: [], itemsLoaded: false, scores: [], busy: false };
  const HEAD = [['vendor_name', 'Supplier / Vendor'], ['invoice_no', 'Invoice number'], ['invoice_date', 'Invoice date (DD-MM-YYYY)', 'date'], ['received_date', 'Received date (DD-MM-YYYY)', 'date'], ['remarks', 'Receipt remarks']];
  const LINE = [
    ['item_name', 'Item name', 'text', 'wide'], ['item_category', 'Section', 'section'], ['unit', 'Unit', 'unit'],
    ['quantity', 'Quantity (billed)', 'qty'], ['free_quantity', 'Free qty', 'qty'], ['pack_size', 'Pack size'],
    ['batch_no', 'Batch / lot number'], ['expiry_date', 'Expiry (DD-MM-YYYY)', 'date'], ['unit_cost', 'Rate per unit (₹, before tax)', 'num'],
    ['mrp', 'MRP (₹)', 'num'], ['gst_percent', 'GST %', 'num'], ['generic_name', 'Generic name'], ['brand_name', 'Brand name'],
    ['strength', 'Strength'], ['dosage_form', 'Dosage form'], ['manufacturer', 'Manufacturer'], ['remarks', 'Line remarks', 'text', 'wide']
  ];
  const LABEL = Object.fromEntries([...HEAD, ...LINE].map(([k, l]) => [k, l]));
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

  // ---------- dates: ISO inside, DD-MM-YYYY on screen ----------
  const isoToIn = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v || ''); };
  const inToIso = (v) => { const m = String(v || '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if (!m) return ''; const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : ''; };
  const monthEnd = (ym) => { const m = String(ym || '').match(/^(\d{4})-(\d{2})$/); if (!m) return ''; const d = new Date(Date.UTC(+m[1], +m[2], 0)); return d.toISOString().slice(0, 10); };

  async function start() {
    if (!sdk || !cfg.supabaseUrl) return status('ERP connection did not load. Refresh the page and try again.', 'error');
    state.client = sdk.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await state.client.auth.getSession();
    if (!data?.session) return status('Please log in to the ERP as Admin first, then reopen Scan Lab.', 'error');
    wire(); loadItems();
  }
  async function loadItems() {
    try {
      const { data, error } = await state.client.from('consumable_store_items').select('id,item_code,item_name,item_category,unit,strength,dosage_form,active').order('item_name');
      if (error) throw error;
      state.items = (data || []).filter((r) => r.active !== false).map((r) => ({ ...r, base: baseName(r.item_name) })).filter((r) => r.base);
      state.itemsLoaded = true; render();
    } catch (e) { console.warn('Stores item list not loaded (item matching off)', e); }
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
  function clearPages() { state.pages.forEach((p) => URL.revokeObjectURL(p.url)); state.pages = []; state.active = 0; renderPages(); status(''); }
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
    $('store-read').textContent = '✨ Read & Fill Stock Arrival' + (state.pages.length > 1 ? ` (${state.pages.length} pages)` : '');
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
    if (state.data && state.data.lines.some((l) => l.verified) && !confirm('Replace the checked lines below with a fresh reading?')) return;
    const btn = $('store-read'), started = Date.now(); btn.disabled = true;
    const tick = setInterval(() => status(`Reading ${state.pages.length} page(s)… ${Math.round((Date.now() - started) / 1000)} s`, 'busy'), 500);
    try {
      const files = []; for (const p of state.pages) files.push(await payload(p));
      const { data, error } = await state.client.functions.invoke('store-scan', { body: { files } });
      if (error) { let msg = 'Could not read the supplier document. Try again.'; try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch (_) {} throw new Error(msg); }
      if (!data?.result) throw new Error(data?.error || 'No result returned.');
      state.data = normalize(data.result); render();
      status(`Read in ${Math.round((Date.now() - started) / 1000)} s. Check every yellow field against the invoice, then tick ✓ Verified on each line. Nothing has been saved.`, 'ok');
    } catch (e) { status(e.message || 'Could not read the document.', 'error'); }
    finally { clearInterval(tick); btn.disabled = !state.pages.length; }
  }

  // ---------- item matching against the Stores / Charge Master list ----------
  function baseName(name) {
    return String(name || '').toLowerCase()
      .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syr|syrup|susp|inj|injection|oint|cream|gel|drops?)\b\.?/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  // Sizes / strengths in a name must agree: "Sterile Gloves 6 1/2" is NOT "Sterile Gloves (6)".
  const sizeTokens = (name) => (String(name || '').toLowerCase().replace(/(\d+)\s*(?:1\/2|½)/g, (m, a) => `${a}.5`).replace(/(\d+)\s*(?:1\/4|¼)/g, (m, a) => `${a}.25`)
    .match(/\d+(?:\.\d+)?/g) || []).map(Number).sort((a, b) => a - b).join(',');
  function matchItem(name) {
    const b = baseName(name); if (!b || !state.items.length) return null;
    const sz = sizeTokens(name);
    let best = null;
    for (const it of state.items) {
      const isz = sizeTokens(it.item_name);
      if (sz && isz && sz !== isz) continue;
      if (it.base === b) return { kind: 'exact', item: it };
      const words = b.split(' '), iw = it.base.split(' ');
      const contained = words.length > 1 && iw.length > 1 && (it.base.includes(b) || b.includes(it.base)) ? 0.9 : 0;
      const ratio = Math.max(contained, 1 - lev(b, it.base) / Math.max(b.length, it.base.length));
      if (!best || ratio > best.ratio) best = { ratio, item: it };
    }
    return best && best.ratio >= 0.78 ? { kind: 'near', item: best.item } : { kind: 'none' };
  }
  const PIECE_UNITS = ['Nos', 'Pieces', 'Tablets', 'Capsules'];
  // "15's" / "1x15" / "10 x 10" / "100's" → pieces per pack (0 when not clear)
  const packCount = (p) => { const t = String(p || '').toLowerCase().replace(/\s+/g, ''); let m = t.match(/^(\d+)x(\d+)$/); if (m) return Number(m[1]) * Number(m[2]); m = t.match(/^(\d+)(?:'?s|nos|pcs|tabs?|caps?)?$/); return m ? Number(m[1]) : 0; };
  const mapUnit = (u) => { const t = String(u || '').trim(); if (!t) return ''; if (UNITS.includes(t)) return t; return UNIT_ALIAS[t.toLowerCase().replace(/[^a-z]/g, '')] || ''; };

  function normalize(x) {
    const header = Object.fromEntries(HEAD.map(([k]) => [k, String(x?.[k] || '')]));
    const lines = (Array.isArray(x?.items) ? x.items : []).slice(0, 50).map((r) => {
      const v = Object.fromEntries(LINE.map(([k]) => [k, String(r?.[k] ?? '')]));
      for (const k of ['quantity', 'free_quantity']) v[k] = v[k].replace(/^(\d+)\.0+$/, '$1'); // "100.00" is 100
      const flags = new Set(Array.isArray(r?.unclear_fields) ? r.unclear_fields : []);
      const notes = {};
      const printedUnit = v.unit; v.unit = mapUnit(v.unit);
      if (printedUnit && !v.unit) { flags.add('unit'); notes.unit = `Printed as "${printedUnit}" — choose the ERP unit`; }
      if (!v.expiry_date && r?.expiry_month) { v.expiry_date = monthEnd(r.expiry_month); flags.add('expiry_date'); notes.expiry_date = `Printed as ${r.expiry_text || r.expiry_month} (month / year) — set to the last day of that month`; }
      if (!v.expiry_date && r?.expiry_text) { flags.add('expiry_date'); notes.expiry_date = `Printed as "${r.expiry_text}" — enter the date`; }
      const m = matchItem(v.item_name);
      const line = { v, ai: null, flags, notes, edited: new Set(), raw: String(r?.raw_text || ''), page: r?.page || 0, confidence: ['high', 'medium', 'low'].includes(r?.confidence) ? r.confidence : 'low', match: m, verified: false, manual: false };
      if (m?.kind === 'exact') applyMaster(line, m.item, true);
      line.ai = { ...v };
      checkLine(line);
      return line;
    });
    return { header, subtotal: String(x?.subtotal || ''), headerUnclear: new Set(Array.isArray(x?.unclear_fields) ? x.unclear_fields : []), lines, removedAi: 0 };
  }
  // Use the master item's section and unit (the ERP rule: same item, same code, one unit everywhere).
  function applyMaster(line, item, auto) {
    line.master = item;
    if (item.item_category && SECTIONS.includes(item.item_category) && line.v.item_category !== item.item_category) { if (!auto) setSys(line, 'item_category', item.item_category); else line.v.item_category = item.item_category; }
    if (item.unit && line.v.unit !== item.unit) {
      if (line.v.unit && auto) line.notes.unit = `Invoice unit ${line.v.unit} — Stores keeps ${item.item_name} in ${item.unit}. Convert the quantity if needed.`;
      if (!auto) setSys(line, 'unit', item.unit); else { line.flags.add('unit'); if (!line.v.unit) line.v.unit = item.unit; }
    }
    if (!auto) setSys(line, 'item_name', item.item_name);
  }
  function checkLine(line) {
    const q = line.v.quantity;
    if (q !== '' && !/^\d+$/.test(String(q))) { line.flags.add('quantity'); line.notes.quantity = 'Stores counts whole numbers only — check the pack / unit'; }
    if (line.v.free_quantity !== '' && !/^\d+$/.test(String(line.v.free_quantity))) line.flags.add('free_quantity');
    if (!line.v.item_category) line.flags.add('item_category');
    if (!line.v.unit) line.flags.add('unit');
    if (!q) line.flags.add('quantity');
  }
  // Changes made by the page itself (Stores master values, pack conversion) are not AI reading mistakes.
  function setSys(line, k, value) { if (line.ai) line.ai[k] = value; setVal(line, k, value); }
  function setVal(line, k, value) {
    line.v[k] = value;
    if (line.ai && String(line.ai[k] ?? '') !== String(value ?? '')) line.edited.add(k); else line.edited.delete(k);
    line.flags.delete(k); delete line.notes[k]; line.verified = false;
  }
  function lineProblems(l) {
    const p = [];
    if (!l.v.item_name.trim()) p.push('Item name');
    if (!l.v.item_category) p.push('Section');
    if (!l.v.unit) p.push('Unit');
    if (!/^\d+$/.test(String(l.v.quantity)) || Number(l.v.quantity) <= 0) p.push('Quantity (whole number)');
    if (l.v.free_quantity && !/^\d+$/.test(String(l.v.free_quantity))) p.push('Free qty (whole number)');
    if (l.v.expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(l.v.expiry_date)) p.push('Expiry date (DD-MM-YYYY)');
    return p;
  }

  // ---------- render ----------
  function control(line, k, type) {
    const val = line.v[k] || '';
    const onSet = (value) => { setVal(line, k, value); if (k === 'item_name') line.match = matchItem(value); };
    if (type === 'section') return el('select', { onchange: (e) => { onSet(e.target.value); render(); } }, el('option', { value: '', text: '—' }), SECTIONS.map((o) => el('option', { value: o, text: o, selected: val === o })));
    if (type === 'unit') return el('select', { onchange: (e) => { onSet(e.target.value); render(); } }, el('option', { value: '', text: '—' }), UNITS.map((o) => el('option', { value: o, text: o, selected: val === o })));
    if (type === 'date') return el('input', { type: 'text', value: isoToIn(val), placeholder: 'DD-MM-YYYY', inputmode: 'numeric', onchange: (e) => { const iso = inToIso(e.target.value); onSet(iso || e.target.value.trim()); render(); } });
    return el('input', { type: 'text', value: val, inputmode: type === 'qty' ? 'numeric' : type === 'num' ? 'decimal' : null, oninput: (e) => onSet(e.target.value), onchange: () => render() });
  }
  function fieldBox(line, k, label, type, wide) {
    const flagged = line.flags.has(k) && !line.verified;
    return el('div', { class: `f${flagged ? ' flag' : ''}${line.edited.has(k) ? ' edited' : ''}${wide ? ' ' + wide : ''}` }, el('label', { text: label }), control(line, k, type),
      line.notes[k] && !line.verified ? el('small', { class: 'fnote', text: line.notes[k] }) : null);
  }
  function matchNote(line) {
    if (!state.itemsLoaded || !line.v.item_name.trim()) return null;
    const m = line.match || matchItem(line.v.item_name);
    if (m?.kind === 'exact') return el('small', { class: 'spell ok', text: `✓ In Stores list: ${m.item.item_code ? m.item.item_code + ' · ' : ''}${m.item.item_name} (${m.item.item_category || '—'}, ${m.item.unit || '—'})` });
    if (m?.kind === 'near') return el('small', { class: 'spell near' }, `Same as ${m.item.item_code ? m.item.item_code + ' · ' : ''}${m.item.item_name}? `,
      el('button', { type: 'button', class: 'link', text: 'Use this item', onclick: () => { applyMaster(line, m.item, false); line.match = { kind: 'exact', item: m.item }; render(); } }));
    if (line.v.item_category === 'Biomedical Equipment') return el('small', { class: 'spell none', text: 'NEW item — Biomedical Equipment is added in the Biomedical Equipment register (BIO- code), not the Stores Master.' });
    const ready = MASTER_SECTIONS.includes(line.v.item_category) && line.v.unit;
    return el('small', { class: 'spell none' }, 'NEW item — not in the Stores / Charge Master list yet. ',
      ready ? el('button', { type: 'button', class: 'link', text: '➕ Add to Stores Master', onclick: () => { line.adding = { rate: '' }; render(); } })
        : el('b', { text: 'Choose its Section and Unit, then add it to the Stores Master from here.' }));
  }
  // 1.2.0: confirm panel — the one place this page writes to the ERP.
  function addPanel(line) {
    const v = line.v, a = line.adding;
    const row = (k, t) => el('div', null, el('span', { class: 'hint', text: k + ': ' }), el('b', { text: t || '—' }));
    return el('div', { class: 'warn add-master' },
      el('b', { text: 'Add this item to the Stores Master?' }),
      row('Item name', v.item_name.trim()), row('Section', v.item_category), row('Unit (Stores counts in)', v.unit),
      v.strength ? row('Strength', v.strength) : null, v.dosage_form ? row('Dosage form', v.dosage_form) : null,
      el('div', null, el('label', { text: 'Guest charge rate ₹ per ' + v.unit + ' (optional — can be set later in Charge Master)' }),
        el('input', { type: 'text', inputmode: 'decimal', value: a.rate, placeholder: v.mrp ? `MRP on bill ₹${v.mrp}` : '', oninput: (e) => { a.rate = e.target.value; } })),
      el('small', { class: 'hint', text: 'The ERP gives it the next item code. Check the spelling first — the name is shown the same way in Indent, Stock and Bills.' }),
      el('div', { class: 'med-actions' },
        el('button', { type: 'button', class: 'btn primary', text: state.busy ? 'Adding…' : 'Yes, add to Stores Master', disabled: state.busy ? true : null, onclick: () => addToMaster(line) }),
        el('button', { type: 'button', class: 'btn ghost', text: 'Cancel', onclick: () => { line.adding = null; render(); } })));
  }
  async function addToMaster(line) {
    const v = line.v, name = v.item_name.trim().replace(/\s+/g, ' '), rateText = String(line.adding?.rate || '').trim();
    if (!name || !MASTER_SECTIONS.includes(v.item_category) || !UNITS.includes(v.unit)) return status('Item name, Section and Unit are needed first.', 'error');
    if (rateText && !(Number(rateText) >= 0)) return status('Enter a valid charge rate (zero or more), or leave it blank.', 'error');
    const again = matchItem(name);
    if (again?.kind === 'exact' || again?.kind === 'near') { line.match = again; line.adding = null; render(); return status(`Not added — the Stores Master already has ${again.item.item_code || ''} ${again.item.item_name}. Use that item.`, 'error'); }
    state.busy = true; render(); status('Adding to Stores Master…');
    try {
      const r = await state.client.rpc('admin_add_store_item', { p_item_name: name, p_category: v.item_category, p_unit: v.unit, p_strength: v.strength.trim() || null, p_dosage_form: v.dosage_form.trim() || null });
      if (r.error) throw r.error;
      const id = r.data;
      let rateNote = '';
      if (rateText) {
        const rr = await state.client.rpc('admin_set_store_item_charge_rate', { p_item_id: id, p_charge_rate: Number(rateText) });
        rateNote = rr.error ? ` Charge rate NOT saved (${rr.error.message}) — set it in Charge Master.` : ` Guest charge rate ₹${Number(rateText)} saved.`;
      }
      const got = await state.client.from('consumable_store_items').select('id,item_code,item_name,item_category,unit,strength,dosage_form,active').eq('id', id).maybeSingle();
      if (got.error || !got.data) throw new Error('The ERP did not confirm the new item. Check Stores Master before adding it again.');
      const item = { ...got.data, base: baseName(got.data.item_name) };
      state.items.push(item);
      applyMaster(line, item, false); line.match = { kind: 'exact', item }; line.adding = null;
      status(`✓ Added to Stores Master: ${item.item_code || ''} · ${item.item_name} (${item.item_category}, ${item.unit}).${rateNote}`, rateNote.includes('NOT') ? 'error' : 'ok');
    } catch (e) {
      status('Not added: ' + (e.message || e) + (/admin|director/i.test(e.message || '') ? ' — only Admin / Director can add Stores Master items.' : ''), 'error');
    } finally { state.busy = false; render(); }
  }
  function render() {
    const box = clear($('store-results')), d = state.data;
    $('store-count').textContent = d ? `(${d.lines.filter((l) => l.verified).length} of ${d.lines.length} verified)` : '';
    if (!d) { box.append(el('p', { class: 'empty' }, 'Upload a supplier invoice or delivery note and press ', el('b', { text: 'Read & Fill Stock Arrival' }), '.')); return; }
    box.append(el('h3', { text: 'Supplier and receipt' }));
    const hg = el('div', { class: 'grid' });
    for (const [k, label, type] of HEAD) {
      const val = d.header[k];
      const inp = type === 'date'
        ? el('input', { type: 'text', value: isoToIn(val), placeholder: 'DD-MM-YYYY', onchange: (e) => { d.header[k] = inToIso(e.target.value) || e.target.value.trim(); d.headerUnclear.delete(k); render(); } })
        : el('input', { type: 'text', value: val, oninput: (e) => { d.header[k] = e.target.value; d.headerUnclear.delete(k); } });
      hg.append(el('div', { class: `f${d.headerUnclear.has(k) || (k === 'received_date' && !val) ? ' flag' : ''}` }, el('label', { text: label }), inp,
        k === 'received_date' && !val ? el('small', { class: 'fnote', text: 'Not printed — enter the day the goods actually arrived' }) : null));
    }
    box.append(hg);
    // 1.1.3: lines total vs the invoice subtotal (before GST) — a quick way to spot a missed or misread line.
    const linesTotal = d.lines.reduce((a, l) => a + (Number(l.v.quantity) || 0) * (Number(l.v.unit_cost) || 0), 0);
    if (d.subtotal) {
      const diff = Math.abs(linesTotal - Number(d.subtotal)), tol = Math.max(1, Number(d.subtotal) * 0.002); // pack conversion rounds the rate
      box.append(el('p', { class: diff < tol ? 'spell ok' : 'warn', text: diff < tol
        ? `✓ Lines total ₹${linesTotal.toFixed(2)} matches the invoice subtotal ₹${Number(d.subtotal).toFixed(2)} — no line missed.`
        : `Lines total ₹${linesTotal.toFixed(2)} does not match the invoice subtotal ₹${Number(d.subtotal).toFixed(2)} (difference ₹${diff.toFixed(2)}). A line may be missing or a quantity / rate misread — check against the bill.` }));
    }
    if (!d.lines.length) box.append(el('p', { class: 'warn', text: 'No stock lines were confidently identified. Add the items manually in the ERP.' }));
    d.lines.forEach((line, i) => {
      const problems = lineProblems(line);
      const card = el('article', { class: `med${line.verified ? ' verified' : ''}${line.confidence === 'low' && !line.verified ? ' low' : ''}` });
      card.append(el('div', { class: 'med-head' }, el('span', { class: 'num', text: String(i + 1) }),
        el('div', { class: 'raw' }, el('small', { text: line.manual ? 'Added manually' : `Invoice line${line.page ? ' · page ' + line.page : ''}` }), line.raw ? el('code', { text: line.raw }) : null),
        el('span', { class: `conf c-${line.confidence}`, text: line.verified ? '✓ Verified' : line.manual ? 'Manual' : line.confidence === 'high' ? 'Check' : line.confidence === 'medium' ? 'Check carefully' : 'Hard to read' })));
      const grid = el('div', { class: 'grid' });
      for (const [k, label, type, wide] of LINE) {
        const box2 = fieldBox(line, k, label, type, wide);
        if (k === 'item_name') { box2.append(matchNote(line)); if (line.adding && line.match?.kind !== 'exact') box2.append(addPanel(line)); }
        grid.append(box2);
      }
      card.append(grid);
      const total = (Number(line.v.quantity) || 0) + (Number(line.v.free_quantity) || 0);
      card.append(el('p', { class: 'hint', text: `Stock to receive: ${total || '—'} ${line.v.unit || ''}${Number(line.v.free_quantity) ? ` (${line.v.quantity} billed + ${line.v.free_quantity} free)` : ''}` }));
      // 1.1.0: invoice quantity is usually in packs (e.g. 20 strips of 15's) — Stores may count single pieces.
      const per = packCount(line.v.pack_size);
      if (per > 1 && PIECE_UNITS.includes(line.v.unit) && !line.converted && total) {
        card.append(el('div', { class: 'warn' },
          `Pack ${line.v.pack_size}: ${total} pack(s) on the invoice = ${total * per} ${line.v.unit}. Is ${line.v.unit} the count of single pieces for this item? `,
          el('button', { type: 'button', class: 'link', text: `Convert to ${line.v.quantity * per} + ${(Number(line.v.free_quantity) || 0) * per} free ${line.v.unit}`, onclick: () => {
            setSys(line, 'quantity', String((Number(line.v.quantity) || 0) * per));
            if (line.v.free_quantity) setSys(line, 'free_quantity', String((Number(line.v.free_quantity) || 0) * per));
            if (line.v.unit_cost) setSys(line, 'unit_cost', String(Math.round((Number(line.v.unit_cost) / per) * 100) / 100));
            if (line.v.mrp) setSys(line, 'mrp', String(Math.round((Number(line.v.mrp) / per) * 100) / 100));
            line.converted = true; render(); } }),
          el('button', { type: 'button', class: 'link', text: ' Keep as packs', onclick: () => { line.converted = true; render(); } })));
      }
      card.append(el('div', { class: 'med-actions' },
        problems.length && !line.verified ? el('span', { class: 'missing', text: 'Still needed: ' + problems.join(', ') }) : el('span'),
        el('button', { type: 'button', class: 'btn ghost danger', text: 'Remove line', onclick: () => { if (!line.manual) d.removedAi++; d.lines.splice(i, 1); render(); } }),
        line.verified
          ? el('button', { type: 'button', class: 'btn secondary', text: 'Undo verify', onclick: () => { line.verified = false; render(); } })
          : el('button', { type: 'button', class: 'btn primary', text: '✓ Verified', disabled: problems.length ? true : null, title: problems.length ? 'Complete the missing fields first' : 'I have checked this line against the invoice', onclick: () => { line.verified = true; render(); } })));
      box.append(card);
    });
    const allDone = d.lines.length && d.lines.every((l) => l.verified);
    box.append(el('div', { class: 'med-actions' },
      el('button', { type: 'button', class: 'btn ghost', text: '+ Add line manually', onclick: () => { const v = Object.fromEntries(LINE.map(([k]) => [k, ''])); d.lines.push({ v, ai: null, flags: new Set(), notes: {}, edited: new Set(), raw: '', page: 0, confidence: 'manual', match: null, verified: false, manual: true }); render(); } }),
      allDone ? el('button', { type: 'button', class: 'btn primary', text: 'Record result in Trial score', onclick: recordScore }) : null,
      el('span', { class: 'hint', text: 'Stock lines are a review preview only (no Save / Submit). Only ➕ Add to Stores Master writes to the ERP, after you confirm.' })));
  }
  function recordScore() {
    const d = state.data; let total = 0, correct = 0, missed = 0; const wrong = {};
    for (const l of d.lines) {
      if (l.manual) { missed++; continue; }
      for (const [k] of LINE) { if (!String(l.ai[k] || '') && !String(l.v[k] || '')) continue; total++; if (l.edited.has(k)) wrong[k] = (wrong[k] || 0) + 1; else correct++; }
    }
    const s = { kind: 'Stock invoice', label: d.header.vendor_name || 'Invoice', rows: d.lines.length, total, correct, missed, extra: d.removedAi, wrong, labels: LABEL, at: new Date() };
    if (window.SamaraScanLab && window.SamaraScanLab.addScore) window.SamaraScanLab.addScore(s);
    d.removedAi = 0;
    status(`Recorded in Trial score: ${correct} of ${total} fields correct (${total ? Math.round(correct / total * 100) : 0}%).`, 'ok');
  }
  document.addEventListener('DOMContentLoaded', () => { start().catch((e) => status(e.message || 'Could not open Stores trial.', 'error')); });
})();
