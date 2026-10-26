/* =====================================================================
   Moteur de planification : contrôles, conflits, affectation équitable
   ===================================================================== */
function sessionFull(id) {
  const s = get('sessions', id);
  if (!s) fail('Session d’examens introuvable.');
  const se = get('semesters', s.semester_id) || {};
  const y = get('years', se.year_id) || {};
  return { ...s, semester_label: se.label || '—', year_label: y.label || '—', year_current: Boolean(y.is_current) };
}
function defaultSessionId() {
  const order = { choix_ouverts: 0, choix_clos: 1, publie: 2, brouillon: 3 };
  const list = DB.sessions.map((s) => sessionFull(s.id))
    .sort((a, b) => (b.year_current - a.year_current) || (order[a.status] - order[b.status]) || b.start_date.localeCompare(a.start_date));
  return list.length ? list[0].id : null;
}
function choiceWindow(s) {
  const now = nowLocal().slice(0, 16);
  if (s.status !== 'choix_ouverts') return { open: false, reason: 'La période de choix n’est pas ouverte pour cette session.' };
  if (s.choices_open_at && now < s.choices_open_at) return { open: false, reason: `Ouverture des choix le ${fmtDT(s.choices_open_at)}.` };
  if (s.choices_close_at && now > s.choices_close_at) return { open: false, reason: 'La date limite de soumission des choix est dépassée.' };
  return { open: true, reason: null };
}
const quotaFor = (t, s) => (t.quota_override ?? s.default_quota);
const activeTeachers = () => where('users', (u) => u.role === 'enseignant' && u.active).sort((a, b) => fullName(a).localeCompare(fullName(b)));
const sessionCreneaux = (sid) => where('creneaux', (c) => c.session_id === sid).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
const activeAssign = (fn = () => true) => DB.assignments.filter((a) => a.status !== 'annule' && fn(a));

function examRoomFull(er) {
  const ex = get('exams', er.exam_id); const r = get('rooms', er.room_id); const s = get('subjects', ex.subject_id); const c = get('classes', ex.class_id);
  return { ...er, exam: ex, session_id: ex.session_id, responsible_id: ex.responsible_id, exam_status: ex.status, room_code: r.code, room_name: r.name, capacity: r.capacity,
    subject_name: s.name, subject_code: s.code, class_code: c.code };
}
function loadContext(sid) {
  const session = sessionFull(sid);
  const cr = sessionCreneaux(sid);
  const crById = new Map(cr.map((c) => [c.id, c]));
  const examIds = new Set(where('exams', (x) => x.session_id === sid && x.status === 'planifie').map((x) => x.id));
  const examRooms = where('examRooms', (er) => examIds.has(er.exam_id)).map(examRoomFull);
  const erIds = new Set(examRooms.map((x) => x.id));
  const assignments = activeAssign((a) => a.session_id === sid && erIds.has(a.exam_room_id));
  const availMap = new Map(where('avail', (a) => a.session_id === sid).map((a) => [`${a.teacher_id}:${a.creneau_id}`, a.state]));
  const submitted = new Set(where('subs', (x) => x.session_id === sid && x.status === 'soumis').map((x) => x.teacher_id));
  const leaves = where('leaves', (l) => l.end_date >= session.start_date && l.start_date <= session.end_date);
  const teachers = activeTeachers();
  return { session, cr, crById, examRooms, assignments, availMap, submitted, leaves, teachers, teacherById: new Map(teachers.map((t) => [t.id, t])) };
}
const onLeave = (ctx, tid, date) => ctx.leaves.some((l) => l.teacher_id === tid && l.start_date <= date && l.end_date >= date);

function evaluate(ctx, tid, er, { ignore = null } = {}) {
  const errors = []; const warnings = [];
  const t = ctx.teacherById.get(tid);
  if (!t) return { errors: ['Enseignant introuvable ou inactif.'], warnings };
  const c = ctx.crById.get(er.creneau_id);
  const mine = ctx.assignments.filter((a) => a.teacher_id === tid && a.id !== ignore);
  if (mine.some((a) => a.creneau_id === c.id)) errors.push('Déjà affecté sur ce créneau.');
  else if (mine.some((a) => overlaps(ctx.crById.get(a.creneau_id), c))) errors.push('Chevauchement horaire avec une autre surveillance.');
  if (onLeave(ctx, tid, c.date)) errors.push('Enseignant en absence déclarée à cette date.');
  if (ctx.assignments.filter((a) => a.exam_room_id === er.id && a.id !== ignore).length >= er.supervisors_needed) errors.push('La salle a déjà tous ses surveillants.');
  const st = ctx.availMap.get(`${tid}:${c.id}`);
  if (st === 'indisponible') warnings.push('Créneau déclaré indisponible par l’enseignant.');
  else if (st !== 'disponible') warnings.push('Créneau hors des disponibilités déclarées.');
  const quota = quotaFor(t, ctx.session);
  if (mine.length + 1 > quota) warnings.push(`Dépassement du quota (${mine.length + 1}/${quota}).`);
  const sameDay = mine.filter((a) => ctx.crById.get(a.creneau_id).date === c.date).length;
  if (sameDay + 1 > ctx.session.max_per_day) warnings.push(`Plus de ${ctx.session.max_per_day} surveillance(s) le même jour.`);
  if (setting('exclude_exam_responsible') && er.responsible_id === tid) warnings.push('Enseignant responsable de cette matière.');
  return { errors, warnings };
}
function addHistory(sid, aid, action, tid, note = null, other = null) {
  ins('history', { session_id: sid, assignment_id: aid, action, teacher_id: tid, other_teacher_id: other, actor_id: ME ? ME.id : null, note });
}
function describeAssignment(a) {
  const er = examRoomFull(get('examRooms', a.exam_room_id)); const c = get('creneaux', a.creneau_id);
  return { ...a, date: c.date, start_time: c.start_time, end_time: c.end_time, room_code: er.room_code, subject_name: er.subject_name, class_code: er.class_code, building: get('rooms', er.room_id).building };
}
const slotText = (d) => `${fmtDate(d.date, true)} de ${fmtTime(d.start_time)} à ${fmtTime(d.end_time)} — salle ${d.room_code} (${d.subject_name}, ${d.class_code})`;

// Contraintes « base de données » : unicité enseignant/créneau et capacité de salle
function insertAssignment(o) {
  if (activeAssign((a) => a.teacher_id === o.teacher_id && a.creneau_id === o.creneau_id).length) fail('Cet enseignant est déjà affecté sur ce créneau.');
  const er = get('examRooms', o.exam_room_id);
  if (er.creneau_id !== o.creneau_id) fail('Créneau d’affectation incohérent avec la salle.');
  if (activeAssign((a) => a.exam_room_id === er.id).length >= er.supervisors_needed) fail('Nombre de surveillants requis déjà atteint pour cette salle.');
  return ins('assignments', { status: 'propose', source: 'manuel', replaces_assignment_id: null, created_by: ME ? ME.id : null, ...o });
}

function assign({ examRoomId, teacherId, force = false, source = 'manuel', replaces = null, status = null }) {
  return tx(() => {
    const raw = get('examRooms', examRoomId); if (!raw) fail('Salle d’examen introuvable.');
    const er = examRoomFull(raw);
    if (er.exam_status !== 'planifie') fail('Examen annulé : affectation impossible.');
    const ctx = loadContext(er.session_id);
    const { errors, warnings } = evaluate(ctx, teacherId, ctx.examRooms.find((x) => x.id === er.id) || er, { ignore: replaces });
    if (errors.length) fail(errors.join(' '));
    if (warnings.length && !force) fail(`Avertissements : ${warnings.join(' ')} Confirmez la dérogation pour poursuivre.`);
    const st = status || (ctx.session.status === 'publie' ? 'confirme' : 'propose');
    const a = insertAssignment({ session_id: er.session_id, exam_room_id: er.id, creneau_id: er.creneau_id, teacher_id: teacherId, status: st, source, replaces_assignment_id: replaces });
    addHistory(er.session_id, a.id, source === 'remplacement' ? 'remplacement' : 'affectation', teacherId, warnings.length ? `Dérogation : ${warnings.join(' ')}` : null);
    if (ctx.session.status === 'publie') notify(teacherId, { title: 'Nouvelle surveillance', body: `Vous êtes affecté(e) à une surveillance le ${slotText(describeAssignment(a))}.`, link: '#/mon-planning', kind: 'affectation' });
    return { a, warnings };
  });
}
function unassign(aid, note = null) {
  return tx(() => {
    const a = get('assignments', aid); if (!a || a.status === 'annule') fail('Affectation introuvable.');
    const s = get('sessions', a.session_id); const d = describeAssignment(a);
    const wasConfirmed = a.status === 'confirme';
    a.status = 'annule'; a.updated_at = nowLocal();
    addHistory(a.session_id, a.id, 'retrait', a.teacher_id, note);
    if (s.status === 'publie' || wasConfirmed) notify(a.teacher_id, { title: 'Surveillance annulée', body: `Votre surveillance du ${slotText(d)} a été retirée.${note ? `\nMotif : ${note}` : ''}`, link: '#/mon-planning', kind: 'affectation' });
    return a;
  });
}
function loadMap(ctx) { const m = new Map(); for (const a of ctx.assignments) m.set(a.teacher_id, (m.get(a.teacher_id) || 0) + 1); return m; }
function candidates(examRoomId, { ignore = null } = {}) {
  const er = examRoomFull(get('examRooms', examRoomId));
  const ctx = loadContext(er.session_id);
  const erc = ctx.examRooms.find((x) => x.id === er.id) || er;
  const load = loadMap(ctx);
  const replaced = ignore ? (get('assignments', ignore) || {}).teacher_id : null;
  return ctx.teachers.filter((t) => t.id !== replaced).map((t) => {
    const ev = evaluate(ctx, t.id, erc, { ignore });
    return { teacher: t, name: fullName(t), load: load.get(t.id) || 0, quota: quotaFor(t, ctx.session), state: ctx.availMap.get(`${t.id}:${er.creneau_id}`) || null, ...ev };
  }).filter((c) => !c.errors.length)
    .sort((a, b) => (a.warnings.length - b.warnings.length) || ((a.state === 'disponible' ? 0 : 1) - (b.state === 'disponible' ? 0 : 1))
      || (a.load / Math.max(a.quota, 1) - b.load / Math.max(b.quota, 1)) || a.name.localeCompare(b.name));
}
function replaceAssignment({ assignmentId, newTeacherId, reason = null, force = false }) {
  return tx(() => {
    const old = get('assignments', assignmentId); if (!old || old.status === 'annule') fail('Affectation introuvable.');
    if (old.teacher_id === newTeacherId) fail('Le remplaçant doit être un autre enseignant.');
    const d = describeAssignment(old);
    const prevStatus = old.status;
    old.status = 'annule'; old.updated_at = nowLocal();
    const res = assign({ examRoomId: old.exam_room_id, teacherId: newTeacherId, force, source: 'remplacement', replaces: old.id, status: prevStatus });
    addHistory(old.session_id, old.id, 'remplace', old.teacher_id, reason, newTeacherId);
    notify(old.teacher_id, { title: 'Surveillance réaffectée', body: `Votre surveillance du ${slotText(d)} a été confiée à un autre enseignant.${reason ? `\nMotif : ${reason}` : ''}`, link: '#/mon-planning', kind: 'affectation' });
    if (get('sessions', old.session_id).status !== 'publie') notify(newTeacherId, { title: 'Surveillance attribuée (remplacement)', body: `Vous remplacez un collègue le ${slotText(d)}.`, link: '#/mon-planning', kind: 'affectation' });
    return res;
  });
}
function tieBreak(a, b) { let h = (a * 2654435761) ^ (b * 40503); h = Math.imul(h ^ (h >>> 16), 2246822507); return (h >>> 0) / 4294967296; }

function autoAssign(sid, { mode = 'complete', allowOutside = null } = {}) {
  return tx(() => {
    const session = sessionFull(sid);
    if (session.status === 'publie') fail('Planning déjà publié : utilisez les remplacements pour le modifier.');
    if (mode === 'reset') {
      let n = 0;
      for (const a of DB.assignments) if (a.session_id === sid && a.source === 'auto' && a.status === 'propose') { a.status = 'annule'; n++; }
      if (n) addHistory(sid, null, 'reinitialisation_auto', null, `${n} proposition(s) automatique(s) retirée(s)`);
    }
    const outside = allowOutside ?? Boolean(setting('allow_outside_choices'));
    const ctx = loadContext(sid);
    const load = loadMap(ctx);
    const excl = Boolean(setting('exclude_exam_responsible'));
    const fits = (t, er, phase) => {
      const c = ctx.crById.get(er.creneau_id);
      const st = ctx.availMap.get(`${t.id}:${c.id}`);
      if (phase === 1 && !(st === 'disponible' && ctx.submitted.has(t.id))) return false;
      if (st === 'indisponible') return false;
      if (excl && er.responsible_id === t.id) return false;
      if ((load.get(t.id) || 0) >= quotaFor(t, session)) return false;
      const mine = ctx.assignments.filter((a) => a.teacher_id === t.id);
      if (mine.some((a) => a.creneau_id === c.id || overlaps(ctx.crById.get(a.creneau_id), c))) return false;
      if (mine.filter((a) => ctx.crById.get(a.creneau_id).date === c.date).length >= session.max_per_day) return false;
      return !onLeave(ctx, t.id, c.date);
    };
    let created = 0; let outsideCount = 0;
    const missingOf = (er) => er.supervisors_needed - ctx.assignments.filter((a) => a.exam_room_id === er.id).length;
    for (const phase of outside ? [1, 2] : [1]) {
      for (;;) {
        const pending = ctx.examRooms.filter((er) => missingOf(er) > 0)
          .map((er) => ({ er, cands: ctx.teachers.filter((t) => fits(t, er, phase)) }))
          .sort((a, b) => a.cands.length - b.cands.length || a.er.creneau_id - b.er.creneau_id);
        const target = pending.find((x) => x.cands.length);
        if (!target) break;
        const best = target.cands.sort((a, b) => ((load.get(a.id) || 0) / Math.max(quotaFor(a, session), 1)) - ((load.get(b.id) || 0) / Math.max(quotaFor(b, session), 1))
          || tieBreak(a.id, target.er.id) - tieBreak(b.id, target.er.id))[0];
        const a = insertAssignment({ session_id: sid, exam_room_id: target.er.id, creneau_id: target.er.creneau_id, teacher_id: best.id, status: 'propose', source: 'auto' });
        ctx.assignments.push(a);
        load.set(best.id, (load.get(best.id) || 0) + 1);
        created++; if (phase === 2) outsideCount++;
      }
    }
    const missing = ctx.examRooms.reduce((s, er) => s + Math.max(0, missingOf(er)), 0);
    addHistory(sid, null, 'affectation_auto', null, `${created} affectation(s) proposée(s), dont ${outsideCount} hors vœux ; ${missing} place(s) restante(s).`);
    return { created, outsideCount, missing };
  });
}
function confirmAll(sid) {
  let n = 0;
  for (const a of DB.assignments) if (a.session_id === sid && a.status === 'propose') { a.status = 'confirme'; n++; }
  addHistory(sid, null, 'confirmation', null, `${n} affectation(s) confirmée(s)`);
  return n;
}
function publish(sid) {
  return tx(() => {
    const s = sessionFull(sid);
    if (s.status === 'publie') fail('Le planning est déjà publié.');
    const blocking = detectConflicts(sid).filter((c) => c.severity === 'erreur');
    if (blocking.length) fail(`Publication impossible : ${blocking.length} conflit(s) bloquant(s) à résoudre.`);
    confirmAll(sid);
    const raw = get('sessions', sid); raw.status = 'publie'; raw.published_at = nowLocal();
    const counts = new Map();
    for (const a of activeAssign((x) => x.session_id === sid && x.status === 'confirme')) counts.set(a.teacher_id, (counts.get(a.teacher_id) || 0) + 1);
    for (const [tid, n] of counts) notify(tid, { title: `Planning publié : ${s.name}`, body: `Le planning définitif des surveillances est publié. Vous avez ${n} surveillance(s). Consultez et imprimez votre convocation.`, link: '#/mon-planning', kind: 'publication' });
    addHistory(sid, null, 'publication', null, `${counts.size} enseignant(s) notifié(s)`);
    return counts.size;
  });
}
function detectConflicts(sid, ctxIn = null) {
  const ctx = ctxIn || loadContext(sid);
  const out = [];
  const erById = new Map(ctx.examRooms.map((x) => [x.id, x]));
  const byT = new Map();
  for (const a of ctx.assignments) { if (!byT.has(a.teacher_id)) byT.set(a.teacher_id, []); byT.get(a.teacher_id).push(a); }
  for (const [tid, list] of byT) {
    const t = ctx.teacherById.get(tid); const name = fullName(t || get('users', tid));
    if (!t) out.push({ type: 'inactif', severity: 'erreur', teacherId: tid, message: `${name} : compte inactif ou non enseignant mais affecté.` });
    for (const a of list) {
      const c = ctx.crById.get(a.creneau_id); const er = erById.get(a.exam_room_id);
      const where2 = `${fmtDate(c.date)} ${fmtTime(c.start_time)}–${fmtTime(c.end_time)}${er ? ` (salle ${er.room_code})` : ''}`;
      if (ctx.availMap.get(`${tid}:${c.id}`) === 'indisponible') out.push({ type: 'indisponibilite', severity: 'avertissement', teacherId: tid, assignmentId: a.id, examRoomId: a.exam_room_id, message: `${name} est affecté(e) le ${where2} alors qu’il/elle s’est déclaré(e) indisponible.` });
      if (onLeave(ctx, tid, c.date)) out.push({ type: 'absence', severity: 'erreur', teacherId: tid, assignmentId: a.id, examRoomId: a.exam_room_id, message: `${name} est en absence déclarée le ${fmtDate(c.date)} mais affecté(e) (${where2}).` });
      for (const b of list) {
        if (b.id <= a.id) continue;
        if (b.creneau_id !== a.creneau_id && overlaps(c, ctx.crById.get(b.creneau_id))) out.push({ type: 'chevauchement', severity: 'erreur', teacherId: tid, assignmentId: b.id, examRoomId: b.exam_room_id, message: `${name} a deux surveillances qui se chevauchent le ${fmtDate(c.date)}.` });
      }
      if (er && er.responsible_id === tid && setting('exclude_exam_responsible')) out.push({ type: 'responsable', severity: 'avertissement', teacherId: tid, assignmentId: a.id, examRoomId: a.exam_room_id, message: `${name} surveille l’épreuve dont il/elle est responsable (${er.subject_name}).` });
    }
    if (t && list.length > quotaFor(t, ctx.session)) out.push({ type: 'quota', severity: 'avertissement', teacherId: tid, message: `${name} dépasse son quota : ${list.length} surveillances pour ${quotaFor(t, ctx.session)} autorisées.` });
    const perDay = new Map();
    for (const a of list) { const d = ctx.crById.get(a.creneau_id).date; perDay.set(d, (perDay.get(d) || 0) + 1); }
    for (const [d, n] of perDay) if (n > ctx.session.max_per_day) out.push({ type: 'journee', severity: 'avertissement', teacherId: tid, message: `${name} a ${n} surveillances le ${fmtDate(d)} (maximum ${ctx.session.max_per_day}).` });
  }
  for (const er of ctx.examRooms) if (er.students > er.capacity) out.push({ type: 'capacite', severity: 'erreur', message: `Salle ${er.room_code} : ${er.students} étudiants pour une capacité de ${er.capacity} (${er.subject_name}, ${er.class_code}).` });
  return out;
}
function stats(sid) {
  if (!sid || !get('sessions', sid)) return null;
  const ctx = loadContext(sid);
  const filledOf = (er) => ctx.assignments.filter((a) => a.exam_room_id === er.id).length;
  const seats = ctx.examRooms.reduce((s, er) => s + er.supervisors_needed, 0);
  const filled = ctx.examRooms.reduce((s, er) => s + Math.min(er.supervisors_needed, filledOf(er)), 0);
  const confirmed = ctx.assignments.filter((a) => a.status === 'confirme').length;
  const load = loadMap(ctx);
  const loads = ctx.teachers.map((t) => ({ id: t.id, name: fullName(t), department: t.department, load: load.get(t.id) || 0, quota: quotaFor(t, ctx.session) }));
  const vals = loads.map((l) => l.load);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const sd = vals.length ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) : 0;
  const conflicts = detectConflicts(sid, ctx);
  const submitted = ctx.teachers.filter((t) => ctx.submitted.has(t.id)).length;
  const aIds = new Set(DB.assignments.filter((a) => a.session_id === sid).map((a) => a.id));
  return {
    session: ctx.session, ctx, exams: where('exams', (x) => x.session_id === sid && x.status === 'planifie').length, examRooms: ctx.examRooms.length, creneaux: ctx.cr.length,
    seats, filled, remaining: seats - filled, roomsCovered: ctx.examRooms.filter((er) => filledOf(er) >= er.supervisors_needed).length,
    confirmed, proposed: ctx.assignments.length - confirmed, coverage: seats ? Math.round((filled / seats) * 100) : 0,
    teachersCount: ctx.teachers.length, submitted, pendingChoices: ctx.teachers.length - submitted,
    drafts: where('subs', (x) => x.session_id === sid && x.status === 'brouillon').length,
    conflicts: conflicts.length, blocking: conflicts.filter((c) => c.severity === 'erreur').length, conflictList: conflicts,
    loads, mean: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10,
    pendingAbsences: where('absences', (r) => r.status === 'en_attente' && aIds.has(r.assignment_id)).length,
  };
}
function byDay(sid) {
  const ctx = loadContext(sid); const m = new Map();
  for (const er of ctx.examRooms) {
    const d = ctx.crById.get(er.creneau_id).date;
    const x = m.get(d) || { date: d, needed: 0, assigned: 0 };
    x.needed += er.supervisors_needed; x.assigned += Math.min(er.supervisors_needed, ctx.assignments.filter((a) => a.exam_room_id === er.id).length);
    m.set(d, x);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function incompleteRooms(sid) {
  const ctx = loadContext(sid);
  return ctx.examRooms.map((er) => ({ ...er, assigned: ctx.assignments.filter((a) => a.exam_room_id === er.id).length, c: ctx.crById.get(er.creneau_id) }))
    .filter((x) => x.assigned < x.supervisors_needed).sort((a, b) => a.c.date.localeCompare(b.c.date) || a.c.start_time.localeCompare(b.c.start_time));
}

/* ---------- Tâches automatiques (exécutées tant que l'application est ouverte) ---------- */
function sendTirageReminder(t) {
  const ids = where('tparts', (p) => p.tirage_id === t.id && p.response !== 'decline').map((p) => p.user_id);
  const s = get('subjects', t.subject_id);
  notify(ids, { title: `Rappel : tirage ${s.name}`, body: `Rappel du rendez-vous de tirage : ${fmtDate(t.date, true)} de ${fmtTime(t.start_time)} à ${fmtTime(t.end_time)}, lieu : ${t.location}.`, link: `#/tirages/${t.id}`, kind: 'rappel' });
  t.reminder_sent_at = nowLocal();
  ins('thist', { tirage_id: t.id, actor_id: ME ? ME.id : null, action: 'rappel', details: `${ids.length} destinataire(s)` });
  return ids.length;
}
function runScheduler() {
  if (Store.readOnly || Store.mode === 'loading') return;
  try {
    tx(() => {
      const now = new Date();
      const nowS = nowLocal().slice(0, 16);
      const limit = new Date(now.getTime() + Number(setting('reminder_hours_before') || 24) * 3600 * 1000);
      for (const t of DB.tirages) {
        if (!['planifie', 'modifie'].includes(t.status) || t.reminder_sent_at) continue;
        const when = new Date(`${t.date}T${t.start_time}:00`);
        if (when >= now && when <= limit) sendTirageReminder(t);
      }
      for (const s of DB.sessions) {
        if (s.status === 'choix_ouverts' && s.choices_close_at && s.choices_close_at < nowS) {
          s.status = 'choix_clos';
          addHistory(s.id, null, 'statut_choix_clos', null, 'Clôture automatique à la date limite');
          audit('session_choix_clos_auto', 'session', s.id);
        }
        if (s.status === 'choix_ouverts' && s.choices_close_at && !DB.settings.reminders_sent[s.id]) {
          const close = new Date(s.choices_close_at.replace(' ', 'T'));
          if (close - now <= 48 * 3600 * 1000 && close > now) {
            const ids = activeTeachers().filter((t) => !where('subs', (x) => x.session_id === s.id && x.teacher_id === t.id && x.status === 'soumis').length).map((t) => t.id);
            notify(ids, { title: `Dernier rappel : choix des surveillances (${s.name})`, body: `La date limite est fixée au ${fmtDT(s.choices_close_at)}. Vos choix ne sont pas encore soumis.`, link: '#/mes-disponibilites', kind: 'rappel' });
            DB.settings.reminders_sent[s.id] = nowLocal();
          }
        }
      }
    });
  } catch (err) { console.error('[planificateur]', err); }
}

/* ---------- Données de démonstration (fictives) ---------- */
const DEMO_PASSWORD = 'Demo2026ipein';
function seedDemo() {
  DB = emptyDB();
  let seed = 20262027;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const hash = hashPassword(DEMO_PASSWORD);
  const user = (email, first, last, role, x = {}) => ins('users', { email, password_hash: hash, first_name: first, last_name: last, role, grade: x.grade || null, department: x.department || null, phone: x.phone || null, quota_override: null, active: true, must_change_password: false, failed_logins: 0, locked_until: null, last_login_at: null, is_demo: true }).id;
  const adminId = user('admin@demo.ipein.tn', 'Sami', 'Haddad', 'admin', { department: 'Administration' });
  const respId = user('examens@demo.ipein.tn', 'Leila', 'Mansour', 'responsable', { department: 'Service des examens', grade: 'Directrice des études' });
  const people = [['Amel', 'Ben Salah', 'Mathématiques'], ['Karim', 'Jaziri', 'Mathématiques'], ['Nadia', 'Trabelsi', 'Mathématiques'], ['Hichem', 'Gharbi', 'Mathématiques'],
    ['Sonia', 'Ayari', 'Mathématiques'], ['Mehdi', 'Bouazizi', 'Mathématiques'], ['Ines', 'Chaabane', 'Physique'], ['Walid', 'Hammami', 'Physique'], ['Rania', 'Ferchichi', 'Physique'],
    ['Anis', 'Mejri', 'Physique'], ['Olfa', 'Sassi', 'Physique'], ['Fethi', 'Kammoun', 'Chimie'], ['Hela', 'Zouari', 'Chimie'], ['Nizar', 'Dridi', 'Chimie'], ['Asma', 'Belhadj', 'Informatique'],
    ['Yassine', 'Masmoudi', 'Informatique'], ['Mouna', 'Khelifi', 'Informatique'], ['Slim', 'Rekik', 'Sciences de l’ingénieur'], ['Dorra', 'Bouslama', 'Sciences de l’ingénieur'],
    ['Bilel', 'Saidi', 'Sciences de l’ingénieur'], ['Emna', 'Guesmi', 'Langues'], ['Tarek', 'Jlassi', 'Langues'], ['Rim', 'Abidi', 'Langues'], ['Lotfi', 'Ouni', 'Langues'],
    ['Salma', 'Hamdi', 'Mathématiques'], ['Riadh', 'Toumi', 'Physique'], ['Afef', 'Karray', 'Chimie'], ['Zied', 'Arfaoui', 'Informatique'], ['Imen', 'Sfar', 'Sciences de l’ingénieur'], ['Chokri', 'Baccouche', 'Mathématiques']];
  const grades = ['Professeur', 'Maître de conférences', 'Maître assistant', 'Assistant', 'Professeur agrégé'];
  const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '');
  const T = people.map(([f, l, d], i) => user(`${strip(f)}.${strip(l)}@demo.ipein.tn`, f, l, 'enseignant', { department: d, grade: grades[i % 5], phone: `+216 2${i % 10} ${100 + i * 7} ${String(200 + i * 13).slice(-3)}` }));
  get('users', T[0]).quota_override = 3;
  const byDept = (d) => T.filter((_, i) => people[i][2] === d);

  const y = ins('years', { label: '2026-2027', start_date: '2026-09-14', end_date: '2027-07-15', is_current: true }).id;
  ins('years', { label: '2025-2026', start_date: '2025-09-15', end_date: '2026-07-15', is_current: false });
  const s1 = ins('semesters', { year_id: y, label: 'Semestre 1', start_date: '2026-09-14', end_date: '2027-01-31' }).id;
  ins('semesters', { year_id: y, label: 'Semestre 2', start_date: '2027-02-01', end_date: '2027-07-15' });
  for (const [t, k, a, b] of [['Vacances de l’automne', 'vacances', '2026-10-26', '2026-11-01'], ['Devoirs surveillés', 'examens', '2026-11-16', '2026-11-20'],
    ['Vacances d’hiver', 'vacances', '2026-12-21', '2027-01-03'], ['Examens du semestre 1', 'examens', '2027-01-11', '2027-01-22'],
    ['Fête de l’Évacuation', 'ferie', '2026-10-15', '2026-10-15'], ['Fête de la Révolution', 'ferie', '2027-01-14', '2027-01-14']]) ins('events', { year_id: y, title: t, kind: k, start_date: a, end_date: b });

  const subj = {};
  for (const [c, n, d] of [['ANA', 'Analyse', 'Mathématiques'], ['ALG', 'Algèbre', 'Mathématiques'], ['PHY', 'Physique', 'Physique'], ['CHI', 'Chimie', 'Chimie'],
    ['INF', 'Informatique', 'Informatique'], ['STI', 'Sciences et techniques de l’ingénieur', 'Sciences de l’ingénieur'], ['ANG', 'Anglais', 'Langues'], ['FRA', 'Français', 'Langues']]) subj[c] = { id: ins('subjects', { code: c, name: n, department: d }).id, dept: d };
  const classes = [['MP1-A', 'MP 1re année — groupe A', '1re année', 34], ['MP1-B', 'MP 1re année — groupe B', '1re année', 33], ['PC1-A', 'PC 1re année — groupe A', '1re année', 35],
    ['PT1', 'PT 1re année', '1re année', 30], ['MP2-A', 'MP 2e année — groupe A', '2e année', 32], ['MP2-B', 'MP 2e année — groupe B', '2e année', 31], ['PC2-A', 'PC 2e année', '2e année', 34], ['PT2', 'PT 2e année', '2e année', 28]]
    .map(([c, n, l, k]) => ({ code: c, n: k, id: ins('classes', { code: c, name: n, level: l, student_count: k }).id }));
  const rooms = [];
  for (let i = 1; i <= 10; i++) rooms.push(ins('rooms', { code: `A${pad(i)}`, name: `Salle A${i}`, building: 'Bloc A', capacity: i <= 6 ? 36 : 40, active: true }).id);
  ins('rooms', { code: 'AMPHI1', name: 'Amphithéâtre 1', building: 'Bloc B', capacity: 120, active: true });
  ins('rooms', { code: 'B05', name: 'Salle B5 (travaux)', building: 'Bloc B', capacity: 30, active: false });

  const sA = ins('sessions', { semester_id: s1, name: 'Devoirs surveillés — novembre 2026', start_date: '2026-11-16', end_date: '2026-11-20', choices_open_at: '2026-10-01 08:00', choices_close_at: '2026-10-15 23:59', status: 'choix_clos', default_quota: 3, max_per_day: 2, min_choices: 2, published_at: null }).id;
  const sB = ins('sessions', { semester_id: s1, name: 'Examens du semestre 1 — janvier 2027', start_date: '2027-01-11', end_date: '2027-01-22', choices_open_at: '2026-10-20 08:00', choices_close_at: '2026-12-15 23:59', status: 'choix_ouverts', default_quota: 5, max_per_day: 2, min_choices: 4, published_at: null }).id;
  const mk = (sid, days, pl) => days.flatMap((d) => pl.map(([a, b]) => ins('creneaux', { session_id: sid, date: d, start_time: a, end_time: b })));
  const crA = mk(sA, ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], [['08:30', '10:30'], ['11:00', '13:00']]);
  const crB = mk(sB, ['2027-01-11', '2027-01-12', '2027-01-13', '2027-01-15', '2027-01-18', '2027-01-19', '2027-01-20', '2027-01-21'], [['08:30', '11:30'], ['13:30', '16:30']]);
  const notes = ['Sujet en 2 exemplaires scellés — coffre du service des examens. Calculatrice autorisée.', 'Barème joint. Documents interdits.', null];
  const sched = (sid, crs, codes) => {
    const out = [];
    classes.forEach((cl, ci) => codes.forEach((code, k) => {
      const c = crs[(ci + k * 3) % crs.length];
      const used = new Set(where('examRooms', (er) => er.creneau_id === c.id).map((er) => er.room_id));
      const free = rooms.filter((r) => !used.has(r));
      if (where('exams', (x) => x.creneau_id === c.id && x.class_id === cl.id).length || !free.length) return;
      const list = byDept(subj[code].dept);
      const ex = ins('exams', { session_id: sid, creneau_id: c.id, subject_id: subj[code].id, class_id: cl.id, responsible_id: list[Math.floor(rnd() * list.length)], status: 'planifie', confidential_notes: notes[Math.floor(rnd() * 3)], created_by: respId, updated_at: nowLocal() });
      ins('examRooms', { exam_id: ex.id, creneau_id: c.id, room_id: free[0], students: cl.n, supervisors_needed: 2 });
      out.push(ex);
    }));
    return out;
  };
  const examsA = sched(sA, crA, ['ANA', 'PHY', 'INF']);
  sched(sB, crB, ['ANA', 'ALG', 'PHY', 'CHI', 'INF', 'STI', 'ANG']);
  for (const t of T) {
    for (const c of crA) if (rnd() < 0.7) ins('avail', { session_id: sA, teacher_id: t, creneau_id: c.id, state: 'disponible', comment: null });
    ins('subs', { session_id: sA, teacher_id: t, status: 'soumis', submitted_at: '2026-10-12 10:00' });
  }
  ME = get('users', respId);
  autoAssign(sA);
  publish(sA);
  T.forEach((t, i) => {
    if (i >= 26) return;
    for (const c of crB) {
      const r = rnd();
      if (r < 0.55) ins('avail', { session_id: sB, teacher_id: t, creneau_id: c.id, state: 'disponible', comment: null });
      else if (r < 0.7) ins('avail', { session_id: sB, teacher_id: t, creneau_id: c.id, state: 'indisponible', comment: rnd() < 0.3 ? 'Jury de soutenance' : null });
    }
    ins('subs', { session_id: sB, teacher_id: t, status: i < 22 ? 'soumis' : 'brouillon', submitted_at: i < 22 ? `2026-10-2${1 + (i % 2)} 1${i % 9}:15` : null });
  });
  ins('leaves', { teacher_id: T[8], start_date: '2027-01-18', end_date: '2027-01-22', reason: 'Mission scientifique', created_by: respId });
  const tdates = ['2026-10-24', '2026-10-29', '2026-11-05', '2026-11-12', '2026-11-13'];
  examsA.slice(0, 8).forEach((ex, i) => {
    const t = ins('tirages', { session_id: sA, exam_id: ex.id, subject_id: ex.subject_id, date: tdates[i % 5], start_time: '09:00', end_time: '10:30', location: 'Bureau du service des examens (Bloc administratif)', copies: 40,
      details: 'Apporter le sujet sur clé USB chiffrée. Reprographie sous surveillance ; mise sous enveloppe scellée et signée.', status: i === 6 ? 'modifie' : 'planifie', reminder_sent_at: null, created_by: respId, updated_at: nowLocal() });
    const parts = [...new Set([ex.responsible_id, T[(i * 7) % T.length], respId])];
    parts.forEach((u, j) => ins('tparts', { tirage_id: t.id, user_id: u, response: j === 0 && i % 3 ? 'confirme' : 'en_attente', comment: null, responded_at: j === 0 && i % 3 ? '2026-10-20 09:00' : null }));
    ins('thist', { tirage_id: t.id, actor_id: respId, action: 'creation', details: `${parts.length} participant(s) invité(s)` });
  });
  const lastA = activeAssign((a) => a.session_id === sA).map((a) => ({ a, c: get('creneaux', a.creneau_id) })).sort((x, z) => z.c.date.localeCompare(x.c.date))[0];
  if (lastA) ins('absences', { assignment_id: lastA.a.id, teacher_id: lastA.a.teacher_id, reason: 'Convocation à un jury de thèse à l’ENIT le même jour (justificatif transmis).', status: 'en_attente', decision_note: null, decided_by: null, decided_at: null, replacement_assignment_id: null });
  ins('announcements', { title: 'Ouverture des choix — examens du semestre 1', body: 'Chers collègues,\nLa période de déclaration des disponibilités pour les examens de janvier est ouverte jusqu’au 15 décembre. Le quota est de 5 surveillances par enseignant. Merci de soumettre vos choix dans les délais.\nLe service des examens.', audience: 'enseignant', pinned: true, author_id: respId, expires_at: null });
  ins('announcements', { title: 'Rappel des consignes de surveillance', body: 'Les surveillants se présentent 15 minutes avant le début de l’épreuve. Les téléphones des candidats sont déposés à l’entrée de la salle. Toute anomalie est consignée dans le procès-verbal.', audience: 'tous', pinned: false, author_id: adminId, expires_at: null });
  ins('messages', { sender_id: T[3], recipient_id: respId, subject: 'Disponibilités janvier', body: 'Bonjour, je serai en mission la semaine du 18 janvier ; mes indisponibilités sont déclarées. Cordialement.', read_at: null });
  DB.settings.demo_mode = true;
  ME = null;
  persist();
}
