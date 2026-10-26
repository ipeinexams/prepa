'use strict';
/* =====================================================================
   IPEIN Examens — application autonome (fichier unique)
   Données : base en ligne de l'application publiée, sinon stockage du navigateur
   ===================================================================== */
const APP_KEY = 'ipein-examens-v1';
const VIEWER = Boolean(window.claude && typeof window.claude.use === 'function');
const SESSION_KEY = 'ipein-examens-session';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class AppError extends Error {}
const fail = (m) => { throw new AppError(m); };

/* ---------- Dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const nowLocal = () => { const d = new Date(); return `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const parseDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function fmtDate(s, long = false) {
  if (!s) return '';
  const d = parseDate(s);
  return long ? `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
const fmtDT = (s) => (s ? `${fmtDate(String(s).slice(0, 10))} ${String(s).replace('T', ' ').slice(11, 16)}`.trim() : '');
const fmtTime = (t) => (t ? String(t).slice(0, 5).replace(':', 'h') : '');
const monthShort = (s) => MOIS_C[parseDate(s).getMonth()];
const minutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const overlaps = (a, b) => a.date === b.date && minutes(a.start_time) < minutes(b.end_time) && minutes(b.start_time) < minutes(a.end_time);
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const fullName = (u) => (u ? `${u.last_name || ''} ${u.first_name || ''}`.trim() : '—');
const initials = (u) => `${(u.first_name || ' ')[0]}${(u.last_name || ' ')[0]}`.toUpperCase();
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

const ROLE = { admin: 'Administrateur', responsable: 'Responsable des examens', enseignant: 'Enseignant' };
const STATUS = {
  brouillon: 'Brouillon', choix_ouverts: 'Choix ouverts', choix_clos: 'Choix clos', publie: 'Publié',
  planifie: 'Planifié', modifie: 'Modifié', annule: 'Annulé', effectue: 'Effectué',
  propose: 'Proposée', confirme: 'Confirmée', en_attente: 'En attente', decline: 'Déclinée',
  acceptee: 'Acceptée', refusee: 'Refusée', soumis: 'Soumis', disponible: 'Disponible', indisponible: 'Indisponible',
  manuel: 'Manuelle', auto: 'Automatique', remplacement: 'Remplacement',
};
const BADGE = {
  publie: 'ok', confirme: 'ok', acceptee: 'ok', effectue: 'ok', soumis: 'ok', disponible: 'ok',
  choix_ouverts: 'blue', propose: 'blue', planifie: 'blue', choix_clos: 'violet', modifie: 'warn', en_attente: 'warn',
  brouillon: 'gray', annule: 'err', refusee: 'err', decline: 'err', indisponible: 'err',
};
const badge = (s, label) => `<span class="badge ${BADGE[s] || 'gray'}">${e(label || STATUS[s] || s || '—')}</span>`;

/* ---------- Stockage ---------- */
const TABLES = ['users', 'years', 'semesters', 'events', 'sessions', 'subjects', 'classes', 'rooms', 'creneaux', 'exams', 'examRooms',
  'avail', 'subs', 'assignments', 'history', 'absences', 'leaves', 'tirages', 'tparts', 'thist', 'announcements', 'messages', 'notifications', 'log'];
const DEFAULT_SETTINGS = {
  reminder_hours_before: 24, allow_outside_choices: true, exclude_exam_responsible: true,
  students_per_supervisor: 20, min_supervisors_per_room: 2, demo_mode: false, reminders_sent: {},
};
function emptyDB() {
  const d = { app: 'ipein-examens', version: 1, seq: 0, settings: { ...DEFAULT_SETTINGS } };
  TABLES.forEach((t) => { d[t] = []; });
  return d;
}
function normalizeDB(d) {
  if (!d || d.app !== 'ipein-examens') fail('Ce fichier n’est pas une sauvegarde IPEIN Examens.');
  TABLES.forEach((t) => { if (!Array.isArray(d[t])) d[t] = []; });
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  return d;
}
let DB = emptyDB();
// Identifiants uniques même avec plusieurs utilisateurs simultanés
let lastId = 0;
const nid = () => { let v = Date.now() * 1000 + Math.floor(Math.random() * 1000); if (v <= lastId) v = lastId + 1; lastId = v; return v; };
const get = (t, id) => { const n = Number(id); return DB[t].find((r) => r.id === n); };
const where = (t, fn) => DB[t].filter(fn);
const ins = (t, o) => { const r = { id: nid(), created_at: nowLocal(), ...o }; DB[t].push(r); return r; };
const rm = (t, fn) => { DB[t] = DB[t].filter((r) => !fn(r)); };
let txDepth = 0;
function tx(fn) {
  if (Store.readOnly && txDepth === 0) fail('Lecture seule : votre accès ne permet pas de modifier les données. Demandez au propriétaire de vous donner le rôle « Contributeur ».');
  const snap = txDepth === 0 ? JSON.stringify(DB) : null;
  txDepth++;
  try {
    const r = fn();
    txDepth--;
    if (txDepth === 0) persist();
    return r;
  } catch (err) {
    txDepth--;
    if (txDepth === 0) DB = JSON.parse(snap);
    throw err;
  }
}

/* ---------- Mots de passe (SHA-256 itéré + sel) ---------- */
const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
function sha256(bytes) {
  const l = bytes.length;
  const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  withPad.set(bytes); withPad[l] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, l * 8); dv.setUint32(withPad.length - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < withPad.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, f, g, h, k] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotr(f, 6) ^ rotr(f, 11) ^ rotr(f, 25)) + ((f & g) ^ (~f & h)) + K256[i] + W[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = h; h = g; g = f; f = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += f; H[5] += g; H[6] += h; H[7] += k;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}
const utf8 = (s) => new TextEncoder().encode(s);
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
function hashPassword(pwd, salt = randHex(16)) {
  const sb = utf8(salt);
  let h = sha256(utf8(`${salt}:${pwd}`));
  const buf = new Uint8Array(32 + sb.length);
  for (let i = 0; i < 4000; i++) { buf.set(h); buf.set(sb, 32); h = sha256(buf); }
  return `${salt}$${hex(h)}`;
}
function verifyPassword(pwd, stored) {
  const [salt, ref] = String(stored || '').split('$');
  if (!salt || !ref) return false;
  const got = hashPassword(pwd, salt).split('$')[1];
  let diff = 0;
  for (let i = 0; i < ref.length; i++) diff |= ref.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0 && got.length === ref.length;
}
function checkPasswordRule(p) {
  if (!p || p.length < 10) fail('Le mot de passe doit contenir au moins 10 caractères.');
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) fail('Le mot de passe doit contenir des lettres et des chiffres.');
}
function tempPassword() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return `${Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => a[b % a.length]).join('')}7a`;
}

/* ---------- Session, journal, notifications ---------- */
function currentUser() {
  if (typeof Store !== 'undefined' && Store.needsLogin) return null;
  const id = Number(SessionBox.get());
  const u = id ? get('users', id) : null;
  if (u && !u.active) { SessionBox.clear(); return null; }
  return u || null;
}
let ME = null;
const isStaff = (u = ME) => Boolean(u && (u.role === 'admin' || u.role === 'responsable'));
function audit(action, entity = null, entityId = null, details = null) {
  DB.log.push({ id: nid(), user_id: ME ? ME.id : null, action, entity, entity_id: entityId, details: details == null ? null : (typeof details === 'string' ? details : JSON.stringify(details)), created_at: nowLocal() });
  if (DB.log.length > 6000) DB.log.splice(0, DB.log.length - 5000);
}
function notify(ids, { title, body = '', link = null, kind = 'info' }) {
  const set = [...new Set([].concat(ids).filter(Boolean).map(Number))];
  let n = 0;
  for (const id of set) {
    const u = get('users', id);
    if (!u || !u.active) continue;
    ins('notifications', { user_id: id, kind, title, body, link, read_at: null });
    n++;
  }
  if (DB.notifications.length > 8000) DB.notifications.splice(0, DB.notifications.length - 7000);
  return n;
}
const notifyRoles = (roles, p) => notify(where('users', (u) => u.active && roles.includes(u.role)).map((u) => u.id), p);
const setting = (k) => DB.settings[k];

/* ---------- Téléchargements ---------- */
// Dans l'application publiée, les téléchargements passent par la capacité « downloads » ;
// hors ligne (fichier ouvert directement), par un lien de téléchargement classique.
async function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const dl = await Store.capability('downloads');
  if (dl) {
    try { await dl.save({ filename: name, data: blob }); return true; } catch (err) {
      if (err && err.code === 'declined') return false;
      if (err && err.code === 'rate_limited') fail('Un téléchargement est déjà en attente de confirmation.');
      if (!['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(err && err.code)) fail(`Téléchargement impossible (${(err && err.message) || 'erreur inconnue'}).`);
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

/* ---------- CSV ---------- */
function toCSV(columns, rows) {
  const q = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return `﻿${[columns.map((c) => q(c[1])).join(';'), ...rows.map((r) => columns.map((c) => q(r[c[0]])).join(';'))].join('\r\n')}`;
}
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const d = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let cur = ''; let inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inq = false; else cur += c;
    } else if (c === '"') inq = true;
    else if (c === d) { row.push(cur.trim()); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/* ---------- XLSX (écriture : zip « stocké » ; lecture : DecompressionStream) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStore(files) {
  const parts = []; const central = []; let offset = 0;
  for (const f of files) {
    const name = utf8(f.name); const data = typeof f.data === 'string' ? utf8(f.data) : f.data; const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const csize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const xmlEsc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function writeXlsx(title, subtitle, columns, rows) {
  const cell = (ref, v, style = 0) => (typeof v === 'number' && Number.isFinite(v)
    ? `<c r="${ref}" s="${style}"><v>${v}</v></c>`
    : `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`);
  const lines = [];
  lines.push(`<row r="1">${cell('A1', 'Institut Préparatoire aux Études d’Ingénieurs de Nabeul (IPEIN)', 1)}</row>`);
  lines.push(`<row r="2">${cell('A2', title, 2)}</row>`);
  lines.push(`<row r="3">${cell('A3', `${subtitle ? `${subtitle} — ` : ''}édité le ${fmtDT(nowLocal())} — ${rows.length} ligne(s)`, 4)}</row>`);
  lines.push(`<row r="5">${columns.map((c, i) => cell(`${colName(i)}5`, c[1], 3)).join('')}</row>`);
  rows.forEach((r, ri) => { lines.push(`<row r="${ri + 6}">${columns.map((c, i) => cell(`${colName(i)}${ri + 6}`, r[c[0]] ?? '', ri % 2 ? 5 : 0)).join('')}</row>`); });
  const cols = `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c[2] || 16}" customWidth="1"/>`).join('')}</cols>`;
  const last = colName(columns.length - 1);
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${lines.join('')}</sheetData><autoFilter ref="A5:${last}${Math.max(5, rows.length + 5)}"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FF0B2540"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF0077B6"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF5B6B7D"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0077B6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F7FB"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const sheetName = xmlEsc(title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName.replace(/'/g, "''")}'!$A$5:$${last}$${Math.max(5, rows.length + 5)}</definedName></definedNames></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
  ]);
}
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') fail('Votre navigateur ne sait pas lire les fichiers .xlsx : utilisez le format CSV.');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf) {
  const u8 = new Uint8Array(buf); const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) fail('Fichier .xlsx illisible.');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let k = 0; k < count; k++) {
    const method = dv.getUint16(p + 10, true); const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true); const xlen = dv.getUint16(p + 30, true); const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    files[name] = { method, data: u8.subarray(start, start + csize) };
    p += 46 + nlen + xlen + clen;
  }
  return {
    async text(name) {
      const f = files[name]; if (!f) return null;
      return new TextDecoder().decode(f.method === 8 ? await inflateRaw(f.data) : f.data);
    },
    names: Object.keys(files),
  };
}
async function readXlsx(buf) {
  const z = await unzip(buf);
  const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const ssx = await z.text('xl/sharedStrings.xml');
  const shared = ssx ? Array.from(parse(ssx).getElementsByTagName('si'), (si) => Array.from(si.getElementsByTagName('t'), (t) => t.textContent).join('')) : [];
  const sheetName = z.names.find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n)) || z.names.find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
  const doc = parse(await z.text(sheetName));
  const out = [];
  for (const row of doc.getElementsByTagName('row')) {
    const vals = [];
    for (const c of row.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') || ''; const letters = ref.replace(/\d+/g, '');
      let idx = 0; for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64); idx -= 1;
      const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0];
      let val = '';
      if (t === 's') val = shared[Number(v && v.textContent)] ?? '';
      else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t'), (x) => x.textContent).join('');
      else val = v ? v.textContent : '';
      vals[idx < 0 ? vals.length : idx] = String(val).trim();
    }
    out.push(Array.from(vals, (x) => x ?? ''));
  }
  return out.filter((r) => r.some((c) => c !== ''));
}
