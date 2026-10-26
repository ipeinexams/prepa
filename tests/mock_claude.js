// Simulation fidèle de window.claude (db, user, downloads) : les données vivent côté test (Python),
// donc hors de la page — comme la vraie base en ligne.
(() => {
  const delay = () => new Promise((r) => setTimeout(r, 3 + Math.random() * 20));
  const clone = (b) => (b == null ? undefined : JSON.parse(JSON.stringify(b)));
  const snap = (id, b) => Object.freeze({ id, exists: b != null, data: () => clone(b), metadata: { fromCache: false, hasPendingWrites: false } });
  const ro = () => Boolean(window.__mockReadOnly);
  const deny = () => { const e = new Error('denied'); e.code = 'invalid_argument'; return e; };
  function checkPath(p, parity) {
    const segs = p.split('/');
    if (segs.some((s) => !/^[A-Za-z0-9_\-.~:@+]+$/.test(s) || s === '.' || s === '..')) throw new TypeError(`bad segment in ${p}`);
    if (segs.length % 2 !== parity) throw new TypeError(`bad parity ${p}`);
  }
  function docRef(path) {
    checkPath(path, 0);
    const id = path.split('/').pop();
    return {
      id, path,
      async get() { await delay(); return snap(id, await window.__store_get(path)); },
      async set(data) {
        await delay();
        if (ro()) throw deny();
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw deny();
        const json = JSON.stringify(data);
        if (json.length > 256 * 1024) throw deny();
        await window.__store_set(path, json);
      },
      async update(data) { await delay(); if (ro()) throw deny(); const cur = await window.__store_get(path); if (!cur) throw deny(); await window.__store_set(path, JSON.stringify({ ...cur, ...data })); },
      async delete() { await delay(); if (ro()) throw deny(); await window.__store_delete(path); },
      onSnapshot(next) {
        let stop = false; let prev;
        const tick = async () => { if (stop) return; const b = await window.__store_get(path); const j = JSON.stringify(b ?? null); if (j !== prev) { prev = j; next(snap(id, b)); } setTimeout(tick, 350); };
        tick();
        return () => { stop = true; };
      },
    };
  }
  function makeQuery(path, st) {
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const run = (rows) => {
      let r = rows.filter(([, b]) => st.filters.every(([f, op, v]) => { const x = b[f]; if (x === undefined) return false; return op === '>' ? x > v : op === '==' ? x === v : op === '<' ? x < v : true; }));
      if (st.order) r = r.slice().sort((a, b) => { const x = a[1][st.order], y = b[1][st.order]; if (x === undefined) return 1; if (y === undefined) return -1; return cmp(x, y); });
      return r.slice(0, st.lim || 100);
    };
    return {
      where: (f, op, v) => makeQuery(path, { ...st, filters: [...st.filters, [f, op, v]] }),
      orderBy: (f) => makeQuery(path, { ...st, order: f }),
      limit: (n) => { if (n < 1 || n > 1000) throw deny(); return makeQuery(path, { ...st, lim: n }); },
      async get() {
        await delay(); window.__calls = (window.__calls || 0) + 1;
        const rows = run(await window.__store_list(path));
        const docs = rows.map(([id, b]) => snap(id, b));
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
      },
    };
  }
  function collRef(path) {
    checkPath(path, 1);
    const base = makeQuery(path, { filters: [] });
    return {
      path,
      where: base.where, orderBy: base.orderBy, limit: base.limit,
      doc: (id) => docRef(`${path}/${id}`),
      async get() {
        await delay();
        const rows = (await window.__store_list(path)).slice(0, 100);
        const docs = rows.map(([id, b]) => snap(id, b));
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })), metadata: { fromCache: false, hasPendingWrites: false } };
      },
      onSnapshot(next) {
        let stop = false; let prev = new Map(); let first = true;
        const tick = async () => {
          if (stop) return;
          const rows = await window.__store_list(path);
          const cur = new Map(rows.map(([id, b]) => [id, JSON.stringify(b)]));
          const changes = [];
          for (const [id, j] of cur) { if (!prev.has(id)) changes.push({ type: 'added', doc: snap(id, JSON.parse(j)) }); else if (prev.get(id) !== j) changes.push({ type: 'modified', doc: snap(id, JSON.parse(j)) }); }
          for (const [id, j] of prev) if (!cur.has(id)) changes.push({ type: 'removed', doc: snap(id, JSON.parse(j)) });
          prev = cur;
          if (changes.length || first) { first = false; const docs = [...cur].map(([id, j]) => snap(id, JSON.parse(j))); next({ docs, size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } }); }
          setTimeout(tick, 350);
        };
        tick();
        return () => { stop = true; };
      },
    };
  }
  const db = Object.freeze({ doc: docRef, collection: collRef });
  const user = Object.freeze({ can: async (n) => (n === 'data.write' ? !ro() : null), isOwner: async () => !ro(), canEdit: async () => !ro(), id: async () => 'u_test', me: async () => ({ id: 'u_test', name: '', email: null, isOwner: !ro(), canEdit: !ro() }) });
  const downloads = Object.freeze({
    save: async ({ filename, data }) => {
      let size = 0;
      if (typeof data === 'string') size = data.length; else if (data && data.size != null) size = data.size;
      let text = '';
      if (typeof data === 'string') text = data; else if (data && data.text && /\.(json|csv|html)$/.test(filename)) text = await data.text();
      await window.__dl(filename, size, text.slice(0, 400000));
      return { status: 'saved' };
    },
  });
  window.claude = Object.freeze({ use: async (n) => { await delay(); return { db, user, downloads }[n] || null; } });
})();
