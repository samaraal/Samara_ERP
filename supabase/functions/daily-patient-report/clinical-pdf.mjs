// Samara Care ERP 2.18.142 — Daily (2-page) and Weekly (3-page) Clinical Report PDFs.
// Layout follows the approved previews (25-10-2026). pdf-lib is passed in so Deno and Node tests share this file.
import { fmtDT, fmtDM, fmtDate, fmtHM, fmtTime, isoOf, addDays, at, txt, rangeText } from './clinical-core.mjs';

const W = 595.28, H = 841.89, M = 28.35, BOTTOM = 50;
const SAMARA_ADDRESS = ['RBK VILLA, No. 23-A, Reddipalayam Road,', 'Jeswant Nagar Phase 1, Mogappair West,', 'Chennai 600037', 'Ph: +91 99767 35577 | +91 73959 61616'];
const SAMARA_WEB = 'samaraassistedliving.com', SAMARA_WEB_URL = 'https://samaraassistedliving.com/';
// Standard PDF fonts are WinAnsi: keep its printable set, map the rest.
const OK = new Set('°–—•×‘’“”·'.split(''));
export function S(v) {
  return String(v ?? '').replace(/[  ]/g, ' ').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, 'to').replace(/₂/g, '2').replace(/✕/g, 'x').replace(/₹/g, 'INR ').replace(/−/g, '-').replace(/[‐‑‒]/g, '-')
    .split('').map(c => (c >= ' ' && c <= '~') || OK.has(c) ? c : (c === '\n' ? ' ' : '?')).join('').replace(/\s+/g, ' ').trim();
}

export async function renderReport(lib, m, assets = {}) {
  const { PDFDocument, StandardFonts, rgb, PDFName, PDFString } = lib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(S(`${m.patient.name} - ${m.kind === 'daily' ? 'Daily' : 'Weekly'} Clinical Report`)); pdf.setAuthor('Samara Assisted Living'); pdf.setCreator('Samara Care ERP');
  const F = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold), i: await pdf.embedFont(StandardFonts.HelveticaOblique) };
  const C = { mag: rgb(.722, .02, .341), deep: rgb(.30, .06, .19), ink: rgb(.17, .10, .14), grey: rgb(.45, .38, .42), line: rgb(.94, .77, .84), head: rgb(.984, .898, .933), pale: rgb(.992, .945, .965), attn: rgb(1, .961, .973), red: rgb(.69, .063, .122), amb: rgb(.60, .33, 0), green: rgb(.03, .44, .25), blue: rgb(.165, .435, .69), rose: rgb(.81, .25, .47), purple: rgb(.42, .18, .63), band: rgb(.914, .965, .937), band2: rgb(.933, .953, .984), white: rgb(1, 1, 1), nr: rgb(.56, .50, .53) };
  let logo = null; try { if (assets.logoJpg) logo = await pdf.embedJpg(assets.logoJpg); } catch { logo = null; }
  const title = m.kind === 'daily' ? 'Daily Clinical Report' : 'Weekly Clinical Report';
  const endLabel = d => (fmtTime(d) === '12:00 AM' && d.getTime() !== m.period.from.getTime()) ? `${fmtDate(isoOf(new Date(d.getTime() - 60000)))}, 11:59 PM` : fmtDT(d);
  const periodLine = `${fmtDT(m.period.from)} to ${endLabel(m.period.to)}`;
  let page, y; const pages = [];
  const T = (s, x, yy, size, f = F.r, color = C.ink) => { const t = S(s); if (t) page.drawText(t, { x, y: H - yy, size, font: f, color }); };
  const tw = (s, size, f = F.r) => f.widthOfTextAtSize(S(s), size);
  const wrap = (s, size, max, f = F.r) => { const words = S(s).split(' ').filter(Boolean), out = []; let line = ''; for (const w of words) { const nx = line ? `${line} ${w}` : w; if (tw(nx, size, f) <= max) line = nx; else { if (line) out.push(line); if (tw(w, size, f) > max) { let cut = w; while (cut.length > 1 && tw(cut, size, f) > max) cut = cut.slice(0, -1); out.push(cut); line = w.slice(cut.length); } else line = w; } } if (line) out.push(line); return out.length ? out : ['']; };
  const rect = (x, yy, w, h, o) => page.drawRectangle({ x, y: H - yy - h, width: w, height: h, ...o });
  const hline = (x1, x2, yy, th = .5, color = C.line, dash) => page.drawLine({ start: { x: x1, y: H - yy }, end: { x: x2, y: H - yy }, thickness: th, color, ...(dash ? { dashArray: dash } : {}) });
  const vline = (x, y1, y2, th = .5, color = C.line, dash) => page.drawLine({ start: { x, y: H - y1 }, end: { x, y: H - y2 }, thickness: th, color, ...(dash ? { dashArray: dash } : {}) });
  const newPage = (cont = true) => { page = pdf.addPage([W, H]); pages.push(page); rect(0, 0, W, 4.3, { color: C.mag }); y = 14; if (cont) { T(pages.length === 2 && m.kind === 'weekly' ? 'Graphical trends' : 'Supporting clinical records', M, y + 14, 9.4, F.b, C.mag); const r = `${m.patient.name} · ${m.patient.id} · Room ${m.patient.room} · ${m.kind === 'weekly' ? (m.weekLabel ? m.weekLabel + ' · ' : '') : ''}${fmtDate(isoOf(m.trend.from))} to ${fmtDate(isoOf(new Date(m.trend.to.getTime() - 1)))}`; T(r, W - M - tw(r, 7), y + 14, 7, F.r, C.grey); hline(M, W - M, y + 20, 1, C.line); y += 28; } };
  const need = h => { if (y + h > H - BOTTOM) newPage(true); };

  // ---------- header (page 1) ----------
  newPage(false);
  const logoW = 78, logoTop = 17; let logoH = 42.6;
  if (logo) { logoH = logoW * logo.height / logo.width; page.drawImage(logo, { x: M, y: H - logoTop - logoH, width: logoW, height: logoH }); } else { T('Samara', M + 8, logoTop + 26, 22, F.b, C.mag); T('assisted living', M + 14, logoTop + 38, 8, F.r, C.mag); }
  const cne = 'CENTRE FOR NURSING EXCELLENCE'; T(cne, M + logoW / 2 - tw(cne, 4.7, F.b) / 2, logoTop + logoH + 6, 4.7, F.b, C.mag);
  T(title, W / 2 - tw(title, 12.5, F.b) / 2, 40, 12.5, F.b, C.mag);
  const dr = m.doctor, sub = '(Treating Doctor)', sp = 4.5, dw = tw(dr, 9, F.b) + sp + tw(sub, 6.6); T(dr, W / 2 - dw / 2, 54, 9, F.b, C.deep); T(sub, W / 2 - dw / 2 + tw(dr, 9, F.b) + sp, 54, 6.6, F.r, C.grey);
  const ax = W - M; T('Samara Assisted Living', ax - tw('Samara Assisted Living', 6.8, F.b), 22, 6.8, F.b, C.mag);
  SAMARA_ADDRESS.forEach((l, i) => T(l, ax - tw(l, 6), 31 + i * 8.3, 6, F.r, C.grey));
  { const wy = 31 + SAMARA_ADDRESS.length * 8.3, ww = tw(SAMARA_WEB, 6.2, F.b); T(SAMARA_WEB, ax - ww, wy, 6.2, F.b, C.mag); const gx = ax - ww - 5.5, gy = H - wy + 2.1, r = 2.8; page.drawCircle({ x: gx, y: gy, size: r, borderColor: C.mag, borderWidth: .5 }); page.drawEllipse({ x: gx, y: gy, xScale: r * .45, yScale: r, borderColor: C.mag, borderWidth: .4 }); page.drawLine({ start: { x: gx - r, y: gy }, end: { x: gx + r, y: gy }, thickness: .4, color: C.mag });
    try { const ctx = pdf.context, link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [gx - r - 1, H - wy - 2, ax, H - wy + 7], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(SAMARA_WEB_URL) } })); page.node.set(PDFName.of('Annots'), ctx.obj([link])); } catch { /* optional */ } }
  y = 86; hline(M, W - M, y, 1.2, C.line); y += 5;
  // patient bar
  const cells = [['Patient', m.patient.name, true], ['Age / Sex', m.patient.ageSex], ['Room', m.patient.room], ['Patient ID', m.patient.id], ['Admitted', m.patient.admittedDate],
    m.kind === 'daily' ? ['Reporting period (24 h)', periodLine.replace(' to ', ' to '), true] : [m.final ? 'Report period (final, to discharge)' : 'Report period', `${m.weekLabel ? m.weekLabel + ' · ' : ''}${periodLine}`, true]];
  if (m.kind === 'daily' && m.sinceAdmission) cells[5][0] = 'Reporting period (since admission)';
  const vs = 7.4; let widths = cells.map(([l, v, b]) => Math.max(tw(l.toUpperCase(), 5.4), tw(v, vs, b ? F.b : F.r)));
  let total = widths.reduce((a, b) => a + b, 0), gap = (W - 2 * M - 14 - total) / (cells.length - 1);
  let vsz = vs; if (gap < 6) { vsz = 6.6; widths = cells.map(([l, v, b]) => Math.max(tw(l.toUpperCase(), 5.4), tw(v, vsz, b ? F.b : F.r))); total = widths.reduce((a, b) => a + b, 0); gap = Math.max(4, (W - 2 * M - 14 - total) / (cells.length - 1)); }
  rect(M, y, W - 2 * M, 24, { color: C.pale, borderColor: C.line, borderWidth: .6 });
  let cx = M + 7; cells.forEach(([l, v, b], i) => { T(l.toUpperCase(), cx, y + 8.5, 5.4, F.r, C.grey); T(v, cx, y + 18.5, vsz, b ? F.b : F.r, b ? C.deep : C.ink); cx += widths[i] + gap; });
  y += 30;

  // ---------- building blocks ----------
  const h2 = (t, right = '', minBody = 30) => { need(18 + minBody); y += 6; T(t.toUpperCase(), M, y + 8, 8.2, F.b, C.mag); if (right) { const rw = Math.min(tw(right, 6.2), W - 2 * M - tw(t.toUpperCase(), 8.2, F.b) - 10); const rl = wrap(right, 6.2, rw + 1)[0]; T(rl, W - M - tw(rl, 6.2), y + 8, 6.2, F.r, C.grey); } hline(M, W - M, y + 11, 1, C.mag); y += 16; };
  const kv = (rows, lw = 88, size = 8.1, x0 = M, width = W - 2 * M, dry = false) => { let yy = 0; const lh = size + 2.6; for (const [k, v] of rows) { const nr = /^(not recorded|not documented)/i.test(S(v)) || k === 'Not documented'; const ll = wrap(k, size, lw - 6, F.b), vl = wrap(v, size, width - lw, nr ? F.i : F.r); const hh = Math.max(ll.length, vl.length) * lh + 1.6; if (!dry) { if (x0 === M) need(hh); ll.forEach((l, i) => T(l, x0, y + yy + size + i * lh, size, F.b, C.deep)); vl.forEach((l, i) => T(l, x0 + lw, y + yy + size + i * lh, size, nr ? F.i : F.r, nr ? C.nr : C.ink)); } yy += hh; if (x0 === M && !dry) { y += hh; yy = 0; } } return yy; };
  const bullets = (items, size = 8.1) => { const lh = size + 2.6; for (const it of items) { const lead = it.t ? `${it.t}: ` : ''; const first = wrap(`${lead}${it.b}`, size, W - 2 * M - 12); need(first.length * lh + 2); page.drawCircle({ x: M + 4, y: H - (y + size - 2.6), size: 1.2, color: C.ink }); first.forEach((l, i) => { const ld = S(lead); if (i === 0 && ld && l.startsWith(ld)) { T(ld, M + 11, y + size, size, F.b, C.ink); T(l.slice(ld.length), M + 11 + tw(ld, size, F.b) + F.r.widthOfTextAtSize(' ', size), y + size, size, F.r, C.ink); } else T(l, M + 11, y + size + i * lh, size, F.r, C.ink); }); y += first.length * lh + 2; } };
  const legend = (s, size = 6.3, f = F.r, color = C.grey) => { if (!s) return; const ls = wrap(s, size, W - 2 * M - 2, f); need(ls.length * (size + 2) + 2); ls.forEach(l => { T(l, M + 1, y + size + 1, size, f, color); y += size + 2; }); y += 1.5; };
  const table = (cols, rows, size = 7.3, x0 = M, width = W - 2 * M, cont = true) => {
    const tot = cols.reduce((a, c) => a + c.w, 0), ws = cols.map(c => c.w / tot * width), lh = size + 2;
    const head = () => { const hl = cols.map((c, i) => wrap(c.h, size - .5, ws[i] - 5, F.b)); const hh = Math.max(...hl.map(l => l.length)) * (size + 1.6) + 4; need(hh + lh + 4); rect(x0, y, width, hh, { color: C.head }); let x = x0; hl.forEach((ls, i) => { ls.forEach((l, j) => { const lw = tw(l, size - .5, F.b); const tx = cols[i].a === 'c' ? x + ws[i] / 2 - lw / 2 : cols[i].a === 'r' ? x + ws[i] - 3 - lw : x + 3; T(l, tx, y + hh - 3 - (ls.length - 1 - j) * (size + 1.6), size - .5, F.b, C.deep); }); x += ws[i]; }); y += hh; };
    head();
    for (const row of rows) {
      if (row && row.span) { const ls = wrap(row.span, size - .4, width - 8, F.r); const hh = ls.length * lh + 2; if (y + hh > H - BOTTOM) { newPage(true); head(); } ls.forEach((l, i) => T(l, x0 + 4, y + size + i * lh, size - .4, F.r, C.grey)); y += hh; hline(x0, x0 + width, y, .4); continue; }
      const cells = row.map((c, i) => { const o = typeof c === 'object' && c !== null ? c : { t: c }; const f = o.b ? F.b : o.i ? F.i : F.r; return { ...o, f, lines: wrap(o.t ?? '-', size, ws[i] - 5, f) }; });
      const hh = Math.max(...cells.map(c => c.lines.length)) * lh + 2.2;
      if (y + hh > H - BOTTOM) { newPage(true); head(); }
      let x = x0; cells.forEach((c, i) => { c.lines.forEach((l, j) => { const lw = tw(l, size, c.f); const tx = cols[i].a === 'c' ? x + ws[i] / 2 - lw / 2 : cols[i].a === 'r' ? x + ws[i] - 3 - lw : x + 3; T(l, tx, y + size + .8 + j * lh, size, c.f, c.c || C.ink); }); x += ws[i]; });
      y += hh; hline(x0, x0 + width, y, .4);
    }
    y += 3;
  };
  const attnBox = items => {
    if (!items.length) { kv([['', 'No specific matter identified from the records.']]); return; }
    const size = 8, lh = size + 2.6, inner = W - 2 * M - 26;
    const blocks = items.map((a, i) => { const main = wrap(`${a.t}. ${a.b}`, size, inner); const ask = a.ask ? wrap(a.askLine || a.ask, size, inner, F.i) : []; const src = a.src ? wrap(`[${a.src}]`, 6, inner) : []; return { a, i, main, ask, src, h: main.length * lh + ask.length * lh + src.length * 8 + 4 }; });
    const total = blocks.reduce((s, b) => s + b.h, 0) + 10; need(Math.min(total, 300));
    let top = y; rect(M, top, W - 2 * M, total, { color: C.attn, borderColor: C.mag, borderWidth: 1 });
    y += 6; blocks.forEach(b => { T(`${b.i + 1}.`, M + 8, y + size, size, F.b, C.ink); b.main.forEach((l, j) => { if (j === 0) { const tt = S(`${b.a.t}.`); if (l.startsWith(tt)) { T(tt, M + 20, y + size, size, F.b, C.ink); T(l.slice(tt.length), M + 20 + tw(tt, size, F.b) + F.r.widthOfTextAtSize(' ', size), y + size, size, F.r, C.ink); } else T(l, M + 20, y + size, size, F.b, C.ink); } else T(l, M + 20, y + size + j * lh, size, F.r, C.ink); }); y += b.main.length * lh; b.ask.forEach(l => { T(l, M + 20, y + size, size, F.i, C.deep); y += lh; }); b.src.forEach(l => { T(l, M + 20, y + 6, 6, F.r, C.grey); y += 8; }); y += 4; });
    y = top + total + 3;
  };
  const replyBox = (x0 = M, width = W - 2 * M) => { const ls = wrap(`Respected Doctor, we would be grateful for any instructions you may wish to give for ${m.patient.name}. Kindly reply on this WhatsApp chat at your convenience; your message will reach our nursing team promptly. Thank you for your guidance. - Samara Assisted Living`, 7.3, width - 16); const hh = ls.length * 9.6 + 22; need(hh); rect(x0, y, width, hh, { color: rgb(1, .988, .992), borderColor: C.mag, borderWidth: .9, borderDashArray: [3, 2] }); hline(x0 + 8, x0 + width - 8, y + 9, .4, C.line); ls.forEach((l, i) => T(l, x0 + 8, y + 20 + i * 9.6, 7.3, F.r, C.deep)); y += hh + 3; };
  const aiNote = () => legend(`Sections B-D: ${m.aiUsed ? `AI-assisted (${m.aiModel || 'Gemini'}, OpenAI fallback) from Samara records only` : 'prepared from Samara records by fixed rules (AI wording not used for this report)'}. Counts, totals, dates and charts are calculated directly from the records. Observations of recorded data, not a diagnosis or a recommendation; all treatment decisions remain with the treating doctor.`, 6.2, F.i);

  // ---------- page 1 ----------
  h2('A. Diagnosis and clinical background', 'Admission record · prescriptions · uploaded documents');
  const bg = [['Primary diagnosis', m.patient.diagnosis || 'Not recorded']];
  if (m.patient.other) bg.push(['Other conditions', m.patient.other]);
  if (m.background) bg.push(['From documents', m.background]);
  bg.push(['Allergies', m.patient.allergies || 'Not recorded']);
  if (m.discharge) bg.push(['Discharge', `Final discharge recorded: ${m.discharge}`]);
  kv(bg);
  h2(m.kind === 'daily' ? 'B. Clinical status — reporting period' : 'B. Clinical progress over the period', periodLine);
  kv(m.b);
  h2(m.kind === 'daily' ? 'C. Significant changes — background' : 'C. Significant clinical changes', m.kind === 'daily' ? `${fmtDate(isoOf(m.trend.from))} to ${fmtDate(isoOf(new Date(m.trend.to.getTime() - 1)))}` : '');
  if (m.changes.length) bullets(m.changes); else kv([['', 'No significant change identified in the recorded data.']]);
  h2("D. Matters requiring the doctor's attention", 'Identified from Samara records only. Not a diagnosis or a recommendation.');
  attnBox(m.attention);
  aiNote();

  // ---------- supporting pages ----------
  const V = m.vitals;
  if (m.kind === 'weekly') { newPage(true); weeklyCharts(); }
  newPage(true);
  if (m.kind === 'daily') {
    h2('A. Vital signs — trend', `${V.byDay.length} day${V.byDay.length > 1 ? 's' : ''} · NR = not recorded`);
    table([{ h: 'Date', w: 58 }, { h: 'Rec.', w: 26, a: 'c' }, { h: 'BP (mmHg)', w: 120 }, { h: 'Pulse', w: 40, a: 'c' }, { h: 'SpO2 %', w: 38, a: 'c' }, { h: 'Temp °F', w: 48, a: 'c' }, { h: 'RR', w: 32, a: 'c' }, { h: 'Pain', w: 30, a: 'c' }, { h: 'Sugar (mg/dL)', w: 92 }],
      [...V.byDay].reverse().map(d => [{ t: fmtDate(d.date), b: isoOf(new Date(m.period.to.getTime() - 1)) === d.date }, String(d.n || '-'), { t: d.bp.join(', ') || (d.n ? 'NR' : '-'), c: d.bad.bp ? C.red : undefined, b: d.bad.bp }, { t: rangeText(d.pulse) || (d.n ? 'NR' : '-'), c: d.bad.pulse ? C.red : undefined, b: d.bad.pulse }, { t: rangeText(d.spo2) || (d.n ? 'NR' : '-'), c: d.bad.spo2 ? C.red : undefined, b: d.bad.spo2 }, { t: rangeText(d.temp) || (d.n ? 'NR' : '-'), c: d.bad.temp ? C.red : undefined, b: d.bad.temp }, { t: rangeText(d.rr) || (d.n ? 'NR' : '-'), c: d.bad.rr ? C.red : undefined }, { t: d.pain.length ? d.pain.join(', ') : 'NR', i: !d.pain.length, c: d.pain.length ? undefined : C.nr }, { t: d.sugar.length ? d.sugar.map(s => `${s.v}${s.k === 'fasting' ? ' F' : s.k === 'post' ? ' PP' : ''}`).join(', ') : 'NR', i: !d.sugar.length, c: d.bad.sugar ? C.red : d.sugar.length ? undefined : C.nr }]));
    legend(`Red = outside the configured range: BP >= ${m.T.sys[1]}/${m.T.dia[1]} or < ${m.T.sys[0]}/${m.T.dia[0]} · pulse > ${m.T.pulse[1]} or < ${m.T.pulse[0]} · SpO2 < ${m.T.spo2_min}% · temp >= ${m.T.temp[1]} or < ${m.T.temp[0]} °F · RR > ${m.T.rr[1]} or < ${m.T.rr[0]} · glucose: fasting ${m.T.glucose.fasting[0]}-${m.T.glucose.fasting[1]}, post-meal < ${m.T.glucose.post_max}, low < ${m.T.glucose.low} mg/dL${m.T.glucoseGuestSpecific ? ' (Guest-specific targets)' : ' (general targets)'}.${V.missed.length ? ` Scheduled checks not recorded: ${V.missed.slice(0, 8).map(x => `${fmtDM(x.date)} ${fmtHM(x.time)}`).join(', ')}.` : ''}`);
  }
  const L = m.kind === 'daily' ? ['B', 'C', 'D', 'E', 'F'] : ['A', 'B', 'C', 'D'];
  h2(`${L[0]}. Medication administration`, m.kind === 'daily' ? 'trend period · doses counted under the order in force at each time' : 'totals for the period, under the order in force at each time');
  const md = m.meds;
  const mt = md.rows.map(r => [{ t: `${r.name}${r.route ? ` · ${r.route}` : ''}${r.times ? ` · ${r.times}` : ''}`, b: false }, String(r.scheduled), { t: String(r.given), c: r.given === r.scheduled && r.scheduled ? C.green : undefined, b: r.given === r.scheduled && r.scheduled > 0 }, { t: String(r.late), c: r.late ? C.amb : undefined }, { t: String(r.refused), c: r.refused ? C.red : undefined, b: r.refused > 0 }, { t: String(r.withheld), c: r.withheld ? C.red : undefined, b: r.withheld > 0 }, { t: String(r.missed), c: r.missed ? C.red : undefined, b: r.missed > 0 }, { t: String(r.unresolved), c: r.unresolved ? C.amb : undefined, b: r.unresolved > 0 }, { t: [...r.stops.map(s => `${s.note}${s.notDoctor ? ' - order status requires verification' : ''} (${fmtDT(s.at)})`), ...r.exceptions].join('; ').slice(0, 420) || '-', b: r.stops.some(s => s.notDoctor) }]);
  if (mt.length) table([{ h: 'Regular medicine · route · times', w: 150 }, { h: 'Sched.', w: 28, a: 'c' }, { h: 'Given', w: 28, a: 'c' }, { h: 'of which late', w: 30, a: 'c' }, { h: 'Refused', w: 34, a: 'c' }, { h: 'Withheld', w: 36, a: 'c' }, { h: 'Missed / n.a.', w: 34, a: 'c' }, { h: 'Unresolved', w: 42, a: 'c' }, { h: 'Exceptions (recorded reason)', w: 160 }], mt, 7.1);
  else legend('No regular medicine doses were scheduled in this period.', 7, F.i, C.ink);
  if (md.sos.length) legend(`As needed (SOS): ${md.sos.map(s => `${s.name}${s.route ? `, ${s.route}` : ''} - ${s.given} dose${s.given === 1 ? '' : 's'} given${s.times.length ? ` (${s.times.slice(0, 4).map(t => `${fmtDT(t.at)}${t.reason ? `: ${t.reason}` : ''}`).join('; ')})` : ''}${s.stopped ? '; discontinued' : ''}${s.notes.length ? `. ${s.notes.join('; ')}` : ''}`).join(' · ')}.`, 6.6, F.r, C.ink);
  legend('Regular medicines: Given + Refused + Withheld + Missed + Unresolved = Scheduled. "Late" (given 30 min or more after the scheduled time) is part of Given. Unresolved = no administration entry, or a "Delayed" / rescheduled dose with no later entry - not counted as given or missed.');
  h2(`${L[1]}. Physiotherapy and mobility`, `${m.physio.done} of ${m.physio.total} recorded sessions done`);
  const P = m.physio;
  if (P.plans.length) legend(P.plans.map(p => `Prescribed: ${p.therapy} · ${p.frequency || '-'}${p.windows ? ` · windows ${p.windows}` : ''} · ${p.until}${p.advisedBy ? ` · advised by ${p.advisedBy}` : ''}${p.startedOn ? ` · plan from ${p.startedOn}` : ''}. Weight-bearing / precautions: ${p.precautions || 'not documented'}.`).join(' '), 7, F.r, C.ink);
  table([{ h: 'Date', w: 40 }, { h: 'Planned · rec. · done', w: 62 }, { h: 'Within 2 h', w: 42, a: 'c' }, { h: 'Late >= 2 h', w: 42, a: 'c' }, { h: 'Not done', w: 40, a: 'c' }, { h: 'Time done: treatment · tolerance · progress', w: 284 }],
    (m.kind === 'daily' ? [...P.days].reverse() : P.days).map(d => [fmtDM(d.date), `${d.planned || '-'} · ${d.recorded} · ${d.done}`, String(d.within2h), { t: String(d.late2h), c: d.late2h ? C.red : undefined, b: d.late2h > 0 }, { t: String(d.notDone), c: d.notDone ? C.red : undefined, b: d.notDone > 0 }, (P.sessions.filter(x => x.date === d.date).map(x => `${x.done ? x.actual : x.status}${x.delay !== null && x.delay > 120 ? ` (window ${x.window}, +${Math.floor(x.delay / 60)} h${x.delay % 60 ? ` ${x.delay % 60} min` : ''})` : ''}: ${x.notes || 'tolerance not recorded'}`).join(' | ') || (d.planned ? 'No session recorded' : '-')).slice(0, 260)]), 7.1);
  if (m.kind === 'weekly') legend('Planned = sessions per day in the physiotherapy plan. Within 2 h / Late >= 2 h are measured from the end of each session window.');
  if (m.kind === 'daily') {
    h2(`${L[2]}. Intake / output — recorded net fluid balance`, 'chart day 7 AM - 7 AM');
    if (m.io.onChart) { need(92); const yy = y; ioBars(M, yy, (W - 2 * M) * .56, 86); const tx = M + (W - 2 * M) * .56 + 10; y = yy; ioTable(tx, W - M - tx); y = Math.max(y, yy + 88); legend(ioNote()); }
    else legend('Not on the Intake / Output chart.', 7, F.i, C.ink);
  }
  // nursing + doctor side by side (measured first, so the block never splits across pages)
  { const colW = (W - 2 * M - 14) / 2, x2 = M + colW + 14;
    const nursingRows = [['Meals', m.nursing.meals ? `${m.nursing.meals} recorded: ${Object.entries(m.nursing.mealCounts).map(([k, v]) => `${k} ${v}`).join(', ')}` : 'Not recorded'], ['Personal care', m.nursing.care ? `${m.nursing.care} records${Object.keys(m.nursing.careTypes).length ? `: ${Object.entries(m.nursing.careTypes).slice(0, 5).map(([k, v]) => `${k}${v > 1 ? ` (${v}x)` : ''}`).join(', ')}` : ''}` : 'Not recorded'], ['Nursing notes', m.nursing.notes ? `${m.nursing.notes} notes; ${m.nursing.alertNotes} alert` : 'None recorded'], ['Incidents', m.nursing.incidents.length ? m.nursing.incidents.map(i => `${fmtDT(i.at)} ${i.type}`).join('; ') : 'None recorded']];
    const rl = m.reviews.length ? m.reviews.map(r => `${fmtDT(r.at)} - ${r.doctor} (${r.source}): ${[r.note, r.changes.join('; ')].filter(Boolean).join(' · ')}`) : ['No doctor review or instruction recorded in the period.'];
    const rw = rl.map(l => wrap(`• ${l}`, 7.3, colW - 4, m.reviews.length ? F.r : F.i));
    const replyLines = wrap(`Respected Doctor, we would be grateful for any instructions you may wish to give for ${m.patient.name}. Kindly reply on this WhatsApp chat at your convenience; your message will reach our nursing team promptly. Thank you for your guidance. - Samara Assisted Living`, 7.3, colW - 16);
    const leftH = nursingRows.reduce((a, [k, v]) => a + wrap(v, 7.3, colW - 64).length * 9.8 + 1.5, 0), rightH = rw.reduce((a, l) => a + l.length * 9.8, 0) + 4 + replyLines.length * 9.6 + 14;
    need(22 + Math.max(leftH, rightH)); y += 6; const y0 = y;
    const sub = (t, x, w) => { T(t.toUpperCase(), x, y0 + 8, 8.2, F.b, C.mag); hline(x, x + w, y0 + 11, 1, C.mag); };
    sub(`${L[m.kind === 'daily' ? 3 : 2]}. Nursing care`, M, colW); sub(`${L[m.kind === 'daily' ? 4 : 3]}. Doctor's reviews and instructions`, x2, colW);
    y = y0 + 16; kvAt(nursingRows, M, colW, 64, 7.3); const yl = y;
    y = y0 + 16; rw.forEach(ls => ls.forEach(w => { T(w, x2, y + 7.3, 7.3, m.reviews.length ? F.r : F.i, m.reviews.length ? C.ink : C.nr); y += 9.8; }));
    y += 4; const hh = replyLines.length * 9.6 + 10; rect(x2, y, colW, hh, { color: rgb(1, .988, .992), borderColor: C.mag, borderWidth: .9, borderDashArray: [3, 2] }); replyLines.forEach((l, i) => T(l, x2 + 8, y + 11 + i * 9.6, 7.3, F.r, C.deep)); y += hh + 3;
    y = Math.max(y, yl) + 2;
  }

  function kvAt(rows, x, w, lw, size) { const lh = size + 2.5; for (const [k, v] of rows) { const nr = /^(not recorded|none recorded)/i.test(v); const vl = wrap(v, size, w - lw, nr ? F.i : F.r); T(k, x, y + size, size, F.b, C.deep); vl.forEach((l, i) => T(l, x + lw, y + size + i * lh, size, nr ? F.i : F.r, nr ? C.nr : C.ink)); y += vl.length * lh + 1.5; } }
  function ioNote() { const d = m.io.days; const p = d.filter(x => x.status === 'partial').map(x => `${fmtDM(x.date)} (${x.reasons.join(', ')})`); const ms = d.filter(x => x.status === 'missing').map(x => fmtDM(x.date)); return `Recorded figures only - not an assessment of hydration.${p.length ? ` Partial chart days: ${p.join('; ')}.` : ''}${ms.length ? ` Not charted: ${ms.join(', ')} (shown as "not charted", never as zero).` : ''} Cumulative = sum of recorded net values only.`; }
  function ioTable(x0, width) { let c = 0; table([{ h: 'Chart day', w: 84 }, { h: 'Intake ml', w: 44, a: 'r' }, { h: 'Output ml', w: 46, a: 'r' }, { h: 'Net ml', w: 38, a: 'r' }, { h: 'Cumul.', w: 42, a: 'r' }], m.io.days.map(d => { const miss = d.status === 'missing'; return [{ t: `${fmtDM(d.date)}${miss ? ' not charted' : d.status === 'partial' ? ' partial' : ''}`, c: d.status !== 'full' ? C.amb : undefined, b: d.status !== 'full' }, miss ? '-' : String(d.intake), miss ? '-' : String(d.output), { t: miss ? '-' : `${d.net > 0 ? '+' : ''}${d.net}`, c: !miss && d.net < 0 ? C.red : undefined }, { t: miss ? '-' : `${d.cumulative > 0 ? '+' : ''}${d.cumulative}` }]; }), 7, x0, width); }
  function ioBars(x0, y0, w, h) {
    const days = m.io.days, L = 26, R = 4, Tp = 14, B = 22, pw = w - L - R, ph = h - Tp - B;
    rect(x0, y0, w, h, { borderColor: C.line, borderWidth: .5, color: C.white });
    T('Daily intake and output', x0 + L, y0 + 9, 7.6, F.b, C.deep); T('ml', x0 + w - R - tw('ml', 6), y0 + 9, 6, F.r, C.grey);
    const max = Math.max(1500, ...days.map(d => Math.max(d.intake, d.output))), ymax = Math.ceil(max / 500) * 500, sy = v => y0 + Tp + ph - v / ymax * ph;
    for (let v = 0; v <= ymax; v += 500) { hline(x0 + L, x0 + w - R, sy(v), .35, C.line); T(String(v), x0 + L - 3 - tw(String(v), 5.6), sy(v) + 2, 5.6, F.r, C.grey); }
    const gw = pw / Math.max(1, days.length), bw = Math.min(13, gw * .3);
    days.forEach((d, i) => { const cx = x0 + L + gw * i + gw / 2, op = d.status === 'partial' ? .45 : 1;
      if (d.status !== 'missing') { rect(cx - bw - 1, sy(d.intake), bw, y0 + Tp + ph - sy(d.intake), { color: C.blue, opacity: op }); rect(cx + 1, sy(d.output), bw, y0 + Tp + ph - sy(d.output), { color: C.rose, opacity: op }); T(String(d.intake), cx - 1 - bw / 2 - tw(String(d.intake), 4.8) / 2, sy(d.intake) - 1.5, 4.8, F.r, C.blue); T(String(d.output), cx + 1 + bw / 2 - tw(String(d.output), 4.8) / 2, sy(d.output) - 1.5, 4.8, F.r, C.rose); }
      else { T('not', cx - tw('not', 5.4) / 2, y0 + Tp + ph / 2, 5.4, F.r, C.amb); T('charted', cx - tw('charted', 5.4) / 2, y0 + Tp + ph / 2 + 6.5, 5.4, F.r, C.amb); }
      const dl = fmtDM(d.date); T(dl, cx - tw(dl, 6) / 2, y0 + h - 13, 6, F.r, C.ink);
      const net = d.status === 'missing' ? '-' : `${d.net > 0 ? '+' : ''}${d.net}`; T(net, cx - tw(net, 5.6, F.b) / 2, y0 + h - 6, 5.6, F.b, d.status === 'missing' ? C.amb : d.net < 0 ? C.red : C.green);
    });
    hline(x0 + L, x0 + w - R, y0 + Tp + ph, .6, C.grey);
    rect(x0 + w - 92, y0 + 5, 5, 3.5, { color: C.blue }); T('Intake', x0 + w - 85, y0 + 8.6, 5.6); rect(x0 + w - 62, y0 + 5, 5, 3.5, { color: C.rose }); T('Output', x0 + w - 55, y0 + 8.6, 5.6); T('pale = partial', x0 + w - 30, y0 + 8.6, 4.8, F.r, C.grey);
  }
  function weeklyCharts() {
    h2('A. Vital signs', 'every recorded reading, plotted at its recorded time');
    const gap = 11, cw = (W - 2 * M - gap) / 2, ch = 114;
    const list = V.list, from = m.period.from.getTime(), to = m.period.to.getTime();
    const X = (x0, pw, t) => x0 + (t - from) / (to - from) * pw;
    const charts = [
      { t: 'Blood pressure', u: 'mmHg', min: 40, max: 180, ticks: [60, 90, 120, 150, 180], band: [m.T.sys[0], m.T.sys[1]], band2: [m.T.dia[0], m.T.dia[1]], series: [{ k: 'sys', c: C.mag, n: 'Systolic' }, { k: 'dia', c: C.blue, n: 'Diastolic' }], legend: true },
      { t: 'Pulse', u: '/min', min: 40, max: 130, ticks: [60, 80, 100, 120], band: m.T.pulse, series: [{ k: 'pulse', c: C.mag }] },
      { t: 'SpO2', u: '%', min: 85, max: 100, ticks: [85, 90, 95, 100], band: [m.T.spo2_min, 100], series: [{ k: 'spo2', c: C.blue }] },
      { t: 'Temperature', u: '°F', min: 95, max: 102, ticks: [96, 98, 100, 102], band: m.T.temp, series: [{ k: 'temp', c: C.amb }] },
      { t: 'Respiratory rate', u: '/min', min: 8, max: 32, ticks: [12, 18, 24, 30], band: m.T.rr, series: [{ k: 'rr', c: C.green }] },
      { t: 'Blood glucose', u: 'mg/dL', min: 50, max: 300, ticks: [70, 130, 180, 250], band: m.T.glucose.fasting, series: [{ k: 'fasting', c: C.purple, n: 'Fasting', sugar: true }, { k: 'post', c: C.rose, n: 'Post-meal', sugar: true }, { k: 'random', c: C.grey, n: 'Random', sugar: true }], legend: true, glucose: true }];
    charts.forEach((cfg, i) => {
      const col = i % 2, row = Math.floor(i / 2), x0 = M + col * (cw + gap), y0 = y + row * (ch + 7);
      rect(x0, y0, cw, ch, { borderColor: C.line, borderWidth: .5, color: C.white });
      const Lp = 25, Rp = 6, Tp = 17, Bp = 15, pw = cw - Lp - Rp, ph = ch - Tp - Bp, px = x0 + Lp;
      const sy = v => y0 + Tp + ph - (Math.max(cfg.min, Math.min(cfg.max, v)) - cfg.min) / (cfg.max - cfg.min) * ph;
      T(cfg.t, x0 + Lp, y0 + 10, 8.2, F.b, C.deep); T(`(${cfg.u})`, x0 + Lp + tw(cfg.t, 8.2, F.b) + 3, y0 + 10, 6.2, F.r, C.grey);
      const pts = s => list.filter(v => s.sugar ? v.sugar !== null && v.sugarKind === s.k : v[s.k] !== null && v[s.k] !== undefined).map(v => ({ t: v.at.getTime(), v: s.sugar ? v.sugar : v[s.k] }));
      if (cfg.glucose && !list.some(v => v.sugar !== null)) { T('No blood glucose recorded in the period.', x0 + cw / 2 - tw('No blood glucose recorded in the period.', 7, F.i) / 2, y0 + ch / 2 + 2, 7, F.i, C.nr); return; }
      if (cfg.band) rect(px, sy(cfg.band[1]), pw, sy(cfg.band[0]) - sy(cfg.band[1]), { color: C.band });
      if (cfg.band2) rect(px, sy(cfg.band2[1]), pw, sy(cfg.band2[0]) - sy(cfg.band2[1]), { color: C.band2 });
      cfg.ticks.forEach(t => { hline(px, px + pw, sy(t), .35, C.line); T(String(t), px - 3 - tw(String(t), 5.8), sy(t) + 2, 5.8, F.r, C.grey); });
      for (let d = isoOf(m.period.from); d <= isoOf(new Date(to - 1)); d = addDays(d, 1)) { const s = Math.max(from, at(d).getTime()), e = Math.min(to, at(addDays(d, 1)).getTime()); if (e <= s) continue; const xs = X(px, pw, s), xe = X(px, pw, e); if (s > from) vline(xs, y0 + Tp, y0 + Tp + ph, .35, C.line); if (xe - xs > 14) T(fmtDM(d), (xs + xe) / 2 - tw(fmtDM(d), 5.8) / 2, y0 + ch - 5, 5.8, F.r, C.ink); }
      hline(px, px + pw, y0 + Tp + ph, .6, C.grey);
      if (cfg.glucose) { const gy = sy(m.T.glucose.post_max); hline(px, px + pw, gy, .6, C.rose, [3, 2]); const lt = `post-meal limit ${m.T.glucose.post_max}`; T(lt, px + pw - tw(lt, 5.2) - 1, gy + 6, 5.2, F.r, C.rose); const ly = sy(m.T.glucose.low); hline(px, px + pw, ly, .6, C.red, [3, 2]); T(`low < ${m.T.glucose.low}`, px + pw - tw(`low < ${m.T.glucose.low}`, 5.2) - 1, ly - 1.5, 5.2, F.r, C.red); }
      cfg.series.forEach(s => {
        const p = pts(s); for (let k = 1; k < p.length; k++) if (p[k].t - p[k - 1].t <= 30 * 3600000) page.drawLine({ start: { x: X(px, pw, p[k - 1].t), y: H - sy(p[k - 1].v) }, end: { x: X(px, pw, p[k].t), y: H - sy(p[k].v) }, thickness: .9, color: s.c });
        p.forEach(q => { const bad = (s.k === 'sys' || s.k === 'dia' || s.k === 'pulse' || s.k === 'spo2' || s.k === 'temp' || s.k === 'rr') ? badV(s.k, q.v) : badV(s.k, q.v); const xx = X(px, pw, q.t), yy = sy(q.v); page.drawCircle({ x: xx, y: H - yy, size: bad ? 2.1 : 1.35, color: bad ? C.red : s.c }); if (bad) { const lbl = String(q.v), ly = yy - 3.5 < y0 + Tp + 5 ? yy + 8 : yy - 3.5; T(lbl, xx - tw(lbl, 5.6, F.b) / 2, ly, 5.6, F.b, C.red); } });
      });
      if (!cfg.glucose) V.missed.forEach(ms => { const xx = X(px, pw, ms.due.getTime()); if (xx < px || xx > px + pw) return; vline(xx, y0 + Tp, y0 + Tp + ph, .5, C.amb, [1.5, 1.2]); T('x', xx - tw('x', 7, F.b) / 2, y0 + Tp + ph - 2, 7, F.b, C.amb); });
      if (cfg.legend) { let lx = x0 + cw - Rp; [...cfg.series].reverse().forEach(s => { if (cfg.glucose && !pts(s).length) return; const n = s.n; lx -= tw(n, 5.8) + 2; T(n, lx, y0 + 9.6, 5.8, F.r, C.ink); lx -= 7; rect(lx, y0 + 5.6, 5, 3.6, { color: s.c }); lx -= 6; }); }
    });
    y += 3 * (ch + 7);
    legend(`Green band = configured usual range (BP ${m.T.sys[0]}-${m.T.sys[1]} / ${m.T.dia[0]}-${m.T.dia[1]} · pulse ${m.T.pulse[0]}-${m.T.pulse[1]} · SpO2 >= ${m.T.spo2_min}% · temp ${m.T.temp[0]}-${m.T.temp[1]} °F · RR ${m.T.rr[0]}-${m.T.rr[1]}). Glucose: fasting target ${m.T.glucose.fasting[0]}-${m.T.glucose.fasting[1]} (green band), post-meal limit ${m.T.glucose.post_max}, low < ${m.T.glucose.low} mg/dL - ${m.T.glucoseGuestSpecific ? 'Guest-specific targets set for this Guest' : 'general targets; the treating doctor can set Guest-specific targets'}. Red = outside range, labelled with the value. Amber x with dashed line = scheduled check not recorded (no value is drawn).`);
    h2('B. Intake / output — recorded net fluid balance', 'chart day 7 AM - 7 AM');
    if (!m.io.onChart) { legend('Not on the Intake / Output chart during this period.', 7, F.i, C.ink); return; }
    need(160); const yy = y; ioBars(M, yy, (W - 2 * M) * .56, 112); const tx = M + (W - 2 * M) * .56 + 10; y = yy; ioTable(tx, W - M - tx); y = Math.max(y, yy + 114) + 4;
    // cumulative chart (recorded days only)
    const d = m.io.days, ch2 = 64, x0 = M, w = W - 2 * M; need(ch2 + 20); rect(x0, y, w, ch2, { borderColor: C.line, borderWidth: .5, color: C.white });
    T('Cumulative recorded net balance', x0 + 30, y + 9, 7.6, F.b, C.deep); const nt = 'ml · uncharted days add nothing'; T(nt, x0 + w - 6 - tw(nt, 6), y + 9, 6, F.r, C.grey);
    const vals = d.filter(q => q.cumulative !== null).map(q => q.cumulative), lim = Math.max(500, Math.ceil(Math.max(0, ...vals.map(Math.abs)) / 500) * 500), Tp = 14, ph = ch2 - Tp - 12, pw = w - 40, sy = v => y + Tp + ph / 2 - v / lim * (ph / 2);
    [lim, 0, -lim].forEach(v => { hline(x0 + 30, x0 + 30 + pw, sy(v), v ? .35 : .6, v ? C.line : C.grey); const l = `${v > 0 ? '+' : ''}${v}`; T(l, x0 + 27 - tw(l, 5.8), sy(v) + 2, 5.8, F.r, C.grey); });
    const gw = pw / Math.max(1, d.length); let prev = null;
    d.forEach((q, i) => { const cx = x0 + 30 + gw * i + gw / 2; T(fmtDM(q.date), cx - tw(fmtDM(q.date), 6) / 2, y + ch2 - 3, 6, F.r, C.ink); if (q.cumulative === null) { T('x', cx - 2, sy(0) - 3, 7, F.b, C.amb); prev = null; return; } const yv = sy(q.cumulative); if (prev) page.drawLine({ start: { x: prev.x, y: H - prev.y }, end: { x: cx, y: H - yv }, thickness: 1, color: C.deep }); page.drawCircle({ x: cx, y: H - yv, size: 1.7, color: C.deep }); const l = `${q.cumulative > 0 ? '+' : ''}${q.cumulative}`; T(l, cx - tw(l, 5.8, F.b) / 2, q.cumulative < 0 ? yv + 8 : yv - 3.5, 5.8, F.b, q.cumulative < 0 ? C.red : C.green); prev = { x: cx, y: yv }; });
    y += ch2 + 4; legend(ioNote());
  }
  function badV(k, v) { const T = m.T; switch (k) { case 'sys': return v >= T.sys[1] || v < T.sys[0]; case 'dia': return v >= T.dia[1] || v < T.dia[0]; case 'pulse': return v > T.pulse[1] || v < T.pulse[0]; case 'spo2': return v < T.spo2_min; case 'temp': return v >= T.temp[1] || v < T.temp[0]; case 'rr': return v > T.rr[1] || v < T.rr[0]; case 'fasting': return v < T.glucose.low || v > T.glucose.fasting[1]; case 'post': return v < T.glucose.low || v > T.glucose.post_max; case 'random': return v < T.glucose.low || v > T.glucose.random_max; default: return false; } }

  // ---------- footers ----------
  const n = pages.length; pages.forEach((p, i) => { p.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: .5, color: C.line }); const l = S(`Samara Assisted Living · ${title} · ${m.kind === 'weekly' && m.weekLabel ? m.weekLabel + ' · ' : ''}${periodLine}`); p.drawText(l, { x: M, y: 25, size: 6, font: F.r, color: C.grey }); const r = S(`Confidential - for the treating doctor · Page ${i + 1} of ${n}`); p.drawText(r, { x: W - M - F.r.widthOfTextAtSize(r, 6), y: 25, size: 6, font: F.r, color: C.grey }); });
  return { bytes: await pdf.save(), pages: n };
}
