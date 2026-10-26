/* =====================================================================
   Vues : connexion, tableaux de bord, calendrier, sessions, examens, tirages
   ===================================================================== */
function viewSetup() {
  return `<div class="auth"><section class="auth-side"><div><div class="logo-card"><img src="${LOGO}" alt=""></div>
    <h2>Plateforme de gestion des examens et des surveillances</h2>
    <ul><li>Planification des sessions, examens et salles</li><li>Rendez-vous de tirage confidentiels</li><li>Choix des créneaux et affectations équitables</li><li>Planning publié, convocations et rapports</li></ul></div>
    <small>Institut Préparatoire aux Études d’Ingénieurs de Nabeul</small></section>
  <section class="auth-form"><div class="box">
    <img class="logo-small" src="${LOGO}" alt="IPEIN">
    <h1>Première utilisation</h1>
    <p class="muted">Créez le compte administrateur. ${Store.mode === 'cloud' ? 'Les données seront enregistrées dans la base en ligne de l’application, partagée par tous ceux qui ont le lien.' : Store.mode === 'local' ? 'Les données seront enregistrées dans ce navigateur.' : '<strong>Attention : ce navigateur bloque l’enregistrement.</strong> Ouvrez le lien de l’application ou le fichier dans Chrome, Edge ou Firefox.'}</p>
    <form data-form="setup" class="stack">
      ${field('Prénom', inp('first_name', '', 'required autocomplete="given-name"'), { req: true })}
      ${field('Nom', inp('last_name', '', 'required autocomplete="family-name"'), { req: true })}
      ${field('Adresse e-mail', inp('email', '', 'type="email" required autocomplete="username"'), { req: true })}
      ${field('Mot de passe', inp('password', '', 'type="password" required minlength="10" autocomplete="new-password"'), { req: true, hint: '10 caractères minimum, lettres et chiffres.' })}
      <button class="btn" type="submit" style="width:100%">Créer l’administrateur</button>
    </form>
    <div class="or"><span>ou</span></div>
    <div class="stack">
      <button class="btn secondary" type="button" data-act="loadDemo" style="width:100%">${icon('sparkles')}Découvrir avec des données de démonstration</button>
      <label class="btn secondary" style="width:100%">${icon('upload')}Importer un fichier de données<input type="file" accept=".json,application/json" data-restore hidden></label>
    </div>
  </div></section></div>`;
}
function viewLogin() {
  const restoreAllowed = Store.mode !== 'cloud' && Boolean(DB.distribution);
  return `<div class="auth"><section class="auth-side"><div><div class="logo-card"><img src="${LOGO}" alt=""></div>
    <h2>Plateforme de gestion des examens et des surveillances</h2>
    <ul><li>Planification des sessions, examens et salles</li><li>Rendez-vous de tirage confidentiels</li><li>Choix des créneaux et affectations équitables</li><li>Planning publié, convocations et rapports</li></ul></div>
    <small>Institut Préparatoire aux Études d’Ingénieurs de Nabeul</small></section>
  <section class="auth-form"><div class="box">
    <img class="logo-small" src="${LOGO}" alt="IPEIN — Institut Préparatoire aux Études d'Ingénieurs de Nabeul">
    <h1>Connexion</h1>
    <p class="muted">Accédez à votre espace avec vos identifiants.</p>
    ${FLASH ? `<div class="alert ${FLASH.type}"><div>${e(FLASH.msg)}</div></div>` : ''}
    <form data-form="login" class="stack">
      ${field('Adresse e-mail', inp('email', R.query.email || '', 'type="email" required autocomplete="username" autofocus'))}
      ${field('Mot de passe', inp('password', '', 'type="password" required autocomplete="current-password"'))}
      <button class="btn" type="submit" style="width:100%">Se connecter</button>
    </form>
    <p class="muted" style="margin-top:18px;font-size:.85rem">Mot de passe oublié ou compte verrouillé ? Le service des examens peut réinitialiser votre accès.</p>
    ${DB.settings.demo_mode ? `<div class="hint-box">Démonstration : <b>admin@demo.ipein.tn</b>, <b>examens@demo.ipein.tn</b> ou <b>amel.bensalah@demo.ipein.tn</b> — mot de passe <b>${DEMO_PASSWORD}</b>.</div>` : ''}
    ${Store.mode === 'memory' ? '<div class="alert error" style="margin-top:14px"><div>Ce navigateur bloque l’enregistrement : vos saisies seront perdues. Ouvrez le lien de l’application ou le fichier dans Chrome, Edge ou Firefox.</div></div>' : ''}
    ${restoreAllowed ? `<label class="btn ghost sm" style="margin-top:6px">${icon('upload')}Importer un fichier de données reçu<input type="file" accept=".json,application/json" data-restore hidden></label>` : ''}
  </div></section></div>`;
}

/* ---------- Tableaux de bord ---------- */
function bars(rows) {
  if (!rows.length) return '<p class="muted">Aucun examen programmé.</p>';
  return `<div class="bars">${rows.map((d) => { const p = d.needed ? Math.min(100, Math.round((d.assigned / d.needed) * 100)) : 0; return `<div class="bar-row"><span>${fmtDate(d.date)}</span><div class="track"><span class="${p === 100 ? 'ok' : ''}" style="width:${p}%"></span></div><span class="muted">${d.assigned}/${d.needed}</span></div>`; }).join('')}</div>`;
}
function examLine(x) {
  const ers = where('examRooms', (r) => r.exam_id === x.id);
  const need = ers.reduce((s, r) => s + r.supervisors_needed, 0);
  const got = ers.reduce((s, r) => s + activeAssign((a) => a.exam_room_id === r.id).length, 0);
  return { need, got, rooms: ers.map((r) => get('rooms', r.room_id).code).join(', ') };
}
function stepsHtml(steps, idx) { return `<ol class="steps">${steps.map((t, i) => `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}"><span class="n">${i < idx ? '✓' : i + 1}</span>${e(t)}</li>`).join('')}</ol>`; }
function viewDashboard() {
  if (!isStaff()) return viewTeacherHome();
  const sid = Number(R.query.session) || defaultSessionId();
  const st = sid ? stats(sid) : null;
  let html = pageHead('Tableau de bord', `Bonjour ${ME.first_name}, voici l’état de la session.`, st ? `<form data-filter>${sessionSelect(sid)}</form>` : '');
  if (!st) return { title: 'Tableau de bord', html: html + card('', empty('Aucune session d’examens', 'Créez une année universitaire, un semestre puis une session.', 'layers', { href: '#/sessions', label: 'Créer une session' })) };
  const s = st.session;
  const idx = s.status === 'publie' ? 4 : ['brouillon', 'choix_ouverts', 'choix_clos'].indexOf(s.status);
  html += `<div class="card" style="margin-bottom:18px"><div class="card-body" style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center"><div>
    <h2 style="margin-bottom:6px">${e(s.name)} ${badge(s.status)}</h2>
    <div class="muted" style="font-size:.88rem">Du ${fmtDate(s.start_date)} au ${fmtDate(s.end_date)}${s.choices_close_at ? ` · clôture des choix : ${fmtDT(s.choices_close_at)}` : ''}</div>
    <div style="margin-top:12px">${stepsHtml(['Préparation', 'Choix ouverts', 'Affectations', 'Planning publié'], idx)}</div></div>
    <div class="actions"><a class="btn secondary" href="#/sessions/${s.id}">${icon('settings')}Gérer la session</a><a class="btn" href="#/planning?session=${s.id}">${icon('grid')}Ouvrir le planning</a></div></div></div>`;
  html += `<div class="kpis">${kpi('Examens programmés', st.exams, `${st.creneaux} créneaux · ${st.examRooms} salles`)}
    ${kpi('Postes couverts', `${st.filled}/${st.seats}`, `${st.coverage} % · ${st.roomsCovered}/${st.examRooms} salles complètes`, st.coverage === 100 ? 'ok' : st.coverage >= 60 ? 'warn' : 'err', st.coverage)}
    ${kpi('Places restantes', st.remaining, 'postes de surveillance à pourvoir', st.remaining ? 'warn' : 'ok')}
    ${kpi('Choix en attente', st.pendingChoices, `${st.submitted}/${st.teachersCount} soumis · ${st.drafts} brouillon(s)`, st.pendingChoices ? 'warn' : 'ok')}
    ${kpi('Conflits', st.conflicts, `${st.blocking} bloquant(s) · ${st.pendingAbsences} absence(s) à traiter`, st.blocking ? 'err' : st.conflicts ? 'warn' : 'ok')}</div>`;
  const upcoming = where('exams', (x) => x.status === 'planifie').map((x) => ({ x, c: get('creneaux', x.creneau_id) })).filter((o) => o.c.date >= today())
    .sort((a, b) => a.c.date.localeCompare(b.c.date) || a.c.start_time.localeCompare(b.c.start_time)).slice(0, 6);
  const upHtml = upcoming.length ? `<ul class="list">${upcoming.map(({ x, c }) => { const l = examLine(x); return `<li><div class="date-box"><b>${c.date.slice(8)}</b><small>${monthShort(c.date)}</small></div><div class="grow"><a href="#/examens/${x.id}"><strong>${e(get('subjects', x.subject_id).name)}</strong></a> — ${e(get('classes', x.class_id).code)}<div class="meta">${fmtDate(c.date, true)}, ${fmtTime(c.start_time)}–${fmtTime(c.end_time)}</div></div><span class="badge ${l.got >= l.need ? 'ok' : 'warn'}">${l.got}/${l.need} surveillants</span></li>`; }).join('')}</ul>` : empty('Aucun examen à venir', '', 'clipboard');
  const conf = st.conflictList.slice(0, 5);
  const confHtml = conf.length ? `<ul class="list">${conf.map((c) => `<li><span class="badge ${c.severity === 'erreur' ? 'err' : 'warn'}">${c.severity === 'erreur' ? 'Bloquant' : 'Alerte'}</span><span class="grow" style="font-size:.86rem">${e(c.message)}</span></li>`).join('')}</ul>` : `<div class="empty" style="padding:24px">${icon('check')}<h3>Aucun conflit détecté</h3></div>`;
  const tirs = where('tirages', (t) => ['planifie', 'modifie'].includes(t.status) && t.date >= today()).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)).slice(0, 5);
  const tirHtml = tirs.length ? `<ul class="list">${tirs.map((t) => { const pend = where('tparts', (p) => p.tirage_id === t.id && p.response === 'en_attente').length; return `<li><div class="grow"><a href="#/tirages/${t.id}"><strong>${e(get('subjects', t.subject_id).name)}</strong></a><div class="meta">${fmtDate(t.date)} à ${fmtTime(t.start_time)} · ${e(t.location)}</div></div>${pend ? `<span class="badge warn">${pend} en attente</span>` : '<span class="badge ok">Confirmé</span>'}</li>`; }).join('')}</ul>` : empty('Aucun tirage planifié', '', 'lock');
  const logs = DB.log.filter((l) => !['connexion', 'deconnexion', 'examen_consulte', 'tirage_consulte'].includes(l.action)).slice(-8).reverse();
  html += `<div class="grid side"><div>${card('Couverture par jour', bars(byDay(s.id)), { right: `<a href="#/statistiques?session=${s.id}">Statistiques détaillées</a>` })}
    ${card('Prochains examens', upHtml, { tight: true, right: `<a href="#/examens?session=${s.id}">Tous les examens</a>` })}</div>
    <div>${card('Conflits à traiter', confHtml, { tight: true, right: `<a href="#/planning?session=${s.id}&onglet=conflits">Voir tout</a>` })}
    ${card('Tirages à venir', tirHtml, { tight: true, right: '<a href="#/tirages?periode=a_venir">Tous</a>' })}
    ${card('Activité récente', `<ul class="list">${logs.map((l) => `<li style="font-size:.85rem"><div class="grow"><strong>${l.user_id ? e(userName(l.user_id)) : 'Système'}</strong> — ${e(l.action.replace(/_/g, ' '))}<div class="meta">${fmtDT(l.created_at)}</div></div></li>`).join('') || '<li class="muted">Aucune activité.</li>'}</ul>`, { tight: true })}</div></div>`;
  return { title: 'Tableau de bord', html };
}
function viewTeacherHome() {
  const sessions = DB.sessions.filter((s) => ['choix_ouverts', 'choix_clos', 'publie'].includes(s.status)).sort((a, b) => b.start_date.localeCompare(a.start_date)).slice(0, 3);
  let html = pageHead(`Bonjour ${e(ME.first_name)}`, 'Votre espace de surveillance des examens.', `<a class="btn secondary" href="#/mon-planning">${icon('clipboard')}Mon planning</a><a class="btn" href="#/mes-disponibilites">${icon('checkSquare')}Mes disponibilités</a>`);
  if (!sessions.length) html += card('', empty('Aucune session en cours', 'Vous serez notifié(e) dès l’ouverture de la période de choix.', 'calendar'));
  for (const raw of sessions) {
    const s = sessionFull(raw.id); const w = choiceWindow(s);
    const sub = where('subs', (x) => x.session_id === s.id && x.teacher_id === ME.id)[0];
    const dispo = where('avail', (a) => a.session_id === s.id && a.teacher_id === ME.id && a.state === 'disponible').length;
    const total = sessionCreneaux(s.id).length;
    const assigned = activeAssign((a) => a.session_id === s.id && a.teacher_id === ME.id).length;
    const submitted = sub && sub.status === 'soumis';
    const stage = s.status === 'publie' ? 3 : submitted ? 2 : dispo ? 1 : 0;
    html += card(e(s.name), `<div style="margin-bottom:14px">${stepsHtml([`Disponibilités déclarées (${dispo}/${total})`, 'Demande soumise', 'Affectations confirmées'], stage)}</div>
      <div class="grid cols-3"><div><div class="label-text">Période de choix</div>${w.open ? `<span class="badge ok">Ouverte</span>${s.choices_close_at ? ` jusqu’au <strong>${fmtDT(s.choices_close_at)}</strong>` : ''}` : `<span class="muted">${e(w.reason)}</span>`}</div>
      <div><div class="label-text">Ma demande</div>${submitted ? `${badge('soumis')} le ${fmtDT(sub.submitted_at)}` : sub ? `${badge('brouillon')} non soumise` : '<span class="badge gray">Non commencée</span>'}</div>
      <div><div class="label-text">Surveillances</div><strong>${s.status === 'publie' ? assigned : '—'}</strong> <span class="muted">/ quota ${quotaFor(ME, s)}</span></div></div>
      <div class="actions" style="margin-top:14px">${w.open ? `<a class="btn" href="#/mes-disponibilites?session=${s.id}">${submitted ? 'Modifier mes choix' : 'Déclarer mes disponibilités'}</a>` : ''}${s.status === 'publie' ? `<a class="btn secondary" href="#/imprimer/convocation/${s.id}">${icon('printer')}Ma convocation</a>` : ''}</div>`, { right: badge(s.status) });
  }
  const next = activeAssign((a) => a.teacher_id === ME.id && get('sessions', a.session_id).status === 'publie').map(describeAssignment).filter((a) => a.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)).slice(0, 5);
  const inv = where('tparts', (p) => p.user_id === ME.id).map((p) => ({ p, t: get('tirages', p.tirage_id) })).filter((o) => o.t && ['planifie', 'modifie'].includes(o.t.status) && o.t.date >= today()).slice(0, 5);
  const ann = annFor(ME).slice(0, 4);
  const notes = where('notifications', (n) => n.user_id === ME.id).slice(-5).reverse();
  html += `<div class="grid cols-2" style="margin-top:18px">${card('Mes prochaines surveillances', next.length ? `<ul class="list">${next.map((a) => `<li><div class="date-box"><b>${a.date.slice(8)}</b><small>${monthShort(a.date)}</small></div><div class="grow"><strong>Salle ${e(a.room_code)}</strong> — ${e(a.subject_name)} (${e(a.class_code)})<div class="meta">${fmtDate(a.date, true)}, ${fmtTime(a.start_time)}–${fmtTime(a.end_time)}</div></div></li>`).join('')}</ul>` : empty('Aucune surveillance confirmée à venir', '', 'clipboard'), { tight: true, right: '<a href="#/mon-planning">Tout voir</a>' })}
    ${card('Invitations aux tirages', inv.length ? `<ul class="list">${inv.map(({ p, t }) => `<li><div class="grow"><a href="#/tirages/${t.id}"><strong>${e(get('subjects', t.subject_id).name)}</strong></a><div class="meta">${fmtDate(t.date, true)}, ${fmtTime(t.start_time)} · ${e(t.location)}</div></div>${badge(p.response)}</li>`).join('')}</ul>` : empty('Aucune invitation en cours', '', 'lock'), { tight: true, right: '<a href="#/tirages">Tout voir</a>' })}</div>
    <div class="grid cols-2" style="margin-top:18px">${card('Annonces', ann.length ? `<ul class="list">${ann.map((a) => `<li><div class="grow"><strong>${e(a.title)}</strong> ${a.pinned ? '<span class="badge blue">Épinglée</span>' : ''}<div class="meta">${fmtDT(a.created_at)}</div><div style="font-size:.88rem;white-space:pre-line;margin-top:4px">${e(a.body.length > 220 ? `${a.body.slice(0, 220)}…` : a.body)}</div></div></li>`).join('')}</ul>` : empty('Aucune annonce', '', 'megaphone'), { tight: true, right: '<a href="#/annonces">Toutes</a>' })}
    ${card('Notifications récentes', notes.length ? `<ul class="list">${notes.map((n) => `<li><div class="grow"><a href="#/notifications" data-act="openNotif" data-id="${n.id}">${e(n.title)}</a><div class="meta">${fmtDT(n.created_at)}</div></div>${n.read_at ? '' : '<span class="badge blue">Nouveau</span>'}</li>`).join('')}</ul>` : empty('Aucune notification', '', 'bell'), { tight: true, right: '<a href="#/notifications">Toutes</a>' })}</div>`;
  return { title: 'Mon espace', html };
}

/* ---------- Calendrier (mois / liste) ---------- */
function calendarEvents(from, to, sid) {
  const ev = [];
  const COLORS = { vacances: '#94a3b8', ferie: '#f59e0b', examens: '#00aeef', cours: '#cbd5e1', autre: '#a78bfa' };
  for (const x of DB.events) if (x.end_date >= from && x.start_date <= to) ev.push({ start: x.start_date, end: x.end_date, title: x.title, color: COLORS[x.kind], allDay: true });
  if (isStaff()) {
    for (const x of DB.exams) {
      if (x.status !== 'planifie' || (sid && x.session_id !== sid)) continue;
      const c = get('creneaux', x.creneau_id); if (c.date < from || c.date > to) continue;
      const l = examLine(x);
      ev.push({ start: c.date, end: c.date, time: c.start_time, endTime: c.end_time, title: `${get('classes', x.class_id).code} · ${get('subjects', x.subject_id).name}`, color: l.got >= l.need ? '#0f766e' : '#c2410c', href: `#/examens/${x.id}`, detail: `Salles : ${l.rooms} · ${l.got}/${l.need} surveillants` });
    }
  } else {
    for (const a of activeAssign((x) => x.teacher_id === ME.id)) {
      const d = describeAssignment(a); if (d.date < from || d.date > to) continue;
      const pub = get('sessions', a.session_id).status === 'publie';
      ev.push({ start: d.date, end: d.date, time: d.start_time, endTime: d.end_time, title: `Surveillance ${d.room_code} · ${d.class_code}`, color: pub ? '#0077b6' : '#64748b', href: '#/mon-planning', detail: `${d.subject_name} — ${pub ? 'confirmée' : 'provisoire'}` });
    }
  }
  const tirs = isStaff() ? DB.tirages : DB.tirages.filter((t) => where('tparts', (p) => p.tirage_id === t.id && p.user_id === ME.id).length);
  for (const t of tirs) if (t.status !== 'annule' && t.date >= from && t.date <= to && (!sid || t.session_id === sid)) ev.push({ start: t.date, end: t.date, time: t.start_time, endTime: t.end_time, title: `Tirage · ${get('subjects', t.subject_id).name}`, color: '#7c3aed', href: `#/tirages/${t.id}`, detail: `Lieu : ${t.location}` });
  return ev.sort((a, b) => a.start.localeCompare(b.start) || (a.allDay ? -1 : 1) || String(a.time).localeCompare(String(b.time)));
}
function viewCalendar() {
  const sid = Number(R.query.session) || null;
  let month = R.query.mois;
  if (!month) {
    const s = sid ? get('sessions', sid) : null;
    month = (s ? s.start_date : today()).slice(0, 7);
  }
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const last = new Date(y, m, 0);
  const end = new Date(last); end.setDate(last.getDate() + (7 - ((last.getDay() + 6) % 7)) - 1);
  const evs = calendarEvents(isoDate(start), isoDate(end), sid);
  const prev = isoDate(new Date(y, m - 2, 1)).slice(0, 7); const next = isoDate(new Date(y, m, 1)).slice(0, 7);
  const vue = R.query.vue === 'liste' ? 'liste' : 'mois';
  const evHtml = (x) => `<a class="cal-ev${x.allDay ? ' all' : ''}" style="--c:${x.color}" ${x.href ? `href="${x.href}"` : ''} title="${e(`${x.title}${x.detail ? `\n${x.detail}` : ''}`)}">${x.time ? `<b>${fmtTime(x.time)}</b> ` : ''}${e(x.title)}</a>`;
  let body;
  if (vue === 'mois') {
    let cells = '';
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = isoDate(d);
      const inM = d.getMonth() === m - 1;
      const list = evs.filter((x) => x.start <= ds && x.end >= ds);
      cells += `<div class="cal-cell${inM ? '' : ' out'}${ds === today() ? ' today' : ''}"><div class="cal-day">${d.getDate()}</div>${list.slice(0, 4).map(evHtml).join('')}${list.length > 4 ? `<a class="cal-more" href="${qs({ vue: 'liste', mois: month })}">+${list.length - 4} autre(s)</a>` : ''}</div>`;
    }
    body = `<div class="cal-grid">${['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((j) => `<div class="cal-head">${j}</div>`).join('')}${cells}</div>`;
  } else {
    const inMonth = evs.filter((x) => x.end >= `${month}-01` && x.start <= isoDate(last));
    const days = [...new Set(inMonth.map((x) => (x.start < `${month}-01` ? `${month}-01` : x.start)))].sort();
    body = days.length ? days.map((d) => `<div class="cal-list-day"><h3>${cap(fmtDate(d, true))}</h3>${inMonth.filter((x) => (x.start < `${month}-01` ? `${month}-01` : x.start) === d).map((x) => `<div class="cal-list-item">${evHtml(x)}${x.detail ? `<span class="muted"> — ${e(x.detail)}</span>` : ''}</div>`).join('')}</div>`).join('') : empty('Aucun événement ce mois-ci', '', 'calendar');
  }
  const legend = isStaff()
    ? '<span><i style="background:#0f766e"></i>Examen couvert</span><span><i style="background:#c2410c"></i>Surveillants manquants</span>'
    : '<span><i style="background:#0077b6"></i>Surveillance confirmée</span><span><i style="background:#64748b"></i>Surveillance provisoire</span>';
  const html = pageHead('Calendrier', isStaff() ? 'Examens, tirages et calendrier universitaire.' : 'Vos surveillances, tirages et le calendrier universitaire.', isStaff() ? `<form data-filter><input type="hidden" name="vue" value="${vue}">${sessionSelect(sid || '', { all: true })}</form>` : '')
    + `<div class="card"><div class="card-head"><div class="actions"><a class="btn secondary sm" href="${qs({ mois: prev })}" aria-label="Mois précédent">‹</a><a class="btn secondary sm" href="${qs({ mois: next })}" aria-label="Mois suivant">›</a><a class="btn secondary sm" href="${qs({ mois: today().slice(0, 7) })}">Aujourd’hui</a></div>
      <h2 style="text-transform:capitalize">${MOIS[m - 1]} ${y}</h2>
      <div class="seg-links"><a class="${vue === 'mois' ? 'active' : ''}" href="${qs({ vue: 'mois' })}">Mois</a><a class="${vue === 'liste' ? 'active' : ''}" href="${qs({ vue: 'liste' })}">Liste</a></div></div>
      <div class="card-body"><div class="legend" style="margin-bottom:12px">${legend}<span><i style="background:#7c3aed"></i>Tirage</span><span><i style="background:#94a3b8"></i>Vacances</span><span><i style="background:#f59e0b"></i>Jour férié</span><span><i style="background:#00aeef"></i>Période d’examens</span></div>${body}</div></div>`;
  return { title: 'Calendrier', html };
}

/* ---------- Statistiques ---------- */
function viewStats() {
  const sid = Number(R.query.session) || defaultSessionId();
  const st = sid ? stats(sid) : null;
  let html = pageHead('Statistiques', 'Couverture, participation et équité de la répartition.', sid ? `<form data-filter>${sessionSelect(sid)}</form><a class="btn secondary" href="#/imprimer/stats/${sid}">${icon('printer')}Rapport imprimable</a>` : '');
  if (!st) return { title: 'Statistiques', html: html + card('', empty('Aucune session', '', 'chart')) };
  html += `<div class="kpis">${kpi('Examens', st.exams, `${st.examRooms} salles · ${st.creneaux} créneaux`)}${kpi('Couverture', `${st.coverage} %`, `${st.filled}/${st.seats} postes`, st.coverage === 100 ? 'ok' : 'warn')}
    ${kpi('Participation aux choix', `${st.teachersCount ? Math.round((st.submitted / st.teachersCount) * 100) : 0} %`, `${st.submitted}/${st.teachersCount} enseignants`)}${kpi('Charge moyenne', st.mean, `écart-type ${st.sd}`)}${kpi('Conflits', st.conflicts, `${st.blocking} bloquant(s)`, st.conflicts ? 'warn' : 'ok')}</div>`;
  const dept = new Map();
  for (const l of st.loads) { const k = l.department || 'Non renseigné'; const x = dept.get(k) || { t: 0, a: 0 }; x.t++; x.a += l.load; dept.set(k, x); }
  const dist = {}; for (const l of st.loads) dist[l.load] = (dist[l.load] || 0) + 1;
  const maxN = Math.max(1, ...Object.values(dist));
  html += `<div class="grid cols-2">${card('Couverture par jour', bars(byDay(sid)))}${card('Par département', `<table class="table"><thead><tr><th>Département</th><th>Enseignants</th><th>Surveillances</th><th>Moyenne</th></tr></thead><tbody>${[...dept].sort((a, b) => b[1].a - a[1].a).map(([k, v]) => `<tr><td>${e(k)}</td><td>${v.t}</td><td>${v.a}</td><td>${(v.a / v.t).toFixed(1)}</td></tr>`).join('')}</tbody></table>`, { tight: true })}</div>`;
  html += card('Distribution des charges', `<div class="bars">${Object.keys(dist).map(Number).sort((a, b) => a - b).map((k) => `<div class="bar-row"><span>${k} surveillance${k > 1 ? 's' : ''}</span><div class="track"><span style="width:${Math.round((dist[k] / maxN) * 100)}%"></span></div><span class="muted">${dist[k]} ens.</span></div>`).join('')}</div>`);
  return { title: 'Statistiques', html };
}

/* ---------- Sessions ---------- */
const semesterOptions = (sel) => DB.semesters.slice().sort((a, b) => b.start_date.localeCompare(a.start_date)).map((se) => opt(se.id, `${(get('years', se.year_id) || {}).label} — ${se.label}`, sel)).join('');
function sessionFields(v = {}) {
  const dt = (x) => (x ? String(x).replace(' ', 'T').slice(0, 16) : '');
  return `<div class="form-grid">
    ${field('Nom', inp('name', v.name, 'required placeholder="Examens du semestre 1 — janvier"'), { req: true, full: true })}
    ${field('Semestre', `<select name="semester_id" required>${semesterOptions(v.semester_id)}</select>`, { req: true, full: true })}
    ${field('Début des épreuves', inp('start_date', v.start_date, 'type="date" required'), { req: true })}
    ${field('Fin des épreuves', inp('end_date', v.end_date, 'type="date" required'), { req: true })}
    ${field('Ouverture des choix', inp('choices_open_at', dt(v.choices_open_at), 'type="datetime-local"'))}
    ${field('Date limite des choix', inp('choices_close_at', dt(v.choices_close_at), 'type="datetime-local"'), { hint: 'Clôture automatique à cette date.' })}
    ${field('Quota par enseignant', inp('default_quota', v.default_quota ?? 4, 'type="number" min="0" max="50" required'), { req: true })}
    ${field('Maximum par jour', inp('max_per_day', v.max_per_day ?? 2, 'type="number" min="1" max="6" required'), { req: true })}
    ${field('Disponibilités minimales exigées', inp('min_choices', v.min_choices ?? 0, 'type="number" min="0" max="100"'), { full: true, hint: 'Nombre minimal de créneaux « disponible » pour pouvoir soumettre.' })}
  </div>`;
}
function viewSessions() {
  const rows = DB.sessions.map((s) => sessionFull(s.id)).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const list = rows.length ? table(['Session', 'Période', 'Choix', 'Créneaux', 'Examens', 'Statut', ''], rows.map((s) => `<tr>${td('Session', `<a href="#/sessions/${s.id}"><strong>${e(s.name)}</strong></a><span class="sub">${e(s.year_label)} · ${e(s.semester_label)}</span>`)}${td('Période', `${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}`, 'nowrap')}${td('Choix', s.choices_close_at ? `jusqu’au ${fmtDT(s.choices_close_at)}` : '—')}${td('Créneaux', where('creneaux', (c) => c.session_id === s.id).length)}${td('Examens', where('exams', (x) => x.session_id === s.id && x.status === 'planifie').length)}${td('Statut', badge(s.status))}<td class="actions-cell"><a class="btn sm secondary" href="#/sessions/${s.id}">Gérer</a></td></tr>`).join(''))
    : empty('Aucune session', DB.semesters.length ? 'Créez votre première session avec le formulaire.' : 'Créez d’abord une année universitaire et un semestre.', 'layers', DB.semesters.length ? null : { href: '#/annees', label: 'Années universitaires' });
  const form = DB.semesters.length ? `<form data-form="sessionSave">${sessionFields()}<div class="form-actions"><button class="btn" type="submit">${icon('plus')}Créer la session</button></div></form>` : '<p class="muted">Aucun semestre disponible. <a href="#/annees">Créer une année et ses semestres</a>.</p>';
  return { title: 'Sessions d’examens', html: pageHead('Sessions d’examens', 'Créneaux, examens, période de choix et planning des surveillances.') + `<div class="grid side">${card('', list, { tight: true })}${card('Nouvelle session', form)}</div>` };
}
function viewSession({ id }) {
  const s = sessionFull(id); const w = choiceWindow(s); const st = stats(s.id);
  const crs = sessionCreneaux(s.id).map((c) => {
    const ex = where('exams', (x) => x.creneau_id === c.id && x.status === 'planifie');
    const needed = where('examRooms', (er) => er.creneau_id === c.id && ex.some((x) => x.id === er.exam_id)).reduce((a, er) => a + er.supervisors_needed, 0);
    return { ...c, exams: ex.length, needed, available: where('avail', (a) => a.creneau_id === c.id && a.state === 'disponible').length };
  });
  const trans = [];
  if (['brouillon', 'choix_clos'].includes(s.status)) trans.push(act('sessionStatus', 'Ouvrir la période de choix', { id: s.id, to: 'choix_ouverts' }, { cls: '', confirm: 'Ouvrir la période de choix ? Tous les enseignants actifs seront notifiés.' }));
  if (s.status === 'choix_ouverts') trans.push(act('sessionStatus', 'Clore la période de choix', { id: s.id, to: 'choix_clos' }, { cls: 'secondary', confirm: 'Clore la période de choix ?' }));
  if (['choix_ouverts', 'choix_clos'].includes(s.status)) trans.push(act('sessionStatus', 'Repasser en brouillon', { id: s.id, to: 'brouillon' }, { cls: 'ghost', confirm: 'Repasser la session en brouillon ?' }));
  trans.push(s.status !== 'publie' ? `<a class="btn secondary" href="#/planning?session=${s.id}">Affecter puis publier le planning →</a>` : `<span class="badge ok">Planning publié le ${fmtDT(s.published_at)}</span>`);
  const hist = where('history', (h) => h.session_id === s.id && !h.assignment_id).slice(-20).reverse();
  const crEdit = R.query.cr ? get('creneaux', R.query.cr) : null;
  const html = pageHead(`${e(s.name)} ${badge(s.status)}`, `${s.year_label} · ${s.semester_label} · du ${fmtDate(s.start_date)} au ${fmtDate(s.end_date)}`,
    `<a class="btn secondary" href="#/examens?session=${s.id}">${icon('clipboard')}Examens (${st.exams})</a><a class="btn secondary" href="#/choix?session=${s.id}">${icon('checkSquare')}Suivi des choix</a><a class="btn" href="#/planning?session=${s.id}">${icon('grid')}Planning</a>`, '<a href="#/sessions">Sessions d’examens</a> /')
    + card('Cycle de la session', `<div class="actions">${trans.join('')}</div>`, { right: `<span class="muted" style="font-size:.88rem">${w.open ? 'Période de choix ouverte' : e(w.reason)}</span>` })
    + `<div class="grid cols-2" style="margin-top:18px">${card('Paramètres et règles', `<form data-form="sessionSave" data-id="${s.id}">${sessionFields(s)}<div class="form-actions">${ME.role === 'admin' ? act('sessionDelete', `${icon('trash')}Supprimer`, { id: s.id }, { cls: 'danger', danger: true, confirm: 'Supprimer définitivement cette session et ses créneaux ? (Impossible si des examens existent.)' }) : ''}<button class="btn" type="submit">Enregistrer</button></div></form>`)}
    ${card(`Créneaux (${crs.length})`, `${crs.length ? `<div class="table-wrap" style="max-height:420px;overflow-y:auto"><table class="table"><thead><tr><th>Date</th><th>Horaire</th><th>Examens</th><th>Besoin</th><th>Disponibles</th><th></th></tr></thead><tbody>${crs.map((c) => `<tr><td class="nowrap">${fmtDate(c.date, true)}</td><td class="nowrap">${fmtTime(c.start_time)}–${fmtTime(c.end_time)}</td><td>${c.exams}</td><td>${c.needed}</td><td><span class="badge ${c.available >= c.needed ? 'ok' : c.needed ? 'warn' : 'gray'}">${c.available}</span></td><td class="actions-cell"><a class="btn sm secondary" href="#/sessions/${s.id}?cr=${c.id}" title="Modifier" aria-label="Modifier">${icon('edit')}</a>${c.exams ? '' : act('creneauDelete', icon('trash'), { id: c.id }, { cls: 'sm danger', confirm: 'Supprimer ce créneau ?', danger: true, title: 'Supprimer' })}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="padding:14px 18px">Aucun créneau : ajoutez-les un par un ou générez-les en série.</p>'}
      <div style="padding:14px 18px;border-top:1px solid var(--line)"><form data-form="creneauAdd" data-id="${s.id}"${crEdit ? ` data-cid="${crEdit.id}"` : ''}><h3>${crEdit ? 'Modifier le créneau' : 'Ajouter un créneau'}</h3><div class="form-grid cols-3">${field('Date', inp('date', crEdit ? crEdit.date : '', `type="date" min="${s.start_date}" max="${s.end_date}" required`))}${field('Début', inp('start_time', crEdit ? crEdit.start_time : '08:30', 'type="time" required'))}${field('Fin', inp('end_time', crEdit ? crEdit.end_time : '10:30', 'type="time" required'))}</div><div class="form-actions">${crEdit ? `<a class="btn ghost" href="#/sessions/${s.id}">Annuler</a>` : ''}<button class="btn secondary" type="submit">${crEdit ? 'Enregistrer' : `${icon('plus')}Ajouter le créneau`}</button></div></form>
      <details><summary style="cursor:pointer;font-weight:600;color:var(--brand-600)">Générer plusieurs créneaux</summary><form data-form="creneauxGenerate" data-id="${s.id}" style="margin-top:12px"><div class="form-grid">${field('Du', inp('from', s.start_date, `type="date" min="${s.start_date}" max="${s.end_date}" required`))}${field('Au', inp('to', s.end_date, `type="date" min="${s.start_date}" max="${s.end_date}" required`))}${field('Plages horaires', inp('plages', '08:30-10:30, 11:00-13:00, 14:00-16:00', 'required'), { full: true, hint: 'Séparées par des virgules ; les dimanches sont exclus.' })}</div><label class="check" style="margin-top:10px"><input type="checkbox" name="saturday"> Inclure les samedis</label><div class="form-actions"><button class="btn secondary" type="submit">Générer</button></div></form></details></div>`, { tight: true, id: 'creneaux' })}</div>`
    + card('Historique de la session', `<ul class="list">${hist.map((h) => `<li style="font-size:.86rem"><div class="grow"><strong>${e(h.action.replace(/_/g, ' '))}</strong>${h.note ? ` — ${e(h.note)}` : ''}<div class="meta">${fmtDT(h.created_at)} · ${h.actor_id ? e(userName(h.actor_id)) : 'Système'}</div></div></li>`).join('') || '<li class="muted">Aucun événement.</li>'}</ul>`, { tight: true, right: `<a href="#/planning?session=${s.id}&onglet=historique">Historique complet</a>` });
  return { title: s.name, html };
}

/* ---------- Examens ---------- */
function examFull(x) {
  const c = get('creneaux', x.creneau_id); const sj = get('subjects', x.subject_id); const cl = get('classes', x.class_id);
  return { ...x, date: c.date, start_time: c.start_time, end_time: c.end_time, subject_name: sj.name, subject_code: sj.code, class_code: cl.code, class_name: cl.name, student_count: cl.student_count, session: get('sessions', x.session_id) };
}
function viewExams() {
  const sid = Number(R.query.session) || defaultSessionId();
  const q = R.query;
  let rows = where('exams', (x) => x.session_id === sid).map((x) => ({ ...examFull(x), ...examLine(x) }));
  if (q.classe) rows = rows.filter((x) => x.class_id === Number(q.classe));
  if (q.matiere) rows = rows.filter((x) => x.subject_id === Number(q.matiere));
  if (q.date) rows = rows.filter((x) => x.date === q.date);
  if (q.statut) rows = rows.filter((x) => x.status === q.statut);
  const l = listing(rows, { search: (x) => `${x.subject_name} ${x.subject_code} ${x.class_code} ${userName(x.responsible_id)}`, sorts: { date: (x) => x.date + x.start_time, matiere: (x) => x.subject_name, classe: (x) => x.class_code }, defaultSort: 'date' });
  const tb = toolbar(`<div class="field"><label>Session${sessionSelect(sid)}</label></div>${searchBox('Matière, classe, responsable…')}
    <div class="field"><label>Classe<select name="classe" data-autosubmit>${opt('', 'Toutes', q.classe)}${DB.classes.map((c) => opt(c.id, c.code, q.classe)).join('')}</select></label></div>
    <div class="field"><label>Matière<select name="matiere" data-autosubmit>${opt('', 'Toutes', q.matiere)}${DB.subjects.map((s) => opt(s.id, s.name, q.matiere)).join('')}</select></label></div>
    <div class="field"><label>Date<input type="date" name="date" value="${e(q.date || '')}"></label></div>
    <div class="field"><label>Statut<select name="statut" data-autosubmit>${opt('', 'Tous', q.statut)}${opt('planifie', 'Planifiés', q.statut)}${opt('annule', 'Annulés', q.statut)}</select></label></div>`);
  const body = !sid ? empty('Aucune session', '', 'layers', { href: '#/sessions', label: 'Créer une session' })
    : !l.rows.length ? empty('Aucun examen', l.term || q.classe || q.matiere || q.date ? 'Aucun examen ne correspond aux filtres.' : 'Programmez le premier examen de la session.', 'clipboard', { href: `#/examens/nouveau?session=${sid}`, label: 'Programmer un examen' })
      : table([sortLink(l, 'date', 'Date'), 'Horaire', sortLink(l, 'matiere', 'Matière'), sortLink(l, 'classe', 'Classe'), 'Salles', 'Responsable', 'Surveillants', 'Statut', ''], l.rows.map((x) => `<tr>${td('Date', fmtDate(x.date), 'nowrap')}${td('Horaire', `${fmtTime(x.start_time)}–${fmtTime(x.end_time)}`, 'nowrap')}${td('Matière', `<a href="#/examens/${x.id}"><strong>${e(x.subject_name)}</strong></a><span class="sub">${e(x.subject_code)}</span>`)}${td('Classe', e(x.class_code))}${td('Salles', e(x.rooms || '—'))}${td('Responsable', x.responsible_id ? e(userName(x.responsible_id)) : '—')}${td('Surveillants', `<span class="badge ${x.status === 'annule' ? 'gray' : x.got >= x.need ? 'ok' : 'warn'}">${x.got}/${x.need}</span>`)}${td('Statut', badge(x.status))}<td class="actions-cell"><a class="btn sm secondary" href="#/examens/${x.id}">Ouvrir</a></td></tr>`).join('')) + pager(l);
  return { title: 'Examens', html: pageHead('Examens', 'Programmation des épreuves, salles et besoins en surveillants.', sid ? `<button class="btn secondary" type="button" data-act="exportData" data-key="examens" data-session="${sid}" data-format="xlsx">${icon('download')}Excel</button><a class="btn secondary" href="#/imports?type=examens">${icon('upload')}Importer</a><a class="btn" href="#/examens/nouveau?session=${sid}">${icon('plus')}Programmer un examen</a>` : '') + `<div class="card">${tb}<div class="card-body tight">${body}</div></div>` };
}
function viewExamForm({ id }) {
  const exam = id ? get('exams', id) : null;
  if (id && !exam) fail('Examen introuvable.');
  const sid = exam ? exam.session_id : Number(R.query.session) || defaultSessionId();
  if (!sid) fail('Créez d’abord une session d’examens.');
  const v = exam || { session_id: sid };
  const teachers = where('users', (u) => u.active && ['enseignant', 'responsable'].includes(u.role)).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const rooms = where('rooms', (r) => r.active).sort((a, b) => a.code.localeCompare(b.code));
  const crs = sessionCreneaux(sid);
  const html = pageHead(exam ? 'Modifier l’examen' : 'Programmer un examen', '', '', `<a href="#/examens?session=${sid}">Examens</a> /`)
    + `<form data-form="examSave"${exam ? ` data-id="${exam.id}"` : ''}><input type="hidden" name="session_id" value="${sid}"><div class="grid side">
      ${card('Épreuve', `<div class="form-grid">
        ${field('Session', `<input value="${e(get('sessions', sid).name)}" disabled>`)}
        ${field('Créneau', `<select name="creneau_id" required><option value="">— Choisir —</option>${crs.map((c) => opt(c.id, `${fmtDate(c.date, true)} · ${fmtTime(c.start_time)}–${fmtTime(c.end_time)}`, v.creneau_id)).join('')}</select>`, { req: true, hint: `Créneau manquant ? <a href="#/sessions/${sid}">Ajoutez-le à la session</a>.` })}
        ${field('Matière', `<select name="subject_id" required><option value="">— Choisir —</option>${DB.subjects.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => opt(s.id, `${s.name} (${s.code})`, v.subject_id)).join('')}</select>`, { req: true })}
        ${field('Classe', `<select name="class_id" required><option value="">— Choisir —</option>${DB.classes.slice().sort((a, b) => a.code.localeCompare(b.code)).map((c) => opt(c.id, `${c.code} — ${c.student_count} étudiants`, v.class_id)).join('')}</select>`, { req: true })}
        ${field('Enseignant responsable du sujet', `<select name="responsible_id"><option value="">— Aucun —</option>${teachers.map((t) => opt(t.id, fullName(t), v.responsible_id)).join('')}</select>`, { full: true, hint: 'Seul cet enseignant et le service des examens accèdent aux informations confidentielles.' })}
        <div class="field full confidential"><div class="tag">${icon('lock')} Confidentiel — accès restreint</div><label>Notes confidentielles (sujet, consignes, documents autorisés…)<textarea name="confidential_notes" maxlength="5000">${e(v.confidential_notes || '')}</textarea></label></div>
      </div>`)}
      ${card('Salles', exam ? '<p class="muted">Les salles se gèrent depuis la fiche de l’examen.</p>' : `<p class="muted" style="font-size:.88rem">Laissez vide pour une <strong>répartition automatique</strong> de l’effectif dans les salles libres du créneau.</p><div data-rooms></div>
        <template id="room-row"><div class="room-row" style="display:grid;grid-template-columns:1.4fr .8fr .8fr auto;gap:8px;align-items:end;margin-bottom:8px">
          ${field('Salle', `<select name="room_id">${rooms.map((r) => opt(r.id, `${r.code} (${r.capacity} pl.)`)).join('')}</select>`)}${field('Étudiants', inp('students', 30, 'type="number" min="0"'))}${field('Surveillants', inp('supervisors', 2, 'type="number" min="1" max="10"'))}
          <button class="btn sm danger" type="button" data-act="removeRow" aria-label="Retirer la salle">${icon('x')}</button></div></template>
        <button class="btn secondary sm" type="button" data-act="addRoomRow">${icon('plus')}Ajouter une salle</button>`)}
    </div><div class="form-actions"><a class="btn secondary" href="${exam ? `#/examens/${exam.id}` : '#/examens'}">Annuler</a><button class="btn" type="submit">${exam ? 'Enregistrer les modifications' : 'Programmer l’examen'}</button></div></form>`;
  return { title: exam ? 'Modifier l’examen' : 'Programmer un examen', html };
}
function canSeeExam(x) { return isStaff() || x.responsible_id === ME.id; }
function viewExam({ id }) {
  const raw = get('exams', id); if (!raw) fail('Examen introuvable.');
  if (!canSeeExam(raw)) return { title: 'Accès refusé', html: card('', empty('Accès refusé', 'Ces informations sont confidentielles.', 'lock')) };
  const x = examFull(raw); const staff = isStaff(); const open = x.status === 'planifie';
  if (staff) { audit('examen_consulte', 'exam', x.id); persistQuiet(); }
  const ers = where('examRooms', (r) => r.exam_id === x.id).map((er) => ({ ...er, room: get('rooms', er.room_id), as: activeAssign((a) => a.exam_room_id === er.id) }));
  const placed = ers.reduce((s, r) => s + r.students, 0);
  const free = where('rooms', (r) => r.active && !where('examRooms', (er) => er.creneau_id === x.creneau_id && er.room_id === r.id).length);
  const tirs = where('tirages', (t) => t.exam_id === x.id);
  const actions = staff ? `<a class="btn secondary" href="#/tirages/nouveau?examen=${x.id}">${icon('lock')}Planifier un tirage</a>${open ? `<a class="btn" href="#/examens/${x.id}/modifier">${icon('edit')}Modifier</a>${act('examCancel', 'Annuler l’épreuve', { id: x.id }, { cls: 'danger', danger: true, confirm: 'Annuler cette épreuve ? Les surveillances associées seront supprimées et les enseignants prévenus.' })}` : ''}${ME.role === 'admin' ? act('examDelete', icon('trash'), { id: x.id }, { cls: 'danger', danger: true, confirm: 'Supprimer définitivement cet examen ?', title: 'Supprimer' }) : ''}` : '';
  const roomsHtml = (ers.length ? table(['Salle', 'Étudiants / surveillants requis', 'Affectés', staff ? '' : ''], ers.map((r) => `<tr>${td('Salle', `<strong>${e(r.room.code)}</strong><span class="sub">${e(r.room.name)} · ${r.room.capacity} places</span>`)}
      ${td('Effectif / besoin', staff && open ? `<form data-form="examRoomUpdate" data-id="${r.id}" style="display:flex;gap:6px;align-items:center"><input type="number" name="students" min="0" max="${r.room.capacity}" value="${r.students}" style="width:80px" aria-label="Étudiants"><input type="number" name="supervisors" min="1" max="10" value="${r.supervisors_needed}" style="width:70px" aria-label="Surveillants requis"><button class="btn sm secondary" type="submit">OK</button></form>` : `${r.students} étudiants · ${r.supervisors_needed} surveillants`)}
      ${td('Affectés', `${r.as.length ? e(r.as.map((a) => userName(a.teacher_id)).join(', ')) : '<span class="missing">Aucun</span>'} <span class="badge ${r.as.length >= r.supervisors_needed ? 'ok' : 'warn'}">${r.as.length}/${r.supervisors_needed}</span>`)}
      <td class="actions-cell">${staff ? `<a class="btn sm secondary" href="#/planning/salle/${r.id}">Affecter</a>${!r.as.length && open ? act('examRoomDelete', icon('trash'), { id: r.id }, { cls: 'sm danger', danger: true, confirm: `Retirer la salle ${r.room.code} de l’examen ?`, title: 'Retirer' }) : ''}` : ''}</td></tr>`).join('')) : '<p class="muted" style="padding:14px 18px">Aucune salle affectée.</p>')
    + `<p style="padding:10px 18px;margin:0;border-top:1px solid var(--line)" class="${placed < x.student_count ? 'missing' : 'muted'}">Étudiants placés : ${placed} / ${x.student_count} (effectif de la classe)</p>`
    + (staff && open && free.length ? `<form data-form="examRoomAdd" data-id="${x.id}" style="padding:14px 18px;border-top:1px solid var(--line)"><div class="form-grid cols-4">${field('Salle libre', `<select name="room_id">${free.map((r) => opt(r.id, `${r.code} (${r.capacity} pl.)`)).join('')}</select>`)}${field('Étudiants', inp('students', Math.max(0, x.student_count - placed), 'type="number" min="0"'))}${field('Surveillants', inp('supervisors', 2, 'type="number" min="1" max="10"'))}<div class="field" style="align-self:end"><button class="btn secondary" type="submit">${icon('plus')}Ajouter</button></div></div></form>` : '');
  const html = pageHead(`${e(x.subject_name)} — ${e(x.class_code)} ${badge(x.status)}`, `${fmtDate(x.date, true)}, ${fmtTime(x.start_time)}–${fmtTime(x.end_time)} · ${x.session.name}`, actions, staff ? `<a href="#/examens?session=${x.session_id}">Examens</a> /` : '')
    + `<div class="grid side"><div>${card('Salles et surveillants', roomsHtml, { tight: true, right: staff ? `<a href="#/planning?session=${x.session_id}">Ouvrir le planning</a>` : '' })}
      ${card('Rendez-vous de tirage', `<ul class="list">${tirs.map((t) => `<li><div class="grow"><a href="#/tirages/${t.id}">${fmtDate(t.date, true)} à ${fmtTime(t.start_time)}</a><div class="meta">${e(t.location)}</div></div>${badge(t.status)}</li>`).join('') || '<li class="muted">Aucun tirage planifié pour cette épreuve.</li>'}</ul>`, { tight: true })}</div>
      <div>${card('Informations', `<dl class="props"><dt>Matière</dt><dd>${e(x.subject_name)} (${e(x.subject_code)})</dd><dt>Classe</dt><dd>${e(x.class_code)} — ${e(x.class_name)}</dd><dt>Effectif</dt><dd>${x.student_count} étudiants</dd><dt>Responsable</dt><dd>${x.responsible_id ? e(userName(x.responsible_id)) : '—'}</dd><dt>Modifié le</dt><dd>${fmtDT(x.updated_at || x.created_at)}</dd></dl>`)}
      <div class="card"><div class="card-body confidential"><div class="tag">${icon('lock')} Informations confidentielles</div>${x.confidential_notes ? `<p style="white-space:pre-line;margin:8px 0 0">${e(x.confidential_notes)}</p>` : '<p class="muted" style="margin:8px 0 0">Aucune note confidentielle.</p>'}<p class="muted" style="font-size:.78rem;margin:10px 0 0">Accès réservé au service des examens et à l’enseignant responsable ; chaque consultation est journalisée.</p></div></div></div></div>`;
  return { title: `${x.subject_name} — ${x.class_code}`, html };
}

/* ---------- Tirages ---------- */
const tirageParts = (tid) => where('tparts', (p) => p.tirage_id === tid);
const canSeeTirage = (t) => isStaff() || tirageParts(t.id).some((p) => p.user_id === ME.id);
function viewTirages() {
  const staff = isStaff(); const q = R.query;
  let rows = DB.tirages.filter((t) => staff || tirageParts(t.id).some((p) => p.user_id === ME.id)).map((t) => {
    const parts = tirageParts(t.id); const ex = t.exam_id ? get('exams', t.exam_id) : null;
    return { ...t, subject_name: get('subjects', t.subject_id).name, class_code: ex ? get('classes', ex.class_id).code : '', n: parts.length, conf: parts.filter((p) => p.response === 'confirme').length, mine: (parts.find((p) => p.user_id === ME.id) || {}).response };
  });
  if (q.session) rows = rows.filter((t) => t.session_id === Number(q.session));
  if (q.statut) rows = rows.filter((t) => t.status === q.statut);
  if (q.periode === 'a_venir') rows = rows.filter((t) => t.date >= today());
  if (q.periode === 'passes') rows = rows.filter((t) => t.date < today());
  const l = listing(rows, { search: (t) => `${t.subject_name} ${t.location} ${t.class_code}`, sorts: { date: (t) => t.date + t.start_time, matiere: (t) => t.subject_name, lieu: (t) => t.location, statut: (t) => t.status }, defaultSort: 'date' });
  const tb = toolbar(`${searchBox('Matière, lieu, classe…')}${staff ? `<div class="field"><label>Session${sessionSelect(q.session || '', { all: true })}</label></div>` : ''}
    <div class="field"><label>Période<select name="periode" data-autosubmit>${opt('', 'Toutes', q.periode)}${opt('a_venir', 'À venir', q.periode)}${opt('passes', 'Passés', q.periode)}</select></label></div>
    <div class="field"><label>Statut<select name="statut" data-autosubmit>${opt('', 'Tous', q.statut)}${['planifie', 'modifie', 'effectue', 'annule'].map((s) => opt(s, STATUS[s], q.statut)).join('')}</select></label></div>`);
  const body = l.rows.length ? table([sortLink(l, 'date', 'Date'), 'Horaire', sortLink(l, 'matiere', 'Matière'), sortLink(l, 'lieu', 'Lieu'), 'Participants', sortLink(l, 'statut', 'Statut'), ...(staff ? [] : ['Ma réponse']), ''],
    l.rows.map((t) => `<tr>${td('Date', fmtDate(t.date), 'nowrap')}${td('Horaire', `${fmtTime(t.start_time)}–${fmtTime(t.end_time)}`, 'nowrap')}${td('Matière', `<strong>${e(t.subject_name)}</strong>${t.class_code ? `<span class="sub">${e(t.class_code)}</span>` : ''}`)}${td('Lieu', e(t.location))}${td('Participants', `<span class="badge ${t.conf === t.n ? 'ok' : 'warn'}">${t.conf}/${t.n} confirmés</span>`)}${td('Statut', badge(t.status))}${staff ? '' : td('Ma réponse', badge(t.mine))}<td class="actions-cell"><a class="btn sm secondary" href="#/tirages/${t.id}">Ouvrir</a></td></tr>`).join('')) + pager(l)
    : empty('Aucun rendez-vous de tirage', staff ? 'Planifiez un tirage depuis cette page ou depuis la fiche d’un examen.' : 'Vous n’avez reçu aucune invitation.', 'lock');
  return { title: 'Rendez-vous de tirage', html: pageHead(staff ? 'Rendez-vous de tirage' : 'Mes rendez-vous de tirage', 'Reprographie confidentielle des sujets : invitations, confirmations, rappels et historique.', staff ? `<a class="btn" href="#/tirages/nouveau">${icon('plus')}Planifier un tirage</a>` : '') + `<div class="card">${tb}<div class="card-body tight">${body}</div></div>` };
}
function viewTirageForm({ id }) {
  const t = id ? get('tirages', id) : null;
  if (id && !t) fail('Tirage introuvable.');
  const exParam = Number(R.query.examen);
  const preEx = exParam ? get('exams', exParam) : null;
  const v = t || (preEx ? { session_id: preEx.session_id, exam_id: preEx.id, subject_id: preEx.subject_id } : { session_id: defaultSessionId() });
  const parts = t ? tirageParts(t.id).map((p) => p.user_id) : (preEx && preEx.responsible_id ? [preEx.responsible_id] : []);
  const exams = where('exams', (x) => x.status === 'planifie').map(examFull).sort((a, b) => a.date.localeCompare(b.date));
  const users = where('users', (u) => u.active).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const html = pageHead(t ? 'Modifier le tirage' : 'Planifier un tirage', t ? 'Toute modification de date, d’horaire ou de lieu est notifiée et demande une nouvelle confirmation.' : '', '', '<a href="#/tirages">Rendez-vous de tirage</a> /')
    + `<form data-form="tirageSave"${t ? ` data-id="${t.id}"` : ''}><div class="grid side">${card('Rendez-vous', `<div class="form-grid">
      ${field('Session', `<select name="session_id" required data-session-select>${DB.sessions.map((s) => opt(s.id, s.name, v.session_id)).join('')}</select>`, { req: true })}
      ${field('Examen concerné', `<select name="exam_id" data-exam-select><option value="">— Aucun (tirage par matière) —</option>${exams.map((x) => `<option value="${x.id}" data-session="${x.session_id}" data-subject="${x.subject_id}"${v.exam_id === x.id ? ' selected' : ''}>${e(`${x.subject_name} — ${x.class_code} (${fmtDate(x.date)})`)}</option>`).join('')}</select>`)}
      ${field('Matière', `<select name="subject_id" required><option value="">— Choisir —</option>${DB.subjects.map((s) => opt(s.id, s.name, v.subject_id)).join('')}</select>`, { req: true, full: true })}
      ${field('Date', inp('date', v.date, 'type="date" required'), { req: true })}
      ${field('Lieu', inp('location', v.location || 'Bureau du service des examens', 'required'), { req: true })}
      ${field('Début', inp('start_time', v.start_time || '09:00', 'type="time" required'), { req: true })}
      ${field('Fin', inp('end_time', v.end_time || '10:00', 'type="time" required'), { req: true })}
      ${field('Nombre de copies', inp('copies', v.copies ?? '', 'type="number" min="0"'))}
      <div class="field full confidential"><div class="tag">${icon('lock')} Confidentiel</div><label>Consignes confidentielles (support du sujet, conditionnement…)<textarea name="details" maxlength="5000">${e(v.details || '')}</textarea></label><div class="hint">Visibles uniquement par le service des examens et les participants invités.</div></div></div>`)}
      ${card('Participants <span class="req">*</span>', `<input type="search" placeholder="Filtrer les noms…" data-filter-input=".participant-item" aria-label="Filtrer" style="margin-bottom:10px">
        <div style="max-height:420px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:6px 10px">${users.map((u) => `<label class="check participant-item" style="display:flex;padding:5px 0"><input type="checkbox" name="participants" value="${u.id}"${parts.includes(u.id) ? ' checked' : ''}><span>${e(fullName(u))} <small class="muted">· ${e(u.role === 'enseignant' ? u.department || 'Enseignant' : ROLE[u.role])}</small></span></label>`).join('')}</div>
        <p class="hint muted" style="font-size:.8rem;margin-top:8px">Chaque participant reçoit une invitation et doit confirmer sa présence.</p>`)}</div>
      <div class="form-actions"><a class="btn secondary" href="${t ? `#/tirages/${t.id}` : '#/tirages'}">Annuler</a><button class="btn" type="submit">${t ? 'Enregistrer et notifier' : 'Planifier et inviter'}</button></div></form>`;
  return { title: t ? 'Modifier le tirage' : 'Planifier un tirage', html };
}
function viewTirage({ id }) {
  const t = get('tirages', id); if (!t) fail('Rendez-vous de tirage introuvable.');
  if (!canSeeTirage(t)) return { title: 'Accès refusé', html: card('', empty('Accès refusé', 'Ce rendez-vous de tirage est confidentiel.', 'lock')) };
  audit('tirage_consulte', 'tirage', t.id); persistQuiet();
  const staff = isStaff(); const closed = ['annule', 'effectue'].includes(t.status);
  const sj = get('subjects', t.subject_id); const ex = t.exam_id ? get('exams', t.exam_id) : null;
  const parts = tirageParts(t.id).map((p) => ({ ...p, u: get('users', p.user_id) })).sort((a, b) => fullName(a.u).localeCompare(fullName(b.u)));
  const me = parts.find((p) => p.user_id === ME.id);
  const hist = where('thist', (h) => h.tirage_id === t.id).slice().reverse();
  const actions = staff ? `${ME.role === 'admin' ? act('tirageDelete', icon('trash'), { id: t.id }, { cls: 'danger', danger: true, confirm: 'Supprimer définitivement ce rendez-vous de tirage et son historique ?', title: 'Supprimer' }) : ''}<a class="btn secondary" href="#/imprimer/tirage/${t.id}">${icon('printer')}Feuille de présence</a>${closed ? '' : `${act('tirageReminder', `${icon('bell')}Envoyer un rappel`, { id: t.id }, { cls: 'secondary', confirm: 'Envoyer un rappel à tous les participants n’ayant pas décliné ?' })}<a class="btn" href="#/tirages/${t.id}/modifier">${icon('edit')}Modifier</a>${act('tirageStatus', `${icon('check')}Effectué`, { id: t.id, to: 'effectue' }, { cls: 'success', confirm: 'Marquer ce tirage comme effectué ?' })}${act('tirageStatus', 'Annuler', { id: t.id, to: 'annule' }, { cls: 'danger', danger: true, confirm: 'Annuler ce rendez-vous ? Les participants seront prévenus.' })}`}` : '';
  const html = pageHead(`Tirage — ${e(sj.name)} ${badge(t.status)}`, `${fmtDate(t.date, true)}, ${fmtTime(t.start_time)}–${fmtTime(t.end_time)} · ${t.location}`, actions, '<a href="#/tirages">Rendez-vous de tirage</a> /')
    + (me && !closed ? `<div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Votre réponse</h2>${badge(me.response)}</div><div class="card-body"><form data-form="tirageRespond" data-id="${t.id}" class="form-grid">${field('Commentaire (obligatoire en cas d’indisponibilité)', inp('comment', me.comment || '', 'maxlength="500"'), { full: true })}<div class="full actions"><button class="btn success" type="submit" name="response" value="confirme">${icon('check')}Je confirme ma présence</button><button class="btn danger" type="submit" name="response" value="decline">Je suis indisponible</button></div></form></div></div>` : '')
    + `<div class="grid side"><div>${card('Participants', table(['Participant', 'Réponse', 'Commentaire', 'Répondu le'], parts.map((p) => `<tr>${td('Participant', `<strong>${e(fullName(p.u))}</strong><span class="sub">${ROLE[p.u.role]}</span>`)}${td('Réponse', badge(p.response))}${td('Commentaire', e(p.comment || '—'))}${td('Répondu le', fmtDT(p.responded_at) || '—')}</tr>`).join('')), { tight: true, right: `<span class="muted">${parts.filter((p) => p.response === 'confirme').length} confirmé(s) sur ${parts.length}</span>` })}
      ${card('Historique', `<ul class="list">${hist.map((h) => `<li style="font-size:.86rem"><div class="grow"><strong>${e(h.action.replace(/_/g, ' '))}</strong>${h.details ? ` — ${e(h.details)}` : ''}<div class="meta">${fmtDT(h.created_at)} · ${h.actor_id ? e(userName(h.actor_id)) : 'Système (automatique)'}</div></div></li>`).join('')}</ul>`, { tight: true })}</div>
      <div>${card('Détails', `<dl class="props"><dt>Matière</dt><dd>${e(sj.name)}</dd>${ex ? `<dt>Épreuve</dt><dd>${staff ? `<a href="#/examens/${ex.id}">${e(get('classes', ex.class_id).code)}</a>` : e(get('classes', ex.class_id).code)}</dd>` : ''}<dt>Session</dt><dd>${e(get('sessions', t.session_id).name)}</dd><dt>Copies</dt><dd>${t.copies ?? '—'}</dd><dt>Rappel</dt><dd>${t.reminder_sent_at ? `envoyé le ${fmtDT(t.reminder_sent_at)}` : 'automatique avant le rendez-vous'}</dd><dt>Organisé par</dt><dd>${t.created_by ? e(userName(t.created_by)) : '—'}</dd></dl>`)}
      <div class="card"><div class="card-body confidential"><div class="tag">${icon('lock')} Consignes confidentielles</div>${t.details ? `<p style="white-space:pre-line;margin:8px 0 0">${e(t.details)}</p>` : '<p class="muted" style="margin:8px 0 0">Aucune consigne.</p>'}</div></div></div></div>`;
  return { title: `Tirage — ${sj.name}`, html };
}
