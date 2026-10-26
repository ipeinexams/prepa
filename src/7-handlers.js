/* =====================================================================
   Traitements : formulaires, actions, imports, démarrage
   ===================================================================== */
const reqTxt = (v, label, max = 200) => { const s = String(v ?? '').trim(); if (!s) fail(`${label} : champ requis.`); if (s.length > max) fail(`${label} : ${max} caractères maximum.`); return s; };
const optTxt = (v, max = 2000) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const reqDate = (v, label) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) fail(`${label} : date invalide.`); return v; };
const reqTime = (v, label) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''))) fail(`${label} : heure invalide (HH:MM).`); return v; };
const reqInt = (v, label, min = 0, max = Number.MAX_SAFE_INTEGER) => { const n = Number(v); if (v === '' || v == null || !Number.isInteger(n)) fail(`${label} : nombre entier attendu.`); if (n < min || n > max) fail(max === Number.MAX_SAFE_INTEGER ? `${label} : sélection invalide.` : `${label} : entre ${min} et ${max}.`); return n; };
const optInt = (v, label, min = 0, max = Number.MAX_SAFE_INTEGER) => (v === '' || v == null ? null : reqInt(v, label, min, max));
const optDT = (v, label) => { if (!v) return null; const s = String(v).replace('T', ' '); if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) fail(`${label} : date/heure invalide.`); return s; };
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const arr = (v) => (v === undefined || v === null || v === '' ? [] : [].concat(v));
const requireStaff = () => { if (!isStaff()) fail('Vous n’avez pas les droits nécessaires pour cette action.'); };
const requireAdmin = () => { if (!ME || ME.role !== 'admin') fail('Action réservée à l’administrateur.'); };

function formData(form, submitter) {
  const out = {};
  const fd = new FormData(form);
  if (submitter && submitter.name) fd.append(submitter.name, submitter.value);
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) { out[k] = v; continue; }
    if (k in out) out[k] = [].concat(out[k], v); else out[k] = v;
  }
  return out;
}
function supervisorsDefault(n) { return Math.max(Number(setting('min_supervisors_per_room')) || 2, Math.ceil(n / (Number(setting('students_per_supervisor')) || 20))); }
function roomFree(creneauId, roomId, ignoreErId = null) { return !where('examRooms', (er) => er.creneau_id === creneauId && er.room_id === roomId && er.id !== ignoreErId).length; }
function addExamRoom(exam, roomId, students, supervisors) {
  const room = get('rooms', roomId);
  if (!room || !room.active) fail('Salle invalide ou désactivée.');
  if (students > room.capacity) fail(`Salle ${room.code} : ${students} étudiants dépassent la capacité (${room.capacity}).`);
  if (!roomFree(exam.creneau_id, room.id)) fail(`La salle ${room.code} est déjà occupée sur ce créneau.`);
  return ins('examRooms', { exam_id: exam.id, creneau_id: exam.creneau_id, room_id: room.id, students, supervisors_needed: supervisors });
}
function autoRooms(exam, students) {
  const free = where('rooms', (r) => r.active && roomFree(exam.creneau_id, r.id)).sort((a, b) => b.capacity - a.capacity || a.code.localeCompare(b.code));
  let left = students;
  for (const r of free) { if (left <= 0) break; const n = Math.min(r.capacity, left); addExamRoom(exam, r.id, n, supervisorsDefault(n)); left -= n; }
  if (left > 0) fail(`Capacité insuffisante : ${left} étudiant(s) sans salle libre sur ce créneau.`);
}

const FORMS = {
  async setup(d) {
    if (DB.users.length) fail('L’application est déjà initialisée.');
    const email = reqTxt(d.email, 'E-mail').toLowerCase(); if (!isEmail(email)) fail('Adresse e-mail invalide.');
    checkPasswordRule(d.password);
    tx(() => {
      const u = ins('users', { email, password_hash: hashPassword(d.password), first_name: reqTxt(d.first_name, 'Prénom', 80), last_name: reqTxt(d.last_name, 'Nom', 80), role: 'admin', grade: null, department: null, phone: null, quota_override: null, active: true, must_change_password: false, failed_logins: 0, locked_until: null, last_login_at: nowLocal(), is_demo: false });
      SessionBox.set(u.id); ME = u; audit('installation', 'user', u.id);
    });
    if (Store.auth) {
      // Le compte est enregistré en ligne, puis on ouvre une session personnelle
      const uid = ME.id;
      await Store.flush(30000);
      const res = await Store.authLogin(email, d.password);
      if (res && !res.error) SessionBox.set(uid);
    }
    go('/', 'Administrateur créé. Commencez par les années universitaires, les référentiels puis les sessions.');
  },
  async login(d) {
    const email = String(d.email || '').trim().toLowerCase();
    if (Store.auth) {
      if (!email || !d.password) fail('Saisissez votre e-mail et votre mot de passe.');
      let res;
      try { res = await Store.authLogin(email, String(d.password)); } catch (err) {
        fail(err && err.code === 'unavailable' ? 'Connexion à la base impossible pour le moment. Vérifiez Internet et réessayez.' : 'Connexion impossible, réessayez.');
      }
      if (!res || res.error) {
        render();
        if (res && res.error === 'verrouille') fail(`Compte temporairement verrouillé après plusieurs échecs. Réessayez après ${res.until}.`);
        if (res && res.error === 'desactive') fail('Ce compte est désactivé. Contactez l’administration.');
        fail('E-mail ou mot de passe incorrect.');
      }
      const u = get('users', Number(res.user_id));
      if (!u) fail('Compte introuvable.');
      SessionBox.set(u.id); ME = u;
      tx(() => { u.failed_logins = 0; u.locked_until = null; u.last_login_at = nowLocal(); audit('connexion', 'user', u.id); });
      runScheduler();
      $('#toasts').innerHTML = '';
      go(ROUTE && ROUTE !== '/' ? ROUTE : '/');
      return;
    }
    const u = DB.users.find((x) => x.email === email);
    if (u && u.locked_until && u.locked_until > nowLocal()) fail(`Compte temporairement verrouillé après plusieurs échecs. Réessayez après ${u.locked_until.slice(11, 16)}.`);
    const ok = u ? verifyPassword(String(d.password || ''), u.password_hash) : (hashPassword('x'), false);
    if (!u || !ok || !u.active) {
      if (u && !Store.readOnly) tx(() => {
        u.failed_logins = (u.failed_logins || 0) + 1;
        if (u.failed_logins >= 5) { const t = new Date(Date.now() + 15 * 60000); u.locked_until = `${isoDate(t)} ${pad(t.getHours())}:${pad(t.getMinutes())}:00`; u.failed_logins = 0; }
        DB.log.push({ id: nid(), user_id: u.id, action: u.locked_until && u.locked_until > nowLocal() ? 'connexion_verrouillee' : 'connexion_echec', entity: 'user', entity_id: u.id, details: null, created_at: nowLocal() });
      });
      fail(u && ok && !u.active ? 'Ce compte est désactivé. Contactez l’administration.' : 'E-mail ou mot de passe incorrect.');
    }
    if (Store.readOnly) { SessionBox.set(u.id); ME = u; }
    else tx(() => { u.failed_logins = 0; u.locked_until = null; u.last_login_at = nowLocal(); SessionBox.set(u.id); ME = u; audit('connexion', 'user', u.id); });
    runScheduler();
    $('#toasts').innerHTML = '';
    go('/');
  },
  passwordChange(d) {
    if (!verifyPassword(d.current || '', ME.password_hash)) fail('Mot de passe actuel incorrect.');
    checkPasswordRule(d.password);
    if (d.password !== d.confirm) fail('Les deux mots de passe ne correspondent pas.');
    if (d.password === d.current) fail('Le nouveau mot de passe doit être différent de l’actuel.');
    tx(() => { ME.password_hash = hashPassword(d.password); ME.must_change_password = false; audit('mot_de_passe_modifie', 'user', ME.id); });
    go('/', 'Mot de passe modifié.');
  },
  profileSave(d) { tx(() => { ME.phone = optTxt(d.phone, 30); audit('profil_modifie', 'user', ME.id); }); go('/mon-compte', 'Profil mis à jour.'); },

  yearSave(d, f) {
    requireStaff();
    const label = reqTxt(d.label, 'Libellé', 20); const a = reqDate(d.start_date, 'Début'); const b = reqDate(d.end_date, 'Fin');
    if (b <= a) fail('La date de fin doit être postérieure à la date de début.');
    const id = Number(f.dataset.id) || null;
    if (DB.years.some((y) => y.label === label && y.id !== id)) fail('Ce libellé existe déjà.');
    const y = tx(() => {
      if (d.is_current) DB.years.forEach((x) => { x.is_current = false; });
      if (id) { const y0 = get('years', id); Object.assign(y0, { label, start_date: a, end_date: b, is_current: Boolean(d.is_current) }); audit('annee_modifiee', 'year', id); return y0; }
      const y1 = ins('years', { label, start_date: a, end_date: b, is_current: Boolean(d.is_current) }); audit('annee_creee', 'year', y1.id, label); return y1;
    });
    go(`/annees/${y.id}`, id ? 'Année mise à jour.' : `Année ${label} créée.`);
  },
  semesterAdd(d, f) {
    requireStaff();
    const y = get('years', f.dataset.id); const label = reqTxt(d.label, 'Libellé', 40); const a = reqDate(d.start_date, 'Début'); const b = reqDate(d.end_date, 'Fin');
    if (b <= a) fail('La date de fin doit être postérieure à la date de début.');
    if (a < y.start_date || b > y.end_date) fail('Le semestre doit être compris dans l’année universitaire.');
    const sid = Number(f.dataset.sid) || null;
    if (where('semesters', (s) => s.year_id === y.id && s.label === label && s.id !== sid).length) fail('Ce semestre existe déjà.');
    if (sid && DB.sessions.some((x) => x.semester_id === sid && (x.start_date < a || x.end_date > b))) fail('Une session d’examens de ce semestre sortirait des nouvelles dates.');
    tx(() => {
      if (sid) { Object.assign(get('semesters', sid), { label, start_date: a, end_date: b }); audit('semestre_modifie', 'semester', sid); }
      else { const s = ins('semesters', { year_id: y.id, label, start_date: a, end_date: b }); audit('semestre_cree', 'semester', s.id, label); }
    });
    go(`/annees/${y.id}`, sid ? 'Semestre modifié.' : 'Semestre ajouté.');
  },
  eventAdd(d, f) {
    requireStaff();
    const title = reqTxt(d.title, 'Intitulé', 120); const a = reqDate(d.start_date, 'Début'); const b = reqDate(d.end_date, 'Fin');
    if (b < a) fail('La date de fin doit être postérieure ou égale à la date de début.');
    if (!KIND[d.kind]) fail('Type invalide.');
    const eid = Number(f.dataset.eid) || null;
    tx(() => {
      if (eid) { Object.assign(get('events', eid), { title, kind: d.kind, start_date: a, end_date: b }); audit('evenement_calendrier_modifie', 'event', eid); }
      else { const x = ins('events', { year_id: Number(f.dataset.id), title, kind: d.kind, start_date: a, end_date: b }); audit('evenement_calendrier_cree', 'event', x.id, title); }
    });
    go(`/annees/${f.dataset.id}`, eid ? 'Événement modifié.' : 'Événement ajouté au calendrier universitaire.');
  },
  refSave(d, f) {
    requireStaff();
    const t = REF[f.dataset.type]; const id = Number(f.dataset.id) || null;
    const o = {};
    for (const [k, label, ty, req] of t.fields) {
      if (ty === 'checkbox') o[k] = Boolean(d[k]);
      else if (ty === 'number') o[k] = k === 'capacity' ? reqInt(d[k], label, 1, 2000) : reqInt(d[k], label, 0, 1000);
      else o[k] = req ? reqTxt(d[k], label, k === 'code' ? 20 : 150) : optTxt(d[k], 150);
    }
    if (DB[t.table].some((r) => r.code.toLowerCase() === o.code.toLowerCase() && r.id !== id)) fail('Ce code est déjà utilisé.');
    tx(() => { if (id) { Object.assign(get(t.table, id), o); audit(`${t.table}_modifie`, t.table, id, o); } else { const r = ins(t.table, o); audit(`${t.table}_cree`, t.table, r.id, o); } });
    go(`/referentiels/${f.dataset.type}`, id ? 'Modifications enregistrées.' : `« ${o.code} » ajouté(e).`);
  },
  userSave(d, f) {
    requireStaff();
    const id = Number(f.dataset.id) || null; const u = id ? get('users', id) : null;
    const email = reqTxt(d.email, 'E-mail').toLowerCase(); if (!isEmail(email)) fail('Adresse e-mail invalide.');
    if (!ROLE[d.role]) fail('Rôle invalide.');
    if (!canManage(u) || !canManage({ role: d.role })) fail('Un responsable ne gère que les comptes enseignants.');
    if (DB.users.some((x) => x.email === email && x.id !== id)) fail('Cette adresse e-mail est déjà utilisée.');
    const o = { email, first_name: reqTxt(d.first_name, 'Prénom', 80), last_name: reqTxt(d.last_name, 'Nom', 80), role: d.role, grade: optTxt(d.grade, 80), department: optTxt(d.department, 100), phone: optTxt(d.phone, 30), quota_override: optInt(d.quota_override, 'Quota personnalisé', 0, 50), active: Boolean(d.active) };
    if (u) {
      if (u.id === ME.id && (o.role !== u.role || !o.active)) fail('Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte.');
      if (u.role === 'admin' && (o.role !== 'admin' || !o.active) && !DB.users.some((x) => x.role === 'admin' && x.active && x.id !== u.id)) fail('Il doit rester au moins un administrateur actif.');
      tx(() => { Object.assign(u, o, { updated_at: nowLocal() }); audit('utilisateur_modifie', 'user', u.id, { role: o.role, active: o.active }); });
      return go(`/utilisateurs/${u.id}`, 'Utilisateur mis à jour.');
    }
    let pwd = d.password ? String(d.password) : null;
    if (pwd) checkPasswordRule(pwd); else pwd = tempPassword();
    const nu = tx(() => { const x = ins('users', { ...o, password_hash: hashPassword(pwd), must_change_password: true, failed_logins: 0, locked_until: null, last_login_at: null, is_demo: false }); audit('utilisateur_cree', 'user', x.id, { email, role: o.role }); notify(x.id, { title: 'Bienvenue sur IPEIN Examens', body: 'Votre compte a été créé. Changez votre mot de passe provisoire à la première connexion.', kind: 'compte' }); return x; });
    go(`/utilisateurs/${nu.id}`, d.password ? 'Compte créé.' : `Compte créé. Mot de passe provisoire (à transmettre de manière sécurisée, affiché une seule fois) : ${pwd}`, d.password ? 'success' : 'warning');
  },
  sessionSave(d, f) {
    requireStaff();
    const id = Number(f.dataset.id) || null;
    const o = { semester_id: reqInt(d.semester_id, 'Semestre', 1), name: reqTxt(d.name, 'Nom', 120), start_date: reqDate(d.start_date, 'Début'), end_date: reqDate(d.end_date, 'Fin'),
      choices_open_at: optDT(d.choices_open_at, 'Ouverture des choix'), choices_close_at: optDT(d.choices_close_at, 'Clôture des choix'),
      default_quota: reqInt(d.default_quota, 'Quota', 0, 50), max_per_day: reqInt(d.max_per_day, 'Maximum par jour', 1, 6), min_choices: reqInt(d.min_choices || 0, 'Disponibilités minimales', 0, 100) };
    if (!get('semesters', o.semester_id)) fail('Semestre invalide.');
    if (o.end_date < o.start_date) fail('La date de fin de session doit être postérieure à la date de début.');
    if (o.choices_open_at && o.choices_close_at && o.choices_close_at <= o.choices_open_at) fail('La clôture des choix doit être postérieure à leur ouverture.');
    if (id) {
      const out = where('creneaux', (c) => c.session_id === id && (c.date < o.start_date || c.date > o.end_date)).length;
      if (out) fail(`${out} créneau(x) se situent hors des nouvelles dates de session.`);
      tx(() => { Object.assign(get('sessions', id), o); audit('session_modifiee', 'session', id, o); });
      return go(`/sessions/${id}`, 'Paramètres de la session enregistrés.');
    }
    const s = tx(() => { const x = ins('sessions', { ...o, status: 'brouillon', published_at: null }); audit('session_creee', 'session', x.id, o.name); return x; });
    go(`/sessions/${s.id}`, 'Session créée. Ajoutez maintenant les créneaux.');
  },
  creneauAdd(d, f) {
    requireStaff();
    const s = get('sessions', f.dataset.id); const date = reqDate(d.date, 'Date'); const a = reqTime(d.start_time, 'Début'); const b = reqTime(d.end_time, 'Fin');
    if (b <= a) fail('L’heure de fin doit être postérieure à l’heure de début.');
    if (date < s.start_date || date > s.end_date) fail('Le créneau doit être compris dans les dates de la session.');
    const cid = Number(f.dataset.cid) || null;
    if (where('creneaux', (c) => c.session_id === s.id && c.date === date && c.start_time === a && c.end_time === b && c.id !== cid).length) fail('Ce créneau existe déjà pour cette session.');
    if (cid) {
      const c = get('creneaux', cid);
      const ers = where('examRooms', (er) => er.creneau_id === cid);
      const moved = { ...c, date, start_time: a, end_time: b };
      for (const er of ers) for (const a2 of activeAssign((x) => x.exam_room_id === er.id)) {
        const clash = activeAssign((x) => x.teacher_id === a2.teacher_id && x.id !== a2.id && x.creneau_id !== cid).some((x) => overlaps(get('creneaux', x.creneau_id), moved));
        if (clash) fail(`Modification impossible : ${userName(a2.teacher_id)} aurait deux surveillances qui se chevauchent.`);
      }
      tx(() => {
        Object.assign(c, { date, start_time: a, end_time: b });
        const affected = [...new Set(ers.flatMap((er) => activeAssign((x) => x.exam_room_id === er.id).map((x) => x.teacher_id)))];
        if (affected.length) notify(affected, { title: 'Changement d’horaire d’une surveillance', body: `Un créneau a été déplacé au ${fmtDate(date, true)} de ${fmtTime(a)} à ${fmtTime(b)}.`, link: '#/mon-planning', kind: 'modification' });
        audit('creneau_modifie', 'creneau', cid);
      });
      return go(`/sessions/${s.id}`, 'Créneau modifié.');
    }
    tx(() => { const c = ins('creneaux', { session_id: s.id, date, start_time: a, end_time: b }); audit('creneau_cree', 'creneau', c.id); });
    go(`/sessions/${s.id}`, 'Créneau ajouté.');
  },
  creneauxGenerate(d, f) {
    requireStaff();
    const s = get('sessions', f.dataset.id); const from = reqDate(d.from, 'Du'); const to = reqDate(d.to, 'Au');
    if (from < s.start_date || to > s.end_date || to < from) fail('La période doit être comprise dans les dates de la session.');
    const plages = reqTxt(d.plages, 'Plages horaires', 300).split(/[,;\n]/).map((p) => p.trim()).filter(Boolean).map((p) => {
      const m = p.match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/);
      if (!m) fail(`Plage horaire invalide : « ${p} » (format attendu 08:30-10:30).`);
      const a = `${m[1]}:${m[2]}`; const b = `${m[3]}:${m[4]}`; if (b <= a) fail(`Plage horaire incohérente : « ${p} ».`); return [a, b];
    });
    let n = 0;
    tx(() => {
      for (let dt = from; dt <= to; dt = addDays(dt, 1)) {
        const dow = parseDate(dt).getDay(); if (dow === 0 || (dow === 6 && !d.saturday)) continue;
        for (const [a, b] of plages) if (!where('creneaux', (c) => c.session_id === s.id && c.date === dt && c.start_time === a && c.end_time === b).length) { ins('creneaux', { session_id: s.id, date: dt, start_time: a, end_time: b }); n++; }
      }
      audit('creneaux_generes', 'session', s.id, { n });
    });
    go(`/sessions/${s.id}`, `${n} créneau(x) créé(s).`);
  },
  examSave(d, f) {
    requireStaff();
    const id = Number(f.dataset.id) || null;
    const sid = reqInt(d.session_id, 'Session', 1);
    const o = { creneau_id: reqInt(d.creneau_id, 'Créneau', 1), subject_id: reqInt(d.subject_id, 'Matière', 1), class_id: reqInt(d.class_id, 'Classe', 1), responsible_id: optInt(d.responsible_id, 'Responsable', 1), confidential_notes: optTxt(d.confidential_notes, 5000) };
    const c = get('creneaux', o.creneau_id); if (!c || c.session_id !== sid) fail('Le créneau choisi n’appartient pas à la session.');
    const cls = get('classes', o.class_id); if (!cls || !get('subjects', o.subject_id)) fail('Matière ou classe invalide.');
    if (where('exams', (x) => x.creneau_id === o.creneau_id && x.class_id === o.class_id && x.id !== id && x.status === 'planifie').length) fail('Cette classe a déjà un examen sur ce créneau.');
    if (id) {
      const ex = get('exams', id); const moved = ex.creneau_id !== o.creneau_id;
      const affected = [...new Set(activeAssign((a) => where('examRooms', (er) => er.exam_id === id).some((er) => er.id === a.exam_room_id)).map((a) => a.teacher_id))];
      tx(() => {
        Object.assign(ex, o, { updated_at: nowLocal() });
        if (moved) {
          for (const er of where('examRooms', (r) => r.exam_id === id)) {
            if (!roomFree(o.creneau_id, er.room_id, er.id)) fail(`La salle ${get('rooms', er.room_id).code} est déjà occupée sur le nouveau créneau.`);
            er.creneau_id = o.creneau_id;
            for (const a of activeAssign((x) => x.exam_room_id === er.id)) {
              if (activeAssign((x) => x.teacher_id === a.teacher_id && x.creneau_id === o.creneau_id && x.id !== a.id).length) fail(`Déplacement impossible : ${userName(a.teacher_id)} est déjà affecté(e) sur le nouveau créneau.`);
              a.creneau_id = o.creneau_id;
            }
          }
          const bad = detectConflicts(sid).filter((x) => x.severity === 'erreur' && affected.includes(x.teacherId));
          if (bad.length) fail(`Déplacement impossible : ${bad.map((b) => b.message).join(' ')}`);
          if (affected.length) notify(affected, { title: 'Changement d’horaire d’une surveillance', body: `L’épreuve ${get('subjects', ex.subject_id).name} (${cls.code}) est déplacée au ${fmtDate(c.date, true)} de ${fmtTime(c.start_time)} à ${fmtTime(c.end_time)}.`, link: '#/mon-planning', kind: 'modification' });
        }
        audit('examen_modifie', 'exam', id, { moved });
      });
      return go(`/examens/${id}`, moved && affected.length ? `Examen modifié ; ${affected.length} surveillant(s) notifié(s).` : 'Examen modifié.');
    }
    const rid = arr(d.room_id).map(Number); const stu = arr(d.students); const sup = arr(d.supervisors);
    if (new Set(rid).size !== rid.length) fail('Une même salle est sélectionnée plusieurs fois.');
    let placed = 0;
    const ex = tx(() => {
      const x = ins('exams', { session_id: sid, ...o, status: 'planifie', created_by: ME.id, updated_at: nowLocal() });
      if (rid.length) rid.forEach((r, i) => { const n = reqInt(stu[i] ?? 0, 'Étudiants', 0, 2000); placed += n; addExamRoom(x, r, n, reqInt(sup[i] ?? 2, 'Surveillants', 1, 10)); });
      else { autoRooms(x, cls.student_count); placed = cls.student_count; }
      audit('examen_cree', 'exam', x.id, { classe: cls.code });
      return x;
    });
    go(`/examens/${ex.id}`, placed < cls.student_count ? `Examen programmé, mais seuls ${placed}/${cls.student_count} étudiants sont placés en salle.` : 'Examen programmé.', placed < cls.student_count ? 'warning' : 'success');
  },
  examRoomAdd(d, f) {
    requireStaff();
    const ex = get('exams', f.dataset.id);
    tx(() => { addExamRoom(ex, reqInt(d.room_id, 'Salle', 1), reqInt(d.students, 'Étudiants', 0, 2000), reqInt(d.supervisors, 'Surveillants', 1, 10)); audit('salle_examen_ajoutee', 'exam', ex.id); });
    go(`/examens/${ex.id}`, 'Salle ajoutée.');
  },
  examRoomUpdate(d, f) {
    requireStaff();
    const er = get('examRooms', f.dataset.id); const room = get('rooms', er.room_id);
    const n = reqInt(d.students, 'Étudiants', 0, 2000); const s = reqInt(d.supervisors, 'Surveillants', 1, 10);
    if (n > room.capacity) fail(`Capacité de la salle ${room.code} dépassée (${room.capacity}).`);
    const assigned = activeAssign((a) => a.exam_room_id === er.id).length;
    if (s < assigned) fail(`${assigned} surveillant(s) déjà affecté(s) : retirez-en avant de réduire le besoin.`);
    tx(() => { er.students = n; er.supervisors_needed = s; audit('salle_examen_modifiee', 'exam_room', er.id); });
    go(`/examens/${er.exam_id}`, 'Salle mise à jour.');
  },
  tirageSave(d, f) {
    requireStaff();
    const id = Number(f.dataset.id) || null; const t0 = id ? get('tirages', id) : null;
    if (t0 && ['annule', 'effectue'].includes(t0.status)) fail('Ce tirage est clôturé et ne peut plus être modifié.');
    const o = { session_id: reqInt(d.session_id, 'Session', 1), exam_id: optInt(d.exam_id, 'Examen', 1), subject_id: reqInt(d.subject_id, 'Matière', 1), date: reqDate(d.date, 'Date'), start_time: reqTime(d.start_time, 'Début'), end_time: reqTime(d.end_time, 'Fin'), location: reqTxt(d.location, 'Lieu', 150), copies: optInt(d.copies, 'Copies', 0, 100000), details: optTxt(d.details, 5000) };
    const parts = [...new Set(arr(d.participants).map(Number))];
    if (o.end_time <= o.start_time) fail('L’heure de fin doit être postérieure à l’heure de début.');
    if (!parts.length) fail('Invitez au moins un participant.');
    if (parts.some((p) => !get('users', p) || !get('users', p).active)) fail('Participant invalide.');
    if (o.exam_id) {
      const ex = get('exams', o.exam_id); if (!ex || ex.session_id !== o.session_id) fail('L’examen choisi n’appartient pas à la session.');
      if (ex.subject_id !== o.subject_id) fail('La matière ne correspond pas à l’examen sélectionné.');
      if (o.date > get('creneaux', ex.creneau_id).date) fail('Le tirage doit avoir lieu avant ou le jour de l’examen.');
    }
    const sj = get('subjects', o.subject_id).name;
    const desc = (t) => `${sj} — ${fmtDate(t.date, true)} de ${fmtTime(t.start_time)} à ${fmtTime(t.end_time)}, lieu : ${t.location}`;
    if (!t0) {
      const t = tx(() => {
        const x = ins('tirages', { ...o, status: 'planifie', reminder_sent_at: null, created_by: ME.id, updated_at: nowLocal() });
        parts.forEach((u) => ins('tparts', { tirage_id: x.id, user_id: u, response: 'en_attente', comment: null, responded_at: null }));
        ins('thist', { tirage_id: x.id, actor_id: ME.id, action: 'creation', details: `${parts.length} participant(s) invité(s)` });
        notify(parts, { title: 'Invitation : rendez-vous de tirage', body: `Vous êtes convoqué(e) au tirage : ${desc(x)}.\nMerci de confirmer votre présence.`, link: `#/tirages/${x.id}`, kind: 'tirage' });
        audit('tirage_cree', 'tirage', x.id);
        return x;
      });
      return go(`/tirages/${t.id}`, `Tirage planifié ; ${parts.length} invitation(s) envoyée(s).`);
    }
    const changed = [];
    if (o.date !== t0.date) changed.push(`date : ${fmtDate(t0.date)} → ${fmtDate(o.date)}`);
    if (o.start_time !== t0.start_time || o.end_time !== t0.end_time) changed.push(`horaire : ${fmtTime(t0.start_time)}–${fmtTime(t0.end_time)} → ${fmtTime(o.start_time)}–${fmtTime(o.end_time)}`);
    if (o.location !== t0.location) changed.push(`lieu : ${t0.location} → ${o.location}`);
    const before = tirageParts(t0.id).map((p) => p.user_id);
    const added = parts.filter((u) => !before.includes(u)); const removed = before.filter((u) => !parts.includes(u));
    tx(() => {
      Object.assign(t0, o, { updated_at: nowLocal() });
      if (changed.length) { t0.status = 'modifie'; t0.reminder_sent_at = null; tirageParts(t0.id).forEach((p) => { p.response = 'en_attente'; p.responded_at = null; }); }
      added.forEach((u) => ins('tparts', { tirage_id: t0.id, user_id: u, response: 'en_attente', comment: null, responded_at: null }));
      rm('tparts', (p) => p.tirage_id === t0.id && removed.includes(p.user_id));
      ins('thist', { tirage_id: t0.id, actor_id: ME.id, action: 'modification', details: [changed.join(' ; '), added.length ? `${added.length} ajouté(s)` : '', removed.length ? `${removed.length} retiré(s)` : ''].filter(Boolean).join(' — ') || 'Détails mis à jour' });
      const stay = parts.filter((u) => !added.includes(u));
      if (changed.length && stay.length) notify(stay, { title: 'Tirage modifié — nouvelle confirmation requise', body: `Le rendez-vous a été modifié (${changed.join(' ; ')}).\n${desc(t0)}`, link: `#/tirages/${t0.id}`, kind: 'tirage' });
      if (added.length) notify(added, { title: 'Invitation : rendez-vous de tirage', body: `Vous êtes convoqué(e) au tirage : ${desc(t0)}.`, link: `#/tirages/${t0.id}`, kind: 'tirage' });
      if (removed.length) notify(removed, { title: 'Tirage : invitation retirée', body: `Votre participation au tirage ${sj} du ${fmtDate(t0.date)} n’est plus requise.`, kind: 'tirage' });
      audit('tirage_modifie', 'tirage', t0.id, { changed });
    });
    go(`/tirages/${t0.id}`, 'Tirage mis à jour.');
  },
  tirageRespond(d, f) {
    const t = get('tirages', f.dataset.id); const p = tirageParts(t.id).find((x) => x.user_id === ME.id);
    if (!p) fail('Vous n’êtes pas invité(e) à ce tirage.');
    if (['annule', 'effectue'].includes(t.status)) fail('Ce tirage est clôturé.');
    if (!['confirme', 'decline'].includes(d.response)) fail('Réponse invalide.');
    const comment = optTxt(d.comment, 500);
    if (d.response === 'decline' && !comment) fail('Indiquez le motif de votre indisponibilité.');
    tx(() => {
      Object.assign(p, { response: d.response, comment, responded_at: nowLocal() });
      ins('thist', { tirage_id: t.id, actor_id: ME.id, action: d.response === 'confirme' ? 'presence_confirmee' : 'presence_declinee', details: comment });
      if (t.created_by && t.created_by !== ME.id) notify(t.created_by, { title: `Tirage ${get('subjects', t.subject_id).name} : ${d.response === 'confirme' ? 'présence confirmée' : 'participant indisponible'}`, body: `${fullName(ME)} a ${d.response === 'confirme' ? 'confirmé sa présence' : `décliné l’invitation (${comment})`}.`, link: `#/tirages/${t.id}`, kind: 'tirage' });
      audit('tirage_reponse', 'tirage', t.id, d.response);
    });
    go(`/tirages/${t.id}`, d.response === 'confirme' ? 'Présence confirmée.' : 'Indisponibilité transmise aux responsables.');
  },
  myChoices(d, f) {
    const s = sessionFull(f.dataset.id); const w = choiceWindow(s); if (!w.open) fail(w.reason);
    const submit = d.action === 'soumettre';
    tx(() => {
      for (const c of sessionCreneaux(s.id)) {
        const v = d[`etat_${c.id}`]; if (v === undefined) continue;
        if (!['disponible', 'indisponible', ''].includes(v)) fail('Valeur de disponibilité invalide.');
        rm('avail', (a) => a.teacher_id === ME.id && a.creneau_id === c.id);
        if (v) ins('avail', { session_id: s.id, teacher_id: ME.id, creneau_id: c.id, state: v, comment: optTxt(d[`comment_${c.id}`], 300) });
      }
      const dispo = where('avail', (a) => a.session_id === s.id && a.teacher_id === ME.id && a.state === 'disponible').length;
      if (submit && dispo < Math.max(s.min_choices, 1)) fail(`Déclarez au moins ${Math.max(s.min_choices, 1)} créneau(x) disponible(s) avant de soumettre (actuellement ${dispo}).`);
      let sub = where('subs', (x) => x.session_id === s.id && x.teacher_id === ME.id)[0];
      if (!sub) sub = ins('subs', { session_id: s.id, teacher_id: ME.id, status: 'brouillon', submitted_at: null });
      sub.status = submit ? 'soumis' : 'brouillon'; if (submit) sub.submitted_at = nowLocal();
      audit(submit ? 'choix_soumis' : 'choix_enregistres', 'session', s.id);
      if (submit) notify(ME.id, { title: 'Choix de surveillance soumis', body: `Vos disponibilités pour « ${s.name} » ont bien été soumises. Modifiables jusqu’à la clôture${s.choices_close_at ? ` (${fmtDT(s.choices_close_at)})` : ''}. Si vous utilisez une copie distribuée, exportez vos choix et transmettez le fichier au service.`, link: '#/mes-disponibilites', kind: 'choix' });
    });
    go(`/mes-disponibilites?session=${s.id}`, submit ? 'Vos choix ont été soumis.' : 'Brouillon enregistré. Pensez à soumettre vos choix avant la date limite.');
  },
  absenceRequest(d, f) {
    const a = get('assignments', f.dataset.id);
    if (!a || a.teacher_id !== ME.id || a.status === 'annule') fail('Surveillance introuvable.');
    const ds = describeAssignment(a);
    if (ds.date < today()) fail('Cette surveillance est déjà passée.');
    if (where('absences', (r) => r.assignment_id === a.id && r.status === 'en_attente').length) fail('Une demande est déjà en cours pour cette surveillance.');
    const reason = reqTxt(d.reason, 'Motif', 1000); if (reason.length < 5) fail('Motif : 5 caractères minimum.');
    tx(() => { const r = ins('absences', { assignment_id: a.id, teacher_id: ME.id, reason, status: 'en_attente', decision_note: null, decided_by: null, decided_at: null, replacement_assignment_id: null }); notifyRoles(['admin', 'responsable'], { title: `Demande d’absence : ${fullName(ME)}`, body: `Surveillance du ${slotText(ds)}.\nMotif : ${reason}`, link: '#/absences', kind: 'absence' }); audit('absence_demandee', 'absence', r.id); });
    go('/mon-planning', 'Demande d’absence transmise. Vous restez affecté(e) tant qu’elle n’est pas acceptée.');
  },
  absenceDecide(d, f) {
    requireStaff();
    const r = get('absences', f.dataset.id); if (!r || r.status !== 'en_attente') fail('Cette demande a déjà été traitée.');
    const dec = d.decision; if (!['acceptee', 'refusee'].includes(dec)) fail('Décision invalide.');
    const note = optTxt(d.note, 500); const repl = optInt(d.replacement_id, 'Remplaçant', 1);
    const ds = describeAssignment(get('assignments', r.assignment_id));
    let msg;
    tx(() => {
      let newId = null;
      if (dec === 'acceptee') {
        if (repl) { newId = replaceAssignment({ assignmentId: r.assignment_id, newTeacherId: repl, reason: 'Absence acceptée', force: true }).a.id; msg = 'Absence acceptée et remplaçant affecté.'; }
        else { unassign(r.assignment_id, 'Absence acceptée'); msg = 'Absence acceptée ; la place est à pourvoir (voir créneaux incomplets).'; }
      } else { if (!note) fail('Indiquez le motif du refus.'); msg = 'Demande refusée ; l’enseignant a été prévenu.'; }
      Object.assign(r, { status: dec, decision_note: note, decided_by: ME.id, decided_at: nowLocal(), replacement_assignment_id: newId });
      notify(r.teacher_id, { title: dec === 'acceptee' ? 'Demande d’absence acceptée' : 'Demande d’absence refusée', body: `Surveillance du ${slotText(ds)}.${dec === 'acceptee' ? ' Vous êtes déchargé(e) de cette surveillance.' : ' Vous restez affecté(e).'}${note ? `\nCommentaire : ${note}` : ''}`, link: '#/mon-planning', kind: 'absence' });
      audit(`absence_${dec}`, 'absence', r.id, { remplacant: repl });
    });
    go('/absences', msg);
  },
  leaveAdd(d) {
    requireStaff();
    const tid = reqInt(d.teacher_id, 'Enseignant', 1); const a = reqDate(d.start_date, 'Début'); const b = reqDate(d.end_date, 'Fin');
    if (b < a) fail('La date de fin doit être postérieure ou égale à la date de début.');
    const impacted = activeAssign((x) => x.teacher_id === tid).filter((x) => { const c = get('creneaux', x.creneau_id); return c.date >= a && c.date <= b; }).length;
    tx(() => { const l = ins('leaves', { teacher_id: tid, start_date: a, end_date: b, reason: optTxt(d.reason, 300), created_by: ME.id }); audit('periode_absence_creee', 'leave', l.id); });
    go('/absences', impacted ? `Absence enregistrée. Attention : ${impacted} surveillance(s) déjà affectée(s) sur cette période — elles apparaissent dans les conflits.` : `Absence enregistrée du ${fmtDate(a)} au ${fmtDate(b)}.`, impacted ? 'warning' : 'success');
  },
  annSave(d, f) {
    requireStaff();
    const id = Number(f.dataset.id) || null;
    const o = { title: reqTxt(d.title, 'Titre', 150), body: reqTxt(d.body, 'Contenu', 5000), audience: AUD[d.audience] ? d.audience : 'tous', pinned: Boolean(d.pinned), expires_at: d.expires_at ? reqDate(d.expires_at, 'Expiration') : null };
    tx(() => {
      if (id) { Object.assign(get('announcements', id), o); audit('annonce_modifiee', 'announcement', id); return; }
      const a = ins('announcements', { ...o, author_id: ME.id });
      notifyRoles(o.audience === 'tous' ? ['admin', 'responsable', 'enseignant'] : o.audience === 'enseignant' ? ['enseignant'] : ['admin', 'responsable'], { title: `Annonce : ${o.title}`, body: o.body.slice(0, 500), link: '#/annonces', kind: 'annonce' });
      audit('annonce_publiee', 'announcement', a.id);
    });
    go('/annonces', id ? 'Annonce modifiée.' : 'Annonce publiée.');
  },
  messageSend(d) {
    const rec = [...new Set(arr(d.recipients).map(Number))];
    if (!rec.length) fail('Choisissez au moins un destinataire.');
    const allowed = new Set(recipientsFor(ME).map((r) => r.id));
    if (rec.some((r) => !allowed.has(r))) fail('Destinataire non autorisé.');
    const subject = reqTxt(d.subject, 'Objet', 150); const body = reqTxt(d.body, 'Message', 5000);
    tx(() => { for (const r of rec) { const m = ins('messages', { sender_id: ME.id, recipient_id: r, subject, body, read_at: null }); notify(r, { title: `Nouveau message de ${fullName(ME)}`, body: subject, link: `#/messages/${m.id}`, kind: 'message' }); } audit('message_envoye', 'message', null, { n: rec.length }); });
    go('/messages?boite=envoyes', `Message envoyé à ${rec.length} destinataire(s).`);
  },
  settingsSave(d) {
    requireAdmin();
    tx(() => {
      Object.assign(DB.settings, { allow_outside_choices: Boolean(d.allow_outside_choices), exclude_exam_responsible: Boolean(d.exclude_exam_responsible), students_per_supervisor: reqInt(d.students_per_supervisor, 'Étudiants par surveillant', 5, 200), min_supervisors_per_room: reqInt(d.min_supervisors_per_room, 'Surveillants minimum', 1, 10), reminder_hours_before: reqInt(d.reminder_hours_before, 'Délai de rappel', 1, 168) });
      audit('parametres_modifies', 'settings');
    });
    go('/parametres', 'Paramètres enregistrés.');
  },
  async importRun(d) {
    requireStaff();
    const type = IMPORTS[d.type]; if (!type) fail('Type d’import inconnu.');
    const file = d.fichier; if (!(file instanceof File) || !file.size) fail('Sélectionnez un fichier à importer.');
    if (file.size > 5 * 1024 * 1024) fail('Fichier trop volumineux (5 Mo maximum).');
    const name = file.name.toLowerCase();
    let matrix;
    if (name.endsWith('.csv')) matrix = parseCSV(await file.text());
    else if (name.endsWith('.xlsx')) matrix = await readXlsx(await file.arrayBuffer());
    else fail('Format non pris en charge : utilisez .xlsx ou .csv.');
    IMPORT_RESULT = runImport(d.type, matrix, { commit: d.mode === 'importer', sessionId: Number(d.session_id) || null });
    go(`/imports?type=${d.type}`, IMPORT_RESULT.committed ? `Import réalisé : ${IMPORT_RESULT.total} ligne(s).` : IMPORT_RESULT.valid ? 'Fichier valide : vous pouvez lancer l’import.' : `${IMPORT_RESULT.errors} ligne(s) en erreur : rien n’a été importé.`, IMPORT_RESULT.valid ? 'success' : 'error');
  },
};

/* ---------- Import ligne par ligne ---------- */
const normH = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const xlDate = (v) => { if (/^\d+(\.\d+)?$/.test(v) && Number(v) > 20000) { const d = new Date(Math.round((Number(v) - 25569) * 86400000)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; } const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : v; };
const xlTime = (v) => { if (/^0?\.\d+$/.test(v)) { const m = Math.round(Number(v) * 1440); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; } const m = String(v).replace('h', ':').match(/^(\d{1,2}):?(\d{2})?$/); return m ? `${pad(m[1])}:${m[2] || '00'}` : v; };
function runImport(key, matrix, { commit, sessionId }) {
  const type = IMPORTS[key];
  const mapH = (row) => { const idx = {}; const n = row.map(normH); for (const [k, al] of Object.entries(type.cols)) { const i = n.findIndex((h) => al.includes(h)); if (i >= 0) idx[k] = i; } return idx; };
  const hr = matrix.findIndex((row) => { const idx = mapH(row); return type.req.filter((k) => idx[k] !== undefined).length >= 2; });
  if (hr < 0) fail(`En-têtes introuvables. Colonnes attendues : ${Object.keys(type.cols).join(', ')}.`);
  const idx = mapH(matrix[hr]); const missing = type.req.filter((k) => idx[k] === undefined);
  if (missing.length) fail(`Colonnes obligatoires manquantes : ${missing.join(', ')}.`);
  const session = type.session ? (sessionId ? sessionFull(sessionId) : fail('Choisissez la session de destination.')) : null;
  const rows = matrix.slice(hr + 1).map((raw, i) => { const r = { _line: hr + i + 2 }; for (const [k, j] of Object.entries(idx)) r[k] = String(raw[j] ?? '').trim(); return r; }).filter((r) => Object.keys(idx).some((k) => r[k]));
  if (!rows.length) fail('Le fichier ne contient aucune ligne de données.');
  const seen = new Set(); const plan = [];
  const report = rows.map((r) => {
    const errors = type.req.filter((k) => !r[k]).map((k) => `${k} manquant`);
    if (!errors.length) {
      if (key === 'enseignants') {
        r.email = r.email.toLowerCase(); if (!isEmail(r.email)) errors.push('e-mail invalide');
        if (r.quota && !/^\d+$/.test(r.quota)) errors.push('quota invalide');
        const ex = DB.users.find((u) => u.email === r.email); if (ex && ex.role !== 'enseignant') errors.push('e-mail utilisé par un compte non enseignant');
        if (seen.has(r.email)) errors.push('doublon dans le fichier'); seen.add(r.email);
      } else if (key === 'classes') { if (!/^\d+$/.test(r.effectif)) errors.push('effectif invalide'); }
      else if (key === 'salles') { if (!/^\d+$/.test(r.capacite) || Number(r.capacite) < 1) errors.push('capacité invalide'); }
      if (['matieres', 'classes', 'salles'].includes(key)) { if (seen.has(r.code.toLowerCase())) errors.push('doublon dans le fichier'); seen.add(r.code.toLowerCase()); }
      if (key === 'examens') {
        r.date = xlDate(r.date); r.debut = xlTime(r.debut); r.fin = xlTime(r.fin);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) errors.push('date invalide'); else if (r.date < session.start_date || r.date > session.end_date) errors.push('date hors de la session');
        if (!/^\d{2}:\d{2}$/.test(r.debut) || !/^\d{2}:\d{2}$/.test(r.fin) || r.fin <= r.debut) errors.push('horaires invalides');
        r._s = DB.subjects.find((x) => x.code.toLowerCase() === r.matiere.toLowerCase()); if (!r._s) errors.push(`matière « ${r.matiere} » inconnue`);
        r._c = DB.classes.find((x) => x.code.toLowerCase() === r.classe.toLowerCase()); if (!r._c) errors.push(`classe « ${r.classe} » inconnue`);
        r._rooms = String(r.salles || '').split(/[+,;/]/).map((x) => x.trim()).filter(Boolean).map((code) => { const room = DB.rooms.find((x) => x.code.toLowerCase() === code.toLowerCase() && x.active); if (!room) errors.push(`salle « ${code} » inconnue ou inactive`); return room; }).filter(Boolean);
        if (r.surveillants && !/^\d+$/.test(r.surveillants)) errors.push('nombre de surveillants invalide');
        if (r.responsable) { r._resp = DB.users.find((u) => u.email === r.responsable.toLowerCase() && u.active); if (!r._resp) errors.push('responsable inconnu'); }
        const k2 = `${r.date}|${r.debut}|${r.classe}`; if (seen.has(k2)) errors.push('doublon dans le fichier'); seen.add(k2);
      }
    }
    plan.push(r);
    return { line: r._line, label: `${r[type.req[0]]}${r[type.req[1]] ? ` — ${r[type.req[1]]}` : ''}`, errors, result: null };
  });
  const valid = report.every((x) => !x.errors.length);
  const credentials = [];
  if (commit && valid) {
    tx(() => {
      plan.forEach((r, i) => {
        if (key === 'enseignants') {
          const ex = DB.users.find((u) => u.email === r.email);
          const o = { last_name: r.nom, first_name: r.prenom, grade: r.grade || null, department: r.departement || null, phone: r.telephone || null, quota_override: r.quota ? Number(r.quota) : null };
          if (ex) { Object.assign(ex, o); report[i].result = 'mis à jour'; } else { const p = tempPassword(); ins('users', { ...o, email: r.email, role: 'enseignant', password_hash: hashPassword(p), active: true, must_change_password: true, failed_logins: 0, locked_until: null, last_login_at: null, is_demo: false }); credentials.push({ name: `${r.nom} ${r.prenom}`, email: r.email, password: p }); report[i].result = 'créé'; }
        } else if (['matieres', 'classes', 'salles'].includes(key)) {
          const tbl = { matieres: 'subjects', classes: 'classes', salles: 'rooms' }[key];
          const o = key === 'matieres' ? { code: r.code, name: r.intitule, department: r.departement || null } : key === 'classes' ? { code: r.code, name: r.intitule, level: r.niveau || null, student_count: Number(r.effectif) } : { code: r.code, name: r.nom, building: r.batiment || null, capacity: Number(r.capacite) };
          const ex = DB[tbl].find((x) => x.code.toLowerCase() === r.code.toLowerCase());
          if (ex) { Object.assign(ex, o); report[i].result = 'mis à jour'; } else { ins(tbl, key === 'salles' ? { ...o, active: true } : o); report[i].result = 'créé'; }
        } else {
          let c = DB.creneaux.find((x) => x.session_id === session.id && x.date === r.date && x.start_time === r.debut && x.end_time === r.fin);
          if (!c) c = ins('creneaux', { session_id: session.id, date: r.date, start_time: r.debut, end_time: r.fin });
          if (where('exams', (x) => x.creneau_id === c.id && x.class_id === r._c.id && x.status === 'planifie').length) fail(`Ligne ${r._line} : la classe ${r._c.code} a déjà un examen sur ce créneau.`);
          const x = ins('exams', { session_id: session.id, creneau_id: c.id, subject_id: r._s.id, class_id: r._c.id, responsible_id: r._resp ? r._resp.id : null, status: 'planifie', confidential_notes: null, created_by: ME.id, updated_at: nowLocal() });
          if (r._rooms.length) { let left = r._c.student_count; for (const room of r._rooms) { const n = Math.max(0, Math.min(room.capacity, left)); left -= n; addExamRoom(x, room.id, n, r.surveillants ? Number(r.surveillants) : supervisorsDefault(n)); } if (left > 0) fail(`Ligne ${r._line} : capacité des salles insuffisante (${left} étudiant(s)).`); } else autoRooms(x, r._c.student_count);
          report[i].result = 'créé';
        }
      });
      audit('import', key, session ? session.id : null, { lignes: plan.length });
    });
  }
  return { type: key, label: type.label, total: plan.length, valid, committed: commit && valid, report, credentials, errors: report.filter((x) => x.errors.length).length };
}

/* ---------- Actions (boutons) ---------- */
const ACTS = {
  toggleNav() { document.body.classList.toggle('nav-open'); },
  refreshRemote() { Store.remoteDirty = false; showRemoteBadge(false); render(); },
  dismiss(el) { el.closest('.alert').remove(); },
  print() { try { window.print(); } catch { /* cadre sans impression */ } },
  async logout() {
    if (ME && !Store.readOnly) tx(() => audit('deconnexion', 'user', ME.id));
    SessionBox.clear(); ME = null;
    if (Store.auth) { renderLoading('Déconnexion…'); await Store.authLogout(); }
    go('/', 'Vous êtes déconnecté(e).', 'info');
  },
  loadDemo() { if (DB.users.length) fail('Des données existent déjà : la démonstration ne peut être chargée que sur une base vide.'); seedDemo(); SessionBox.clear(); go('/', `Données de démonstration chargées. Mot de passe de tous les comptes : ${DEMO_PASSWORD}`, 'info'); },
  openNotif(el, ev) { ev.preventDefault(); const n = get('notifications', el.dataset.id); if (n && !n.read_at) { n.read_at = nowLocal(); persistQuiet(); } const link = n && n.link && n.link.startsWith('#/') ? n.link.slice(1) : '/notifications'; go(link); },
  readAll() { tx(() => DB.notifications.forEach((n) => { if (n.user_id === ME.id && !n.read_at) n.read_at = nowLocal(); })); go('/notifications', 'Toutes les notifications sont marquées comme lues.'); },
  addRoomRow() { $('[data-rooms]').appendChild($('#room-row').content.cloneNode(true)); },
  removeRow(el) { el.closest('.room-row').remove(); },
  fillChoices(el) { $$('.slot-choice').forEach((row) => { const r = $(`input[value="${el.dataset.v}"]`, row); if (r && !r.disabled) r.checked = true; }); refreshChoiceForm(); },
  sessionStatus(el) {
    requireStaff();
    const s = get('sessions', el.dataset.id); const to = el.dataset.to;
    const allowedFrom = { choix_ouverts: ['brouillon', 'choix_clos'], choix_clos: ['choix_ouverts'], brouillon: ['choix_ouverts', 'choix_clos'] }[to];
    if (!allowedFrom || !allowedFrom.includes(s.status)) fail('Transition impossible depuis ce statut.');
    if (to === 'choix_ouverts' && !where('creneaux', (c) => c.session_id === s.id).length) fail('Ajoutez au moins un créneau avant d’ouvrir les choix.');
    tx(() => {
      s.status = to;
      if (to === 'choix_ouverts') { delete DB.settings.reminders_sent[s.id]; notifyRoles(['enseignant'], { title: `Choix des surveillances ouverts : ${s.name}`, body: `Déclarez vos disponibilités et soumettez vos choix${s.choices_close_at ? ` avant le ${fmtDT(s.choices_close_at)}` : ''}. Quota : ${s.default_quota} surveillance(s).`, link: '#/mes-disponibilites', kind: 'choix' }); }
      if (to === 'choix_clos') notifyRoles(['enseignant'], { title: `Choix clos : ${s.name}`, body: 'La période de déclaration des disponibilités est terminée.', link: '#/mes-disponibilites', kind: 'choix' });
      addHistory(s.id, null, `statut_${to}`, null); audit(`session_${to}`, 'session', s.id);
    });
    go(`/sessions/${s.id}`, { choix_ouverts: 'Période de choix ouverte ; les enseignants ont été notifiés.', choix_clos: 'Période de choix close.', brouillon: 'Session repassée en brouillon.' }[to]);
  },
  sessionDelete(el) {
    requireAdmin();
    const s = get('sessions', el.dataset.id);
    const n = where('exams', (x) => x.session_id === s.id).length; if (n) fail(`Suppression impossible : la session contient ${n} examen(s).`);
    tx(() => { const crIds = new Set(where('creneaux', (c) => c.session_id === s.id).map((c) => c.id)); rm('creneaux', (c) => c.session_id === s.id); rm('avail', (a) => crIds.has(a.creneau_id)); rm('subs', (x) => x.session_id === s.id); rm('history', (h) => h.session_id === s.id); rm('sessions', (x) => x.id === s.id); audit('session_supprimee', 'session', s.id, s.name); });
    go('/sessions', 'Session supprimée.');
  },
  creneauDelete(el) {
    requireStaff();
    const c = get('creneaux', el.dataset.id);
    if (where('exams', (x) => x.creneau_id === c.id).length) fail('Ce créneau porte des examens : déplacez-les ou supprimez-les d’abord.');
    tx(() => { rm('creneaux', (x) => x.id === c.id); rm('avail', (a) => a.creneau_id === c.id); audit('creneau_supprime', 'creneau', c.id); });
    go(`/sessions/${c.session_id}`, 'Créneau supprimé.');
  },
  examCancel(el) {
    requireStaff();
    const x = get('exams', el.dataset.id); if (x.status === 'annule') fail('Examen déjà annulé.');
    const erIds = new Set(where('examRooms', (r) => r.exam_id === x.id).map((r) => r.id));
    const affected = [];
    tx(() => {
      x.status = 'annule'; x.updated_at = nowLocal();
      for (const a of activeAssign((y) => erIds.has(y.exam_room_id))) { a.status = 'annule'; affected.push(a.teacher_id); addHistory(x.session_id, a.id, 'annulation_examen', a.teacher_id); }
      const f = examFull(x);
      if (affected.length) notify(affected, { title: 'Épreuve annulée', body: `L’épreuve ${f.subject_name} (${f.class_code}) du ${fmtDate(f.date, true)} est annulée. Votre surveillance est supprimée.`, link: '#/mon-planning', kind: 'modification' });
      audit('examen_annule', 'exam', x.id);
    });
    go(`/examens/${x.id}`, `Examen annulé${affected.length ? ` ; ${affected.length} surveillant(s) prévenu(s)` : ''}.`);
  },
  examDelete(el) {
    requireAdmin();
    const x = get('exams', el.dataset.id);
    const erIds = new Set(where('examRooms', (r) => r.exam_id === x.id).map((r) => r.id));
    if (activeAssign((a) => erIds.has(a.exam_room_id) && a.status === 'confirme').length) fail('Des surveillances confirmées existent : annulez l’examen plutôt que de le supprimer.');
    tx(() => { rm('assignments', (a) => erIds.has(a.exam_room_id)); rm('examRooms', (r) => r.exam_id === x.id); DB.tirages.forEach((t) => { if (t.exam_id === x.id) t.exam_id = null; }); rm('exams', (y) => y.id === x.id); audit('examen_supprime', 'exam', x.id); });
    go(`/examens?session=${x.session_id}`, 'Examen supprimé.');
  },
  examRoomDelete(el) {
    requireStaff();
    const er = get('examRooms', el.dataset.id);
    if (activeAssign((a) => a.exam_room_id === er.id).length) fail('Retirez d’abord les surveillants affectés à cette salle.');
    tx(() => { rm('examRooms', (r) => r.id === er.id); audit('salle_examen_supprimee', 'exam_room', er.id); });
    go(`/examens/${er.exam_id}`, 'Salle retirée de l’examen.');
  },
  tirageReminder(el) { requireStaff(); const t = get('tirages', el.dataset.id); const n = tx(() => { audit('tirage_rappel', 'tirage', t.id); return sendTirageReminder(t); }); go(`/tirages/${t.id}`, `Rappel envoyé à ${n} participant(s).`); },
  tirageStatus(el) {
    requireStaff();
    const t = get('tirages', el.dataset.id); if (['annule', 'effectue'].includes(t.status)) fail('Ce tirage est déjà clôturé.');
    tx(() => {
      t.status = el.dataset.to; t.updated_at = nowLocal();
      ins('thist', { tirage_id: t.id, actor_id: ME.id, action: t.status === 'annule' ? 'annulation' : 'realise', details: null });
      if (t.status === 'annule') notify(tirageParts(t.id).map((p) => p.user_id), { title: `Tirage annulé : ${get('subjects', t.subject_id).name}`, body: `Le rendez-vous de tirage du ${fmtDate(t.date, true)} est annulé.`, link: `#/tirages/${t.id}`, kind: 'tirage' });
      audit(`tirage_${t.status}`, 'tirage', t.id);
    });
    go(`/tirages/${t.id}`, t.status === 'annule' ? 'Tirage annulé, participants prévenus.' : 'Tirage marqué comme effectué.');
  },
  assign(el) { requireStaff(); const r = assign({ examRoomId: Number(el.dataset.room), teacherId: Number(el.dataset.teacher), force: el.dataset.force === '1' }); tx(() => audit('affectation_manuelle', 'assignment', r.a.id, { warnings: r.warnings })); go(`/planning/salle/${el.dataset.room}`, r.warnings.length ? `Affectation enregistrée avec dérogation : ${r.warnings.join(' ')}` : 'Surveillant affecté.', r.warnings.length ? 'warning' : 'success'); },
  replace(el) { requireStaff(); const old = get('assignments', el.dataset.old); replaceAssignment({ assignmentId: old.id, newTeacherId: Number(el.dataset.teacher), reason: 'Remplacement décidé par le service des examens', force: el.dataset.force === '1' }); tx(() => audit('affectation_remplacee', 'assignment', old.id)); go(`/planning?session=${old.session_id}`, 'Remplacement effectué ; les deux enseignants ont été prévenus.'); },
  unassign(el) { requireStaff(); const a = unassign(Number(el.dataset.id)); tx(() => audit('affectation_retiree', 'assignment', a.id)); go(ROUTE || '/planning', 'Surveillant retiré.'); },
  autoAssign(el) { requireStaff(); const r = autoAssign(Number(el.dataset.id), { mode: el.dataset.mode }); tx(() => audit('affectation_automatique', 'session', Number(el.dataset.id), r)); go(`/planning?session=${el.dataset.id}`, `${r.created} affectation(s) proposée(s)${r.outsideCount ? ` (dont ${r.outsideCount} hors vœux)` : ''}. ${r.missing ? `${r.missing} place(s) restent à pourvoir manuellement.` : 'Tous les besoins sont couverts.'}`, r.missing ? 'warning' : 'success'); },
  confirmAll(el) { requireStaff(); const n = tx(() => { const k = confirmAll(Number(el.dataset.id)); audit('affectations_confirmees', 'session', Number(el.dataset.id), { n: k }); return k; }); go(`/planning?session=${el.dataset.id}`, `${n} affectation(s) confirmée(s).`); },
  publish(el) { requireStaff(); const n = publish(Number(el.dataset.id)); tx(() => audit('planning_publie', 'session', Number(el.dataset.id))); go(`/planning?session=${el.dataset.id}`, `Planning définitif publié ; ${n} enseignant(s) notifié(s).`); },
  unpublish(el) { requireAdmin(); tx(() => { const s = get('sessions', el.dataset.id); s.status = 'choix_clos'; s.published_at = null; addHistory(s.id, null, 'depublication', null); audit('planning_depublie', 'session', s.id); }); go(`/planning?session=${el.dataset.id}`, 'Publication retirée : la session repasse en « choix clos ».', 'warning'); },
  choicesRemind(el) {
    requireStaff();
    const s = get('sessions', el.dataset.id);
    const ids = activeTeachers().filter((t) => !where('subs', (x) => x.session_id === s.id && x.teacher_id === t.id && x.status === 'soumis').length).map((t) => t.id);
    tx(() => { notify(ids, { title: `Rappel : choix des surveillances (${s.name})`, body: `Vous n’avez pas encore soumis vos disponibilités.${s.choices_close_at ? ` Date limite : ${fmtDT(s.choices_close_at)}.` : ''}`, link: '#/mes-disponibilites', kind: 'rappel' }); audit('choix_relance', 'session', s.id, { n: ids.length }); });
    go(`/choix?session=${s.id}`, `Rappel envoyé à ${ids.length} enseignant(s).`);
  },
  choicesReopen(el) {
    requireStaff();
    const sub = where('subs', (x) => x.session_id === Number(el.dataset.session) && x.teacher_id === Number(el.dataset.teacher))[0];
    if (!sub) fail('Aucune soumission à rouvrir.');
    tx(() => { sub.status = 'brouillon'; notify(sub.teacher_id, { title: 'Vos choix ont été rouverts', body: `Le service des examens a rouvert vos choix pour « ${get('sessions', sub.session_id).name} ». Merci de les vérifier et de les soumettre à nouveau.`, link: '#/mes-disponibilites', kind: 'choix' }); audit('choix_rouverts', 'user', sub.teacher_id); });
    go(`/choix?session=${sub.session_id}`, 'Soumission rouverte ; l’enseignant a été prévenu.');
  },
  leaveDelete(el) { requireStaff(); tx(() => { rm('leaves', (l) => l.id === Number(el.dataset.id)); audit('periode_absence_supprimee', 'leave', Number(el.dataset.id)); }); go('/absences', 'Période d’absence supprimée.'); },
  annDelete(el) { requireStaff(); tx(() => { rm('announcements', (a) => a.id === Number(el.dataset.id)); audit('annonce_supprimee', 'announcement', Number(el.dataset.id)); }); go('/annonces', 'Annonce supprimée.'); },
  userReset(el) {
    requireStaff(); const u = get('users', el.dataset.id); if (!canManage(u)) fail('Vous ne pouvez pas modifier ce compte.');
    const p = tempPassword();
    tx(() => { Object.assign(u, { password_hash: hashPassword(p), must_change_password: true, failed_logins: 0, locked_until: null }); audit('mot_de_passe_reinitialise', 'user', u.id); });
    go(`/utilisateurs/${u.id}`, `Mot de passe réinitialisé. Mot de passe provisoire (affiché une seule fois) : ${p}`, 'warning');
  },
  userDelete(el) {
    requireAdmin(); const u = get('users', el.dataset.id);
    if (u.id === ME.id) fail('Vous ne pouvez pas supprimer votre propre compte.');
    const n = activeAssign((a) => a.teacher_id === u.id).length; if (n) fail(`Ce compte a ${n} affectation(s) : désactivez-le plutôt que de le supprimer.`);
    if (u.role === 'admin' && !DB.users.some((x) => x.role === 'admin' && x.active && x.id !== u.id)) fail('Il doit rester au moins un administrateur actif.');
    tx(() => { rm('users', (x) => x.id === u.id); rm('avail', (a) => a.teacher_id === u.id); rm('subs', (x) => x.teacher_id === u.id); rm('tparts', (p) => p.user_id === u.id); rm('notifications', (x) => x.user_id === u.id); rm('leaves', (l) => l.teacher_id === u.id); audit('utilisateur_supprime', 'user', u.id, u.email); });
    go('/utilisateurs', 'Compte supprimé.');
  },
  refDelete(el) {
    requireStaff();
    const t = REF[el.dataset.type]; const r = get(t.table, el.dataset.id);
    const used = t.table === 'rooms' ? where('examRooms', (x) => x.room_id === r.id).length : where('exams', (x) => x[t.table === 'subjects' ? 'subject_id' : 'class_id'] === r.id).length + (t.table === 'subjects' ? where('tirages', (x) => x.subject_id === r.id).length : 0);
    if (used) fail(`Suppression impossible : « ${r.code} » est utilisé(e) ${used} fois.${t.table === 'rooms' ? ' Vous pouvez la désactiver.' : ''}`);
    tx(() => { rm(t.table, (x) => x.id === r.id); audit(`${t.table}_supprime`, t.table, r.id, r.code); });
    go(`/referentiels/${el.dataset.type}`, `« ${r.code} » supprimé(e).`);
  },
  yearDelete(el) {
    requireAdmin(); const y = get('years', el.dataset.id);
    const sems = where('semesters', (s) => s.year_id === y.id).map((s) => s.id);
    if (DB.sessions.some((s) => sems.includes(s.semester_id))) fail('Des sessions d’examens sont rattachées à cette année.');
    tx(() => { rm('semesters', (s) => s.year_id === y.id); rm('events', (x) => x.year_id === y.id); rm('years', (x) => x.id === y.id); audit('annee_supprimee', 'year', y.id, y.label); });
    go('/annees', `Année ${y.label} supprimée.`);
  },
  semesterDelete(el) { requireStaff(); const s = get('semesters', el.dataset.id); if (DB.sessions.some((x) => x.semester_id === s.id)) fail('Des sessions sont rattachées à ce semestre.'); tx(() => { rm('semesters', (x) => x.id === s.id); audit('semestre_supprime', 'semester', s.id); }); go(`/annees/${s.year_id}`, 'Semestre supprimé.'); },
  eventDelete(el) { requireStaff(); const x = get('events', el.dataset.id); tx(() => { rm('events', (y) => y.id === x.id); audit('evenement_supprime', 'event', x.id); }); go(`/annees/${x.year_id}`, 'Événement supprimé.'); },
  exportData(el) {
    const ds = datasets()[el.dataset.key]; if (!ds) fail('Export inconnu.');
    if (ds.admin && ME.role !== 'admin') fail('Export réservé à l’administrateur.');
    if (!isStaff()) fail('Export réservé au service des examens.');
    const sid = Number(el.dataset.session) || null;
    if (ds.session && !sid) fail('Aucune session sélectionnée.');
    if (sid) sessionFull(sid);
    const rows = ds.rows(sid);
    const name = `ipein-${el.dataset.key}${sid ? `-session${sid}` : ''}-${today()}`;
    if (el.dataset.format === 'csv') download(toCSV(ds.columns, rows), `${name}.csv`, 'text/csv;charset=utf-8');
    else download(writeXlsx(ds.title, sid ? sessionFull(sid).name : '', ds.columns, rows), `${name}.xlsx`);
    tx(() => audit('export', el.dataset.key, sid, el.dataset.format));
    toast('success', `Export « ${ds.title} » téléchargé (${rows.length} ligne(s)).`);
  },
  importTemplate(el, ev) {
    ev.preventDefault();
    const t = IMPORTS[el.dataset.type];
    const cols = Object.keys(t.cols).map((k) => [k, k, Math.max(14, k.length + 6)]);
    const row = Object.fromEntries(Object.keys(t.cols).map((k, i) => [k, t.ex[i] ?? '']));
    download(writeXlsx(`Modèle ${t.label}`, 'remplacez la ligne d’exemple par vos données ; en-têtes en ligne 5', cols, [row]), `modele-import-${el.dataset.type}.xlsx`);
  },
  downloadCredentials() {
    if (!IMPORT_RESULT) return;
    download(toCSV([['name', 'Enseignant'], ['email', 'E-mail'], ['password', 'Mot de passe provisoire']], IMPORT_RESULT.credentials), `identifiants-provisoires-${today()}.csv`, 'text/csv;charset=utf-8');
  },
  exportIcs() {
    const rows = myAssignments().filter((r) => r.session_status === 'publie');
    const dt = (d, t) => `${d.replace(/-/g, '')}T${t.replace(':', '')}00`;
    const esc = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`);
    const n = new Date(); const stamp = `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}T${pad(n.getUTCHours())}${pad(n.getUTCMinutes())}00Z`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IPEIN//Examens//FR', 'X-WR-CALNAME:Surveillances IPEIN'];
    for (const r of rows) lines.push('BEGIN:VEVENT', `UID:surveillance-${r.id}@ipein`, `DTSTAMP:${stamp}`, `DTSTART:${dt(r.date, r.start_time)}`, `DTEND:${dt(r.date, r.end_time)}`, `SUMMARY:${esc(`Surveillance ${r.subject_name} (${r.class_code})`)}`, `LOCATION:${esc(`IPEIN — salle ${r.room_code}`)}`, 'END:VEVENT');
    lines.push('END:VCALENDAR');
    download(lines.join('\r\n'), 'surveillances-ipein.ics', 'text/calendar;charset=utf-8');
  },
  exportMyChoices(el) {
    const s = get('sessions', el.dataset.session);
    const sub = where('subs', (x) => x.session_id === s.id && x.teacher_id === ME.id)[0];
    const items = where('avail', (a) => a.session_id === s.id && a.teacher_id === ME.id).map((a) => { const c = get('creneaux', a.creneau_id); return { date: c.date, start_time: c.start_time, end_time: c.end_time, state: a.state, comment: a.comment }; });
    if (!items.length) fail('Aucune disponibilité déclarée à exporter.');
    download(JSON.stringify({ app: 'ipein-examens', kind: 'choix', session_name: s.name, session_start: s.start_date, email: ME.email, name: fullName(ME), submitted: Boolean(sub && sub.status === 'soumis'), exported_at: nowLocal(), items }, null, 1), `choix-${ME.email.split('@')[0]}-${today()}.json`, 'application/json');
    toast('success', 'Fichier de choix téléchargé : transmettez-le au service des examens.');
  },
  backupFull() { requireStaff(); tx(() => audit('sauvegarde_exportee', 'backup')); download(JSON.stringify(DB), `ipein-examens-sauvegarde-${today()}.json`, 'application/json'); toast('success', 'Sauvegarde téléchargée.'); },
  backupDistribution() {
    requireStaff();
    const copy = JSON.parse(JSON.stringify(DB));
    copy.exams.forEach((x) => { x.confidential_notes = null; });
    copy.tirages.forEach((t) => { t.details = null; });
    copy.messages = []; copy.log = []; copy.notifications = []; copy.absences = []; copy.history = [];
    copy.distribution = { from: fullName(ME), at: nowLocal() };
    tx(() => audit('copie_enseignants_exportee', 'backup'));
    download(JSON.stringify(copy), `ipein-examens-copie-enseignants-${today()}.json`, 'application/json');
    toast('success', 'Copie enseignants téléchargée (sans informations confidentielles).');
  },
  purgeLog() { requireAdmin(); tx(() => { DB.log = DB.log.slice(-500); audit('journal_purge', 'log'); }); go('/sauvegarde', 'Journal purgé.'); },
  purgeNotifs() { requireAdmin(); tx(() => rm('notifications', (n) => n.read_at)); go('/sauvegarde', 'Notifications lues supprimées.'); },
  async resetAll() {
    requireAdmin();
    if (!(await confirmDlg('Toutes les données (utilisateurs, examens, plannings, historique) seront définitivement effacées pour tous les utilisateurs. Téléchargez d’abord une sauvegarde. Pour confirmer, tapez EFFACER.', true, 'Tout effacer', 'EFFACER'))) return;
    Store.replaceAll(emptyDB()); SessionBox.clear(); ME = null;
    go('/', 'Toutes les données ont été effacées.', 'info');
  },
  async deleteMessage(el) {
    const m = get('messages', el.dataset.id);
    if (!m || (m.recipient_id !== ME.id && m.sender_id !== ME.id)) fail('Message introuvable.');
    tx(() => { rm('messages', (x) => x.id === m.id); audit('message_supprime', 'message', m.id); });
    go('/messages', 'Message supprimé.');
  },
  deleteNotif(el) { tx(() => rm('notifications', (n) => n.id === Number(el.dataset.id) && n.user_id === ME.id)); go('/notifications', 'Notification supprimée.'); },
  clearReadNotifs() { tx(() => rm('notifications', (n) => n.user_id === ME.id && n.read_at)); go('/notifications', 'Notifications lues supprimées.'); },
  tirageDelete(el) {
    requireAdmin();
    const t = get('tirages', el.dataset.id); if (!t) fail('Tirage introuvable.');
    tx(() => { rm('tparts', (p) => p.tirage_id === t.id); rm('thist', (h) => h.tirage_id === t.id); rm('tirages', (x) => x.id === t.id); audit('tirage_supprime', 'tirage', t.id); });
    go('/tirages', 'Rendez-vous de tirage supprimé.');
  },
  async downloadDoc() {
    const art = document.querySelector('article.doc'); if (!art) return;
    const css = (document.getElementById('app-style') || {}).textContent || '';
    const title = (art.querySelector('h1') || {}).textContent || 'Document IPEIN';
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)}</title><style>${css}</style></head><body class="printing-doc"><div class="doc-toolbar no-print"><button class="btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>${art.outerHTML}</body></html>`;
    const ok = await download(html, `${title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${today()}.html`, 'text/html;charset=utf-8');
    if (ok) toast('success', 'Document téléchargé : ouvrez-le puis utilisez « Imprimer / Enregistrer en PDF ».');
  },
};

/* ---------- Fichiers : restauration et import des choix ---------- */
async function restoreFile(file) {
  const data = normalizeDB(JSON.parse(await file.text()));
  if (Store.mode === 'cloud' && data.distribution) fail('Ce fichier est une copie enseignants : il ne peut pas remplacer la base partagée. Connectez-vous simplement avec vos identifiants.');
  const full = DB.users.length && !DB.distribution;
  if (full && (!ME || ME.role !== 'admin')) fail('Seul un administrateur connecté peut remplacer les données.');
  if (DB.users.length && !(await confirmDlg(`Toutes les données actuelles seront remplacées par celles du fichier « ${file.name} »${Store.mode === 'cloud' ? ', pour tous les utilisateurs' : ''}. Pour confirmer, tapez REMPLACER.`, true, 'Remplacer', 'REMPLACER'))) return;
  Store.replaceAll(data);
  SessionBox.clear(); ME = null;
  go('/', data.distribution ? `Copie distribuée par ${data.distribution.from} importée. Connectez-vous avec vos identifiants.` : 'Données restaurées. Connectez-vous.', 'success');
}
async function importChoiceFiles(files, sid) {
  requireStaff();
  const s = get('sessions', sid); let ok = 0; const errs = [];
  for (const f of files) {
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'ipein-examens' || d.kind !== 'choix') fail('fichier non reconnu');
      const u = DB.users.find((x) => x.email === String(d.email).toLowerCase() && x.role === 'enseignant');
      if (!u) fail(`enseignant ${d.email} inconnu`);
      tx(() => {
        let n = 0;
        for (const it of d.items || []) {
          const c = DB.creneaux.find((x) => x.session_id === s.id && x.date === it.date && x.start_time === it.start_time && x.end_time === it.end_time);
          if (!c || !['disponible', 'indisponible'].includes(it.state)) continue;
          rm('avail', (a) => a.teacher_id === u.id && a.creneau_id === c.id);
          ins('avail', { session_id: s.id, teacher_id: u.id, creneau_id: c.id, state: it.state, comment: optTxt(it.comment, 300) }); n++;
        }
        if (!n) fail('aucun créneau ne correspond à cette session');
        let sub = where('subs', (x) => x.session_id === s.id && x.teacher_id === u.id)[0];
        if (!sub) sub = ins('subs', { session_id: s.id, teacher_id: u.id, status: 'brouillon', submitted_at: null });
        if (d.submitted) { sub.status = 'soumis'; sub.submitted_at = d.exported_at || nowLocal(); }
        audit('choix_importes', 'user', u.id, { creneaux: n, fichier: f.name });
      });
      ok++;
    } catch (err) { errs.push(`${f.name} : ${err.message}`); }
  }
  go(`/choix?session=${sid}`, `${ok} fichier(s) de choix importé(s).${errs.length ? ` Erreurs : ${errs.join(' · ')}` : ''}`, errs.length ? 'warning' : 'success');
}

/* ---------- Gestion des événements ---------- */
function showError(err) {
  if (err instanceof AppError) toast('error', err.message);
  else { console.error(err); toast('error', 'Une erreur inattendue est survenue. Rechargez la page ; si elle persiste, exportez une sauvegarde.'); }
}
document.addEventListener('submit', async (ev) => {
  const f = ev.target;
  if (f.hasAttribute('data-filter')) {
    ev.preventDefault();
    const p = {};
    for (const [k, v] of new FormData(f).entries()) if (v !== '') p[k] = v;
    navigate(`${R.path}${Object.keys(p).length ? `?${new URLSearchParams(p)}` : ''}`);
    return;
  }
  const name = f.dataset.form; if (!name) return;
  ev.preventDefault();
  const btn = ev.submitter;
  const text = (btn && btn.dataset.confirm) || f.dataset.confirm;
  if (text && !(await confirmDlg(text, btn && btn.classList.contains('danger')))) return;
  const data = formData(f, btn);
  if (btn) { btn.classList.add('is-loading'); btn.disabled = true; }
  await new Promise((r) => setTimeout(r, 0));
  try { await FORMS[name](data, f); } catch (err) { showError(err); } finally { if (btn && btn.isConnected) { btn.classList.remove('is-loading'); btn.disabled = false; } }
});
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) { if (document.body.classList.contains('nav-open') && !ev.target.closest('.sidebar')) document.body.classList.remove('nav-open'); return; }
  const fn = ACTS[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A' && el.dataset.act !== 'openNotif' && el.dataset.act !== 'importTemplate') ev.preventDefault();
  if (el.dataset.confirm && !(await confirmDlg(el.dataset.confirm, el.dataset.danger === '1'))) return;
  try { await fn(el, ev); } catch (err) { showError(err); }
});
document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.matches('[data-autosubmit]') && t.form && t.form.hasAttribute('data-filter')) t.form.requestSubmit();
  if (t.matches('[data-choice-form] input[type=radio]')) refreshChoiceForm();
  if (t.matches('[data-import-type]')) navigate(`/imports?type=${t.value}`);
  if (t.matches('[data-session-select]')) $$('[data-exam-select] option[data-session]').forEach((o) => { o.hidden = o.dataset.session !== t.value; });
  if (t.matches('[data-exam-select]')) { const o = t.selectedOptions[0]; if (o && o.dataset.subject) t.form.subject_id.value = o.dataset.subject; }
  try {
    if (t.matches('[data-restore]') && t.files[0]) await restoreFile(t.files[0]);
    if (t.matches('[data-import-choices]') && t.files.length) await importChoiceFiles([...t.files], Number(t.dataset.importChoices));
  } catch (err) { showError(err instanceof SyntaxError ? new AppError('Fichier illisible (JSON invalide).') : err); } finally { if (t.matches('[data-restore], [data-import-choices]')) t.value = ''; }
});
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.matches('[data-filter-input]')) { const v = t.value.trim().toLowerCase(); $$(t.dataset.filterInput).forEach((el) => { el.hidden = Boolean(v) && !el.textContent.toLowerCase().includes(v); }); }
});
// Navigation interne (liens « #/… »)
document.addEventListener('click', (ev) => {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
  const a = ev.target.closest('a[href^="#/"]');
  if (!a || a.dataset.act) return;
  ev.preventDefault();
  navigate(a.getAttribute('href').slice(1));
});
if (!VIEWER) {
  window.addEventListener('popstate', () => { ROUTE = initialRoute(); render(); });
}
function safeRender() { if (isEditing()) { Store.remoteDirty = true; showRemoteBadge(true); } else render(); }
async function start() {
  ROUTE = initialRoute();
  try { await Store.boot(); } catch (err) { console.error(err); Store.mode = LS.ok() ? 'local' : 'memory'; }
  render();
  if (Store.migrated) toast('success', 'Vos données enregistrées dans ce navigateur ont été transférées dans la base en ligne.');
  if (currentUser()) runScheduler();
  setInterval(() => { if (currentUser() && !Store.readOnly) { const before = DB.notifications.length; runScheduler(); if (DB.notifications.length !== before) safeRender(); } }, 60000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
