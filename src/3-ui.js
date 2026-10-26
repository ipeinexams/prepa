/* =====================================================================
   Interface : routeur, gabarit, composants
   ===================================================================== */
const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M9 10h6M9 14h6M9 18h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 5.1"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h14"/>',
  door: '<path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><circle cx="14.5" cy="12" r=".9"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  checkSquare: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7.5 12 3 3 6-6"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  lock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  swap: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1Z"/><path d="M17 8.5a5 5 0 0 1 0 7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  download: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 20h16"/>',
  upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 20h16"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h11"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sparkles: '<path d="M12 3l1.8 4.6L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.9L12 3Z"/><path d="M19 15l.8 2 2 .9-2 .8L19 21l-.8-2.3-2-.8 2-.9.8-2Z"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || IC.info}</svg>`;

/* ---------- Routeur ---------- */
let R = { path: '/', query: {}, params: {} };
let ROUTE = '/';
function initialRoute() {
  let h = '';
  try { h = decodeURIComponent(location.hash.replace(/^#/, '')); } catch { h = ''; }
  return h.startsWith('/') ? h : '/';
}
function parseHash() {
  const [path, q] = (ROUTE || '/').split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(q || '')) };
}
function navigate(path, push = true) {
  ROUTE = path || '/';
  if (!VIEWER && push) { try { history.pushState(null, '', `#${ROUTE}`); } catch { /* fichier local sans historique */ } }
  render();
}
function go(path, msg = null, type = 'success') {
  if (msg) FLASH = { type, msg };
  navigate(path);
}
function qs(over = {}, base = R.query) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return `#${R.path}${s ? `?${s}` : ''}`;
}
const ROUTES = [];
const route = (pattern, access, view) => ROUTES.push({ re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), access, view });
function allowed(access) {
  if (access === 'all') return true;
  if (access === 'staff') return isStaff();
  if (access === 'admin') return ME.role === 'admin';
  if (access === 'teacher') return ME.role === 'enseignant';
  return false;
}

/* ---------- Messages ---------- */
let FLASH = null;
function toast(type, msg) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `alert ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'success' ? 'check' : type === 'info' ? 'info' : 'alert')}<div>${e(msg)}</div><button class="close" type="button" aria-label="Fermer">×</button>`;
  el.querySelector('.close').onclick = () => el.remove();
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 9000 : 5000);
}
function confirmDlg(text, danger = false, label = 'Confirmer', typed = '') {
  return new Promise((resolve) => {
    const dlg = $('#confirm-dialog');
    $('#confirm-text').textContent = text;
    const ok = $('#confirm-ok'); ok.textContent = label; ok.className = danger ? 'btn danger' : 'btn';
    const box = $('#confirm-typed'); const inp = $('#confirm-input');
    box.hidden = !typed; inp.value = ''; ok.disabled = Boolean(typed);
    inp.oninput = () => { ok.disabled = inp.value.trim().toUpperCase() !== typed; };
    dlg.returnValue = '';
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    if (typed) setTimeout(() => inp.focus(), 30);
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' && (!typed || inp.value.trim().toUpperCase() === typed)), { once: true });
  });
}

/* ---------- Composants ---------- */
const empty = (title, text = '', ic = 'search', action = null) => `<div class="empty">${icon(ic)}<h3>${e(title)}</h3>${text ? `<p>${e(text)}</p>` : ''}${action ? `<a class="btn" href="${action.href}">${icon('plus')}${e(action.label)}</a>` : ''}</div>`;
const kpi = (label, value, sub = '', cls = '', pct = null) => `<div class="kpi ${cls}"><div class="k-label">${e(label)}</div><div class="k-value">${e(value)}</div>${pct !== null ? `<div class="progress ${pct === 100 ? 'ok' : ''}"><span style="width:${pct}%"></span></div>` : ''}${sub ? `<div class="k-sub">${e(sub)}</div>` : ''}</div>`;
const card = (title, body, { right = '', tight = false, id = '' } = {}) => `<div class="card"${id ? ` id="${id}"` : ''}>${title ? `<div class="card-head"><h2>${title}</h2>${right}</div>` : ''}<div class="card-body${tight ? ' tight' : ''}">${body}</div></div>`;
const pageHead = (title, sub = '', actions = '', crumb = '') => `<div class="page-head"><div>${crumb ? `<div class="breadcrumb">${crumb}</div>` : ''}<h1>${title}</h1>${sub ? `<p>${e(sub)}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
const opt = (v, label, sel) => `<option value="${e(v)}"${String(sel) === String(v) ? ' selected' : ''}>${e(label)}</option>`;
const field = (label, input, { req = false, hint = '', full = false, cls = '' } = {}) => `<div class="field${full ? ' full' : ''} ${cls}"><label>${e(label)}${req ? ' <span class="req">*</span>' : ''}${input}</label>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const inp = (name, value = '', attrs = '') => `<input${/\btype=/.test(attrs) ? '' : ' type="text"'} name="${name}" value="${e(value ?? '')}" ${attrs}>`;
const act = (name, label, data = {}, { cls = 'secondary sm', confirm = '', danger = false, title = '' } = {}) => `<button type="button" class="btn ${cls}" data-act="${name}" ${Object.entries(data).map(([k, v]) => `data-${k}="${e(v)}"`).join(' ')}${confirm ? ` data-confirm="${e(confirm)}"` : ''}${danger ? ' data-danger="1"' : ''}${title ? ` title="${e(title)}" aria-label="${e(title)}"` : ''}>${label}</button>`;
const sessionSelect = (sel, { all = false, name = 'session', staffOnly = true } = {}) => {
  const list = DB.sessions.filter((s) => !staffOnly || isStaff() || s.status !== 'brouillon').slice().sort((a, b) => b.start_date.localeCompare(a.start_date));
  return `<select name="${name}" data-autosubmit aria-label="Session" style="min-width:260px">${all ? opt('', 'Toutes les sessions', sel) : ''}${list.map((s) => opt(s.id, `${s.name} — ${STATUS[s.status]}`, sel)).join('')}</select>`;
};

function listing(rows, { search = null, sorts = {}, defaultSort = null, defaultDir = 'asc', perPage = 20 }) {
  const q = R.query;
  const term = (q.q || '').trim().toLowerCase();
  let out = term && search ? rows.filter((r) => search(r).toLowerCase().includes(term)) : rows.slice();
  const sort = sorts[q.tri] ? q.tri : defaultSort;
  const dir = q.ordre === 'desc' ? 'desc' : q.ordre === 'asc' ? 'asc' : defaultDir;
  if (sort) {
    const f = sorts[sort];
    out.sort((a, b) => { const x = f(a) ?? ''; const y = f(b) ?? ''; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr'); return dir === 'asc' ? c : -c; });
  }
  const pages = Math.max(1, Math.ceil(out.length / perPage));
  const page = Math.min(Math.max(1, Number(q.page) || 1), pages);
  return { rows: out.slice((page - 1) * perPage, page * perPage), total: out.length, page, pages, sort, dir, term: q.q || '' };
}
const sortLink = (l, key, label) => {
  const active = l.sort === key;
  return `<a href="${qs({ tri: key, ordre: active && l.dir === 'asc' ? 'desc' : 'asc', page: 1 })}" class="${active ? 'sorted' : ''}">${e(label)}${active ? (l.dir === 'asc' ? ' ▲' : ' ▼') : ''}</a>`;
};
function pager(l) {
  if (!l.total) return '';
  let links = '';
  if (l.pages > 1) {
    if (l.page > 1) links += `<a href="${qs({ page: l.page - 1 })}" aria-label="Page précédente">‹</a>`;
    for (let p = Math.max(1, l.page - 2); p <= Math.min(l.pages, l.page + 2); p++) links += p === l.page ? `<span class="cur">${p}</span>` : `<a href="${qs({ page: p })}">${p}</a>`;
    if (l.page < l.pages) links += `<a href="${qs({ page: l.page + 1 })}" aria-label="Page suivante">›</a>`;
  }
  return `<div class="pagination"><span>${l.total} résultat${l.total > 1 ? 's' : ''} — page ${l.page} sur ${l.pages}</span><nav class="pages">${links}</nav></div>`;
}
const searchBox = (ph = 'Rechercher…') => `<div class="field grow"><label>Recherche<input type="search" name="q" value="${e(R.query.q || '')}" placeholder="${e(ph)}"></label></div>`;
const toolbar = (inner, keep = []) => `<form class="toolbar" data-filter>${keep.map((k) => (R.query[k] ? `<input type="hidden" name="${k}" value="${e(R.query[k])}">` : '')).join('')}${inner}<button class="btn secondary" type="submit">${icon('search')}Filtrer</button></form>`;
const table = (heads, rowsHtml) => `<div class="table-wrap"><table class="table responsive"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
const td = (label, v, cls = '') => `<td data-label="${e(label)}"${cls ? ` class="${cls}"` : ''}>${v}</td>`;
const userName = (id) => fullName(get('users', id));

/* ---------- Gabarit ---------- */
function navFor(u) {
  const staff = isStaff(u);
  const unreadN = where('notifications', (n) => n.user_id === u.id && !n.read_at).length;
  const unreadM = where('messages', (m) => m.recipient_id === u.id && !m.read_at).length;
  const comm = { label: 'Communication', items: [['/annonces', 'megaphone', 'Annonces'], ['/messages', 'mail', 'Messagerie', unreadM], ['/notifications', 'bell', 'Notifications', unreadN]] };
  const nav = staff ? [
    { label: 'Pilotage', items: [['/', 'home', 'Tableau de bord'], ['/calendrier', 'calendar', 'Calendrier'], ['/statistiques', 'chart', 'Statistiques']] },
    { label: 'Examens', items: [['/sessions', 'layers', 'Sessions et créneaux'], ['/examens', 'clipboard', 'Examens'], ['/tirages', 'lock', 'Rendez-vous de tirage']] },
    { label: 'Surveillances', items: [['/choix', 'checkSquare', 'Suivi des choix'], ['/planning', 'grid', 'Planning et affectations'], ['/absences', 'swap', 'Absences et remplacements']] },
    comm,
    { label: 'Données', items: [['/utilisateurs', 'users', 'Utilisateurs'], ['/referentiels/matieres', 'book', 'Matières'], ['/referentiels/classes', 'users', 'Classes'], ['/referentiels/salles', 'door', 'Salles'],
      ['/annees', 'calendar', 'Années universitaires'], ['/imports', 'upload', 'Imports'], ['/exports', 'download', 'Exports et impressions'], ['/sauvegarde', 'save', 'Sauvegarde et partage']] },
  ] : [
    { label: 'Mon espace', items: [['/', 'home', 'Accueil'], ['/mes-disponibilites', 'checkSquare', 'Mes disponibilités'], ['/mon-planning', 'clipboard', 'Mon planning'], ['/tirages', 'lock', 'Mes tirages'], ['/calendrier', 'calendar', 'Calendrier']] },
    comm,
  ];
  if (u.role === 'admin') nav.push({ label: 'Administration', items: [['/parametres', 'settings', 'Paramètres et règles'], ['/journal', 'history', 'Journal d’activité']] });
  return { nav, unreadN, unreadM };
}
function shell(title, body) {
  const { nav, unreadN } = navFor(ME);
  const active = (h) => (h === '/' ? R.path === '/' : R.path === h || R.path.startsWith(`${h}/`));
  return `<div class="app">
  <aside class="sidebar" id="sidebar" aria-label="Navigation principale">
    <a class="brand" href="#/"><img src="${LOGO}" alt="IPEIN — Institut Préparatoire aux Études d'Ingénieurs de Nabeul"><span>Gestion des examens</span></a>
    <nav class="nav">${nav.map((g) => `<div class="nav-group"><div class="label">${e(g.label)}</div>${g.items.map(([h, ic, t, c]) => `<a href="#${h}" class="${active(h) ? 'active' : ''}">${icon(ic)}<span>${e(t)}</span>${c ? `<span class="count">${c}</span>` : ''}</a>`).join('')}</div>`).join('')}</nav>
    <div class="foot">Institut Préparatoire aux Études d’Ingénieurs de Nabeul</div>
  </aside>
  <div class="main">
    ${DB.settings.demo_mode ? `<div class="banner info">${icon('info')}<div>Données de démonstration (fictives). Effacez-les depuis « Sauvegarde et partage » avant de saisir vos vraies données.</div></div>` : ''}
    ${DB.distribution ? `<div class="banner info">${icon('info')}<div>Copie distribuée par le service des examens : après avoir déclaré vos disponibilités, cliquez sur « Exporter mes choix » et transmettez le fichier.</div></div>` : ''}
    ${Store.mode === 'memory' ? `<div class="banner err">${icon('alert')}<div><strong>Ici, rien n’est enregistré</strong> (aperçu ou navigateur qui bloque le stockage) : vos saisies seront perdues à la fermeture. Utilisez l’application en ligne : tout y est enregistré automatiquement, sans export. <a class="btn sm" href="${ONLINE_URL}" target="_blank" rel="noopener">Ouvrir l’application en ligne</a></div></div>` : ''}
    ${Store.mode === 'local' && VIEWER ? `<div class="banner warn">${icon('alert')}<div><strong>Base en ligne indisponible dans cette vue</strong> : les saisies restent sur cet appareil. Ouvrez l’application depuis claude.ai en étant connecté à votre compte. <a class="btn sm secondary" href="${ONLINE_URL}" target="_blank" rel="noopener">Ouvrir l’application en ligne</a></div></div>` : ''}
    ${Store.readOnly ? `<div class="banner warn">${icon('lock')}<div><strong>Lecture seule.</strong> ${e(Store.lastError || 'Votre accès ne permet pas de modifier les données.')}</div></div>` : ''}
    <header class="topbar">
      <button class="icon-btn menu-toggle" type="button" data-act="toggleNav" aria-label="Ouvrir le menu">${icon('menu')}</button>
      <img class="mobile-logo" src="${EMBLEM}" alt="IPEIN">
      <div class="title">${e(title)}</div><div class="spacer"></div>
      <button type="button" class="remote-badge" id="remote-badge" data-act="refreshRemote" hidden>Nouvelles données · actualiser</button>
      <span class="save-state ok" id="save-state" role="status" aria-live="polite"><i aria-hidden="true"></i><span>Enregistré</span></span>
      <a class="icon-btn" href="#/notifications" aria-label="Notifications">${icon('bell')}${unreadN ? `<span class="dot">${unreadN > 99 ? '99+' : unreadN}</span>` : ''}</a>
      <a class="user-chip" href="#/mon-compte"><span class="avatar">${e(initials(ME))}</span><span class="who">${e(ME.first_name)} ${e(ME.last_name)}<small>${ROLE[ME.role]}</small></span></a>
      <button class="icon-btn" type="button" data-act="logout" aria-label="Se déconnecter" title="Se déconnecter">${icon('logout')}</button>
    </header>
    <main class="content" id="contenu">
      <div class="print-header"><img src="${LOGO}" alt="IPEIN"><div><strong>${e(title)}</strong><br><small>Édité le ${fmtDT(nowLocal())}</small></div></div>
      ${FLASH ? `<div class="alert ${FLASH.type}" role="status">${icon(FLASH.type === 'success' ? 'check' : 'alert')}<div>${e(FLASH.msg)}</div><button class="close" type="button" data-act="dismiss" aria-label="Fermer">×</button></div>` : ''}
      ${body}
    </main>
  </div></div>`;
}

let lastPath = null;
function render() {
  ME = currentUser();
  const parsed = parseHash();
  R = { ...parsed, params: {} };
  const root = $('#app');
  let out;
  try {
    if (!DB.users.length && !Store.needsLogin) out = { bare: true, html: viewSetup() };
    else if (!ME) out = { bare: true, html: viewLogin() };
    else if (ME.must_change_password && R.path !== '/mon-compte/mot-de-passe') { ROUTE = '/mon-compte/mot-de-passe'; render(); return; }
    else {
      const r = ROUTES.find((x) => x.re.test(R.path));
      if (!r) out = { title: 'Page introuvable', html: card('', empty('Page introuvable', 'Cette adresse n’existe pas.', 'alert', null)) };
      else {
        R.params = R.path.match(r.re).groups || {};
        out = allowed(r.access) ? r.view(R.params) : { title: 'Accès refusé', html: card('', empty('Accès refusé', 'Vous n’avez pas les droits nécessaires pour cette page.', 'lock')) };
      }
    }
  } catch (err) {
    console.error(err);
    out = { title: 'Erreur', html: card('', empty(err instanceof AppError ? err.message : 'Une erreur est survenue.', err instanceof AppError ? '' : String(err.message || err), 'alert')) };
  }
  document.body.classList.toggle('printing-doc', Boolean(out.doc));
  root.innerHTML = out.bare || out.doc ? out.html : shell(out.title, out.html);
  document.title = `${out.title || 'Connexion'} · IPEIN Examens`;
  FLASH = null;
  document.body.classList.remove('nav-open');
  if (lastPath !== R.path) { window.scrollTo(0, 0); lastPath = R.path; }
  if (out.after) out.after();
  Store.remoteDirty = false;
  Store.updateIndicator();
  showRemoteBadge(false);
  const af = $('[autofocus]', root); if (af) af.focus();
}
