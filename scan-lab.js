/* Samara Care ERP — Scan Lab (TRIAL) v1.0.6 · 17-10-2026
 * Separate page, Admin only. Reads a prescription / ID card through the "prescription-scan" Edge Function
 * and fills Admission-form fields for checking. NOTHING is written to the database.
 * The only database read is the Pharmacy item list (for the spelling check).
 */
(function () {
  'use strict';
  const cfg = window.SAMARA_CONFIG || {};
  const sdk = window.supabase;
  const $ = (id) => document.getElementById(id);

  // ---------- ERP option lists (same values as the Admission form) ----------
  const FREQUENCIES = ['Once Daily (OD)', 'Twice Daily (BD)', 'Three Times Daily (TDS)', 'Four Times Daily (QID)', 'HS', 'STAT', 'SOS / PRN', 'Weekly', 'Monthly'];
  const ROUTES = ['Oral', 'IV', 'IM', 'Subcutaneous', 'Topical', 'Inhalation', 'Other'];
  const FOODS = ['Before food', 'After food', 'With food', 'No restriction'];
  const DURATIONS = ['Single Dose', '1 Day', '3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '21 Days', '30 Days', 'Until Doctor Review', 'Long Term', 'Custom'];
  const UNITS = ['mg', 'mcg', 'g', 'ml', 'mg/ml', 'mg/5 ml', 'IU', 'units', '%', 'drops', 'tablet', 'capsule', 'puff', 'sachet', 'patch'];
  // 1.0.3: medicine times follow Samara's meal times (meals ~8 AM, 1 PM, 8 PM — confirmed by Admin 17-10-2026).
  // After food = 1 hour after the meal (9 AM, 2 PM, 9 PM); before food = 1 hour before (7 AM, 12 PM, 7 PM);
  // with food = at the meal (8 AM, 1 PM, 8 PM); no restriction = same as after food; bedtime (HS / 4th dose) = 10 PM.
  const MEAL_TIMES = { 'Before food': ['07:00', '12:00', '19:00'], 'After food': ['09:00', '14:00', '21:00'], 'With food': ['08:00', '13:00', '20:00'], 'No restriction': ['09:00', '14:00', '21:00'] };
  const BEDTIME = '22:00';
  const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
  const RELATIONS = ['', 'S/O', 'D/O', 'W/O', 'C/O', 'H/O'];
  const GENDERS = ['', 'Male', 'Female', 'Other'];
  const RX_FIELDS = ['prescribed_by_doctor', 'medicine_name', 'variable_dose', 'strength_amount', 'strength_unit', 'frequency', 'times', 'route', 'food_instruction', 'duration', 'custom_duration_days', 'special_instruction'];
  const RX_LABEL = { prescribed_by_doctor: 'Prescribed Doctor', medicine_name: 'Medicine', variable_dose: 'Dose varies', strength_amount: 'Strength', strength_unit: 'Unit', frequency: 'Frequency', times: 'Time', route: 'Route', food_instruction: 'Food', duration: 'Duration', custom_duration_days: 'Custom days', special_instruction: 'Special instruction' };
  const ID_FIELDS = [
    ['full_name', 'Full name (as on ID)'], ['relation_type', 'Relation'], ['relation_name', 'Relation’s name'],
    ['date_of_birth', 'Date of birth (DD-MM-YYYY)'], ['gender', 'Gender'],
    ['house_no', 'House / Door No.'], ['apartment_name', 'Apartment / Building'], ['street_name', 'Street'], ['locality_area', 'Locality / Area'],
    ['village_town', 'Village / Town / City'], ['taluk', 'Taluk'], ['district', 'District'], ['state', 'State'], ['pincode', 'Pincode'], ['country', 'Country'],
    ['document_type', 'ID type'], ['id_last4', 'ID number — last 4 digits only']
  ];
  // 1.0.4: sliding-scale / variable-dose medicines (e.g. insulin by blood-sugar level) have NO fixed strength —
  // the nurse gives the dose after checking the sugar, as per the scale or the doctor's instruction.
  const VARIABLE_DOSE_RE = /sliding\s*scale|depend(ing|s)?\s+on\s+(the\s+)?(blood\s*)?sugar|(as\s+per|according\s+to)\s+(the\s+)?(blood\s*)?sugar|\b(grbs|cbg|rbs)\b|blood\s*sugar|sugar\s*level|as\s+directed\s+by\s+(the\s+)?doctor/i;
  const INSULIN_RE = /insulin|actrapid|mixtard|lantus|novorapid|novomix|humalog|huminsulin|insugen|basalog|tresiba|ryzodeg|levemir|apidra|glargine|aspart|lispro|degludec|detemir|wosulin/i;
  // Spot Assessment / Admission field names in the live ERP (shown for reference only).
  const UNCLEAR_MAP = { strength: 'strength_amount', dose: 'strength_amount', strength_amount: 'strength_amount', strength_unit: 'strength_unit', time: 'times', times: 'times', dose_pattern: 'times', frequency: 'frequency', route: 'route', food: 'food_instruction', food_instruction: 'food_instruction', duration: 'duration', custom_duration_days: 'custom_duration_days', medicine_name: 'medicine_name', name: 'medicine_name', special_instruction: 'special_instruction', doctor_name: 'prescribed_by_doctor', prescribed_by_doctor: 'prescribed_by_doctor' };

  // ---------- state ----------
  const state = {
    client: null, session: null,
    pages: { rx: [], id: [] }, active: { rx: 0, id: 0 },
    meds: [], rxMeta: null, rxNotes: [], idData: null, groups: [], readCount: 0, pageOffset: 0,
    pharmacy: [], pharmacyLoaded: false,
    scores: [] // {kind, total, correct, missed, extra, verifiedAt}
  };
  let rowSeq = 0;

  // ---------- tiny DOM helper (all text goes through textContent: AI output is data, never HTML) ----------
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

  // ---------- login gate ----------
  async function start() {
    if (!sdk || !cfg.supabaseUrl) return gate('The page could not load the ERP connection. Please refresh.', false);
    state.client = sdk.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await state.client.auth.getSession();
    const session = data?.session;
    if (!session) return gate('Please log in to the ERP as Admin in this browser first, then open Scan Lab again.', true);
    const uid = session.user.id;
    const { data: prof } = await state.client.from('profiles').select('role,full_name').or(`id.eq.${uid},auth_user_id.eq.${uid}`).limit(1).maybeSingle();
    if (String(prof?.role || '') !== 'Admin') return gate('Scan Lab is in trial and open to Admin only.', true);
    state.session = session;
    $('gate').hidden = true; $('app').hidden = false;
    wire();
    loadPharmacy();
  }
  function gate(text, showLink) { $('gate-text').textContent = text; $('gate-link').hidden = !showLink; $('gate').hidden = false; $('app').hidden = true; }

  async function loadPharmacy() {
    try {
      const { data, error } = await state.client.from('consumable_store_items').select('item_code,item_name,item_category,strength,dosage_form,active').order('item_name');
      if (error) throw error;
      state.pharmacy = (data || []).filter((r) => r.active !== false && (/pharm/i.test(String(r.item_category || '')) || String(r.dosage_form || '').trim()))
        .map((r) => ({ ...r, base: baseName(r.item_name) })).filter((r) => r.base);
      state.pharmacyLoaded = true;
      renderMeds();
    } catch (e) { console.warn('Pharmacy list not loaded (spelling check off)', e); }
  }

  // ---------- tabs ----------
  function wire() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
      if (t.dataset.tab === 'score') renderScore();
    }));
    for (const kind of ['rx', 'id']) {
      $(kind + '-file').addEventListener('change', (e) => { addPages(kind, e.target.files); e.target.value = ''; });
      $(kind + '-cam').addEventListener('change', (e) => { addPages(kind, e.target.files); e.target.value = ''; });
      $(kind + '-clear').addEventListener('click', () => { state.pages[kind].forEach((p) => URL.revokeObjectURL(p.url)); state.pages[kind] = []; state.active[kind] = 0; renderPages(kind); });
      $(kind + '-read').addEventListener('click', () => readScan(kind));
    }
    $('rx-add').addEventListener('click', () => { state.meds.push(blankRow(true)); renderMeds(); updateReadLabel('rx'); });
    $('rx-fresh').addEventListener('click', () => {
      if (!confirm('Clear ALL medicine rows and start a fresh list? (Use this for a different Guest.)')) return;
      state.meds = []; state.groups = []; state.rxNotes = []; state.rxMeta = null; state.pageOffset = 0; state.removedAi = 0;
      setStatus('rx', ''); renderMeds(); updateReadLabel('rx');
    });
    window.addEventListener('beforeunload', (e) => { if (state.meds.length || state.idData) { e.preventDefault(); e.returnValue = ''; } });
  }

  // ---------- pages ----------
  function addPages(kind, fileList) {
    const files = Array.from(fileList || []);
    for (const f of files) {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
      const isImg = /^image\//.test(f.type || '');
      if (!isPdf && !isImg) { setStatus(kind, `${f.name}: only photos and PDF files can be read.`, 'error'); continue; }
      if (state.pages[kind].length >= 8) { setStatus(kind, 'At most 8 pages at a time.', 'error'); break; }
      state.pages[kind].push({ file: f, isPdf, url: URL.createObjectURL(f), name: f.name || (isPdf ? 'document.pdf' : 'photo.jpg') });
    }
    state.active[kind] = Math.max(0, state.pages[kind].length - 1);
    renderPages(kind);
  }
  function renderPages(kind) {
    const pages = state.pages[kind], thumbs = clear($(kind + '-thumbs')), viewer = clear($(kind + '-viewer'));
    pages.forEach((p, i) => {
      thumbs.append(el('div', { class: 'thumb' + (i === state.active[kind] ? ' active' : '') },
        el('button', { type: 'button', class: 'thumb-open', title: p.name, onclick: () => { state.active[kind] = i; renderPages(kind); } },
          p.isPdf ? el('span', { class: 'pdf', text: 'PDF' }) : el('img', { src: p.url, alt: `Page ${i + 1}` }),
          el('small', { text: `Page ${i + 1}` })),
        el('button', { type: 'button', class: 'thumb-x', 'aria-label': `Remove page ${i + 1}`, text: '×', onclick: () => { URL.revokeObjectURL(p.url); pages.splice(i, 1); state.active[kind] = Math.min(state.active[kind], pages.length - 1); renderPages(kind); } })));
    });
    const cur = pages[state.active[kind]];
    if (!cur) viewer.append(el('p', { class: 'empty', text: kind === 'rx' ? 'The prescription you upload shows here, so you can compare it with each medicine row.' : 'The ID card you upload shows here.' }));
    else if (cur.isPdf) viewer.append(el('iframe', { src: cur.url, title: cur.name }), el('a', { href: cur.url, target: '_blank', rel: 'noopener', class: 'open-link', text: 'Open PDF in a new tab' }));
    else {
      const img = el('img', { src: cur.url, alt: cur.name, class: 'zoomable' });
      img.addEventListener('click', () => img.classList.toggle('zoomed'));
      viewer.append(img, el('small', { class: 'hint', text: 'Tap the picture to zoom in / out.' }));
    }
    $(kind + '-read').disabled = !pages.length;
    // 1.0.1: make multi-page use obvious — buttons say "add next page" and the Read button shows the page count.
    const n = pages.length;
    $(kind + '-file-label').textContent = n ? '+ Add more pages' : 'Upload file';
    $(kind + '-cam-label').textContent = n ? `+ Photo of page ${n + 1}` : 'Mobile camera';
    updateReadLabel(kind);
  }

  // Shrink large photos (phone cameras) before sending; keeps handwriting readable.
  async function toPayload(p) {
    if (p.isPdf) {
      if (p.file.size > 10 * 1024 * 1024) throw new Error(`${p.name} is larger than 10 MB. Please upload a smaller PDF or photos of the pages.`);
      return { mime: 'application/pdf', data: await blobToB64(p.file) };
    }
    try {
      const bmp = await loadImage(p.url);
      const max = 2400, scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
      if (blob) return { mime: 'image/jpeg', data: await blobToB64(blob) };
    } catch (_) { /* fall back to the original file */ }
    const mime = /^image\/(jpeg|png|webp|heic|heif)$/.test(p.file.type) ? p.file.type : 'image/jpeg';
    return { mime, data: await blobToB64(p.file) };
  }
  function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
  function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); }); }

  function setStatus(kind, text, tone) { const n = $(kind + '-status'); n.textContent = text || ''; n.className = 'status' + (tone ? ' ' + tone : ''); }

  // ---------- read ----------
  async function readScan(kind) {
    const pages = state.pages[kind];
    if (!pages.length) return;
    const adding = kind === 'rx' && state.meds.length > 0;
    if (kind === 'id' && state.idData && !confirm('Replace the Guest details below with a fresh reading?')) return;
    const btn = $(kind + '-read'); btn.disabled = true;
    const t0 = Date.now();
    const tick = setInterval(() => setStatus(kind, `Reading ${pages.length} page(s)… ${Math.round((Date.now() - t0) / 1000)} s`, 'busy'), 500);
    try {
      const files = [];
      for (const p of pages) files.push(await toPayload(p));
      const { data, error } = await state.client.functions.invoke('prescription-scan', { body: { kind: kind === 'rx' ? 'prescription' : 'id', files } });
      if (error) {
        let msg = 'Could not read the file just now. Please try again.';
        try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch (_) { /* keep default */ }
        throw new Error(msg);
      }
      if (!data?.result) throw new Error(data?.error || 'No result returned.');
      const secs = Math.round((Date.now() - t0) / 1000);
      if (kind === 'rx') {
        const n = applyRx(data.result, pages.length, adding);
        setStatus('rx', adding
          ? `Read in ${secs} s — ${n} medicine(s) ADDED; the list now has ${state.meds.length}. To add another doctor's prescription: Clear pages, upload it, and press Read & Add again.`
          : `Read in ${secs} s. Check every yellow row against the prescription, correct anything wrong, then tick ✓ Verified. Another doctor's prescription? Clear pages, upload it, and press Read & Add.`, 'ok');
      }
      else { applyId(data.result); setStatus('id', `Read in ${secs} s. Check each field against the ID card, then tick ✓ Verified.`, 'ok'); }
    } catch (e) {
      setStatus(kind, e.message || 'Could not read the file.', 'error');
    } finally { clearInterval(tick); btn.disabled = !state.pages[kind].length; }
  }

  // ---------- prescription → rows ----------
  function parseSlots(pattern) {
    const t = String(pattern || '').replace(/½/g, '0.5').replace(/\b1\/2\b/g, '0.5').replace(/¼/g, '0.25');
    const parts = t.split(/\s*[-–—]\s*/).filter((x) => x !== '');
    if (parts.length < 3 || parts.length > 4) return null;
    const nums = parts.map((x) => Number(x));
    return nums.every((n) => Number.isFinite(n)) ? nums : null;
  }
  function timesFor(frequency, pattern, food) {
    const meal = MEAL_TIMES[food] || MEAL_TIMES['After food'];
    if (frequency === 'HS') return [BEDTIME];
    if (frequency === 'STAT' || frequency === 'SOS / PRN') return [];
    const slots = parseSlots(pattern);
    if (slots) {
      const t = slots.map((n, i) => (n > 0 ? (i < 3 ? meal[i] : BEDTIME) : null)).filter(Boolean);
      if (t.length) return [...new Set(t)].sort();
    }
    switch (frequency) {
      case 'Once Daily (OD)': case 'Weekly': case 'Monthly': return [meal[0]];
      case 'Twice Daily (BD)': return [meal[0], meal[2]];
      case 'Three Times Daily (TDS)': return meal.slice();
      case 'Four Times Daily (QID)': return [...meal, BEDTIME];
      default: return [];
    }
  }
  function freqFromPattern(pattern) {
    const slots = parseSlots(pattern); if (!slots) return '';
    const n = slots.filter((x) => x > 0).length;
    if (slots.length === 4 && n === 4) return 'Four Times Daily (QID)';
    return ({ 1: 'Once Daily (OD)', 2: 'Twice Daily (BD)', 3: 'Three Times Daily (TDS)' })[n] || '';
  }
  function blankRow(manual) {
    const v = { prescribed_by_doctor: (state.groups[0] && state.groups[0].doctor) || state.rxMeta?.doctor_name || '', medicine_name: '', variable_dose: false, strength_amount: '', strength_unit: '', frequency: 'Once Daily (OD)', times: ['09:00'], route: 'Oral', food_instruction: 'After food', duration: 'Long Term', custom_duration_days: '', special_instruction: '' };
    return { id: ++rowSeq, group: state.groups[0] ? state.groups[0].key : '', v, ai: manual ? null : { ...v, times: v.times.slice() }, flags: new Set(), notes: {}, raw: '', form: '', confidence: manual ? 'manual' : 'high', verified: false, manual: !!manual, edited: new Set() };
  }
  // 1.0.6: a second reading ADDS to the medicine list (e.g. another doctor's prescription read separately);
  // "Start a fresh list" clears it.
  function applyRx(r, pagesRead, add) {
    const meta = { doctor_name: r.doctor_name || '', hospital_or_clinic: r.hospital_or_clinic || '', prescription_date: r.prescription_date || '', patient_name: r.patient_name_on_prescription || '', page_quality: r.page_quality || '' };
    if (!add) { state.meds = []; state.groups = []; state.rxNotes = []; state.pageOffset = 0; state.rxMeta = meta; }
    else if (state.rxMeta) { if (meta.page_quality === 'poor') state.rxMeta.page_quality = 'poor'; if (!state.rxMeta.patient_name) state.rxMeta.patient_name = meta.patient_name; }
    else state.rxMeta = meta;
    state.rxNotes = state.rxNotes.concat(r.other_notes || []);
    const readNo = ++state.readCount, offset = state.pageOffset;
    // 1.0.5: medicines are grouped by prescription (doctor, else page) — one doctor entry fills the whole group.
    const perMedDoctor = (r.medicines || []).some((m) => String(m.doctor_name || '').trim());
    const groupFor = (m) => {
      const doc = perMedDoctor ? String(m.doctor_name || '').trim() : meta.doctor_name;
      const key = doc ? 'd:' + doc.toLowerCase().replace(/[^a-z]/g, '') : `r${readNo}:p${m.page || 1}`;
      let g = state.groups.find((x) => x.key === key);
      if (!g) { g = { key, doctor: doc, aiDoctor: doc, pages: new Set(), count: 0, hospital: meta.hospital_or_clinic, date: meta.prescription_date }; state.groups.push(g); }
      g.pages.add(Number(m.page || 1) + offset);
      g.count++;
      return g;
    };
    state.pageOffset += Math.max(1, pagesRead || 1);
    const known = new Set(state.meds.map((x) => baseName(x.v.medicine_name)).filter(Boolean));
    const added = (r.medicines || []).map((m) => {
      const g = groupFor(m);
      const row = blankRow(false); row.group = g.key;
      const flags = new Set((m.unclear_fields || []).map((f) => UNCLEAR_MAP[String(f).toLowerCase()] || null).filter(Boolean));
      const frequency = m.frequency || freqFromPattern(m.dose_pattern);
      if (!frequency) flags.add('frequency');
      const times = timesFor(frequency, m.dose_pattern, m.food_instruction || 'After food');
      if (!times.length && !['SOS / PRN', 'STAT'].includes(frequency)) flags.add('times');
      const dose = String(m.dose_per_time || '').trim();
      const plainOne = /^1\s*(tab|tablet|cap|capsule)s?\.?$/i.test(dose);
      const extra = [dose && !plainOne ? `Dose: ${dose} each time` : '', m.special_instruction || ''].filter(Boolean).join('. ');
      const variable = !m.strength_amount && VARIABLE_DOSE_RE.test(`${m.raw_text || ''} ${m.special_instruction || ''}`);
      const v = {
        prescribed_by_doctor: g.doctor,
        medicine_name: m.medicine_name || '',
        variable_dose: variable,
        strength_amount: variable ? '' : (m.strength_amount || ''), strength_unit: variable ? (m.strength_unit || (INSULIN_RE.test(m.medicine_name || '') ? 'units' : '')) : (m.strength_unit || ''),
        frequency: frequency || 'Once Daily (OD)', times,
        route: m.route || 'Oral',
        food_instruction: m.food_instruction || 'After food',
        duration: m.duration || 'Long Term', custom_duration_days: m.custom_duration_days || '',
        special_instruction: extra
      };
      if (!g.doctor) flags.add('prescribed_by_doctor');
      if (!v.medicine_name) flags.add('medicine_name');
      if (!v.variable_dose && !v.strength_amount) flags.add('strength_amount');
      if (!v.variable_dose && !v.strength_unit) flags.add('strength_unit');
      if (v.variable_dose) { flags.add('variable_dose'); flags.delete('strength_amount'); flags.delete('strength_unit'); }
      if (!m.route) flags.add('route');
      const notes = {};
      if (!m.food_instruction) { flags.add('food_instruction'); notes.food_instruction = 'Not written — confirm'; }
      if (!m.duration) { flags.add('duration'); notes.duration = 'Not written — confirm (pre-set to Long Term)'; }
      if (v.duration === 'Custom' && !v.custom_duration_days) flags.add('custom_duration_days');
      if (add && known.has(baseName(v.medicine_name))) { flags.add('medicine_name'); notes.medicine_name = 'This medicine is already in the list from an earlier prescription — remove one if it is the same.'; }
      Object.assign(row, { v, ai: { ...v, times: times.slice() }, flags, notes, raw: m.raw_text || '', form: m.form || '', pattern: m.dose_pattern || '', confidence: m.confidence || 'low' });
      return row;
    });
    state.meds = state.meds.concat(added);
    renderMeds(); updateReadLabel('rx');
    return added.length;
  }
  function updateReadLabel(kind) {
    const n = state.pages[kind].length;
    const base = kind === 'rx' ? (state.meds.length ? '✨ Read & Add to Medicines' : '✨ Read & Fill Medicines') : '✨ Read & Fill Guest Details';
    $(kind + '-read').textContent = base + (n > 1 ? ` (${n} pages)` : '');
    const fresh = $('rx-fresh'); if (fresh) fresh.hidden = !state.meds.length;
  }

  // ---------- spelling check against Pharmacy list ----------
  function baseName(name) {
    return String(name || '').toLowerCase()
      .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syr|syrup|susp|suspension|inj|injection|oint|ointment|cream|gel|drops?|inhaler|rotacaps?|sachet|tablets?)\b\.?/g, ' ')
      .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%|units?)?/g, ' ')
      .replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  function pharmacyMatch(name) {
    const b = baseName(name); if (!b || !state.pharmacy.length) return null;
    let best = null;
    for (const it of state.pharmacy) {
      if (it.base === b) return { kind: 'exact', item: it };
      const first = it.base.split(' ')[0], bFirst = b.split(' ')[0];
      const d = Math.min(lev(b, it.base), first.length >= 4 ? lev(bFirst, first) + (b === bFirst ? 0 : 1) : 99);
      const ratio = 1 - d / Math.max(b.length, it.base.length);
      if (!best || ratio > best.ratio) best = { ratio, item: it };
    }
    return best && best.ratio >= 0.72 ? { kind: 'near', item: best.item } : { kind: 'none' };
  }

  // ---------- render medicines ----------
  function field(row, key, control, extraClass) {
    const flagged = row.flags.has(key) && !row.verified;
    const edited = row.edited.has(key);
    return el('div', { class: `f f-${key}${flagged ? ' flag' : ''}${edited ? ' edited' : ''}${extraClass ? ' ' + extraClass : ''}` },
      el('label', { text: RX_LABEL[key] }), control,
      row.notes[key] && !row.verified ? el('small', { class: 'fnote', text: row.notes[key] }) : null);
  }
  function setVal(row, key, value) {
    row.v[key] = value;
    const aiVal = row.ai ? (key === 'times' ? (row.ai.times || []).join(',') : String(row.ai[key] ?? '')) : null;
    const nowVal = key === 'times' ? (value || []).join(',') : String(value ?? '');
    if (row.ai && aiVal !== nowVal) row.edited.add(key); else row.edited.delete(key);
    row.flags.delete(key); delete row.notes[key];
    row.verified = false;
  }
  function input(row, key, type) {
    return el('input', { 'data-k': key, type: type || 'text', value: row.v[key] || '', list: key === 'prescribed_by_doctor' ? 'doctor-list' : null, autocomplete: key === 'prescribed_by_doctor' ? 'off' : null, inputmode: key === 'strength_amount' || key === 'custom_duration_days' ? 'decimal' : null,
      oninput: (e) => { setVal(row, key, e.target.value); refreshRowState(row); } ,
      onchange: () => renderMeds() });
  }
  function select(row, key, list, allowBlank) {
    const s = el('select', { 'data-k': key, onchange: (e) => { const prev = row.v[key]; setVal(row, key, e.target.value); if (key === 'frequency') { const t = timesFor(e.target.value, '', row.v.food_instruction); if (t.length || ['SOS / PRN', 'STAT'].includes(e.target.value)) setVal(row, 'times', t); } if (key === 'food_instruction') { const was = timesFor(row.v.frequency, row.pattern, prev).join(','); if ((row.v.times || []).join(',') === was) setVal(row, 'times', timesFor(row.v.frequency, row.pattern, e.target.value)); } renderMeds(); } },
      allowBlank ? el('option', { value: '', text: '—' }) : null,
      list.map((o) => el('option', { value: o, text: o, selected: row.v[key] === o })));
    return s;
  }
  function timesControl(row) {
    const wrap = el('div', { class: 'times' });
    const chosen = new Set(row.v.times || []);
    const shown = HOURS.filter((h) => chosen.has(h) || ['07:00', '08:00', '09:00', '12:00', '13:00', '14:00', '19:00', '20:00', '21:00', '22:00'].includes(h));
    for (const h of shown) wrap.append(el('button', { type: 'button', class: 'chip' + (chosen.has(h) ? ' on' : ''), text: hourLabel(h),
      onclick: () => { const next = new Set(row.v.times || []); next.has(h) ? next.delete(h) : next.add(h); setVal(row, 'times', [...next].sort()); renderMeds(); } }));
    const more = el('select', { class: 'more', 'aria-label': 'Add another time', onchange: (e) => { if (!e.target.value) return; const next = new Set(row.v.times || []); next.add(e.target.value); setVal(row, 'times', [...next].sort()); renderMeds(); } },
      el('option', { value: '', text: '+ other time' }), HOURS.filter((h) => !shown.includes(h)).map((h) => el('option', { value: h, text: hourLabel(h) })));
    wrap.append(more);
    return wrap;
  }
  function hourLabel(h) { const n = Number(h.slice(0, 2)); return `${n === 0 ? 12 : n > 12 ? n - 12 : n} ${n < 12 ? 'AM' : 'PM'}`; }
  function rowProblems(row) {
    const p = [];
    if (!String(row.v.prescribed_by_doctor).trim()) p.push('Prescribed Doctor');
    if (!String(row.v.medicine_name).trim()) p.push('Medicine');
    if (!row.v.variable_dose && (!String(row.v.strength_amount).trim() || !row.v.strength_unit)) p.push('Strength (number and unit) — or tick “Dose varies”');
    if (!(row.v.times || []).length && !['SOS / PRN', 'STAT'].includes(row.v.frequency)) p.push('Time');
    if (row.v.duration === 'Custom' && !String(row.v.custom_duration_days).trim()) p.push('Custom days');
    return p;
  }
  function refreshRowState(row) {
    const card = document.querySelector(`[data-row="${row.id}"]`); if (!card) return;
    card.classList.toggle('verified', row.verified);
  }
  function doctorList() {
    const names = [...new Set([...state.groups.map((g) => g.doctor), ...state.meds.map((r) => r.v.prescribed_by_doctor)].map((x) => String(x || '').trim()).filter(Boolean))];
    return el('datalist', { id: 'doctor-list' }, names.map((n) => el('option', { value: n })));
  }
  function applyGroupDoctor(g, value) {
    const old = g.doctor || '';
    g.doctor = value;
    // Fill every medicine of this prescription, except rows the user has moved to another doctor.
    for (const row of state.meds) if (row.group === g.key && (!String(row.v.prescribed_by_doctor || '').trim() || row.v.prescribed_by_doctor === old)) {
      // A name that was simply not printed is not an AI mistake: don't count it as "corrected" in the Trial score.
      if (row.ai && !String(row.ai.prescribed_by_doctor || '').trim()) row.ai.prescribed_by_doctor = value;
      setVal(row, 'prescribed_by_doctor', value);
    }
  }
  function groupPanel() {
    if (!state.groups.length) return null;
    const multi = state.groups.length > 1;
    return el('div', { class: 'groups' },
      el('b', { text: multi ? `${state.groups.length} prescriptions found — enter each doctor once:` : 'Prescribed Doctor — enter once for all medicines:' }),
      state.groups.map((g, i) => {
        const n = state.meds.filter((r) => r.group === g.key).length;
        const pages = [...g.pages].sort((a, b) => a - b);
        const inp = el('input', { type: 'text', value: g.doctor || '', list: 'doctor-list', autocomplete: 'off', placeholder: 'Doctor’s name (e.g. Dr. Maneesha)', 'data-group': g.key,
          onchange: (e) => { applyGroupDoctor(g, e.target.value.trim()); renderMeds(); } });
        return el('div', { class: 'group' + (g.doctor ? '' : ' flag') },
          el('span', { class: 'gname', text: `${multi ? 'Prescription ' + (i + 1) : 'All'}${pages.length ? ' · page ' + pages.join(', ') : ''} · ${n} medicine${n === 1 ? '' : 's'}${multi && g.date ? ' · ' + g.date : ''}` }),
          inp,
          !g.doctor ? el('small', { class: 'fnote', text: 'Not printed on the prescription — type it once here; it fills every medicine in this group.' }) : null);
      }),
      multi ? el('small', { class: 'hint', text: 'A medicine in the wrong group? Change the doctor in that row — the list offers doctors already entered.' }) : null);
  }
  // Re-render after the browser has moved focus, then put the cursor back where the user went.
  let renderTimer = 0;
  function renderMeds() { clearTimeout(renderTimer); renderTimer = setTimeout(renderMedsNow, 0); }
  function renderMedsNow() {
    const af = document.activeElement, fk = af && af.dataset ? af.dataset.k : '', fr = af && af.closest ? (af.closest('[data-row]') || {}).dataset : null;
    const fRow = fr ? fr.row : '';
    drawMeds();
    if (fk && fRow) { const n = document.querySelector(`[data-row="${fRow}"] [data-k="${fk}"]`); if (n) { n.focus(); if (n.setSelectionRange && n.type === 'text') { const L = n.value.length; try { n.setSelectionRange(L, L); } catch (_) {} } } }
  }
  function drawMeds() {
    const box = clear($('rx-rows'));
    box.append(doctorList());
    const meta = $('rx-meta');
    if (state.rxMeta) {
      meta.hidden = false; clear(meta).append(...[
        groupPanel(),
        state.rxMeta.hospital_or_clinic ? el('div', null, el('b', { text: 'Hospital / Clinic: ' }), state.rxMeta.hospital_or_clinic) : null,
        state.rxMeta.prescription_date ? el('div', null, el('b', { text: 'Prescription date: ' }), state.rxMeta.prescription_date) : null,
        state.rxMeta.patient_name ? el('div', null, el('b', { text: 'Name on prescription: ' }), state.rxMeta.patient_name, el('span', { class: 'hint', text: ' — make sure this is the right Guest' })) : null,
        state.rxMeta.page_quality === 'poor' ? el('div', { class: 'warn', text: 'The pages were hard to read. Check every row very carefully, or take a clearer photo.' }) : null].filter(Boolean));
    } else meta.hidden = true;
    if (!state.meds.length) box.append(el('p', { class: 'empty' }, 'No medicines yet. Upload the prescription and press ', el('b', { text: 'Read & Fill Medicines' }), '.'));
    state.meds.forEach((row, i) => {
      const problems = rowProblems(row);
      const match = state.pharmacyLoaded ? pharmacyMatch(row.v.medicine_name) : null;
      const card = el('div', { class: `med${row.verified ? ' verified' : ''}${row.confidence === 'low' && !row.verified ? ' low' : ''}`, 'data-row': row.id },
        el('div', { class: 'med-head' },
          el('span', { class: 'num', text: String(i + 1) }),
          el('div', { class: 'raw' },
            row.raw ? [el('small', { text: 'As written on prescription' }), el('code', { text: row.raw })] : el('small', { text: row.manual ? 'Added manually' : '' })),
          el('span', { class: `conf c-${row.confidence}`, text: row.verified ? '✓ Verified' : row.manual ? 'Manual' : row.confidence === 'high' ? 'Check' : row.confidence === 'medium' ? 'Check carefully' : 'Hard to read' })),
        el('div', { class: 'grid' },
          field(row, 'prescribed_by_doctor', input(row, 'prescribed_by_doctor'), 'wide'),
          field(row, 'medicine_name', el('div', null, input(row, 'medicine_name'), spellNote(row, match)), 'wide'),
          row.v.variable_dose
            ? field(row, 'strength_amount', el('div', { class: 'varies', text: 'No fixed strength — nurse gives the dose after checking blood sugar, as per the scale / doctor' }), 'wide')
            : [field(row, 'strength_amount', input(row, 'strength_amount')), field(row, 'strength_unit', select(row, 'strength_unit', UNITS, true))],
          field(row, 'frequency', select(row, 'frequency', FREQUENCIES)),
          field(row, 'route', select(row, 'route', ROUTES)),
          field(row, 'times', timesControl(row), 'wide'),
          field(row, 'food_instruction', select(row, 'food_instruction', FOODS)),
          field(row, 'duration', select(row, 'duration', DURATIONS)),
          row.v.duration === 'Custom' ? field(row, 'custom_duration_days', input(row, 'custom_duration_days', 'number')) : null,
          field(row, 'special_instruction', input(row, 'special_instruction'), 'full'),
          field(row, 'variable_dose', el('label', { class: 'check' },
            el('input', { type: 'checkbox', 'data-k': 'variable_dose', checked: row.v.variable_dose ? true : null, onchange: (e) => { setVal(row, 'variable_dose', e.target.checked); if (e.target.checked) { setVal(row, 'strength_amount', ''); if (!row.v.strength_unit && INSULIN_RE.test(row.v.medicine_name)) setVal(row, 'strength_unit', 'units'); } renderMeds(); } }),
            ' Dose varies — given as per blood sugar / doctor’s instruction (no fixed strength, e.g. sliding-scale insulin). Write the scale in Special instruction.'), 'full')),
        el('div', { class: 'med-actions' },
          problems.length && !row.verified ? el('span', { class: 'missing', text: 'Still needed: ' + problems.join(', ') }) : el('span'),
          el('button', { type: 'button', class: 'btn ghost danger', text: 'Remove', onclick: () => { if (row.verified || confirm('Remove this medicine row?')) { if (!row.manual) row.removed = true; state.removedAi = (state.removedAi || 0) + (row.manual ? 0 : 1); state.meds = state.meds.filter((r) => r !== row); renderMeds(); } } }),
          row.verified
            ? el('button', { type: 'button', class: 'btn secondary', text: 'Undo verify', onclick: () => { row.verified = false; renderMeds(); } })
            : el('button', { type: 'button', class: 'btn primary', text: '✓ Verified', disabled: problems.length ? true : null, title: problems.length ? 'Complete the missing fields first' : 'I have checked this row against the prescription', onclick: () => { row.verified = true; renderMeds(); } })));
      box.append(card);
    });
    $('rx-count').textContent = state.meds.length ? `(${state.meds.filter((r) => r.verified).length} of ${state.meds.length} verified)` : '';
    const notes = $('rx-notes');
    if (state.rxNotes.length) { notes.hidden = false; clear(notes).append(el('b', { text: 'Also on the prescription (not added as medicines): ' }), el('ul', null, state.rxNotes.map((n) => el('li', { text: n })))); } else notes.hidden = true;
    renderRxSummary();
  }
  function spellNote(row, match) {
    if (!state.pharmacyLoaded || !row.v.medicine_name.trim() || !match) return null;
    if (match.kind === 'exact') return el('small', { class: 'spell ok', text: `✓ In Pharmacy list: ${match.item.item_name}${match.item.item_code ? ' (' + match.item.item_code + ')' : ''}` });
    if (match.kind === 'near') return el('small', { class: 'spell near' }, `Did you mean ${match.item.item_name}? `,
      el('button', { type: 'button', class: 'link', text: 'Use this name', onclick: () => { setVal(row, 'medicine_name', match.item.item_name.replace(/\s+\d.*$/, '').trim() || match.item.item_name); renderMeds(); } }));
    return el('small', { class: 'spell none', text: 'Not in Samara Pharmacy list (fine if the family brings it — just check the spelling).' });
  }
  function renderRxSummary() {
    const box = $('rx-summary');
    if (!state.meds.length) { box.hidden = true; return; }
    const done = state.meds.every((r) => r.verified);
    box.hidden = false; clear(box);
    if (!done) { box.className = 'summary'; box.append(el('span', { text: `${state.meds.filter((r) => !r.verified).length} row(s) still to verify. In the live ERP, admission cannot be saved until every auto-filled row is verified.` })); return; }
    box.className = 'summary done';
    box.append(el('span', { text: `All ${state.meds.length} medicines verified ✓ — in the live ERP these rows would now be in Section 3 of the Admission form, ready to save.` }),
      el('button', { type: 'button', class: 'btn primary', text: 'Record result in Trial score', onclick: recordRxScore }));
  }
  function recordRxScore() {
    let total = 0, correct = 0, missed = 0;
    const wrong = {};
    for (const r of state.meds) {
      if (r.manual) { missed++; continue; }
      for (const k of RX_FIELDS) {
        if (k === 'custom_duration_days' && r.v.duration !== 'Custom' && !(r.ai && r.ai.duration === 'Custom')) continue;
        total++;
        if (r.edited.has(k)) wrong[k] = (wrong[k] || 0) + 1; else correct++;
      }
    }
    state.scores.push({ kind: 'Prescription', label: state.rxMeta?.doctor_name || 'Prescription', rows: state.meds.length, total, correct, missed, extra: state.removedAi || 0, wrong, at: new Date() });
    state.removedAi = 0;
    alert('Recorded in Trial score. You can clear the pages and try the next prescription.');
    renderScore();
  }

  // ---------- ID card ----------
  function applyId(r) {
    const flags = new Set((r.unclear_fields || []).map(String));
    const v = {};
    for (const [k] of ID_FIELDS) v[k] = r[k] || '';
    if (!v.date_of_birth && r.year_of_birth) { v.date_of_birth = ''; v.year_of_birth = r.year_of_birth; }
    if (!v.country && /aadhaar|pan|voter|driving/i.test(v.document_type)) v.country = 'India';
    for (const [k] of ID_FIELDS) if (!v[k] && ['full_name', 'gender', 'date_of_birth', 'district', 'state', 'pincode'].includes(k)) flags.add(k);
    state.idData = { v, ai: { ...v }, flags, edited: new Set(), verified: false, yob: r.year_of_birth || '' };
    renderId();
  }
  function ageFrom(v, yob) {
    const m = String(v || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
    const now = new Date();
    if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); if (isNaN(d)) return ''; let a = now.getFullYear() - d.getFullYear(); if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--; return a >= 0 && a < 130 ? String(a) : ''; }
    if (/^\d{4}$/.test(String(yob || ''))) return `about ${now.getFullYear() - Number(yob)} (year of birth only)`;
    return '';
  }
  function renderId() {
    const box = clear($('id-form'));
    const d = state.idData; if (!d) return;
    const grid = el('div', { class: `grid id-grid${d.verified ? ' verified' : ''}` });
    for (const [k, label] of ID_FIELDS) {
      let control;
      const onChange = (val) => { d.v[k] = val; if (String(d.ai[k] || '') !== String(val)) d.edited.add(k); else d.edited.delete(k); d.flags.delete(k); d.verified = false; };
      if (k === 'relation_type') control = el('select', { onchange: (e) => { onChange(e.target.value); renderId(); } }, RELATIONS.map((o) => el('option', { value: o, text: o || '—', selected: d.v[k] === o })));
      else if (k === 'gender') control = el('select', { onchange: (e) => { onChange(e.target.value); renderId(); } }, GENDERS.map((o) => el('option', { value: o, text: o || '—', selected: d.v[k] === o })));
      else control = el('input', { type: 'text', value: d.v[k] || '', maxlength: k === 'id_last4' ? '4' : k === 'pincode' ? '6' : null, inputmode: k === 'pincode' || k === 'id_last4' ? 'numeric' : null,
        placeholder: k === 'date_of_birth' && d.yob ? `Only year printed: ${d.yob}` : null,
        oninput: (e) => { let val = e.target.value; if (k === 'id_last4') { val = val.replace(/[^0-9A-Za-z]/g, '').slice(-4); e.target.value = val; } onChange(val); },
        onchange: () => renderId() });
      const flagged = d.flags.has(k) && !d.verified;
      grid.append(el('div', { class: `f${flagged ? ' flag' : ''}${d.edited.has(k) ? ' edited' : ''}${k === 'full_name' ? ' wide' : ''}` }, el('label', { text: label }), control,
        k === 'date_of_birth' ? el('small', { class: 'fnote ok', text: ageFrom(d.v.date_of_birth, d.yob) ? `Age: ${ageFrom(d.v.date_of_birth, d.yob)}` : '' }) : null,
        k === 'id_last4' ? el('small', { class: 'fnote', text: 'Full ID numbers are never read or stored — the card image itself is the proof.' }) : null));
    }
    box.append(grid,
      el('p', { class: 'hint', text: 'In the live ERP, District / Taluk are chosen from the dropdown lists — the values read here would be matched to those lists.' }),
      el('div', { class: 'med-actions' },
        el('span', { class: d.verified ? 'ok-text' : 'missing', text: d.verified ? '✓ Guest details verified' : 'Check each field against the ID card.' }),
        d.verified
          ? el('button', { type: 'button', class: 'btn primary', text: 'Record result in Trial score', onclick: recordIdScore })
          : el('button', { type: 'button', class: 'btn primary', text: '✓ Verified', disabled: !String(d.v.full_name).trim() ? true : null, onclick: () => { d.verified = true; renderId(); } })));
  }
  function recordIdScore() {
    const d = state.idData; let total = 0, correct = 0; const wrong = {};
    for (const [k] of ID_FIELDS) { if (!String(d.ai[k] || '') && !String(d.v[k] || '')) continue; total++; if (d.edited.has(k)) wrong[k] = (wrong[k] || 0) + 1; else correct++; }
    state.scores.push({ kind: 'ID card', label: d.v.document_type || 'ID', rows: 1, total, correct, missed: 0, extra: 0, wrong, at: new Date() });
    alert('Recorded in Trial score.');
    renderScore();
  }

  // ---------- score ----------
  function renderScore() {
    const box = clear($('score-body'));
    if (!state.scores.length) { box.append(el('p', { class: 'empty', text: 'No results recorded yet. After verifying a prescription or ID card, press “Record result in Trial score”.' })); return; }
    const sum = (k, f) => state.scores.filter(f || (() => true)).reduce((a, s) => a + s[k], 0);
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const rxF = (s) => s.kind === 'Prescription', idF = (s) => s.kind === 'ID card';
    box.append(el('div', { class: 'stats' },
      stat('Prescriptions tried', String(state.scores.filter(rxF).length)),
      stat('Medicine fields correct', `${pct(sum('correct', rxF), sum('total', rxF))}%`, `${sum('correct', rxF)} of ${sum('total', rxF)}`),
      stat('Medicines missed by AI', String(sum('missed', rxF)), 'added manually'),
      stat('Wrong extra rows', String(sum('extra', rxF)), 'removed'),
      stat('ID cards tried', String(state.scores.filter(idF).length)),
      stat('ID fields correct', `${pct(sum('correct', idF), sum('total', idF))}%`, `${sum('correct', idF)} of ${sum('total', idF)}`)));
    const wrongAll = {};
    state.scores.forEach((s) => Object.entries(s.wrong).forEach(([k, n]) => { wrongAll[k] = (wrongAll[k] || 0) + n; }));
    const top = Object.entries(wrongAll).sort((a, b) => b[1] - a[1]);
    if (top.length) box.append(el('h3', { text: 'Fields corrected most often' }), el('ul', null, top.map(([k, n]) => el('li', { text: `${RX_LABEL[k] || (ID_FIELDS.find((f) => f[0] === k) || [k, k])[1]}: ${n}` }))));
    box.append(el('h3', { text: 'Each scan' }), el('div', { class: 'table-wrap' }, el('table', null,
      el('thead', null, el('tr', null, ['Time', 'Type', 'Source', 'Rows', 'Fields correct', 'Missed', 'Extra'].map((t) => el('th', { text: t })))),
      el('tbody', null, state.scores.map((s) => el('tr', null,
        el('td', { text: s.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }), el('td', { text: s.kind }), el('td', { text: s.label }),
        el('td', { text: String(s.rows) }), el('td', { text: `${s.correct} / ${s.total} (${pct(s.correct, s.total)}%)` }), el('td', { text: String(s.missed) }), el('td', { text: String(s.extra) })))))));
  }
  function stat(label, value, sub) { return el('div', { class: 'stat' }, el('span', { text: label }), el('strong', { text: value }), sub ? el('small', { text: sub }) : null); }

  document.addEventListener('DOMContentLoaded', () => { start().catch((e) => { console.error(e); gate('Something went wrong while opening Scan Lab. Please refresh.', true); }); });
})();
