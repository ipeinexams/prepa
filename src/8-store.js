/* =====================================================================
   Persistance : base de données en ligne (application publiée) avec
   cache local, file d'écriture avec reprise automatique, et secours
   local quand l'application est ouverte comme simple fichier.
   Rien ne doit faire planter la page si le navigateur bloque son stockage.
   ===================================================================== */

/* ---------- Accès protégé au stockage du navigateur ---------- */
const SafeStorage = (kind) => ({
  ok() { try { const s = window[kind]; const k = '__ipein_test__'; s.setItem(k, '1'); s.removeItem(k); return true; } catch { return false; } },
  get(k) { try { return window[kind].getItem(k); } catch { return null; } },
  set(k, v) { try { window[kind].setItem(k, v); return true; } catch { return false; } },
  remove(k) { try { window[kind].removeItem(k); } catch { /* ignoré */ } },
});
const LS = SafeStorage('localStorage');
const SS = SafeStorage('sessionStorage');

// Session de connexion : stockage de session si possible, sinon mémoire (jamais d'erreur)
const SessionBox = {
  mem: null,
  get() { const v = SS.get(SESSION_KEY); return v ?? this.mem; },
  set(id) { this.mem = String(id); SS.set(SESSION_KEY, String(id)); },
  clear() { this.mem = null; SS.remove(SESSION_KEY); },
};

/* ---------- Correspondance tables ↔ documents ---------- */
// Par défaut, un document par enregistrement. Certaines tables très volumineuses
// sont regroupées pour rester sous les limites (25 000 documents, 256 Ko par document).
const GROUPED = {
  avail: (r) => `s${r.session_id}_t${r.teacher_id}`,
  notifications: (r) => `u${r.user_id}`,
  log: (r) => `h${String(r.created_at || '').replace(/\D/g, '').slice(0, 10) || '0'}`,
};
const COLL_PREFIX = 'ipein_';
const META_COLL = 'ipein_meta';
const docKeyOf = (table, row) => (GROUPED[table] ? GROUPED[table](row) : String(row.id));
function tableDocs(table) {
  const out = new Map();
  if (GROUPED[table]) {
    for (const r of DB[table]) { const k = docKeyOf(table, r); if (!out.has(k)) out.set(k, []); out.get(k).push(r); }
    for (const [k, rows] of out) out.set(k, { gid: k, rows });
  } else for (const r of DB[table]) out.set(String(r.id), r);
  return out;
}
const metaBody = () => ({ app: 'ipein-examens', version: 2, settings: DB.settings, distribution: DB.distribution || null });

/* Délai maximal : une requête qui ne répond jamais ne doit pas bloquer l'application */
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'unavailable' })), ms))]);
}

/* ---------- Le magasin ---------- */
const Store = {
  mode: 'loading',          // loading | cloud | local | memory
  readOnly: false,
  synced: new Map(),        // "table/clé" -> JSON confirmé par le serveur
  pending: new Map(),       // "table/clé" -> corps à écrire (null = suppression)
  inflight: new Set(),
  failures: new Map(),
  retryAt: new Map(),
  slow: 0,
  status: 'idle',           // idle | saving | error | offline
  lastError: null,
  db: null,
  caps: {},
  unsubs: [],
  remoteDirty: false,

  async capability(name) {
    if (name in this.caps) return this.caps[name];
    let v = null;
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        v = await Promise.race([window.claude.use(name), new Promise((r) => setTimeout(() => r(null), 12000))]);
      }
    } catch { v = null; }
    this.caps[name] = v || null;
    return this.caps[name];
  },

  /* Cache local (best effort) : données + écritures non confirmées */
  saveCache() {
    if (this.mode === 'memory') return;
    const ok = LS.set(APP_KEY, JSON.stringify(DB));
    if (this.mode === 'cloud') LS.set(`${APP_KEY}:pending`, JSON.stringify([...this.pending]));
    if (!ok && this.mode === 'local') { this.status = 'error'; this.lastError = 'Espace de stockage du navigateur plein ou bloqué : téléchargez une sauvegarde.'; }
  },
  loadCache() {
    const raw = LS.get(APP_KEY);
    if (!raw) return null;
    try { return normalizeDB(JSON.parse(raw)); } catch { return null; }
  },

  /* Calcule les différences avec l'état confirmé et met les écritures en file */
  diff() {
    for (const table of TABLES) {
      const docs = tableDocs(table);
      const prefix = `${table}/`;
      for (const [k, body] of docs) {
        const key = prefix + k; const json = JSON.stringify(body);
        const known = this.pending.has(key) ? (this.pending.get(key) === null ? null : JSON.stringify(this.pending.get(key))) : this.synced.get(key);
        if (known !== json) this.pending.set(key, JSON.parse(json));
      }
      for (const key of [...this.synced.keys(), ...this.pending.keys()]) {
        if (key.startsWith(prefix) && !docs.has(key.slice(prefix.length))) {
          if (this.synced.has(key) || (this.pending.has(key) && this.pending.get(key) !== null)) this.pending.set(key, null);
        }
      }
    }
    const meta = JSON.stringify(metaBody());
    const knownMeta = this.pending.has('meta/app') ? JSON.stringify(this.pending.get('meta/app')) : this.synced.get('meta/app');
    if (knownMeta !== meta) this.pending.set('meta/app', JSON.parse(meta));
    // Une suppression d'un document jamais envoyé n'a rien à faire
    for (const [key, body] of this.pending) if (body === null && !this.synced.has(key) && !this.inflight.has(key)) this.pending.delete(key);
  },

  ref(key) {
    if (key === 'meta/app') return this.db.collection(META_COLL).doc('app');
    const i = key.indexOf('/');
    return this.db.collection(COLL_PREFIX + key.slice(0, i)).doc(key.slice(i + 1));
  },

  /* Envoie les écritures en attente : une à la fois par document, 6 en parallèle */
  pump() {
    if (this.mode !== 'cloud' || this.readOnly || this.needsLogin) return;
    for (const [key] of this.pending) {
      if (this.inflight.size >= 4) break;
      if (this.inflight.has(key)) continue;
      if ((this.retryAt.get(key) || 0) > Date.now()) continue;
      this.retryAt.delete(key);
      this.writeOne(key);
    }
    this.updateIndicator();
  },
  async writeOne(key) {
    const body = this.pending.get(key);
    const json = body === null ? null : JSON.stringify(body);
    this.inflight.add(key);
    try {
      if (body === null) await withTimeout(this.ref(key).delete(), 30000); else await withTimeout(this.ref(key).set(body), 30000);
      this.everWrote = true;
      this.failures.delete(key);
      if (this.slow) this.slow = Math.max(0, this.slow - 100);
      if (json === null) this.synced.delete(key); else this.synced.set(key, json);
      const now = this.pending.get(key);
      if (now !== undefined && (now === null ? null : JSON.stringify(now)) === json) this.pending.delete(key);
      if (this.status === 'error' && !this.failures.size) { this.status = 'idle'; this.lastError = null; }
    } catch (err) {
      const code = (err && err.code) || 'unavailable';
      const n = (this.failures.get(key) || 0) + 1;
      this.failures.set(key, n);
      if (['revoked', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code)) {
        this.readOnly = code !== 'revoked' ? this.readOnly : true;
        this.status = 'error'; this.lastError = 'La connexion à la base de données a été interrompue. Rechargez la page.';
      } else if (code === 'invalid_argument' && n === 1 && !this.readOnly) {
        // Écriture refusée : soit droits insuffisants, soit document trop volumineux
        const can = await this.canWrite();
        if (can === false || (can !== true && !this.everWrote)) { this.readOnly = true; this.status = 'error'; this.lastError = 'Lecture seule : votre accès ne permet pas d’enregistrer. Le propriétaire doit vous donner le rôle « Contributeur ».'; } else {
          this.status = 'error'; this.lastError = 'Un enregistrement est trop volumineux pour être sauvegardé. Purgez le journal ou les notifications (Sauvegarde et partage).';
        }
      } else if (code === 'unauthenticated') {
        this.status = 'idle';
      } else if (code === 'resource_exhausted') {
        // Trop d'écritures à la fois : on ralentit, rien n'est perdu
        this.slow = Math.min(8000, (this.slow || 500) * 2);
      } else if (code === 'quota_exceeded') {
        this.status = 'error'; this.lastError = 'La base de données est pleine : purgez le journal, les notifications ou les anciennes sessions.';
      } else {
        this.status = 'offline'; this.lastError = 'Connexion perdue : vos modifications sont gardées et seront envoyées automatiquement.';
      }
      const wait = Math.min(30000, 800 * 2 ** Math.min(n, 5)) + (this.slow || 0) + Math.random() * 500;
      this.retryAt.set(key, Date.now() + wait);
      if (!this.readOnly) setTimeout(() => this.pump(), wait + 20);
    } finally {
      this.inflight.delete(key);
      this.saveCache();
      this.updateIndicator();
      if (this.pending.size && !this.readOnly && !this.failures.has(key)) this.pump();
    }
  },
  async canWrite() {
    if (this.db && this.db.supa) return true;
    const user = await this.capability('user');
    if (!user) return null;
    try { return await user.can('data.write'); } catch { return null; }
  },

  /* Indicateur d'enregistrement visible en permanence */
  updateIndicator() {
    const el = document.getElementById('save-state');
    if (!el) return;
    let cls = 'ok'; let txt = 'Enregistré';
    if (this.mode === 'memory') { cls = 'err'; txt = 'Non enregistré'; }
    else if (this.readOnly) { cls = 'warn'; txt = 'Lecture seule'; }
    else if (this.status === 'error') { cls = 'err'; txt = 'Erreur d’enregistrement'; }
    else if (this.pending.size || this.inflight.size) { cls = this.status === 'offline' ? 'warn' : 'busy'; txt = this.status === 'offline' ? 'En attente de connexion' : 'Enregistrement…'; }
    else if (this.mode === 'local') txt = 'Enregistré sur cet appareil';
    el.className = `save-state ${cls}`;
    el.title = this.lastError || (this.mode === 'cloud' ? 'Données enregistrées dans la base en ligne de l’application' : this.mode === 'local' ? 'Données enregistrées dans ce navigateur' : 'Le navigateur bloque l’enregistrement');
    el.querySelector('span').textContent = txt;
  },

  /* Lecture paginée d'une collection (pages de 500, triées par identifiant de document) */
  async readCollection(t) {
    const coll = this.db.collection(COLL_PREFIX + t);
    if (coll.readAll) return coll.readAll();
    const field = GROUPED[t] ? 'gid' : 'id';
    const out = []; let last; let guard = 0;
    for (;;) {
      let q = coll.orderBy(field).limit(500);
      if (last !== undefined) q = coll.where(field, '>', last).orderBy(field).limit(500);
      const snap = await withTimeout(q.get(), 20000);
      out.push(...snap.docs);
      if (snap.docs.length < 500 || ++guard > 60) break;
      const b = snap.docs[snap.docs.length - 1].data();
      last = b ? b[field] : undefined;
      if (last === undefined) break;
    }
    // Documents sans champ de tri (anciennes versions) : lecture simple en complément
    if (!out.length) { const snap = await withTimeout(coll.limit(1000).get(), 20000); out.push(...snap.docs); }
    return out;
  },

  /* Lecture complète de la base en ligne */
  async fetchAll() {
    const meta = await withTimeout(this.ref('meta/app').get(), 20000);
    const data = emptyDB();
    let any = meta.exists;
    if (meta.exists) { const m = meta.data(); data.settings = { ...DEFAULT_SETTINGS, ...(m.settings || {}) }; if (m.distribution) data.distribution = m.distribution; this.synced.set('meta/app', JSON.stringify(m)); }
    // Lecture par petits lots pour rester sous la limite d'appels
    const snaps = [];
    for (let i = 0; i < TABLES.length; i += 4) snaps.push(...await Promise.all(TABLES.slice(i, i + 4).map((t) => this.readCollection(t))));
    snaps.forEach((docs, i) => {
      const t = TABLES[i];
      for (const d of docs) {
        const body = d.data(); if (!body) continue;
        any = true;
        this.synced.set(`${t}/${d.id}`, JSON.stringify(body));
        if (GROUPED[t]) data[t].push(...(Array.isArray(body.rows) ? body.rows : []));
        else data[t].push(body);
      }
    });
    return { data, any };
  },

  /* Changements faits par d'autres utilisateurs, en direct */
  subscribe() {
    const apply = (t, snap) => {
      let changed = false;
      for (const ch of snap.docChanges()) {
        const key = `${t}/${ch.doc.id}`;
        if (this.pending.has(key) || this.inflight.has(key)) continue; // nos propres modifications priment
        if (ch.type === 'removed') {
          if (!this.synced.has(key)) continue;
          this.synced.delete(key);
          DB[t] = DB[t].filter((r) => docKeyOf(t, r) !== ch.doc.id);
          changed = true;
        } else {
          const body = ch.doc.data(); if (!body) continue;
          const json = JSON.stringify(body);
          if (this.synced.get(key) === json) continue;
          this.synced.set(key, json);
          const rows = GROUPED[t] ? (Array.isArray(body.rows) ? body.rows : []) : [body];
          DB[t] = DB[t].filter((r) => docKeyOf(t, r) !== ch.doc.id).concat(JSON.parse(JSON.stringify(rows)));
          changed = true;
        }
      }
      if (changed) this.remoteChanged();
    };
    TABLES.forEach((t) => {
      try {
        this.unsubs.push(this.db.collection(COLL_PREFIX + t).onSnapshot((snap) => apply(t, snap), (err) => this.onSubError(err)));
      } catch (err) { console.warn(err); }
    });
    try {
      this.unsubs.push(this.ref('meta/app').onSnapshot((d) => {
        if (!d.exists || this.pending.has('meta/app') || this.inflight.has('meta/app')) return;
        const json = JSON.stringify(d.data());
        if (this.synced.get('meta/app') === json) return;
        this.synced.set('meta/app', json);
        const m = d.data();
        DB.settings = { ...DEFAULT_SETTINGS, ...(m.settings || {}) };
        if (m.distribution) DB.distribution = m.distribution; else delete DB.distribution;
        this.remoteChanged();
      }, (err) => this.onSubError(err)));
    } catch (err) { console.warn(err); }
  },
  onSubError(err) {
    if (err && err.code === 'revoked') { this.readOnly = true; this.lastError = 'Votre accès à cette application a changé. Rechargez la page.'; this.status = 'error'; this.updateIndicator(); }
  },
  remoteChanged() {
    this.saveCache();
    // Ne jamais effacer une saisie en cours : on attend que l'utilisateur ait fini
    if (isEditing()) { this.remoteDirty = true; showRemoteBadge(true); return; }
    render();
  },

  /* Démarrage */
  async boot() {
    const cached = this.loadCache();
    const viewer = Boolean(window.claude && typeof window.claude.use === 'function');
    if (SUPA_ON && !viewer) {
      // Site de l'établissement : base en ligne commune, protégée par la connexion
      renderLoading('Connexion à la base de données…');
      this.db = makeSupaDB();
      this.mode = 'cloud';
      this.auth = true;
      this.db.onAuthLost(() => this.authLost());
      this.installUnloadGuards();
      await this.authBoot(cached);
      return;
    }
    if (!this.db && viewer) {
      renderLoading('Connexion à la base de données…');
      this.db = await this.capability('db');
    }
    if (this.db) {
      this.mode = 'cloud';
      try {
        const { data, any } = await this.fetchAll();
        let pendingLocal = [];
        try { pendingLocal = JSON.parse(LS.get(`${APP_KEY}:pending`) || '[]'); } catch { pendingLocal = []; }
        if (any) {
          DB = normalizeDB(data);
          // Modifications locales jamais confirmées (coupure réseau, onglet fermé) : on les rejoue
          if (pendingLocal.length && cached) {
            for (const [key, body] of pendingLocal) {
              const i = key.indexOf('/'); const t = key.slice(0, i); const k = key.slice(i + 1);
              if (key === 'meta/app') { if (body && body.settings) DB.settings = { ...DEFAULT_SETTINGS, ...body.settings }; continue; }
              if (!TABLES.includes(t)) continue;
              DB[t] = DB[t].filter((r) => docKeyOf(t, r) !== k);
              if (body) DB[t].push(...(GROUPED[t] ? body.rows || [] : [body]));
            }
          }
        } else if (cached && cached.users && cached.users.length) {
          // Première ouverture en ligne : on transfère les données déjà saisies dans ce navigateur
          DB = cached;
          this.migrated = true;
        }
        const can = await this.canWrite();
        if (can === false) this.readOnly = true;
        this.subscribe();
        if (!this.readOnly) { this.diff(); this.pump(); }
        this.saveCache();
      } catch (err) {
        console.warn('Base en ligne injoignable', err && err.code);
        // Base en ligne injoignable : on travaille sur le cache et on renverra plus tard
        if (cached) DB = cached;
        this.status = 'offline';
        this.lastError = 'Base de données injoignable : travail sur la copie locale ; les modifications seront envoyées au retour de la connexion.';
        setTimeout(() => this.retryBoot(), 5000);
      }
    } else if (LS.ok()) {
      this.mode = 'local';
      if (cached) DB = cached;
      window.addEventListener('storage', (ev) => {
        if (ev.key !== APP_KEY || !ev.newValue) return;
        try { DB = normalizeDB(JSON.parse(ev.newValue)); this.remoteChanged(); } catch { /* ignoré */ }
      });
    } else {
      this.mode = 'memory';
    }
    this.installUnloadGuards();
  },
  installUnloadGuards() {
    window.addEventListener('beforeunload', (ev) => {
      if (this.mode === 'cloud' && (this.pending.size || this.inflight.size)) { this.saveCache(); ev.preventDefault(); ev.returnValue = ''; }
      if (this.mode === 'memory' && DB.users.length) { ev.preventDefault(); ev.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.saveCache(); });
  },

  /* ---------- Site protégé : connexion vérifiée par le serveur ---------- */
  needsLogin: false,
  auth: false,
  async authBoot(cached) {
    let initialized = null;
    try { initialized = await withTimeout(this.db.state(), 15000); } catch { initialized = null; }
    if (initialized === null) {
      // Réseau indisponible : on garde la copie locale et on réessaie
      if (cached && SupaSession.get()) DB = cached; else this.needsLogin = Boolean(SupaSession.get()) || Boolean(cached && cached.users && cached.users.length);
      this.status = 'offline';
      this.lastError = 'Connexion à la base en cours… vos saisies sont gardées et seront envoyées automatiquement.';
      setTimeout(async () => { this.status = 'idle'; this.lastError = null; this.needsLogin = false; await this.authBoot(this.loadCache()); render(); }, 6000);
      return;
    }
    if (!initialized) {
      // Base vide : première installation (compte administrateur)
      try { SupaSession.set(await this.db.setup()); } catch { /* nouvel essai à l'écriture */ }
      this.needsLogin = false;
      if (cached && cached.users && cached.users.length) { DB = cached; this.migrated = true; } else DB = emptyDB();
      this.subscribe(); this.diff(); this.pump(); this.saveCache();
      return;
    }
    if (!SupaSession.get()) { this.needsLogin = true; DB = emptyDB(); return; }
    try { await this.loadRemote(cached); } catch (err) {
      if (err && err.code === 'unauthenticated') { SupaSession.clear(); this.needsLogin = true; DB = emptyDB(); return; }
      if (cached) DB = cached;
      this.status = 'offline'; this.lastError = 'Connexion à la base en cours… vos saisies sont gardées et seront envoyées automatiquement.';
      setTimeout(async () => { this.status = 'idle'; this.lastError = null; await this.authBoot(this.loadCache()); render(); }, 6000);
    }
  },
  // Lecture complète puis réapplication des saisies pas encore envoyées
  async loadRemote(cached) {
    const { data, any } = await this.fetchAll();
    let pendingLocal = [];
    try { pendingLocal = JSON.parse(LS.get(`${APP_KEY}:pending`) || '[]'); } catch { pendingLocal = []; }
    const replay = new Map(cached ? pendingLocal : []);
    for (const [k, v] of this.pending) replay.set(k, v);
    DB = any ? normalizeDB(data) : emptyDB();
    for (const [key, body] of replay) {
      if (key === 'meta/app') { if (body && body.settings) DB.settings = { ...DEFAULT_SETTINGS, ...body.settings }; continue; }
      const i = key.indexOf('/'); const t = key.slice(0, i); const k = key.slice(i + 1);
      if (!TABLES.includes(t)) continue;
      DB[t] = DB[t].filter((r) => docKeyOf(t, r) !== k);
      if (body) DB[t].push(...(GROUPED[t] ? body.rows || [] : [body]));
    }
    this.pending.clear();
    this.subscribe(); this.diff(); this.pump(); this.saveCache();
  },
  async authLogin(email, password) {
    if (!this.needsLogin) await this.flush();
    const salt = await this.db.salt(email);
    const hash = hashPassword(password, salt).split('$')[1];
    const res = await this.db.login(email, hash);
    if (!res || res.error) return res || { error: 'identifiants' };
    SupaSession.set(res.token);
    this.needsLogin = false;
    renderLoading('Chargement des données…');
    this.db.stop();
    await this.loadRemote(this.loadCache());
    return res;
  },
  authLost() {
    if (this.needsLogin) return;
    this.needsLogin = true;
    SupaSession.clear(); this.db.stop(); SessionBox.clear(); ME = null;
    FLASH = { type: 'info', msg: 'Votre session a expiré : reconnectez-vous. Vos dernières saisies seront envoyées juste après.' };
    this.saveCache();
    render();
  },
  flush(ms = 20000) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      const tick = () => { if ((!this.pending.size && !this.inflight.size) || Date.now() - t0 > ms) resolve(!this.pending.size && !this.inflight.size); else setTimeout(tick, 100); };
      tick();
    });
  },
  async authLogout() {
    await this.flush(10000);
    try { await this.db.logout(); } catch { /* ignoré */ }
    SupaSession.clear(); this.db.stop(); this.synced.clear(); this.pending.clear();
    LS.remove(APP_KEY); LS.remove(`${APP_KEY}:pending`);
    this.needsLogin = true;
    DB = emptyDB();
  },
  async retryBoot() {
    try {
      const { data } = await this.fetchAll();
      // On garde nos modifications locales et on complète avec le serveur
      for (const t of TABLES) {
        const localKeys = new Set(DB[t].map((r) => docKeyOf(t, r)));
        DB[t].push(...data[t].filter((r) => !localKeys.has(docKeyOf(t, r))));
      }
      this.status = 'idle'; this.lastError = null;
      this.subscribe(); this.diff(); this.pump(); render();
    } catch { setTimeout(() => this.retryBoot(), 15000); }
  },

  /* Remplacement complet (restauration d'une sauvegarde, effacement) */
  replaceAll(data) {
    DB = data;
    if (this.mode === 'cloud') { this.diff(); this.pump(); }
    this.saveCache();
  },
};

/* ---------- Écriture après chaque transaction ---------- */
function persist() {
  if (Store.mode === 'cloud') { Store.diff(); Store.saveCache(); Store.pump(); }
  else if (Store.mode === 'local') { Store.saveCache(); Store.updateIndicator(); }
  else Store.updateIndicator();
}
function persistQuiet() { try { persist(); } catch { /* signalé par l'indicateur */ } }

/* ---------- Saisie en cours / rafraîchissement différé ---------- */
function isEditing() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select') && a.closest('form[data-form]')) return true;
  if (document.querySelector('form[data-form][data-dirty]')) return true;
  return Boolean(document.querySelector('dialog[open]'));
}
function showRemoteBadge(on) {
  const b = document.getElementById('remote-badge');
  if (b) b.hidden = !on;
}
document.addEventListener('input', (ev) => { const f = ev.target.closest && ev.target.closest('form[data-form]'); if (f) f.dataset.dirty = '1'; }, true);
setInterval(() => { if (Store.remoteDirty && !isEditing()) { Store.remoteDirty = false; showRemoteBadge(false); render(); } }, 1500);

function renderLoading(msg) {
  const root = document.getElementById('app');
  if (root) root.innerHTML = `<div class="boot"><img src="${LOGO}" alt="IPEIN" width="200"><div class="spinner" aria-hidden="true"></div><p>${e(msg)}</p></div>`;
}
