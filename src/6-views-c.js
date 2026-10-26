/* =====================================================================
   Vues : utilisateurs, référentiels, années, imports/exports, administration, impressions
   ===================================================================== */
const canManage = (target) => ME.role === 'admin' || (ME.role === 'responsable' && (!target || target.role === 'enseignant'));
function viewUsers() {
  const q = R.query;
  let rows = DB.users.slice();
  if (q.role) rows = rows.filter((u) => u.role === q.role);
  if (q.statut === 'actif') rows = rows.filter((u) => u.active);
  if (q.statut === 'inactif') rows = rows.filter((u) => !u.active);
  if (q.departement) rows = rows.filter((u) => u.department === q.departement);
  const depts = [...new Set(DB.users.map((u) => u.department).filter(Boolean))].sort();
  const l = listing(rows, { search: (u) => `${fullName(u)} ${u.email} ${u.department || ''}`, sorts: { nom: (u) => fullName(u), email: (u) => u.email, role: (u) => u.role, departement: (u) => u.department || '', connexion: (u) => u.last_login_at || '' }, defaultSort: 'nom' });
  const html = pageHead('Utilisateurs et enseignants', 'Comptes, rôles, quotas et coordonnées.', `<button class="btn secondary" type="button" data-act="exportData" data-key="enseignants" data-format="xlsx">${icon('download')}Exporter les enseignants</button><a class="btn secondary" href="#/imports?type=enseignants">${icon('upload')}Importer</a><a class="btn" href="#/utilisateurs/nouveau">${icon('plus')}Nouvel utilisateur</a>`)
    + `<div class="card">${toolbar(`${searchBox('Nom, e-mail, département…')}<div class="field"><label>Rôle<select name="role" data-autosubmit>${opt('', 'Tous', q.role)}${Object.entries(ROLE).map(([k, v]) => opt(k, v, q.role)).join('')}</select></label></div><div class="field"><label>Département<select name="departement" data-autosubmit>${opt('', 'Tous', q.departement)}${depts.map((d) => opt(d, d, q.departement)).join('')}</select></label></div><div class="field"><label>Statut<select name="statut" data-autosubmit>${opt('', 'Tous', q.statut)}${opt('actif', 'Actifs', q.statut)}${opt('inactif', 'Désactivés', q.statut)}</select></label></div>`)}
    <div class="card-body tight">${l.rows.length ? table([sortLink(l, 'nom', 'Nom'), sortLink(l, 'email', 'E-mail'), sortLink(l, 'role', 'Rôle'), sortLink(l, 'departement', 'Département'), 'Quota', 'Statut', sortLink(l, 'connexion', 'Dernière connexion'), ''], l.rows.map((u) => `<tr>${td('Nom', `<a href="#/utilisateurs/${u.id}"><strong>${e(u.last_name)}</strong> ${e(u.first_name)}</a>${u.grade ? `<span class="sub">${e(u.grade)}</span>` : ''}`)}${td('E-mail', e(u.email))}${td('Rôle', `<span class="badge ${u.role === 'admin' ? 'violet' : u.role === 'responsable' ? 'blue' : 'gray'}">${ROLE[u.role]}</span>`)}${td('Département', e(u.department || '—'))}${td('Quota', u.quota_override ?? 'Par défaut')}${td('Statut', u.active ? '<span class="badge ok">Actif</span>' : '<span class="badge err">Désactivé</span>')}${td('Dernière connexion', fmtDT(u.last_login_at) || 'Jamais')}<td class="actions-cell"><a class="btn sm secondary" href="#/utilisateurs/${u.id}">Détails</a></td></tr>`).join('')) + pager(l) : empty('Aucun utilisateur trouvé', '', 'users')}</div></div>`;
  return { title: 'Utilisateurs', html };
}
function viewUserForm({ id }) {
  const u = id ? get('users', id) : null;
  if (id && !u) fail('Utilisateur introuvable.');
  if (u && !canManage(u)) fail('Vous ne pouvez pas modifier ce compte.');
  const v = u || { role: 'enseignant', active: true };
  const roles = Object.entries(ROLE).filter(([k]) => ME.role === 'admin' || k === 'enseignant');
  const html = pageHead(u ? 'Modifier l’utilisateur' : 'Nouvel utilisateur', '', '', '<a href="#/utilisateurs">Utilisateurs</a> /')
    + `<div class="card" style="max-width:900px"><div class="card-body"><form data-form="userSave"${u ? ` data-id="${u.id}"` : ''}><div class="form-grid">
      ${field('Nom', inp('last_name', v.last_name, 'required'), { req: true })}${field('Prénom', inp('first_name', v.first_name, 'required'), { req: true })}
      ${field('E-mail', inp('email', v.email, 'type="email" required'), { req: true })}${field('Rôle', `<select name="role" required>${roles.map(([k, t]) => opt(k, t, v.role)).join('')}</select>`, { req: true })}
      ${field('Grade', inp('grade', v.grade, 'placeholder="Maître assistant…"'))}${field('Département', inp('department', v.department))}
      ${field('Téléphone', inp('phone', v.phone))}${field('Quota personnalisé', inp('quota_override', v.quota_override ?? '', 'type="number" min="0" max="50"'), { hint: 'Vide = quota de la session (décharge, temps partiel…).' })}
      ${u ? '' : field('Mot de passe initial', inp('password', '', 'type="password" minlength="10" autocomplete="new-password"'), { full: true, hint: 'Facultatif : un mot de passe provisoire est généré sinon. Changement exigé à la première connexion.' })}
      <div class="full"><label class="check"><input type="checkbox" name="active"${v.active ? ' checked' : ''}> Compte actif</label></div></div>
      <div class="form-actions"><a class="btn secondary" href="${u ? `#/utilisateurs/${u.id}` : '#/utilisateurs'}">Annuler</a><button class="btn" type="submit">${u ? 'Enregistrer' : 'Créer le compte'}</button></div></form></div></div>`;
  return { title: u ? 'Modifier l’utilisateur' : 'Nouvel utilisateur', html };
}
function viewUser({ id }) {
  const u = get('users', id); if (!u) fail('Utilisateur introuvable.');
  const as = activeAssign((a) => a.teacher_id === u.id).map((a) => ({ ...describeAssignment(a), session_name: get('sessions', a.session_id).name })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
  const leaves = where('leaves', (l) => l.teacher_id === u.id);
  const logs = DB.log.filter((l) => l.user_id === u.id).slice(-15).reverse();
  const actions = `<a class="btn secondary" href="#/messages?a=${u.id}">${icon('mail')}Écrire</a>${canManage(u) ? `${act('userReset', `${icon('lock')}Réinitialiser le mot de passe`, { id: u.id }, { cls: 'secondary', confirm: 'Générer un mot de passe provisoire pour ce compte ?' })}<a class="btn" href="#/utilisateurs/${u.id}/modifier">${icon('edit')}Modifier</a>` : ''}${ME.role === 'admin' && u.id !== ME.id ? act('userDelete', `${icon('trash')}Supprimer`, { id: u.id }, { cls: 'danger', danger: true, confirm: 'Supprimer définitivement ce compte ? Préférez la désactivation pour conserver l’historique.' }) : ''}`;
  const html = pageHead(`${e(u.last_name)} ${e(u.first_name)} ${u.active ? '<span class="badge ok">Actif</span>' : '<span class="badge err">Désactivé</span>'}`, `${ROLE[u.role]}${u.grade ? ` · ${u.grade}` : ''}${u.department ? ` · ${u.department}` : ''}`, actions, '<a href="#/utilisateurs">Utilisateurs</a> /')
    + `<div class="grid side">${card('Surveillances', as.length ? table(['Date', 'Horaire', 'Salle', 'Épreuve', 'Session', 'Statut'], as.map((a) => `<tr>${td('Date', fmtDate(a.date))}${td('Horaire', `${fmtTime(a.start_time)}–${fmtTime(a.end_time)}`)}${td('Salle', e(a.room_code))}${td('Épreuve', e(a.subject_name))}${td('Session', e(a.session_name))}${td('Statut', badge(a.status))}</tr>`).join('')) : empty('Aucune surveillance', '', 'clipboard'), { tight: true })}
    <div>${card('Coordonnées', `<dl class="props"><dt>E-mail</dt><dd>${e(u.email)}</dd><dt>Téléphone</dt><dd>${e(u.phone || '—')}</dd><dt>Quota</dt><dd>${u.quota_override ?? 'Quota de la session'}</dd><dt>Créé le</dt><dd>${fmtDT(u.created_at)}</dd><dt>Connexion</dt><dd>${fmtDT(u.last_login_at) || 'Jamais'}</dd>${u.must_change_password ? '<dt>Sécurité</dt><dd><span class="badge warn">Mot de passe à changer</span></dd>' : ''}${u.locked_until && u.locked_until > nowLocal() ? `<dt>Verrouillage</dt><dd><span class="badge err">Jusqu’à ${fmtDT(u.locked_until)}</span></dd>` : ''}</dl>`)}
    ${card('Périodes d’absence', `<ul class="list">${leaves.map((l) => `<li><div class="grow">${fmtDate(l.start_date)} → ${fmtDate(l.end_date)}<div class="meta">${e(l.reason || '')}</div></div></li>`).join('') || '<li class="muted">Aucune.</li>'}</ul>`, { tight: true, right: '<a href="#/absences">Gérer</a>' })}
    ${card('Dernières actions', `<ul class="list">${logs.map((l) => `<li style="font-size:.85rem"><div class="grow">${e(l.action.replace(/_/g, ' '))}<div class="meta">${fmtDT(l.created_at)}</div></div></li>`).join('') || '<li class="muted">Aucune.</li>'}</ul>`, { tight: true })}</div></div>`;
  return { title: fullName(u), html };
}

/* ---------- Référentiels ---------- */
const REF = {
  matieres: { table: 'subjects', title: 'Matières', singular: 'matière', fields: [['code', 'Code', 'text', true], ['name', 'Intitulé', 'text', true], ['department', 'Département', 'text']] },
  classes: { table: 'classes', title: 'Classes', singular: 'classe', fields: [['code', 'Code', 'text', true], ['name', 'Intitulé', 'text', true], ['level', 'Niveau', 'text'], ['student_count', 'Effectif', 'number', true]] },
  salles: { table: 'rooms', title: 'Salles', singular: 'salle', fields: [['code', 'Code', 'text', true], ['name', 'Nom', 'text', true], ['building', 'Bâtiment', 'text'], ['capacity', 'Capacité', 'number', true], ['active', 'Active', 'checkbox']] },
};
function viewRef({ type }) {
  const t = REF[type]; if (!t) fail('Page introuvable.');
  const l = listing(DB[t.table], { search: (r) => t.fields.map((f) => r[f[0]] ?? '').join(' '), sorts: Object.fromEntries(t.fields.filter((f) => f[2] !== 'checkbox').map((f) => [f[0], (r) => r[f[0]] ?? ''])), defaultSort: 'code' });
  const edit = R.query.modifier ? get(t.table, R.query.modifier) : null;
  const html = pageHead(t.title, `${DB[t.table].length} élément(s) enregistré(s).`, `<button class="btn secondary" type="button" data-act="exportData" data-key="${type}" data-format="xlsx">${icon('download')}Excel</button><button class="btn secondary" type="button" data-act="exportData" data-key="${type}" data-format="csv">${icon('download')}CSV</button><a class="btn secondary" href="#/imports?type=${type}">${icon('upload')}Importer</a>`)
    + `<div class="grid side"><div class="card">${toolbar(searchBox('Code, intitulé…'))}<div class="card-body tight">${l.rows.length ? table([...t.fields.map((f) => (f[2] === 'checkbox' ? f[1] : sortLink(l, f[0], f[1]))), ''], l.rows.map((r) => `<tr>${t.fields.map((f) => td(f[1], f[2] === 'checkbox' ? (r[f[0]] ? '<span class="badge ok">Oui</span>' : '<span class="badge gray">Non</span>') : f[0] === 'code' ? `<strong>${e(r.code)}</strong>` : e(r[f[0]] ?? '—'))).join('')}<td class="actions-cell"><a class="btn sm secondary" href="${qs({ modifier: r.id })}" aria-label="Modifier">${icon('edit')}</a>${act('refDelete', icon('trash'), { type, id: r.id }, { cls: 'sm danger', danger: true, confirm: `Supprimer « ${r.code} » ?`, title: 'Supprimer' })}</td></tr>`).join('')) + pager(l) : empty(l.term ? 'Aucun résultat' : `Aucune ${t.singular}`, l.term ? 'Modifiez votre recherche.' : 'Ajoutez-en avec le formulaire ou par import Excel/CSV.')}</div></div>
    ${card(edit ? `Modifier « ${e(edit.code)} »` : `Ajouter une ${t.singular}`, `<form data-form="refSave" data-type="${type}"${edit ? ` data-id="${edit.id}"` : ''}>${t.fields.map(([k, label, ty, req]) => (ty === 'checkbox' ? `<label class="check" style="margin:6px 0 12px"><input type="checkbox" name="${k}"${(edit ? edit[k] : true) ? ' checked' : ''}> ${label}</label>` : `<div style="margin-bottom:12px">${field(label, inp(k, edit ? edit[k] : '', `type="${ty}"${req ? ' required' : ''}${ty === 'number' ? ' min="0"' : ''}`), { req })}</div>`)).join('')}<div class="form-actions">${edit ? `<a class="btn secondary" href="#/referentiels/${type}">Annuler</a>` : ''}<button class="btn" type="submit">${edit ? 'Enregistrer' : 'Ajouter'}</button></div></form>`)}</div>`;
  return { title: t.title, html };
}

/* ---------- Années universitaires ---------- */
function viewYears() {
  const ys = DB.years.slice().sort((a, b) => b.start_date.localeCompare(a.start_date));
  const html = pageHead('Années universitaires', 'Années, semestres et calendrier universitaire.')
    + `<div class="grid side">${card('', ys.length ? table(['Année', 'Période', 'Semestres', 'Statut', ''], ys.map((y) => `<tr>${td('Année', `<a href="#/annees/${y.id}"><strong>${e(y.label)}</strong></a>`)}${td('Période', `${fmtDate(y.start_date)} → ${fmtDate(y.end_date)}`)}${td('Semestres', where('semesters', (s) => s.year_id === y.id).length)}${td('Statut', y.is_current ? '<span class="badge ok">En cours</span>' : '<span class="badge gray">—</span>')}<td class="actions-cell"><a class="btn sm secondary" href="#/annees/${y.id}">Gérer</a></td></tr>`).join('')) : empty('Aucune année universitaire', 'Créez la première année avec le formulaire.', 'calendar'), { tight: true })}
    ${card('Nouvelle année', `<form data-form="yearSave">${field('Libellé', inp('label', '', 'required placeholder="2027-2028"'), { req: true })}<div class="form-grid" style="margin-top:12px">${field('Début', inp('start_date', '', 'type="date" required'), { req: true })}${field('Fin', inp('end_date', '', 'type="date" required'), { req: true })}</div><label class="check" style="margin-top:12px"><input type="checkbox" name="is_current"> Année en cours</label><div class="form-actions"><button class="btn" type="submit">${icon('plus')}Créer</button></div></form>`)}</div>`;
  return { title: 'Années universitaires', html };
}
const KIND = { cours: 'Cours', examens: 'Examens', vacances: 'Vacances', ferie: 'Jour férié', autre: 'Autre' };
function viewYear({ id }) {
  const y = get('years', id); if (!y) fail('Année universitaire introuvable.');
  const sems = where('semesters', (s) => s.year_id === y.id).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const evs = where('events', (x) => x.year_id === y.id).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const semEdit = R.query.sem ? sems.find((x) => x.id === Number(R.query.sem)) : null;
  const evEdit = R.query.ev ? evs.find((x) => x.id === Number(R.query.ev)) : null;
  const html = pageHead(`Année ${e(y.label)} ${y.is_current ? '<span class="badge ok">En cours</span>' : ''}`, '', ME.role === 'admin' ? act('yearDelete', `${icon('trash')}Supprimer`, { id: y.id }, { cls: 'danger', danger: true, confirm: `Supprimer l’année ${y.label}, ses semestres et son calendrier ? Impossible si des sessions y sont rattachées.` }) : '', '<a href="#/annees">Années universitaires</a> /')
    + `<div class="grid cols-2">${card('Paramètres de l’année', `<form data-form="yearSave" data-id="${y.id}"><div class="form-grid cols-3">${field('Libellé', inp('label', y.label, 'required'))}${field('Début', inp('start_date', y.start_date, 'type="date" required'))}${field('Fin', inp('end_date', y.end_date, 'type="date" required'))}</div><label class="check" style="margin-top:12px"><input type="checkbox" name="is_current"${y.is_current ? ' checked' : ''}> Année en cours</label><div class="form-actions"><button class="btn" type="submit">Enregistrer</button></div></form>`)}
    ${card('Semestres', `${sems.length ? `<table class="table"><thead><tr><th>Semestre</th><th>Période</th><th>Sessions</th><th></th></tr></thead><tbody>${sems.map((s) => { const n = where('sessions', (x) => x.semester_id === s.id).length; return `<tr><td><strong>${e(s.label)}</strong></td><td>${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}</td><td>${n}</td><td class="actions-cell"><a class="btn sm secondary" href="#/annees/${y.id}?sem=${s.id}" title="Modifier" aria-label="Modifier">${icon('edit')}</a>${n ? '' : act('semesterDelete', icon('trash'), { id: s.id }, { cls: 'sm danger', danger: true, confirm: 'Supprimer ce semestre ?', title: 'Supprimer' })}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted" style="padding:14px 18px">Aucun semestre.</p>'}
      <form data-form="semesterAdd" data-id="${y.id}"${semEdit ? ` data-sid="${semEdit.id}"` : ''} class="subform"><h3>${semEdit ? `Modifier « ${e(semEdit.label)} »` : 'Ajouter un semestre'}</h3><div class="form-grid cols-3">${field('Libellé', inp('label', semEdit ? semEdit.label : '', 'required placeholder="Semestre 1"'))}${field('Début', inp('start_date', semEdit ? semEdit.start_date : '', `type="date" min="${y.start_date}" max="${y.end_date}" required`))}${field('Fin', inp('end_date', semEdit ? semEdit.end_date : '', `type="date" min="${y.start_date}" max="${y.end_date}" required`))}</div><div class="form-actions">${semEdit ? `<a class="btn ghost" href="#/annees/${y.id}">Annuler</a>` : ''}<button class="btn secondary" type="submit">${semEdit ? 'Enregistrer' : `${icon('plus')}Ajouter le semestre`}</button></div></form>`, { tight: true })}</div>`
    + card('Calendrier universitaire', `${evs.length ? table(['Événement', 'Type', 'Du', 'Au', ''], evs.map((x) => `<tr>${td('Événement', e(x.title))}${td('Type', `<span class="badge ${x.kind === 'examens' ? 'blue' : x.kind === 'ferie' ? 'warn' : 'gray'}">${KIND[x.kind]}</span>`)}${td('Du', fmtDate(x.start_date))}${td('Au', fmtDate(x.end_date))}<td class="actions-cell"><a class="btn sm secondary" href="#/annees/${y.id}?ev=${x.id}" title="Modifier" aria-label="Modifier">${icon('edit')}</a>${act('eventDelete', icon('trash'), { id: x.id }, { cls: 'sm danger', danger: true, confirm: 'Supprimer cet événement ?', title: 'Supprimer' })}</td></tr>`).join('')) : '<p class="muted" style="padding:14px 18px">Aucun événement (vacances, jours fériés, périodes d’examens…).</p>'}
      <form data-form="eventAdd" data-id="${y.id}"${evEdit ? ` data-eid="${evEdit.id}"` : ''} class="subform"><h3>${evEdit ? `Modifier « ${e(evEdit.title)} »` : 'Ajouter un événement'}</h3><div class="form-grid cols-4">${field('Intitulé', inp('title', evEdit ? evEdit.title : '', 'required placeholder="Vacances de printemps"'))}${field('Type', `<select name="kind">${Object.entries(KIND).map(([k, t]) => opt(k, t, evEdit ? evEdit.kind : 'vacances')).join('')}</select>`)}${field('Du', inp('start_date', evEdit ? evEdit.start_date : '', 'type="date" required'))}${field('Au', inp('end_date', evEdit ? evEdit.end_date : '', 'type="date" required'))}</div><div class="form-actions">${evEdit ? `<a class="btn ghost" href="#/annees/${y.id}">Annuler</a>` : ''}<button class="btn secondary" type="submit">${evEdit ? 'Enregistrer' : `${icon('plus')}Ajouter l’événement`}</button></div></form>`, { tight: true, right: '<a href="#/calendrier">Voir dans le calendrier</a>' });
  return { title: `Année ${y.label}`, html };
}

/* ---------- Exports ---------- */
function datasets() {
  return {
    enseignants: { title: 'Enseignants', columns: [['last_name', 'Nom', 22], ['first_name', 'Prénom', 20], ['email', 'E-mail', 32], ['grade', 'Grade', 18], ['department', 'Département', 22], ['phone', 'Téléphone', 16], ['quota_override', 'Quota personnalisé', 12], ['actif', 'Actif', 8]],
      rows: () => where('users', (u) => u.role === 'enseignant').sort((a, b) => fullName(a).localeCompare(fullName(b))).map((u) => ({ ...u, actif: u.active ? 'oui' : 'non' })) },
    utilisateurs: { title: 'Utilisateurs', admin: true, columns: [['last_name', 'Nom', 22], ['first_name', 'Prénom', 20], ['email', 'E-mail', 32], ['role_l', 'Rôle', 22], ['department', 'Département', 20], ['actif', 'Actif', 8], ['last_login_at', 'Dernière connexion', 20]],
      rows: () => DB.users.map((u) => ({ ...u, role_l: ROLE[u.role], actif: u.active ? 'oui' : 'non' })) },
    matieres: { title: 'Matières', columns: [['code', 'Code', 12], ['name', 'Intitulé', 40], ['department', 'Département', 24]], rows: () => DB.subjects.slice().sort((a, b) => a.code.localeCompare(b.code)) },
    classes: { title: 'Classes', columns: [['code', 'Code', 12], ['name', 'Intitulé', 36], ['level', 'Niveau', 14], ['student_count', 'Effectif', 10]], rows: () => DB.classes.slice().sort((a, b) => a.code.localeCompare(b.code)) },
    salles: { title: 'Salles', columns: [['code', 'Code', 12], ['name', 'Nom', 28], ['building', 'Bâtiment', 18], ['capacity', 'Capacité', 10], ['actif', 'Active', 8]], rows: () => DB.rooms.map((r) => ({ ...r, actif: r.active ? 'oui' : 'non' })) },
    creneaux: { title: 'Créneaux', session: true, columns: [['date_fr', 'Date', 14], ['start_time', 'Début', 8], ['end_time', 'Fin', 8], ['exams', 'Examens', 10], ['needed', 'Surveillants requis', 14], ['vol', 'Disponibles déclarés', 14]],
      rows: (sid) => sessionCreneaux(sid).map((c) => { const ex = where('exams', (x) => x.creneau_id === c.id && x.status === 'planifie'); return { ...c, date_fr: fmtDate(c.date), exams: ex.length, needed: where('examRooms', (er) => ex.some((x) => x.id === er.exam_id)).reduce((a, er) => a + er.supervisors_needed, 0), vol: where('avail', (a) => a.creneau_id === c.id && a.state === 'disponible').length }; }) },
    examens: { title: 'Examens', session: true, columns: [['date_fr', 'Date', 12], ['start_time', 'Début', 8], ['end_time', 'Fin', 8], ['subject_code', 'Code matière', 12], ['subject_name', 'Matière', 30], ['class_code', 'Classe', 10], ['rooms', 'Salles', 20], ['resp', 'Responsable', 24], ['need', 'Requis', 8], ['got', 'Affectés', 8], ['st', 'Statut', 10]],
      rows: (sid) => where('exams', (x) => x.session_id === sid).map((x) => ({ ...examFull(x), ...examLine(x) })).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)).map((x) => ({ ...x, date_fr: fmtDate(x.date), resp: x.responsible_id ? userName(x.responsible_id) : '', st: STATUS[x.status], rooms: x.rooms.replace(/, /g, ' + ') })) },
    affectations: { title: 'Affectations des surveillances', session: true, columns: [['date_fr', 'Date', 12], ['start_time', 'Début', 8], ['end_time', 'Fin', 8], ['room_code', 'Salle', 10], ['subject_name', 'Matière', 28], ['class_code', 'Classe', 10], ['teacher', 'Enseignant', 26], ['email', 'E-mail', 30], ['st', 'Statut', 12], ['src', 'Origine', 14]],
      rows: (sid) => activeAssign((a) => a.session_id === sid && get('exams', get('examRooms', a.exam_room_id).exam_id).status === 'planifie').map(describeAssignment).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time) || a.room_code.localeCompare(b.room_code))
        .map((a) => { const u = get('users', a.teacher_id); return { ...a, date_fr: fmtDate(a.date), teacher: fullName(u), email: u.email, st: STATUS[a.status], src: STATUS[a.source] }; }) },
    charges: { title: 'Charge de surveillance par enseignant', session: true, columns: [['name', 'Enseignant', 28], ['department', 'Département', 20], ['quota', 'Quota', 8], ['load', 'Affectations', 12], ['ecart', 'Écart au quota', 12], ['dispo', 'Créneaux disponibles', 14], ['choice', 'Choix', 14]],
      rows: (sid) => { const s = get('sessions', sid); return activeTeachers().map((u) => { const load = activeAssign((a) => a.session_id === sid && a.teacher_id === u.id).length; const q = quotaFor(u, s); const sub = where('subs', (x) => x.session_id === sid && x.teacher_id === u.id)[0]; return { name: fullName(u), department: u.department, quota: q, load, ecart: load - q, dispo: where('avail', (a) => a.session_id === sid && a.teacher_id === u.id && a.state === 'disponible').length, choice: sub ? STATUS[sub.status] : 'Non commencé' }; }); } },
    journal: { title: 'Journal d’activité', admin: true, columns: [['created_at', 'Date', 20], ['user', 'Utilisateur', 26], ['action', 'Action', 28], ['entity', 'Objet', 16], ['entity_id', 'N°', 8], ['details', 'Détails', 50]],
      rows: () => DB.log.slice().reverse().map((l) => ({ ...l, user: l.user_id ? userName(l.user_id) : 'Système' })) },
  };
}
function viewExports() {
  const sid = Number(R.query.session) || defaultSessionId();
  const ds = datasets();
  const html = pageHead('Exports et états imprimables', 'Fichiers Excel/CSV et documents imprimables aux couleurs de l’IPEIN.', sid ? `<form data-filter>${sessionSelect(sid)}</form>` : '')
    + `<div class="grid cols-2">${card('Documents imprimables de la session', sid ? `<ul class="list">
      <li><div class="grow"><strong>Planning général des surveillances</strong><div class="meta">Par jour, horaire et salle ; places à pourvoir mises en évidence.</div></div><a class="btn sm" href="#/imprimer/planning/${sid}">${icon('printer')}Ouvrir</a></li>
      <li><div class="grow"><strong>Convocations individuelles</strong><div class="meta">Une page par enseignant affecté.</div></div><a class="btn sm" href="#/imprimer/convocations/${sid}">${icon('printer')}Ouvrir</a></li>
      <li><div class="grow"><strong>Rapport statistique</strong><div class="meta">Indicateurs clés et répartition de la charge.</div></div><a class="btn sm" href="#/imprimer/stats/${sid}">${icon('printer')}Ouvrir</a></li></ul>
      <p class="muted" style="font-size:.82rem;padding:0 18px 14px;margin:0">Pour obtenir un PDF : « Imprimer », puis destination « Enregistrer au format PDF ».</p>` : '<p class="muted" style="padding:14px 18px">Aucune session.</p>', { tight: true })}
    ${card('Données (Excel / CSV)', `<ul class="list">${Object.entries(ds).filter(([, d]) => (!d.admin || ME.role === 'admin') && (!d.session || sid)).map(([k, d]) => `<li><div class="grow"><strong>${e(d.title)}</strong><div class="meta">${d.session ? 'Session sélectionnée' : 'Référentiel complet'}</div></div><button class="btn sm secondary" type="button" data-act="exportData" data-key="${k}" data-session="${sid || ''}" data-format="xlsx">Excel</button><button class="btn sm secondary" type="button" data-act="exportData" data-key="${k}" data-session="${sid || ''}" data-format="csv">CSV</button></li>`).join('')}</ul>`, { tight: true })}</div>
    <p class="muted" style="font-size:.84rem;margin-top:14px">Chaque export est enregistré dans le journal. Les informations confidentielles (sujets, consignes de tirage) ne sont jamais incluses dans les exports.</p>`;
  return { title: 'Exports', html };
}

/* ---------- Imports ---------- */
const IMPORTS = {
  enseignants: { label: 'Enseignants', cols: { nom: ['nom', 'last_name'], prenom: ['prenom', 'first_name'], email: ['email', 'e_mail', 'courriel'], grade: ['grade'], departement: ['departement', 'department'], telephone: ['telephone', 'tel', 'phone'], quota: ['quota', 'quota_personnalise'] }, req: ['nom', 'prenom', 'email'], ex: ['Ben Salah', 'Amel', 'amel.bensalah@ipein.rnu.tn', 'Maître assistante', 'Mathématiques', '+216 20 000 000', ''] },
  matieres: { label: 'Matières', cols: { code: ['code'], intitule: ['intitule', 'nom', 'name', 'matiere'], departement: ['departement', 'department'] }, req: ['code', 'intitule'], ex: ['MATH1', 'Analyse 1', 'Mathématiques'] },
  classes: { label: 'Classes', cols: { code: ['code'], intitule: ['intitule', 'nom', 'name', 'classe'], niveau: ['niveau', 'level'], effectif: ['effectif', 'nombre_etudiants', 'student_count'] }, req: ['code', 'intitule', 'effectif'], ex: ['MP1-A', 'Mathématiques-Physique 1re année, groupe A', '1re année', '32'] },
  salles: { label: 'Salles', cols: { code: ['code'], nom: ['nom', 'name', 'salle'], batiment: ['batiment', 'building', 'bloc'], capacite: ['capacite', 'capacity', 'places'] }, req: ['code', 'nom', 'capacite'], ex: ['A12', 'Salle A12', 'Bloc A', '40'] },
  examens: { label: 'Examens (session choisie)', session: true, cols: { date: ['date'], debut: ['debut', 'heure_debut', 'start'], fin: ['fin', 'heure_fin', 'end'], matiere: ['matiere', 'code_matiere', 'matiere_code'], classe: ['classe', 'code_classe', 'classe_code'], salles: ['salles', 'salle', 'rooms'], surveillants: ['surveillants', 'surveillants_par_salle'], responsable: ['responsable', 'email_responsable'] }, req: ['date', 'debut', 'fin', 'matiere', 'classe'], ex: ['2027-01-11', '08:30', '10:30', 'MATH1', 'MP1-A', 'A12+A13', '2', 'amel.bensalah@ipein.rnu.tn'] },
};
let IMPORT_RESULT = null;
function viewImports() {
  const sel = IMPORTS[R.query.type] ? R.query.type : 'enseignants';
  const res = IMPORT_RESULT && IMPORT_RESULT.type === sel ? IMPORT_RESULT : null;
  const html = pageHead('Import de données', 'Excel (.xlsx) ou CSV (« ; » ou « , »). Chaque fichier est vérifié ligne par ligne ; l’import n’est appliqué que si toutes les lignes sont valides.')
    + `<div class="grid side">${card('Importer un fichier', `<form data-form="importRun"><div class="form-grid">
      ${field('Type de données', `<select name="type" data-import-type>${Object.entries(IMPORTS).map(([k, t]) => opt(k, t.label, sel)).join('')}</select>`)}
      ${field('Session (pour les examens)', `<select name="session_id">${DB.sessions.map((s) => opt(s.id, s.name, defaultSessionId())).join('')}</select>`)}
      ${field('Fichier', '<input type="file" name="fichier" accept=".xlsx,.csv" required>', { req: true, full: true, hint: `<a href="#" data-act="importTemplate" data-type="${sel}">Télécharger le modèle « ${e(IMPORTS[sel].label)} »</a>` })}</div>
      <div class="form-actions"><button class="btn secondary" type="submit" name="mode" value="verifier">${icon('search')}Vérifier le fichier</button><button class="btn" type="submit" name="mode" value="importer" data-confirm="Importer les données ? Les éléments existants (même code ou même e-mail) seront mis à jour.">${icon('upload')}Importer</button></div></form>`)}
    ${card('Colonnes attendues', `<div style="font-size:.88rem">${Object.values(IMPORTS).map((t) => `<p style="margin-bottom:10px"><strong>${e(t.label)}</strong><br><span class="mono" style="font-size:.8rem">${Object.keys(t.cols).map((c) => (t.req.includes(c) ? `${c}*` : c)).join(' · ')}</span></p>`).join('')}<p class="muted" style="font-size:.8rem">* obligatoire. En-têtes reconnus sans tenir compte des accents ni de la casse. Les enseignants importés reçoivent un mot de passe provisoire.</p></div>`)}</div>`
    + (res ? card(`Rapport — ${e(res.label)}`, `${res.credentials.length ? `<div class="alert warning" style="margin:14px 18px">${icon('lock')}<div><strong>Mots de passe provisoires (affichés une seule fois).</strong> Transmettez-les de manière sécurisée ; ils devront être changés à la première connexion. <button class="btn sm secondary" type="button" data-act="downloadCredentials">Télécharger (CSV)</button></div></div>${table(['Enseignant', 'E-mail', 'Mot de passe provisoire'], res.credentials.map((c) => `<tr><td>${e(c.name)}</td><td>${e(c.email)}</td><td class="mono">${e(c.password)}</td></tr>`).join(''))}` : ''}
      <div class="table-wrap" style="max-height:480px;overflow-y:auto"><table class="table"><thead><tr><th>Ligne</th><th>Élément</th><th>Résultat</th></tr></thead><tbody>${res.report.map((r) => `<tr><td>${r.line}</td><td>${e(r.label)}</td><td>${r.errors.length ? `<span class="badge err">Erreur</span> ${e(r.errors.join(' ; '))}` : r.result ? `<span class="badge ok">${e(r.result)}</span>` : '<span class="badge blue">Valide</span>'}</td></tr>`).join('')}</tbody></table></div>`,
      { tight: true, right: res.committed ? `<span class="badge ok">Import réalisé : ${res.total} ligne(s)</span>` : res.valid ? `<span class="badge blue">Fichier valide : ${res.total} ligne(s) prêtes</span>` : `<span class="badge err">${res.errors} ligne(s) en erreur — rien n’a été importé</span>` }) : '');
  return { title: 'Import de données', html };
}

/* ---------- Sauvegarde et partage ---------- */
function viewBackup() {
  const size = new Blob([JSON.stringify(DB)]).size;
  const cloud = Store.mode === 'cloud';
  const where2 = cloud ? 'dans la base de données en ligne de l’application, partagée par tous les utilisateurs du lien' : Store.mode === 'local' ? 'dans ce navigateur, sur cet appareil uniquement' : 'nulle part : ce navigateur bloque l’enregistrement';
  const html = pageHead('Sauvegarde et partage', `Les données sont enregistrées ${where2}.`)
    + `<div class="kpis">${kpi('Stockage', cloud ? 'En ligne' : Store.mode === 'local' ? 'Cet appareil' : 'Aucun', cloud ? 'base partagée et permanente' : Store.mode === 'local' ? 'pensez aux sauvegardes' : 'téléchargez une sauvegarde', Store.mode === 'memory' ? 'err' : 'ok')}${kpi('Volume des données', `${Math.max(1, Math.round(size / 1024))} Ko`, cloud ? 'aucune limite pratique' : 'limite du navigateur : 5 Mo', !cloud && size > 4e6 ? 'err' : 'ok')}${kpi('Utilisateurs', DB.users.length)}${kpi('Examens', DB.exams.length)}</div>
    <div class="grid cols-2">${card('Sauvegarde complète', `<p>Un fichier contenant toutes les données, y compris les informations confidentielles. Conservez-le en lieu sûr ; il permet de tout restaurer.</p><div class="actions">${act('backupFull', `${icon('download')}Télécharger la sauvegarde`, {}, { cls: '' })}</div>${ME.role === 'admin' ? `<div class="sep"></div><p><strong>Restaurer</strong> : remplace toutes les données${cloud ? ' pour tous les utilisateurs' : ''} par celles du fichier. Une confirmation écrite est demandée.</p><label class="btn secondary">${icon('upload')}Restaurer une sauvegarde<input type="file" accept=".json" data-restore hidden></label>` : ''}`)}
    ${cloud ? card('Partager avec les enseignants', `<p>Tous les comptes travaillent sur la même base. Pour donner accès à un enseignant :</p><ol class="steps-list"><li>Créez son compte dans <a href="#/utilisateurs">Utilisateurs</a> (ou importez la liste).</li><li>Partagez le lien de l’application en lui donnant le rôle <strong>Contributeur</strong> (bouton Partager de l’application).</li><li>Il se connecte avec son e-mail et son mot de passe provisoire, puis déclare ses disponibilités : elles arrivent directement dans le <a href="#/choix">Suivi des choix</a>.</li></ol><p class="muted small">Toute personne ayant accès au lien peut lire les données de la base : partagez-le uniquement avec le personnel et les enseignants de l’institut.</p>`)
    : card('Partage avec les enseignants (sans connexion)', `<p>En mode fichier, chaque navigateur a ses propres données. Pour recueillir les choix :</p><ol class="steps-list"><li>Téléchargez la <strong>copie enseignants</strong> (sans notes confidentielles, consignes de tirage, messages ni journal) et transmettez-la.</li><li>Chaque enseignant ouvre ce fichier, importe la copie depuis l’écran de connexion, déclare ses disponibilités puis clique sur « Exporter mes choix ».</li><li>Importez les fichiers reçus dans <a href="#/choix">Suivi des choix</a>.</li></ol><div class="actions">${act('backupDistribution', `${icon('send')}Télécharger la copie enseignants`, {}, { cls: '' })}</div>`)}</div>
    ${ME.role === 'admin' ? card('Maintenance', `<div class="actions">${act('purgeLog', 'Purger le journal (garder 500 entrées)', {}, { cls: 'secondary', confirm: 'Supprimer les entrées anciennes du journal d’activité ?' })}${act('purgeNotifs', 'Purger les notifications lues', {}, { cls: 'secondary', confirm: 'Supprimer toutes les notifications déjà lues ?' })}${act('resetAll', `${icon('trash')}Effacer toutes les données`, {}, { cls: 'danger' })}</div>`) : ''}`;
  return { title: 'Sauvegarde et partage', html };
}

/* ---------- Administration ---------- */
function viewSettings() {
  const s = DB.settings;
  const html = pageHead('Paramètres et règles', 'Règles globales d’affectation et de rappel. Quotas, plafonds journaliers et périodes de choix se règlent par session.')
    + `<div class="grid side">${card('', `<form data-form="settingsSave"><fieldset style="margin-bottom:16px"><legend>Affectation des surveillances</legend>
      <label class="check" style="display:flex;margin:6px 0"><input type="checkbox" name="allow_outside_choices"${s.allow_outside_choices ? ' checked' : ''}> Autoriser l’affectation automatique hors vœux pour compléter les créneaux</label>
      <label class="check" style="display:flex;margin:6px 0"><input type="checkbox" name="exclude_exam_responsible"${s.exclude_exam_responsible ? ' checked' : ''}> Éviter qu’un enseignant surveille l’épreuve dont il est responsable</label></fieldset>
      <fieldset style="margin-bottom:16px"><legend>Calcul des besoins par salle</legend><div class="form-grid">${field('Étudiants par surveillant', inp('students_per_supervisor', s.students_per_supervisor, 'type="number" min="5" max="200" required'))}${field('Surveillants minimum par salle', inp('min_supervisors_per_room', s.min_supervisors_per_room, 'type="number" min="1" max="10" required'))}</div></fieldset>
      <fieldset><legend>Rappels</legend>${field('Rappel automatique des tirages (heures avant)', inp('reminder_hours_before', s.reminder_hours_before, 'type="number" min="1" max="168" required'))}</fieldset>
      <div class="form-actions"><button class="btn" type="submit">Enregistrer</button></div></form>`)}
      ${card('Fonctionnement', `<dl class="props"><dt>Stockage</dt><dd>${Store.mode === 'cloud' ? 'Base de données en ligne (partagée)' : Store.mode === 'local' ? 'Ce navigateur' : 'Aucun (navigateur bloqué)'}</dd><dt>Mode</dt><dd>${s.demo_mode ? '<span class="badge warn">Démonstration</span>' : '<span class="badge ok">Réel</span>'}</dd><dt>Notifications</dt><dd>Internes à l’application</dd><dt>Rappels</dt><dd>Exécutés à l’ouverture et chaque minute</dd></dl><p class="muted" style="font-size:.84rem;margin-top:12px">Les e-mails ne peuvent pas être envoyés sans serveur : utilisez la messagerie interne et les annonces.</p>`)}</div>`;
  return { title: 'Paramètres', html };
}
function viewLog() {
  const q = R.query;
  let rows = DB.log.slice();
  if (q.utilisateur) rows = rows.filter((l) => l.user_id === Number(q.utilisateur));
  if (q.du) rows = rows.filter((l) => l.created_at >= q.du);
  if (q.au) rows = rows.filter((l) => l.created_at.slice(0, 10) <= q.au);
  const l = listing(rows, { search: (x) => `${x.action} ${x.entity || ''} ${x.details || ''} ${x.user_id ? userName(x.user_id) : ''}`, sorts: { date: (x) => x.id, action: (x) => x.action }, defaultSort: 'date', defaultDir: 'desc', perPage: 50 });
  const html = pageHead('Journal d’activité', 'Traçabilité des connexions, consultations confidentielles, modifications et exports.', `<button class="btn secondary" type="button" data-act="exportData" data-key="journal" data-format="xlsx">${icon('download')}Exporter</button>`)
    + `<div class="card">${toolbar(`${searchBox('Action, objet…')}<div class="field"><label>Utilisateur<select name="utilisateur" data-autosubmit>${opt('', 'Tous', q.utilisateur)}${DB.users.map((u) => opt(u.id, fullName(u), q.utilisateur)).join('')}</select></label></div><div class="field"><label>Du<input type="date" name="du" value="${e(q.du || '')}"></label></div><div class="field"><label>Au<input type="date" name="au" value="${e(q.au || '')}"></label></div>`)}
    <div class="card-body tight">${l.rows.length ? table([sortLink(l, 'date', 'Date'), 'Utilisateur', sortLink(l, 'action', 'Action'), 'Objet', 'Détails'], l.rows.map((x) => `<tr>${td('Date', fmtDT(x.created_at), 'nowrap')}${td('Utilisateur', x.user_id ? e(userName(x.user_id)) : 'Système')}${td('Action', `<span class="badge ${/echec|verrou/.test(x.action) ? 'err' : /consulte|export/.test(x.action) ? 'violet' : 'gray'}">${e(x.action)}</span>`)}${td('Objet', x.entity ? `${e(x.entity)}${x.entity_id ? ` #${x.entity_id}` : ''}` : '—')}${td('Détails', `<span class="mono" style="font-size:.8rem;word-break:break-word">${e(x.details ? (x.details.length > 200 ? `${x.details.slice(0, 200)}…` : x.details) : '')}</span>`)}</tr>`).join('')) + pager(l) : empty('Aucune entrée', '', 'history')}</div></div>`;
  return { title: 'Journal d’activité', html };
}
function viewAccount() {
  const html = pageHead('Mon compte', 'Informations personnelles et sécurité.', `<a class="btn secondary" href="#/mon-compte/mot-de-passe">${icon('lock')}Changer mon mot de passe</a>`)
    + `<div class="grid cols-2">${card('Identité', `<dl class="props"><dt>Nom</dt><dd>${e(fullName(ME))}</dd><dt>E-mail</dt><dd>${e(ME.email)}</dd><dt>Rôle</dt><dd>${ROLE[ME.role]}</dd>${ME.grade ? `<dt>Grade</dt><dd>${e(ME.grade)}</dd>` : ''}${ME.department ? `<dt>Département</dt><dd>${e(ME.department)}</dd>` : ''}<dt>Dernière connexion</dt><dd>${fmtDT(ME.last_login_at) || '—'}</dd></dl><p class="muted" style="margin-top:14px;font-size:.85rem">Pour corriger votre nom, grade ou département, contactez le service des examens.</p>`)}
    ${card('Coordonnées', `<form data-form="profileSave">${field('Téléphone', inp('phone', ME.phone, 'maxlength="30" autocomplete="tel"'))}<div class="form-actions"><button class="btn" type="submit">Enregistrer</button></div></form>`)}</div>`;
  return { title: 'Mon compte', html };
}
function viewPassword() {
  const html = pageHead('Changer mon mot de passe', ME.must_change_password ? 'Veuillez définir un nouveau mot de passe avant de continuer.' : 'Au moins 10 caractères, avec des lettres et des chiffres.')
    + `<div class="card" style="max-width:560px"><div class="card-body"><form data-form="passwordChange">${field('Mot de passe actuel', inp('current', '', 'type="password" required autocomplete="current-password"'), { req: true })}<div style="margin-top:14px">${field('Nouveau mot de passe', inp('password', '', 'type="password" required minlength="10" autocomplete="new-password"'), { req: true })}</div><div style="margin-top:14px">${field('Confirmation', inp('confirm', '', 'type="password" required minlength="10" autocomplete="new-password"'), { req: true })}</div><div class="form-actions"><button class="btn" type="submit">Mettre à jour</button></div></form></div></div>`;
  return { title: 'Mot de passe', html };
}

/* ---------- Documents imprimables ---------- */
function doc(title, subtitle, body, back) {
  return { doc: true, title, html: `<div class="doc-toolbar no-print"><a class="btn secondary" href="${back}">← Retour</a>${VIEWER ? '' : `<button class="btn secondary" type="button" data-act="print">${icon('printer')}Imprimer / PDF</button>`}<button class="btn" type="button" data-act="downloadDoc">${icon('download')}Télécharger le document</button></div>
  <article class="doc"><header class="doc-head"><img src="${LOGO}" alt="IPEIN"><div><strong>Institut Préparatoire aux Études d’Ingénieurs de Nabeul</strong><br><span>Service des examens</span></div></header>
  <h1>${e(title)}</h1>${subtitle ? `<p class="doc-sub">${e(subtitle)}</p>` : ''}${body}<footer class="doc-foot">IPEIN — Document édité le ${fmtDT(nowLocal())}</footer></article>` };
}
const docTable = (heads, rows) => `<table class="doc-table"><thead><tr>${heads.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
function printPlanning({ sid }) {
  const s = sessionFull(sid); const ctx = loadContext(s.id);
  let body = '';
  for (const d of [...new Set(ctx.cr.map((c) => c.date))]) {
    const rooms = ctx.examRooms.filter((er) => ctx.crById.get(er.creneau_id).date === d).sort((a, b) => ctx.crById.get(a.creneau_id).start_time.localeCompare(ctx.crById.get(b.creneau_id).start_time) || a.room_code.localeCompare(b.room_code));
    if (!rooms.length) continue;
    body += `<h2>${cap(fmtDate(d, true))}</h2>${docTable(['Horaire', 'Salle', 'Matière', 'Classe', 'Surveillants'], rooms.map((er) => { const c = ctx.crById.get(er.creneau_id); const names = ctx.assignments.filter((a) => a.exam_room_id === er.id).map((a) => userName(a.teacher_id)); return `<tr${names.length < er.supervisors_needed ? ' class="hl"' : ''}><td><b>${fmtTime(c.start_time)} – ${fmtTime(c.end_time)}</b></td><td>${e(er.room_code)}</td><td>${e(er.subject_name)}</td><td>${e(er.class_code)}</td><td>${e(names.join(', ') || 'À POURVOIR')}${names.length && names.length < er.supervisors_needed ? ` (+${er.supervisors_needed - names.length} à pourvoir)` : ''}</td></tr>`; }).join(''))}`;
  }
  return doc('Planning des surveillances', `${s.name} — ${s.year_label}, ${s.semester_label} — ${s.status === 'publie' ? 'Planning définitif publié' : 'Document provisoire (non publié)'}`, body || '<p>Aucun examen programmé pour cette session.</p>', `#/planning?session=${s.id}`);
}
function convocationBlock(s, u) {
  const rows = activeAssign((a) => a.session_id === s.id && a.teacher_id === u.id).map(describeAssignment).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  return `<p><b>${e(`${u.grade ? `${u.grade} ` : ''}${fullName(u)}`)}</b>${u.department ? ` — Département ${e(u.department)}` : ''}</p>
    <p style="text-align:justify">Vous êtes convoqué(e) pour assurer la surveillance des épreuves suivantes. Merci de vous présenter au service des examens 15 minutes avant le début de chaque épreuve.${s.status !== 'publie' ? ' <b>DOCUMENT PROVISOIRE : le planning n’est pas encore publié.</b>' : ''}</p>
    ${rows.length ? docTable(['Date', 'Horaire', 'Salle', 'Épreuve', 'Classe'], rows.map((a) => `<tr><td><b>${fmtDate(a.date, true)}</b></td><td>${fmtTime(a.start_time)} – ${fmtTime(a.end_time)}</td><td>${e(a.room_code)}</td><td>${e(a.subject_name)}</td><td>${e(a.class_code)}</td></tr>`).join('')) : '<p>Aucune surveillance ne vous est attribuée pour cette session.</p>'}
    <p style="margin-top:18px">Nombre total de surveillances : ${rows.length}</p><p class="sign">Le Directeur des études</p>`;
}
function printConvocation({ sid }) {
  const s = sessionFull(sid);
  const uid = isStaff() && R.query.ens ? Number(R.query.ens) : ME.id;
  if (!isStaff() && s.status !== 'publie') fail('La convocation sera disponible après publication du planning.');
  return doc('Convocation — surveillance des examens', `${s.name} — ${s.year_label}`, convocationBlock(s, get('users', uid)), isStaff() ? '#/exports' : '#/mon-planning');
}
function printConvocations({ sid }) {
  const s = sessionFull(sid);
  const ids = [...new Set(activeAssign((a) => a.session_id === s.id).map((a) => a.teacher_id))].map((id) => get('users', id)).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return doc('Convocations des surveillants', `${s.name} — ${ids.length} enseignant(s)`, ids.map((u, i) => `<section class="${i ? 'page-break' : ''}">${convocationBlock(s, u)}</section>`).join('') || '<p>Aucune affectation.</p>', `#/exports?session=${s.id}`);
}
function printStats({ sid }) {
  const st = stats(Number(sid)); if (!st) fail('Session introuvable.');
  const s = st.session;
  const kv = [['Examens programmés', st.exams], ['Créneaux', st.creneaux], ['Salles mobilisées', st.examRooms], ['Postes de surveillance requis', st.seats], ['Postes pourvus', `${st.filled} (${st.coverage} %)`], ['Places restantes', st.remaining], ['Salles entièrement couvertes', `${st.roomsCovered} / ${st.examRooms}`], ['Affectations confirmées / proposées', `${st.confirmed} / ${st.proposed}`], ['Enseignants ayant soumis leurs choix', `${st.submitted} / ${st.teachersCount}`], ['Conflits détectés (dont bloquants)', `${st.conflicts} (${st.blocking})`], ['Charge moyenne (écart-type)', `${st.mean} (${st.sd})`], ['Demandes d’absence en attente', st.pendingAbsences]];
  return doc('Rapport statistique de la session', `${s.name} — ${s.year_label}, ${s.semester_label}`, `<h2>Indicateurs clés</h2>${docTable(['Indicateur', 'Valeur'], kv.map(([k, v]) => `<tr><td><b>${e(k)}</b></td><td>${e(v)}</td></tr>`).join(''))}<h2>Répartition des surveillances par enseignant</h2>${docTable(['Enseignant', 'Affectations', 'Quota', 'Écart'], st.loads.slice().sort((a, b) => b.load - a.load || a.name.localeCompare(b.name)).map((l) => `<tr${l.load > l.quota ? ' class="hl"' : ''}><td>${e(l.name)}</td><td>${l.load}</td><td>${l.quota}</td><td>${l.load - l.quota}</td></tr>`).join(''))}`, `#/statistiques?session=${s.id}`);
}
function printTirage({ id }) {
  const t = get('tirages', id); if (!t) fail('Tirage introuvable.');
  const parts = tirageParts(t.id).map((p) => ({ ...p, u: get('users', p.user_id) })).sort((a, b) => fullName(a.u).localeCompare(fullName(b.u)));
  return doc('Feuille de présence — tirage des sujets', `${get('subjects', t.subject_id).name} — ${get('sessions', t.session_id).name}`, `<p>Date : <b>${fmtDate(t.date, true)}</b> — Horaire : <b>${fmtTime(t.start_time)} – ${fmtTime(t.end_time)}</b><br>Lieu : ${e(t.location)}${t.copies ? ` — Nombre de copies : ${t.copies}` : ''}<br>Statut : ${STATUS[t.status]}</p><p class="confid">DOCUMENT CONFIDENTIEL — ne pas diffuser.</p>${docTable(['Participant', 'Réponse', 'Émargement'], parts.map((p) => `<tr style="height:42px"><td>${e(fullName(p.u))}</td><td>${STATUS[p.response]}</td><td></td></tr>`).join(''))}`, `#/tirages/${t.id}`);
}

/* ---------- Table des routes ---------- */
route('/', 'all', viewDashboard);
route('/calendrier', 'all', viewCalendar);
route('/statistiques', 'staff', viewStats);
route('/sessions', 'staff', viewSessions);
route('/sessions/:id', 'staff', viewSession);
route('/examens', 'staff', viewExams);
route('/examens/nouveau', 'staff', viewExamForm);
route('/examens/:id/modifier', 'staff', viewExamForm);
route('/examens/:id', 'all', viewExam);
route('/tirages', 'all', viewTirages);
route('/tirages/nouveau', 'staff', viewTirageForm);
route('/tirages/:id/modifier', 'staff', viewTirageForm);
route('/tirages/:id', 'all', viewTirage);
route('/choix', 'staff', viewStaffChoices);
route('/mes-disponibilites', 'teacher', viewMyChoices);
route('/planning', 'staff', viewPlanning);
route('/planning/salle/:id', 'staff', viewRoom);
route('/mon-planning', 'teacher', viewMine);
route('/absences', 'staff', viewAbsences);
route('/annonces', 'all', viewAnnouncements);
route('/messages', 'all', viewMessages);
route('/messages/:id', 'all', viewMessage);
route('/notifications', 'all', viewNotifications);
route('/utilisateurs', 'staff', viewUsers);
route('/utilisateurs/nouveau', 'staff', viewUserForm);
route('/utilisateurs/:id/modifier', 'staff', viewUserForm);
route('/utilisateurs/:id', 'staff', viewUser);
route('/referentiels/:type', 'staff', viewRef);
route('/annees', 'staff', viewYears);
route('/annees/:id', 'staff', viewYear);
route('/imports', 'staff', viewImports);
route('/exports', 'staff', viewExports);
route('/sauvegarde', 'staff', viewBackup);
route('/parametres', 'admin', viewSettings);
route('/journal', 'admin', viewLog);
route('/mon-compte', 'all', viewAccount);
route('/mon-compte/mot-de-passe', 'all', viewPassword);
route('/imprimer/planning/:sid', 'staff', printPlanning);
route('/imprimer/convocations/:sid', 'staff', printConvocations);
route('/imprimer/convocation/:sid', 'all', printConvocation);
route('/imprimer/stats/:sid', 'staff', printStats);
route('/imprimer/tirage/:id', 'staff', printTirage);
