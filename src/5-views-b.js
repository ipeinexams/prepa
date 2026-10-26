/* =====================================================================
   Vues : choix, planning, absences, communication
   ===================================================================== */
function viewMyChoices() {
  const sessions = DB.sessions.filter((s) => ['choix_ouverts', 'choix_clos', 'publie'].includes(s.status)).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const sid = Number(R.query.session) || (sessions.find((s) => s.status === 'choix_ouverts') || sessions[0] || {}).id;
  const head = (extra = '') => pageHead('Mes disponibilités', 'Déclarez les créneaux où vous pouvez surveiller, puis soumettez votre demande avant la date limite.', `${sessions.length > 1 ? `<form data-filter>${sessionSelect(sid, { staffOnly: false })}</form>` : ''}${extra}`);
  if (!sid) return { title: 'Mes disponibilités', html: head() + card('', empty('Aucune période de choix', 'Vous serez notifié(e) à l’ouverture de la prochaine période de choix.', 'calendar')) };
  const s = sessionFull(sid);
  if (s.status === 'brouillon') fail('Session indisponible.');
  const w = choiceWindow(s);
  const sub = where('subs', (x) => x.session_id === s.id && x.teacher_id === ME.id)[0];
  const submitted = sub && sub.status === 'soumis';
  const av = new Map(where('avail', (a) => a.teacher_id === ME.id && a.session_id === s.id).map((a) => [a.creneau_id, a]));
  const dispo = [...av.values()].filter((a) => a.state === 'disponible').length;
  const indispo = [...av.values()].filter((a) => a.state === 'indisponible').length;
  const crs = sessionCreneaux(s.id);
  const leaves = where('leaves', (l) => l.teacher_id === ME.id && l.end_date >= s.start_date && l.start_date <= s.end_date);
  const days = [];
  for (const c of crs) { let d = days[days.length - 1]; if (!d || d.date !== c.date) { d = { date: c.date, items: [] }; days.push(d); } d.items.push(c); }
  const needOf = (c) => where('examRooms', (er) => er.creneau_id === c.id && get('exams', er.exam_id).status === 'planifie').reduce((a, er) => a + er.supervisors_needed, 0);
  const dis = w.open ? '' : 'disabled';
  let html = head(`<button class="btn secondary" type="button" data-act="exportMyChoices" data-session="${s.id}">${icon('download')}Exporter mes choix (fichier)</button>`)
    + `<div class="kpis">${kpi('Période de choix', w.open ? 'Ouverte' : 'Fermée', w.open ? (s.choices_close_at ? `Date limite : ${fmtDT(s.choices_close_at)}` : 'Sans date limite') : w.reason, w.open ? 'ok' : '')}
      ${kpi('Ma demande', submitted ? 'Soumise' : sub ? 'Brouillon' : 'Non commencée', submitted ? `le ${fmtDT(sub.submitted_at)}` : 'à soumettre avant la date limite', submitted ? 'ok' : 'warn')}
      <div class="kpi"><div class="k-label">Créneaux disponibles</div><div class="k-value" data-dispo-count>${dispo}</div><div class="k-sub">minimum requis : ${Math.max(s.min_choices, 1)} · ${indispo} indisponible(s)</div></div>
      ${kpi('Quota de surveillances', quotaFor(ME, s), `au maximum ${s.max_per_day} par jour`)}</div>`;
  if (leaves.length) html += `<div class="alert info">${icon('info')}<div>Périodes d’absence enregistrées : ${leaves.map((l) => `${fmtDate(l.start_date)} → ${fmtDate(l.end_date)}`).join(', ')}. Vous ne serez pas affecté(e) sur ces dates.</div></div>`;
  if (submitted && w.open) html += `<div class="alert info">${icon('info')}<div>Votre demande est soumise. Toute modification la repasse en brouillon : pensez à la soumettre à nouveau.</div></div>`;
  html += `<form class="card" data-form="myChoices" data-id="${s.id}" data-choice-form><div class="card-head"><h2>${e(s.name)}</h2>${w.open ? `<div class="actions"><button class="btn sm secondary" type="button" data-act="fillChoices" data-v="disponible">Tout disponible</button><button class="btn sm secondary" type="button" data-act="fillChoices" data-v="">Tout effacer</button></div>` : ''}</div><div class="card-body">
    ${days.length ? '' : '<p class="muted">Aucun créneau n’est encore défini pour cette session.</p>'}
    ${days.map((d) => `<div class="day"><h3>${cap(fmtDate(d.date, true))}</h3>${d.items.map((c) => {
      const a = av.get(c.id); const st = a ? a.state : '';
      const vol = where('avail', (x) => x.creneau_id === c.id && x.state === 'disponible').length;
      const mine = activeAssign((x) => x.creneau_id === c.id && x.teacher_id === ME.id).length;
      return `<div class="slot-choice st-${st || 'none'}"><div><strong>${fmtTime(c.start_time)} – ${fmtTime(c.end_time)}</strong><div class="muted" style="font-size:.78rem">${needOf(c)} surveillant(s) requis · ${vol} volontaire(s)</div>${mine ? `<span class="badge ${s.status === 'publie' ? 'ok' : 'blue'}">${s.status === 'publie' ? 'Affectation confirmée' : 'Affectation proposée'}</span>` : ''}</div>
        <input type="text" name="comment_${c.id}" value="${e(a && a.comment ? a.comment : '')}" placeholder="Commentaire (facultatif)" maxlength="300" ${dis} aria-label="Commentaire">
        <div class="seg" role="radiogroup" aria-label="Disponibilité ${fmtDate(c.date)} ${fmtTime(c.start_time)}"><label class="dispo"><input type="radio" name="etat_${c.id}" value="disponible"${st === 'disponible' ? ' checked' : ''} ${dis}><span>Disponible</span></label><label class="indispo"><input type="radio" name="etat_${c.id}" value="indisponible"${st === 'indisponible' ? ' checked' : ''} ${dis}><span>Indisponible</span></label><label><input type="radio" name="etat_${c.id}" value=""${!st ? ' checked' : ''} ${dis}><span>—</span></label></div></div>`;
    }).join('')}</div>`).join('')}</div>
    ${w.open && days.length ? `<div class="sticky-bar"><span class="muted">Brouillon : modifiable à tout moment. Soumission : transmise au service des examens.</span><div class="actions"><button class="btn secondary" type="submit" name="action" value="enregistrer">Enregistrer le brouillon</button><button class="btn" type="submit" name="action" value="soumettre" data-confirm="Soumettre vos disponibilités au service des examens ? Vous pourrez les modifier jusqu’à la date limite.">${icon('send')}Soumettre ma demande</button></div></div>` : ''}</form>`;
  return { title: 'Mes disponibilités', html, after: () => refreshChoiceForm() };
}
function refreshChoiceForm() {
  const f = $('[data-choice-form]'); if (!f) return;
  let n = 0;
  $$('.slot-choice', f).forEach((row) => {
    const v = ($('input[type=radio]:checked', row) || {}).value || '';
    row.classList.toggle('st-disponible', v === 'disponible'); row.classList.toggle('st-indisponible', v === 'indisponible');
    if (v === 'disponible') n++;
  });
  const c = $('[data-dispo-count]'); if (c) c.textContent = n;
}

function viewStaffChoices() {
  const sid = Number(R.query.session) || defaultSessionId();
  if (!sid) return { title: 'Suivi des choix', html: pageHead('Suivi des choix') + card('', empty('Aucune session', '', 'layers')) };
  const s = sessionFull(sid); const st = stats(sid); const w = choiceWindow(s);
  let rows = activeTeachers().map((u) => {
    const sub = where('subs', (x) => x.session_id === sid && x.teacher_id === u.id)[0];
    const av = where('avail', (a) => a.session_id === sid && a.teacher_id === u.id);
    return { ...u, status: sub ? sub.status : null, submitted_at: sub ? sub.submitted_at : null, dispo: av.filter((a) => a.state === 'disponible').length, indispo: av.filter((a) => a.state === 'indisponible').length, assigned: activeAssign((a) => a.session_id === sid && a.teacher_id === u.id).length, quota: quotaFor(u, s) };
  });
  const q = R.query;
  if (q.etat === 'soumis') rows = rows.filter((r) => r.status === 'soumis');
  if (q.etat === 'brouillon') rows = rows.filter((r) => r.status === 'brouillon');
  if (q.etat === 'aucun') rows = rows.filter((r) => !r.status);
  const l = listing(rows, { search: (r) => `${fullName(r)} ${r.department || ''}`, sorts: { nom: (r) => fullName(r), etat: (r) => r.status || '', soumission: (r) => r.submitted_at || '', dispo: (r) => r.dispo }, defaultSort: 'nom' });
  const html = pageHead('Suivi des choix', 'Disponibilités déclarées, demandes soumises et affectations par enseignant.', `<form data-filter>${sessionSelect(sid)}</form>`)
    + `<div class="kpis">${kpi('Demandes soumises', `${st.submitted}/${st.teachersCount}`, '', 'ok', st.teachersCount ? Math.round((st.submitted / st.teachersCount) * 100) : 0)}${kpi('Brouillons', st.drafts, 'disponibilités déclarées non soumises', 'warn')}${kpi('En attente', st.pendingChoices, 'enseignants sans soumission', st.pendingChoices ? 'err' : 'ok')}${kpi('Période', w.open ? 'Ouverte' : 'Fermée', s.choices_close_at ? `limite ${fmtDT(s.choices_close_at)}` : '')}</div>
    <div class="card">${toolbar(`${searchBox('Nom, département…')}<div class="field"><label>État<select name="etat" data-autosubmit>${opt('', 'Tous', q.etat)}${opt('soumis', 'Soumis', q.etat)}${opt('brouillon', 'Brouillon', q.etat)}${opt('aucun', 'Non commencé', q.etat)}</select></label></div>`, ['session'])}
    <div class="toolbar" style="justify-content:space-between"><span class="muted" style="flex:1">${st.pendingChoices} enseignant(s) n’ont pas encore soumis leurs choix.</span>
      <label class="btn secondary">${icon('upload')}Importer des fichiers de choix<input type="file" accept=".json" multiple data-import-choices="${sid}" hidden></label>
      <button class="btn secondary" type="button" data-act="exportData" data-key="charges" data-session="${sid}" data-format="xlsx">${icon('download')}Exporter</button>
      ${w.open && st.pendingChoices ? act('choicesRemind', `${icon('bell')}Relancer les retardataires`, { id: sid }, { cls: '', confirm: 'Envoyer un rappel à tous les enseignants n’ayant pas soumis leurs choix ?' }) : ''}</div>
    <div class="card-body tight">${l.rows.length ? table([sortLink(l, 'nom', 'Enseignant'), sortLink(l, 'etat', 'Demande'), sortLink(l, 'soumission', 'Soumise le'), sortLink(l, 'dispo', 'Disponible'), 'Indisponible', 'Affectations', ''], l.rows.map((r) => `<tr>${td('Enseignant', `<a href="#/utilisateurs/${r.id}"><strong>${e(r.last_name)}</strong> ${e(r.first_name)}</a><span class="sub">${e(r.department || '')}</span>`)}${td('Demande', r.status ? badge(r.status) : '<span class="badge gray">Non commencée</span>')}${td('Soumise le', fmtDT(r.submitted_at) || '—')}${td('Disponible', `<span class="badge ${r.dispo ? 'ok' : 'gray'}">${r.dispo}</span>`)}${td('Indisponible', r.indispo)}${td('Affectations', `<span class="badge ${r.assigned > r.quota ? 'warn' : r.assigned ? 'blue' : 'gray'}">${r.assigned}/${r.quota}</span>`)}<td class="actions-cell"><a class="btn sm secondary" href="#/messages?a=${r.id}" aria-label="Écrire">${icon('mail')}</a>${r.status === 'soumis' ? act('choicesReopen', 'Rouvrir', { session: sid, teacher: r.id }, { confirm: 'Rouvrir la demande de cet enseignant ? Il devra la soumettre à nouveau.' }) : ''}</td></tr>`).join('')) + pager(l) : empty('Aucun enseignant', '', 'users')}</div></div>`;
  return { title: 'Suivi des choix', html };
}

/* ---------- Planning ---------- */
function viewPlanning() {
  const sid = Number(R.query.session) || defaultSessionId();
  if (!sid) return { title: 'Planning des surveillances', html: pageHead('Planning des surveillances') + card('', empty('Aucune session', '', 'layers', { href: '#/sessions', label: 'Créer une session' })) };
  const s = sessionFull(sid); const st = stats(sid); const pub = s.status === 'publie';
  const tab = ['tableau', 'conflits', 'equite', 'historique'].includes(R.query.onglet) ? R.query.onglet : 'tableau';
  let html = pageHead('Planning des surveillances', 'Affectations, conflits, équité et publication du planning définitif.', `<form data-filter>${sessionSelect(sid)}</form>`)
    + `<div class="kpis">${kpi('Couverture', `${st.coverage} %`, `${st.filled}/${st.seats} postes`, st.coverage === 100 ? 'ok' : 'warn', st.coverage)}${kpi('Places restantes', st.remaining, `${st.examRooms - st.roomsCovered} salle(s) incomplète(s)`, st.remaining ? 'warn' : 'ok')}${kpi('Affectations', st.confirmed + st.proposed, `${st.confirmed} confirmée(s) · ${st.proposed} proposée(s)`)}${kpi('Conflits', st.conflicts, `${st.blocking} bloquant(s)`, st.blocking ? 'err' : st.conflicts ? 'warn' : 'ok')}${kpi('Équité', st.mean, `surveillances en moyenne · écart-type ${st.sd}`)}</div>
    <div class="card" style="margin-bottom:18px"><div class="card-body actions" style="justify-content:space-between"><div class="actions">
      ${pub ? `<span class="badge ok">Planning publié le ${fmtDT(s.published_at)}</span><span class="muted" style="font-size:.86rem">Les modifications passent par des remplacements notifiés.</span>`
    : `${act('autoAssign', `${icon('sparkles')}Affectation automatique`, { id: sid, mode: 'complete' }, { cls: '', confirm: 'Compléter automatiquement les places vides selon les vœux, les quotas et l’équité ?' })}${act('autoAssign', 'Recalculer les propositions', { id: sid, mode: 'reset' }, { cls: 'secondary', confirm: 'Les propositions automatiques non confirmées seront retirées puis recalculées. Les affectations manuelles et confirmées sont conservées.' })}${st.proposed ? act('confirmAll', `${icon('check')}Confirmer les propositions`, { id: sid }, { cls: 'secondary', confirm: `Confirmer les ${st.proposed} affectation(s) proposée(s) ?` }) : ''}`}
    </div><div class="actions"><a class="btn secondary" href="#/imprimer/planning/${sid}">${icon('printer')}Imprimer / PDF</a><button class="btn secondary" type="button" data-act="exportData" data-key="affectations" data-session="${sid}" data-format="xlsx">${icon('download')}Excel</button>
      ${pub ? (ME.role === 'admin' ? act('unpublish', 'Dépublier', { id: sid }, { cls: 'danger', danger: true, confirm: 'Retirer la publication ? Les affectations restent confirmées.' }) : '')
    : `<button type="button" class="btn success" data-act="publish" data-id="${sid}" data-confirm="${e(`Publier le planning définitif ? Toutes les affectations seront confirmées et chaque enseignant notifié.${st.remaining ? ` Attention : ${st.remaining} place(s) restent à pourvoir.` : ''}`)}"${st.blocking ? ' disabled title="Résolvez d’abord les conflits bloquants"' : ''}>${icon('send')}Publier le planning</button>`}</div></div></div>
    <nav class="tabs">${[['tableau', 'Tableau des créneaux'], ['conflits', `Conflits et manques (${st.conflicts})`], ['equite', 'Équité de répartition'], ['historique', 'Historique']].map(([k, t]) => `<a href="#/planning?session=${sid}&onglet=${k}" class="${tab === k ? 'active' : ''}">${e(t)}</a>`).join('')}</nav>`;
  const ctx = st.ctx;
  if (tab === 'tableau') {
    const dates = [...new Set(ctx.cr.map((c) => c.date))];
    const onlyInc = R.query.incomplets === '1';
    const groups = [];
    for (const c of ctx.cr) {
      if (R.query.date && c.date !== R.query.date) continue;
      let rooms = ctx.examRooms.filter((er) => er.creneau_id === c.id).sort((a, b) => a.room_code.localeCompare(b.room_code)).map((er) => ({ ...er, as: ctx.assignments.filter((a) => a.exam_room_id === er.id) }));
      if (onlyInc) rooms = rooms.filter((r) => r.as.length < r.supervisors_needed);
      if (rooms.length) groups.push({ c, rooms });
    }
    html += `<form class="card toolbar" data-filter style="margin-bottom:16px;border-radius:var(--radius)"><input type="hidden" name="session" value="${sid}"><div class="field"><label>Jour<select name="date" data-autosubmit>${opt('', 'Tous les jours', R.query.date)}${dates.map((d) => opt(d, fmtDate(d, true), R.query.date)).join('')}</select></label></div><label class="check" style="align-self:center"><input type="checkbox" name="incomplets" value="1" data-autosubmit${onlyInc ? ' checked' : ''}> Salles incomplètes uniquement</label></form>`;
    if (!groups.length) html += card('', empty(onlyInc ? 'Toutes les salles sont couvertes' : 'Aucun examen programmé', onlyInc ? 'Aucune place à pourvoir pour ce filtre.' : 'Programmez des examens pour cette session.', 'grid', onlyInc ? null : { href: `#/examens/nouveau?session=${sid}`, label: 'Programmer un examen' }));
    for (const g of groups) {
      const need = g.rooms.reduce((a, r) => a + r.supervisors_needed, 0); const got = g.rooms.reduce((a, r) => a + Math.min(r.as.length, r.supervisors_needed), 0);
      html += `<section class="slot"><div class="slot-head"><span class="when">${fmtDate(g.c.date, true)} · ${fmtTime(g.c.start_time)}–${fmtTime(g.c.end_time)}</span><span class="badge ${got >= need ? 'ok' : 'warn'}">${got}/${need} surveillants</span><span class="muted" style="font-size:.84rem">${g.rooms.length} salle(s)</span></div><div class="rooms">${g.rooms.map((r) => {
        const full = r.as.length >= r.supervisors_needed;
        return `<div class="room ${full ? 'complete' : 'incomplete'}" id="er-${r.id}"><div class="room-head"><b>Salle ${e(r.room_code)}</b><a href="#/examens/${r.exam_id}" class="muted" style="font-size:.82rem">${e(r.class_code)} · ${e(r.subject_code)}</a></div><div class="muted" style="font-size:.8rem;margin-bottom:6px">${e(r.subject_name)} · ${r.students} étudiants</div>
          <ul class="people">${r.as.map((a) => { const t = get('users', a.teacher_id); const av = ctx.availMap.get(`${a.teacher_id}:${a.creneau_id}`); return `<li><span class="name" title="${e(fullName(t))}">${e(fullName(t))}</span>${av === 'indisponible' ? '<span class="badge err" title="Déclaré indisponible">!</span>' : av !== 'disponible' ? '<span class="badge gray" title="Hors vœux">HV</span>' : ''}<span class="badge ${a.status === 'confirme' ? 'ok' : 'blue'}" title="${STATUS[a.source]}">${a.status === 'confirme' ? 'Conf.' : 'Prop.'}</span><a class="btn sm ghost" href="#/planning/salle/${r.id}?remplacer=${a.id}" title="Remplacer" aria-label="Remplacer">${icon('swap')}</a>${act('unassign', icon('x'), { id: a.id }, { cls: 'sm ghost', danger: true, confirm: `Retirer ${fullName(t)} de cette surveillance ?${pub ? ' L’enseignant sera notifié.' : ''}`, title: 'Retirer' })}</li>`; }).join('')}</ul>
          ${full ? '' : `<div style="display:flex;justify-content:space-between;align-items:center"><span class="missing">${r.supervisors_needed - r.as.length} place(s) à pourvoir</span><a class="btn sm" href="#/planning/salle/${r.id}">${icon('plus')}Affecter</a></div>`}</div>`;
      }).join('')}</div></section>`;
    }
  }
  if (tab === 'conflits') {
    const inc = incompleteRooms(sid);
    html += `<div class="grid cols-2">${card('Conflits détectés', st.conflictList.length ? `<ul class="list">${st.conflictList.map((c) => `<li><span class="badge ${c.severity === 'erreur' ? 'err' : 'warn'}">${c.severity === 'erreur' ? 'Bloquant' : 'Alerte'}</span><div class="grow" style="font-size:.88rem">${e(c.message)}</div>${c.assignmentId ? `<a class="btn sm secondary" href="#/planning/salle/${c.examRoomId}?remplacer=${c.assignmentId}">Remplacer</a>` : ''}</li>`).join('')}</ul>` : `<div class="empty">${icon('check')}<h3>Aucun conflit</h3><p>Pas de double affectation, de chevauchement, de dépassement de quota ni d’indisponibilité violée.</p></div>`, { tight: true })}
      ${card(`Créneaux incomplets (${inc.length})`, inc.length ? `<ul class="list">${inc.map((r) => `<li><div class="grow"><strong>Salle ${e(r.room_code)}</strong> — ${e(r.subject_name)} (${e(r.class_code)})<div class="meta">${fmtDate(r.c.date, true)}, ${fmtTime(r.c.start_time)}–${fmtTime(r.c.end_time)}</div></div><span class="badge warn">${r.assigned}/${r.supervisors_needed}</span><a class="btn sm" href="#/planning/salle/${r.id}">Affecter</a></li>`).join('')}</ul>` : `<div class="empty">${icon('check')}<h3>Tous les besoins sont couverts</h3></div>`, { tight: true })}</div>`;
  }
  if (tab === 'equite') {
    const max = Math.max(1, ...st.loads.map((l) => Math.max(l.load, l.quota)));
    html += card('Charge par enseignant', `<input type="search" placeholder="Filtrer…" data-filter-input=".load-row" aria-label="Filtrer" style="max-width:320px;margin-bottom:12px"><div class="bars">${st.loads.slice().sort((a, b) => b.load - a.load || a.name.localeCompare(b.name)).map((l) => `<div class="bar-row load-row" style="grid-template-columns:220px 1fr 80px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="#/utilisateurs/${l.id}">${e(l.name)}</a></span><div class="track"><span class="${l.load > l.quota ? 'over' : l.load === l.quota ? 'ok' : ''}" style="width:${Math.round((l.load / max) * 100)}%"></span></div><span class="muted">${l.load} / ${l.quota}</span></div>`).join('')}</div>`, { right: `<span class="muted">Moyenne ${st.mean} · écart-type ${st.sd} · ${st.loads.filter((l) => l.load > l.quota).length} dépassement(s)</span>` });
  }
  if (tab === 'historique') {
    const h = where('history', (x) => x.session_id === sid).slice(-300).reverse();
    html += card('', h.length ? table(['Date', 'Action', 'Enseignant', 'Détail', 'Par'], h.map((x) => `<tr>${td('Date', fmtDT(x.created_at), 'nowrap')}${td('Action', `<strong>${e(x.action.replace(/_/g, ' '))}</strong>`)}${td('Enseignant', `${x.teacher_id ? e(userName(x.teacher_id)) : '—'}${x.other_teacher_id ? ` → ${e(userName(x.other_teacher_id))}` : ''}`)}${td('Détail', e(x.note || ''))}${td('Par', x.actor_id ? e(userName(x.actor_id)) : 'Système')}</tr>`).join('')) : empty('Aucun historique', '', 'history'), { tight: true });
  }
  return { title: 'Planning des surveillances', html };
}
function viewRoom({ id }) {
  const raw = get('examRooms', id); if (!raw) fail('Salle d’examen introuvable.');
  const er = examRoomFull(raw); const c = get('creneaux', er.creneau_id);
  const rep = Number(R.query.remplacer) || null;
  const current = activeAssign((a) => a.exam_room_id === er.id);
  const target = rep ? current.find((a) => a.id === rep) : null;
  if (rep && !target) fail('Affectation à remplacer introuvable.');
  const cands = candidates(er.id, { ignore: rep });
  const full = current.length >= er.supervisors_needed;
  const html = pageHead(`${target ? 'Remplacer un surveillant' : 'Affecter un surveillant'} — salle ${e(er.room_code)}`, `${er.subject_name} (${er.class_code}) · ${fmtDate(c.date, true)}, ${fmtTime(c.start_time)}–${fmtTime(c.end_time)} · ${current.length}/${er.supervisors_needed} surveillant(s)`, '', `<a href="#/planning?session=${er.session_id}">Planning</a> /`)
    + (target ? `<div class="alert warning">${icon('swap')}<div>Remplacement de <strong>${e(userName(target.teacher_id))}</strong>. L’ancien et le nouveau surveillant seront notifiés ; l’historique est conservé.</div></div>` : full ? `<div class="alert info">${icon('info')}<div>Cette salle a déjà tous ses surveillants. Utilisez « Remplacer » pour changer quelqu’un.</div></div>` : '')
    + `<div class="grid side">${card(`Enseignants éligibles (${cands.length})`, cands.length ? table(['Enseignant', 'Vœu sur ce créneau', 'Charge', 'Alertes', ''], cands.map((x) => `<tr class="cand-row">${td('Enseignant', `<strong>${e(x.teacher.last_name)}</strong> ${e(x.teacher.first_name)}<span class="sub">${e(x.teacher.department || '')}</span>`)}${td('Vœu', x.state ? badge(x.state) : '<span class="badge gray">Non renseigné</span>')}${td('Charge', `<span class="badge ${x.load >= x.quota ? 'warn' : 'gray'}">${x.load}/${x.quota}</span>`)}${td('Alertes', `<span style="font-size:.8rem;color:var(--warn)">${e(x.warnings.join(' ') || '—')}</span>`)}<td class="actions-cell">${!target && full ? '' : act(target ? 'replace' : 'assign', target ? 'Remplacer par' : 'Affecter', { room: er.id, teacher: x.teacher.id, old: target ? target.id : '', force: x.warnings.length ? 1 : 0 }, { cls: `sm ${x.warnings.length ? 'secondary' : ''}`, confirm: x.warnings.length ? `Dérogation : ${x.warnings.join(' ')} Confirmer pour ${fullName(x.teacher)} ?` : '' })}</td></tr>`).join(''))
      : empty(!target && full ? 'Salle complète' : 'Aucun enseignant éligible', !target && full ? 'Utilisez « Remplacer » pour changer un surveillant.' : 'Tous les enseignants sont déjà affectés, en chevauchement ou absents sur ce créneau.', 'users'), { tight: true, right: '<input type="search" placeholder="Filtrer…" data-filter-input=".cand-row" aria-label="Filtrer" style="max-width:220px">' })}
      ${card('Surveillants actuels', `<ul class="list">${current.map((a) => `<li><div class="grow"><strong>${e(userName(a.teacher_id))}</strong><div class="meta">${STATUS[a.source]} · ${STATUS[a.status]}</div></div>${target ? '' : `<a class="btn sm secondary" href="#/planning/salle/${er.id}?remplacer=${a.id}">Remplacer</a>`}</li>`).join('') || '<li class="muted">Aucun surveillant.</li>'}</ul><p class="muted" style="font-size:.84rem;padding:12px 18px;margin:0;border-top:1px solid var(--line)">Classement : sans alerte, puis disponibles déclarés, puis charge relative la plus faible. Les cas bloquants (double affectation, chevauchement, absence) sont exclus.</p>`, { tight: true })}</div>`;
  return { title: `Salle ${er.room_code}`, html };
}
function myAssignments() {
  return activeAssign((a) => a.teacher_id === ME.id).map((a) => {
    const d = describeAssignment(a); const s = get('sessions', a.session_id);
    return { ...d, session_name: s.name, session_status: s.status, colleagues: activeAssign((x) => x.exam_room_id === a.exam_room_id && x.id !== a.id).map((x) => userName(x.teacher_id)).join(', '), absence: (where('absences', (r) => r.assignment_id === a.id).slice(-1)[0] || {}).status };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
}
function viewMine() {
  const rows = myAssignments(); const pub = rows.filter((r) => r.session_status === 'publie'); const prov = rows.filter((r) => r.session_status !== 'publie');
  const sids = [...new Set(pub.map((r) => r.session_id))];
  const html = pageHead('Mon planning de surveillance', 'Affectations confirmées après publication, demandes d’absence et convocations.', `${pub.length ? `<button class="btn secondary" type="button" data-act="exportIcs">${icon('calendar')}Ajouter à mon agenda (.ics)</button>${sids.map((sid) => `<a class="btn" href="#/imprimer/convocation/${sid}">${icon('printer')}Convocation — ${e(get('sessions', sid).name)}</a>`).join('')}` : ''}`)
    + card('Affectations confirmées', pub.length ? table(['Date', 'Horaire', 'Salle', 'Épreuve', 'Avec', 'Absence', ''], pub.map((a) => { const past = a.date < today(); return `<tr style="${past ? 'opacity:.6' : ''}">${td('Date', `<strong>${fmtDate(a.date, true)}</strong>`, 'nowrap')}${td('Horaire', `${fmtTime(a.start_time)}–${fmtTime(a.end_time)}`, 'nowrap')}${td('Salle', `${e(a.room_code)}<span class="sub">${e(a.building || '')}</span>`)}${td('Épreuve', `${e(a.subject_name)} (${e(a.class_code)})<span class="sub">${e(a.session_name)}</span>`)}${td('Avec', e(a.colleagues || '—'))}${td('Absence', a.absence ? badge(a.absence) : '—')}<td class="actions-cell">${!past && a.absence !== 'en_attente' ? `<details><summary class="btn sm secondary">Signaler une absence</summary><form data-form="absenceRequest" data-id="${a.id}" style="margin-top:8px;min-width:260px;text-align:left">${field('Motif', '<textarea name="reason" required minlength="5" maxlength="1000" style="min-height:70px"></textarea>', { req: true })}<button class="btn sm" type="submit" style="margin-top:6px">Envoyer la demande</button></form></details>` : ''}</td></tr>`; }).join('')) : empty('Aucune affectation confirmée', 'Votre planning apparaîtra ici dès sa publication.', 'clipboard'), { tight: true, right: `<span class="badge ok">${pub.length}</span>` })
    + (prov.length ? card('Affectations provisoires', `<p class="muted" style="padding:12px 18px 0;margin:0;font-size:.86rem">Propositions en cours : elles peuvent évoluer jusqu’à la publication du planning définitif.</p>${table(['Date', 'Horaire', 'Salle', 'Épreuve', 'Statut'], prov.map((a) => `<tr>${td('Date', fmtDate(a.date, true))}${td('Horaire', `${fmtTime(a.start_time)}–${fmtTime(a.end_time)}`)}${td('Salle', e(a.room_code))}${td('Épreuve', `${e(a.subject_name)} (${e(a.class_code)})`)}${td('Statut', badge(a.status))}</tr>`).join(''))}`, { tight: true, right: `<span class="badge blue">${prov.length}</span>` }) : '');
  return { title: 'Mon planning de surveillance', html };
}

/* ---------- Absences ---------- */
function viewAbsences() {
  const statut = ['en_attente', 'acceptee', 'refusee', 'toutes'].includes(R.query.statut) ? R.query.statut : 'en_attente';
  const rows = DB.absences.filter((r) => statut === 'toutes' || r.status === statut).map((r) => ({ ...r, d: describeAssignment(get('assignments', r.assignment_id)) }));
  const l = listing(rows, { search: (r) => `${userName(r.teacher_id)} ${r.d.subject_name}`, sorts: { date: (r) => r.d.date + r.d.start_time }, defaultSort: 'date' });
  const teachers = activeTeachers();
  const leaves = DB.leaves.filter((x) => x.end_date >= addDays(today(), -30)).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const html = pageHead('Absences et remplacements', 'Demandes d’absence, réaffectations et périodes d’indisponibilité.')
    + `<nav class="tabs">${[['en_attente', 'En attente'], ['acceptee', 'Acceptées'], ['refusee', 'Refusées'], ['toutes', 'Toutes']].map(([k, t]) => `<a href="#/absences?statut=${k}" class="${statut === k ? 'active' : ''}">${t}</a>`).join('')}</nav>`
    + card('', l.rows.length ? `<ul class="list">${l.rows.map((r) => {
      const cands = r.status === 'en_attente' ? candidates(r.d.exam_room_id, { ignore: r.assignment_id }).slice(0, 8) : [];
      return `<li style="display:block"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start"><div class="grow"><strong>${e(userName(r.teacher_id))}</strong> — surveillance du ${fmtDate(r.d.date, true)}, ${fmtTime(r.d.start_time)}–${fmtTime(r.d.end_time)}, salle ${e(r.d.room_code)} (${e(r.d.subject_name)})<div class="meta">Demandée le ${fmtDT(r.created_at)}${r.decided_by ? ` · traitée par ${e(userName(r.decided_by))} le ${fmtDT(r.decided_at)}` : ''}</div><p style="margin:6px 0 0;white-space:pre-line"><em>« ${e(r.reason)} »</em></p>${r.decision_note ? `<p class="muted" style="margin:4px 0 0">Décision : ${e(r.decision_note)}</p>` : ''}</div>${badge(r.status)}</div>
        ${r.status === 'en_attente' ? `<form data-form="absenceDecide" data-id="${r.id}" class="form-grid cols-3" style="margin-top:12px;background:#f8fbfd;padding:12px;border-radius:8px;border:1px solid var(--line)">${field('Remplaçant proposé', `<select name="replacement_id"><option value="">— Libérer la place sans remplaçant —</option>${cands.map((c) => opt(c.teacher.id, `${c.name} · ${c.load}/${c.quota}${c.state === 'disponible' ? ' · disponible' : ''}${c.warnings.length ? ' · ⚠' : ''}`)).join('')}</select>`, { hint: 'Classés par disponibilité et charge. ⚠ = dérogation.' })}${field('Commentaire', inp('note', '', 'maxlength="500" placeholder="Obligatoire en cas de refus"'))}<div class="field" style="align-self:end;display:flex;gap:6px;flex-wrap:wrap"><button class="btn success sm" type="submit" name="decision" value="acceptee" data-confirm="Accepter l’absence et appliquer le remplacement choisi ?">Accepter</button><button class="btn danger sm" type="submit" name="decision" value="refusee" data-confirm="Refuser cette demande ? L’enseignant restera affecté.">Refuser</button></div></form>` : ''}</li>`;
    }).join('')}</ul>${pager(l)}` : empty(statut === 'en_attente' ? 'Aucune demande en attente' : 'Aucune demande', '', 'swap'), { tight: true })
    + `<div class="grid side" style="margin-top:18px">${card('Périodes d’absence des enseignants', leaves.length ? table(['Enseignant', 'Du', 'Au', 'Motif', ''], leaves.map((x) => `<tr>${td('Enseignant', `<a href="#/utilisateurs/${x.teacher_id}">${e(userName(x.teacher_id))}</a>`)}${td('Du', fmtDate(x.start_date))}${td('Au', fmtDate(x.end_date))}${td('Motif', e(x.reason || '—'))}<td class="actions-cell">${act('leaveDelete', icon('trash'), { id: x.id }, { cls: 'sm danger', danger: true, confirm: 'Supprimer cette période d’absence ?', title: 'Supprimer' })}</td></tr>`).join('')) : '<p class="muted" style="padding:14px 18px">Aucune période enregistrée.</p>', { tight: true })}
      ${card('Déclarer une absence', `<form data-form="leaveAdd">${field('Enseignant', `<select name="teacher_id" required><option value="">— Choisir —</option>${teachers.map((t) => opt(t.id, fullName(t))).join('')}</select>`, { req: true })}<div class="form-grid" style="margin-top:12px">${field('Du', inp('start_date', '', 'type="date" required'), { req: true })}${field('Au', inp('end_date', '', 'type="date" required'), { req: true })}</div><div style="margin-top:12px">${field('Motif', inp('reason', '', 'maxlength="300" placeholder="Congé, mission, formation…"'))}</div><p class="muted" style="font-size:.8rem;margin-top:8px">L’enseignant ne sera plus proposé sur ces dates ; les surveillances existantes apparaîtront comme conflits à réaffecter.</p><div class="form-actions"><button class="btn" type="submit">Enregistrer</button></div></form>`)}</div>`;
  return { title: 'Absences et remplacements', html };
}

/* ---------- Communication ---------- */
const AUD = { tous: 'Tout le monde', enseignant: 'Enseignants', responsable: 'Personnel administratif' };
function annFor(u) {
  const aud = u.role === 'enseignant' ? ['tous', 'enseignant'] : ['tous', 'enseignant', 'responsable'];
  return DB.announcements.filter((a) => aud.includes(a.audience) && (isStaff(u) || !a.expires_at || a.expires_at >= today()))
    .sort((a, b) => (b.pinned - a.pinned) || b.created_at.localeCompare(a.created_at));
}
function viewAnnouncements() {
  const staff = isStaff();
  const l = listing(annFor(ME), { search: (a) => `${a.title} ${a.body}`, perPage: 10 });
  const edit = staff && R.query.modifier ? get('announcements', R.query.modifier) : null;
  const v = edit || {};
  const list = l.rows.length ? `<ul class="list">${l.rows.map((a) => { const exp = a.expires_at && a.expires_at < today(); return `<li style="display:block;${exp ? 'opacity:.6' : ''}"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">${e(a.title)}</h3>${a.pinned ? '<span class="badge blue">Épinglée</span>' : ''}${staff ? `<span class="badge gray">${AUD[a.audience]}</span>` : ''}${exp ? '<span class="badge gray">Expirée</span>' : ''}</div><div class="meta">${fmtDT(a.created_at)}${a.author_id ? ` · ${e(userName(a.author_id))}` : ''}${a.expires_at ? ` · jusqu’au ${fmtDate(a.expires_at)}` : ''}</div><p style="white-space:pre-line;margin:8px 0 0">${e(a.body)}</p>${staff ? `<div class="actions" style="margin-top:8px"><a class="btn sm secondary" href="#/annonces?modifier=${a.id}">${icon('edit')}Modifier</a>${act('annDelete', `${icon('trash')}Supprimer`, { id: a.id }, { cls: 'sm danger', danger: true, confirm: 'Supprimer cette annonce ?' })}</div>` : ''}</li>`; }).join('')}</ul>${pager(l)}` : empty('Aucune annonce', '', 'megaphone');
  const form = staff ? card(edit ? 'Modifier l’annonce' : 'Nouvelle annonce', `<form data-form="annSave"${edit ? ` data-id="${edit.id}"` : ''}>${field('Titre', inp('title', v.title, 'required maxlength="150"'), { req: true })}<div style="margin-top:12px">${field('Contenu', `<textarea name="body" required maxlength="5000" style="min-height:150px">${e(v.body || '')}</textarea>`, { req: true })}</div><div class="form-grid" style="margin-top:12px">${field('Destinataires', `<select name="audience">${Object.entries(AUD).map(([k, t]) => opt(k, t, v.audience)).join('')}</select>`)}${field('Expire le', inp('expires_at', v.expires_at, 'type="date"'))}</div><label class="check" style="margin-top:12px"><input type="checkbox" name="pinned"${v.pinned ? ' checked' : ''}> Épingler en tête</label><div class="form-actions">${edit ? '<a class="btn secondary" href="#/annonces">Annuler</a>' : ''}<button class="btn" type="submit">${edit ? 'Enregistrer' : 'Publier'}</button></div></form>`) : '';
  return { title: 'Annonces', html: pageHead('Annonces', 'Messages et annonces administratives du service des examens.') + `<div class="${staff ? 'grid side' : ''}">${card('', list, { tight: true })}${form}</div>` };
}
const recipientsFor = (u) => where('users', (x) => x.active && x.id !== u.id && (isStaff(u) || x.role !== 'enseignant')).sort((a, b) => fullName(a).localeCompare(fullName(b)));
function viewMessages() {
  const box = R.query.boite === 'envoyes' ? 'envoyes' : 'reception';
  const rows = DB.messages.filter((m) => (box === 'reception' ? m.recipient_id === ME.id : m.sender_id === ME.id));
  const l = listing(rows, { search: (m) => `${m.subject} ${m.body} ${userName(box === 'reception' ? m.sender_id : m.recipient_id)}`, sorts: { date: (m) => m.id }, defaultSort: 'date', defaultDir: 'desc' });
  const unread = DB.messages.filter((m) => m.recipient_id === ME.id && !m.read_at).length;
  const html = pageHead('Messagerie', isStaff() ? 'Échangez avec les enseignants et l’équipe.' : 'Contactez le service des examens.')
    + `<div class="grid side"><div class="card"><nav class="tabs" style="margin:0;padding:0 12px"><a href="#/messages?boite=reception" class="${box === 'reception' ? 'active' : ''}">Reçus${unread ? ` (${unread})` : ''}</a><a href="#/messages?boite=envoyes" class="${box === 'envoyes' ? 'active' : ''}">Envoyés</a></nav><div class="card-body tight">${l.rows.length ? `<ul class="list">${l.rows.map((m) => { const un = box === 'reception' && !m.read_at; return `<li><div class="grow"><a href="#/messages/${m.id}" style="${un ? 'font-weight:700' : ''}">${e(m.subject)}</a><div class="meta">${box === 'reception' ? 'De' : 'À'} ${e(userName(box === 'reception' ? m.sender_id : m.recipient_id))} · ${fmtDT(m.created_at)}</div></div>${un ? '<span class="badge blue">Non lu</span>' : ''}</li>`; }).join('')}</ul>${pager(l)}` : empty('Aucun message', '', 'mail')}</div></div>
    ${card('Nouveau message', `<form data-form="messageSend">${field('Destinataire(s)', `<select name="recipients" multiple required size="8">${recipientsFor(ME).map((r) => opt(r.id, `${fullName(r)} — ${ROLE[r.role]}`, R.query.a)).join('')}</select>`, { req: true, hint: 'Ctrl/Cmd + clic pour sélectionner plusieurs destinataires.' })}<div style="margin-top:12px">${field('Objet', inp('subject', '', 'required maxlength="150"'), { req: true })}</div><div style="margin-top:12px">${field('Message', '<textarea name="body" required maxlength="5000" style="min-height:140px"></textarea>', { req: true })}</div><div class="form-actions"><button class="btn" type="submit">${icon('send')}Envoyer</button></div></form>`)}</div>`;
  return { title: 'Messagerie', html };
}
function viewMessage({ id }) {
  const m = get('messages', id);
  if (!m || (m.recipient_id !== ME.id && m.sender_id !== ME.id)) fail('Message introuvable.');
  if (m.recipient_id === ME.id && !m.read_at) { m.read_at = nowLocal(); persistQuiet(); }
  const canReply = m.sender_id && m.sender_id !== ME.id && recipientsFor(ME).some((r) => r.id === m.sender_id);
  const html = pageHead(e(m.subject), `De ${userName(m.sender_id)} à ${userName(m.recipient_id)} · ${fmtDT(m.created_at)}`, act('deleteMessage', `${icon('trash')}Supprimer`, { id: m.id }, { cls: 'danger', danger: true, confirm: 'Supprimer ce message ?' }), '<a href="#/messages">Messagerie</a> /')
    + `<div class="grid side">${card('', `<p style="white-space:pre-line;margin:0">${e(m.body)}</p>`)}${canReply ? card('Répondre', `<form data-form="messageSend"><input type="hidden" name="recipients" value="${m.sender_id}"><input type="hidden" name="subject" value="${e(m.subject.startsWith('RE :') ? m.subject : `RE : ${m.subject}`.slice(0, 150))}">${field('Votre réponse', '<textarea name="body" required maxlength="5000"></textarea>')}<div class="form-actions"><button class="btn" type="submit">${icon('send')}Envoyer</button></div></form>`) : ''}</div>`;
  return { title: m.subject, html };
}
function viewNotifications() {
  const rows = DB.notifications.filter((n) => n.user_id === ME.id);
  const l = listing(rows, { sorts: { date: (n) => n.id }, defaultSort: 'date', defaultDir: 'desc', perPage: 25 });
  const unread = rows.filter((n) => !n.read_at).length;
  const html = pageHead('Notifications', 'Invitations, rappels, affectations et changements vous concernant.', `${unread ? act('readAll', `${icon('check')}Tout marquer comme lu`, {}, { cls: 'secondary' }) : ''}${rows.some((n) => n.read_at) ? act('clearReadNotifs', `${icon('trash')}Supprimer les lues`, {}, { cls: 'secondary', confirm: 'Supprimer toutes vos notifications déjà lues ?' }) : ''}`)
    + card('', l.rows.length ? `<ul class="list">${l.rows.map((n) => `<li style="${n.read_at ? '' : 'background:#f5fbfe'}"><div class="grow"><a href="${e(n.link || '#/notifications')}" data-act="openNotif" data-id="${n.id}" style="${n.read_at ? '' : 'font-weight:700'}">${e(n.title)}</a>${n.body ? `<div style="font-size:.86rem;white-space:pre-line;color:#334155;margin-top:2px">${e(n.body.length > 300 ? `${n.body.slice(0, 300)}…` : n.body)}</div>` : ''}<div class="meta">${fmtDT(n.created_at)}</div></div>${n.read_at ? '' : '<span class="badge blue">Nouveau</span>'}${act('deleteNotif', icon('x'), { id: n.id }, { cls: 'sm ghost', title: 'Supprimer' })}</li>`).join('')}</ul>${pager(l)}` : empty('Aucune notification', '', 'bell'), { tight: true });
  return { title: 'Notifications', html };
}
