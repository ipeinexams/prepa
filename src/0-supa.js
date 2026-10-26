/* =====================================================================
   Base de données en ligne (Supabase) : même interface que la base
   intégrée (collection/doc, get/set/delete, onSnapshot), pour que
   toutes les copies de l'application — fichier ou lien — enregistrent
   automatiquement au même endroit.
   ===================================================================== */
/* global SUPA_URL, SUPA_KEY */
const SUPA_ON = typeof SUPA_URL === 'string' && SUPA_URL.length > 0;
// Session personnelle délivrée par le serveur après connexion (12 h, prolongée à l'usage)
const SupaSession = {
  key: 'ipein-examens:session-token',
  get() { try { return localStorage.getItem(this.key) || this.mem || null; } catch { return this.mem || null; } },
  set(t) { this.mem = t; try { localStorage.setItem(this.key, t); } catch { /* mémoire */ } },
  clear() { this.mem = null; try { localStorage.removeItem(this.key); } catch { /* ignoré */ } },
};

function makeSupaDB() {
  const err = (code, msg) => Object.assign(new Error(msg || code), { code });
  let onAuthLost = null;
  async function rpc(fn, args = {}, auth = true) {
    let r;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), 25000);
    try {
      r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(auth ? { p_token: SupaSession.get() || '', ...args } : args),
        signal: ctl ? ctl.signal : undefined,
        cache: 'no-store',
      });
    } catch { throw err('unavailable', 'réseau'); } finally { clearTimeout(t); }
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) { if (auth && onAuthLost) onAuthLost(); throw err('unauthenticated', 'session'); }
      const code = r.status === 429 ? 'resource_exhausted' : (r.status >= 500 || r.status === 408) ? 'unavailable' : 'invalid_argument';
      throw err(code, `HTTP ${r.status}`);
    }
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }
  const clone = (b) => (b == null ? undefined : JSON.parse(JSON.stringify(b)));
  const snap = (id, body) => ({ id, exists: body != null, data: () => clone(body), metadata: { fromCache: false, hasPendingWrites: false } });

  /* Suivi des changements faits par les autres : interrogation régulière */
  let since = null;
  const collL = new Map(); // collection -> Set(callback)
  const docL = new Map(); // chemin -> Set(callback)
  let timer = null;
  async function ensureSince() { if (since === null) since = Date.parse(await rpc('ipein_now')); }
  async function poll() {
    timer = null;
    try {
      await ensureSince();
      const from = new Date(since - 15000).toISOString(); // recouvrement : rien n'est manqué
      const rows = (await rpc('ipein_since', { p_since: from })) || [];
      const byColl = new Map();
      for (const row of rows) {
        const ts = Date.parse(row.updated_at); if (ts > since) since = ts;
        const i = row.path.lastIndexOf('/'); const coll = row.path.slice(0, i); const id = row.path.slice(i + 1);
        const ch = row.deleted ? { type: 'removed', doc: snap(id, null) } : { type: 'modified', doc: snap(id, row.body) };
        if (!byColl.has(coll)) byColl.set(coll, []);
        byColl.get(coll).push(ch);
        const dl = docL.get(row.path);
        if (dl && !row.deleted) dl.forEach((fn) => { try { fn(snap(id, row.body)); } catch (e) { console.warn(e); } });
      }
      for (const [coll, changes] of byColl) {
        const ls = collL.get(coll); if (!ls) continue;
        const s = { docs: [], size: 0, empty: true, docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } };
        ls.forEach((fn) => { try { fn(s); } catch (e) { console.warn(e); } });
      }
    } catch { /* nouvel essai au prochain passage */ }
    schedule();
  }
  function schedule() {
    if (timer || (!collL.size && !docL.size)) return;
    timer = setTimeout(poll, document.visibilityState === 'hidden' ? 20000 : 4000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && timer) { clearTimeout(timer); timer = null; poll(); } });
  const listen = (map, key, fn) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(fn); schedule();
    return () => { const s = map.get(key); if (s) { s.delete(fn); if (!s.size) map.delete(key); } };
  };

  function docRef(path) {
    const id = path.slice(path.lastIndexOf('/') + 1);
    return {
      id, path,
      async get() { await ensureSince(); const b = await rpc('ipein_get', { p_path: path }); return snap(id, b); },
      async set(body) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw err('invalid_argument');
        if (JSON.stringify(body).length > 900 * 1024) throw err('invalid_argument', 'document trop volumineux');
        await rpc('ipein_put', { p_path: path, p_body: body });
      },
      async delete() { await rpc('ipein_del', { p_path: path }); },
      onSnapshot(next) { return listen(docL, path, next); },
    };
  }
  function collRef(path) {
    return {
      path,
      doc: (id) => docRef(`${path}/${id}`),
      // Lecture complète de la collection, page par page (ordre des chemins)
      async readAll() {
        await ensureSince();
        const out = []; let after = '';
        for (let guard = 0; guard < 200; guard++) {
          const rows = (await rpc('ipein_list', { p_coll: path, p_after: after, p_limit: 1000 })) || [];
          for (const r of rows) out.push(snap(r.path.slice(path.length + 1), r.body));
          if (rows.length < 1000) break;
          after = rows[rows.length - 1].path;
        }
        return out;
      },
      onSnapshot(next) { return listen(collL, path, next); },
    };
  }
  function stop() { collL.clear(); docL.clear(); if (timer) { clearTimeout(timer); timer = null; } since = null; }
  return Object.freeze({
    supa: true, doc: docRef, collection: collRef, stop,
    ping: () => rpc('ipein_state', {}, false),
    state: () => rpc('ipein_state', {}, false),
    setup: () => rpc('ipein_setup', {}, false),
    salt: (email) => rpc('ipein_salt', { p_email: email }, false),
    login: (email, hash) => rpc('ipein_login', { p_email: email, p_hash: hash }, false),
    logout: () => rpc('ipein_logout', { p_token: SupaSession.get() || '' }, false),
    onAuthLost: (fn) => { onAuthLost = fn; },
  });
}
