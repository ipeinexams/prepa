"""Tests de bout en bout : persistance réelle (base simulée hors de la page), CRUD complets,
plusieurs utilisateurs, stockage bloqué, mode fichier, lecture seule. Zéro erreur JavaScript attendue."""
import json, re, sys, time
from playwright.sync_api import sync_playwright

D = '/tmp/claude-0/-home-claude/47be0ffe-69a4-58a0-a0aa-5359d04f7812/scratchpad/'
URL = 'file:///home/claude/ipein-html/ipein-examens.html'
MOCK = open(D + 'mock_claude.js').read()
STORE = {}
DOWNLOADS = []
RESULTS = []
ERRORS = []
SHOTS = D + 'v3/'
import os; os.makedirs(SHOTS, exist_ok=True)

def ok(cond, label):
    RESULTS.append(('OK ' if cond else 'XX ') + label)
    if not cond: print('XX', label, flush=True)

def count(coll):
    return sum(1 for k in STORE if k.startswith(f'ipein_{coll}/'))

def rows(coll):
    out = []
    for k, v in STORE.items():
        if k.startswith(f'ipein_{coll}/'):
            out.extend(v['rows'] if isinstance(v, dict) and 'rows' in v and coll in ('avail', 'notifications', 'log') else [v])
    return out

def make_context(b, cloud=True, readonly=False, block_storage=False, viewport=(1440, 900)):
    ctx = b.new_context(viewport={'width': viewport[0], 'height': viewport[1]})
    if cloud:
        ctx.expose_function('__store_get', lambda p: STORE.get(p))
        ctx.expose_function('__store_set', lambda p, j: STORE.__setitem__(p, json.loads(j)))
        ctx.expose_function('__store_delete', lambda p: STORE.pop(p, None) and None)
        ctx.expose_function('__store_list', lambda c: [[k[len(c) + 1:], v] for k, v in STORE.items() if k.startswith(c + '/') and '/' not in k[len(c) + 1:]])
        ctx.expose_function('__dl', lambda n, s, t: DOWNLOADS.append((n, s, t)))
        if readonly:
            ctx.add_init_script('window.__mockReadOnly = true;')
        ctx.add_init_script(MOCK)
    if block_storage:
        ctx.add_init_script("for (const k of ['localStorage','sessionStorage']) Object.defineProperty(window, k, {get(){ throw new DOMException('blocked','SecurityError'); }});")
    return ctx

def page_of(ctx, tag):
    p = ctx.new_page()
    p.on('pageerror', lambda e: ERRORS.append(f'[{tag}] pageerror: {e}'))
    p.on('console', lambda m: ERRORS.append(f'[{tag}] console.{m.type}: {m.text}') if m.type == 'error' else None)
    return p

def boot(p):
    p.goto(URL)
    p.wait_for_function("document.querySelector('form[data-form=login], form[data-form=setup], .sidebar') !== null", timeout=20000)

def saved(p, timeout=15000):
    p.wait_for_function("typeof Store !== 'undefined' && Store.pending.size === 0 && Store.inflight.size === 0", timeout=timeout)

def nav(p, path):
    p.evaluate(f"navigate({json.dumps(path)})")
    p.wait_for_timeout(60)

def flash(p):
    t = p.query_selector_all('#toasts .alert')
    if t: return t[-1].inner_text().replace('×', '').strip()
    el = p.query_selector('.content > .alert, .auth-form .alert')
    return el.inner_text().replace('×', '').strip() if el else ''

def clear_toasts(p):
    p.evaluate("document.getElementById('toasts').innerHTML=''")

def confirm(p, typed=None):
    p.wait_for_selector('#confirm-dialog[open]', timeout=5000)
    if typed: p.fill('#confirm-input', typed)
    p.click('#confirm-ok')
    p.wait_for_timeout(150)

def fill(p, form, values):
    for k, v in values.items():
        sel = f'form[data-form={form}] [name="{k}"]'
        el = p.query_selector(sel)
        assert el, f'champ {k} introuvable dans {form}'
        tag = el.evaluate('e => e.tagName')
        typ = el.get_attribute('type') or ''
        if tag == 'SELECT':
            if isinstance(v, list): p.select_option(sel, [str(x) for x in v])
            else: p.select_option(sel, str(v))
        elif typ == 'checkbox':
            if v: p.check(sel)
            else: p.uncheck(sel)
        else:
            p.fill(sel, str(v))

def submit(p, form, values=None, button=None, confirm_typed=None, expect_confirm=False):
    clear_toasts(p)
    if values: fill(p, form, values)
    btn = f'form[data-form={form}] button[type=submit]' if not button else f'form[data-form={form}] {button}'
    p.click(btn)
    if expect_confirm: confirm(p, confirm_typed)
    p.wait_for_timeout(200)
    return flash(p)

def act(p, selector, expect_confirm=False, typed=None):
    clear_toasts(p)
    p.click(selector)
    if expect_confirm: confirm(p, typed)
    p.wait_for_timeout(200)
    return flash(p)

def login(p, email, pwd):
    p.evaluate('SessionBox.clear()')
    nav(p, '/')
    p.wait_for_selector('form[data-form=login]')
    submit(p, 'login', {'email': email, 'password': pwd})
    p.wait_for_selector('.topbar', timeout=10000)

def js(p, expr):
    return p.evaluate(expr)

ADMIN = ('directeur@ipein.tn', 'Ipein2026admin')

with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ================= 1. Première utilisation en ligne =================
    A = make_context(b); pa = page_of(A, 'A')
    boot(pa)
    ok(pa.query_selector('form[data-form=setup]') is not None, 'base vide : écran de première utilisation')
    ok(js(pa, 'Store.mode') == 'cloud', 'mode base en ligne détecté')
    pa.screenshot(path=SHOTS + '01-setup.png')
    submit(pa, 'setup', {'first_name': 'Mohamed', 'last_name': 'Trabelsi', 'email': ADMIN[0], 'password': ADMIN[1]})
    pa.wait_for_selector('.sidebar'); saved(pa)
    ok(count('users') == 1 and rows('users')[0]['email'] == ADMIN[0], 'administrateur enregistré dans la base en ligne')
    ok('Enregistré' in pa.inner_text('#save-state'), 'indicateur « Enregistré » affiché')

    # Rechargement : rien n'est perdu
    pa.reload(); pa.wait_for_selector('.sidebar', timeout=20000)
    ok(js(pa, 'DB.users.length') == 1, 'après rechargement : données toujours là, session conservée')

    # Nouvel appareil (navigateur vierge) : les données viennent de la base
    B = make_context(b); pb = page_of(B, 'B')
    boot(pb)
    ok(pb.query_selector('form[data-form=login]') is not None, 'autre appareil : écran de connexion (pas de réinitialisation)')
    login(pb, *ADMIN)
    ok(js(pb, 'ME && ME.email') == ADMIN[0], 'autre appareil : connexion avec le compte créé ailleurs')
    p = pb

    # ================= 2. Années, semestres, calendrier =================
    nav(p, '/annees')
    f = submit(p, 'yearSave', {'label': '2026-2027', 'start_date': '2026-09-14', 'end_date': '2027-07-15', 'is_current': True})
    ok('créée' in f, f'année : création ({f})')
    saved(p); ok(count('years') == 1, 'année enregistrée')
    yid = js(p, 'DB.years[0].id')
    f = submit(p, 'yearSave', {'label': '2026-2027 (IPEIN)'})
    saved(p); ok(rows('years')[0]['label'] == '2026-2027 (IPEIN)', f'année : modification ({f})')
    f = submit(p, 'semesterAdd', {'label': 'Semestre 1', 'start_date': '2026-09-14', 'end_date': '2027-01-31'})
    ok('ajouté' in f, f'semestre : création ({f})')
    submit(p, 'semesterAdd', {'label': 'Semestre 2', 'start_date': '2027-02-01', 'end_date': '2027-07-15'})
    saved(p); ok(count('semesters') == 2, 'semestres enregistrés')
    s2 = js(p, "DB.semesters.find(s=>s.label==='Semestre 2').id")
    nav(p, f'/annees/{yid}?sem={s2}')
    f = submit(p, 'semesterAdd', {'label': 'Semestre 2 (printemps)'})
    saved(p); ok(any(r['label'] == 'Semestre 2 (printemps)' for r in rows('semesters')), f'semestre : modification ({f})')
    f = act(p, f'button[data-act=semesterDelete][data-id="{s2}"]', expect_confirm=True)
    saved(p); ok(count('semesters') == 1, f'semestre : suppression ({f})')
    f = submit(p, 'eventAdd', {'title': 'Vacances d’hiver', 'kind': 'vacances', 'start_date': '2026-12-21', 'end_date': '2027-01-03'})
    saved(p); ok(count('events') == 1, f'événement : création ({f})')
    ev = js(p, 'DB.events[0].id')
    nav(p, f'/annees/{yid}?ev={ev}')
    submit(p, 'eventAdd', {'title': 'Vacances d’hiver 2026'})
    saved(p); ok(rows('events')[0]['title'] == 'Vacances d’hiver 2026', 'événement : modification')
    act(p, f'button[data-act=eventDelete][data-id="{ev}"]', expect_confirm=True)
    saved(p); ok(count('events') == 0, 'événement : suppression')
    submit(p, 'eventAdd', {'title': 'Fête de la Révolution', 'kind': 'ferie', 'start_date': '2027-01-14', 'end_date': '2027-01-14'})

    # Année jetable : création puis suppression
    nav(p, '/annees')
    submit(p, 'yearSave', {'label': '2030-2031', 'start_date': '2030-09-01', 'end_date': '2031-07-01'})
    y2 = js(p, "DB.years.find(y=>y.label==='2030-2031').id")
    f = act(p, f'button[data-act=yearDelete][data-id="{y2}"]', expect_confirm=True)
    saved(p); ok(count('years') == 1, f'année : suppression ({f})')

    # ================= 3. Référentiels =================
    for typ, coll, vals, edit_field, edit_val in [
        ('matieres', 'subjects', [{'code': 'ANA', 'name': 'Analyse', 'department': 'Mathématiques'}, {'code': 'PHY', 'name': 'Physique', 'department': 'Physique'}, {'code': 'TMP', 'name': 'Temporaire'}], 'name', 'Analyse 1'),
        ('classes', 'classes', [{'code': 'MP1-A', 'name': 'MP 1re année A', 'level': '1re année', 'student_count': 32}, {'code': 'PC1-A', 'name': 'PC 1re année A', 'student_count': 30}, {'code': 'TMP', 'name': 'Temporaire', 'student_count': 1}], 'student_count', '34'),
        ('salles', 'rooms', [{'code': 'A01', 'name': 'Salle A1', 'building': 'Bloc A', 'capacity': 40}, {'code': 'A02', 'name': 'Salle A2', 'building': 'Bloc A', 'capacity': 40}, {'code': 'A03', 'name': 'Salle A3', 'capacity': 36}, {'code': 'TMP', 'name': 'Temporaire', 'capacity': 10}], 'capacity', '42'),
    ]:
        nav(p, f'/referentiels/{typ}')
        for v in vals: submit(p, 'refSave', v)
        saved(p); ok(count(coll) == len(vals), f'{typ} : {len(vals)} créations enregistrées')
        f = submit(p, 'refSave', {'code': vals[0]['code'].lower(), 'name': 'Doublon', **({'capacity': 5} if typ == 'salles' else {}), **({'student_count': 5} if typ == 'classes' else {})})
        ok('déjà utilisé' in f and count(coll) == len(vals), f'{typ} : doublon de code refusé ({f!r})')
        first = js(p, f"DB['{coll}'].find(r=>r.code==='{vals[0]['code']}').id")
        nav(p, f'/referentiels/{typ}?modifier={first}')
        submit(p, 'refSave', {edit_field: edit_val})
        saved(p); ok(str([r for r in rows(coll) if r['id'] == first][0][edit_field]) == edit_val, f'{typ} : modification')
        tmp = js(p, f"DB['{coll}'].find(r=>r.code==='TMP').id")
        act(p, f'button[data-act=refDelete][data-id="{tmp}"]', expect_confirm=True)
        saved(p); ok(count(coll) == len(vals) - 1, f'{typ} : suppression')

    # ================= 4. Utilisateurs =================
    nav(p, '/utilisateurs/nouveau')
    f = submit(p, 'userSave', {'last_name': 'Responsable', 'first_name': 'Leila', 'email': 'resp@ipein.tn', 'role': 'responsable', 'password': 'Resp2026ipein'})
    ok('Compte créé' in f, f'utilisateur : création responsable ({f[:40]})')
    teachers = []
    for i, (fn, ln, dep) in enumerate([('Amel', 'Ben Salah', 'Mathématiques'), ('Karim', 'Jaziri', 'Physique'), ('Nadia', 'Hamdi', 'Mathématiques'), ('Walid', 'Hammami', 'Physique'), ('Sonia', 'Ayari', 'Informatique'), ('Rim', 'Abidi', 'Langues')]):
        nav(p, '/utilisateurs/nouveau')
        submit(p, 'userSave', {'last_name': ln, 'first_name': fn, 'email': f'ens{i}@ipein.tn', 'role': 'enseignant', 'department': dep, 'password': f'Ens{i}pass2026'})
    saved(p); ok(count('users') == 8, 'utilisateurs : 7 créations enregistrées')
    nav(p, '/utilisateurs/nouveau')
    f = submit(p, 'userSave', {'last_name': 'X', 'first_name': 'Y', 'email': 'ENS0@ipein.tn', 'role': 'enseignant'})
    ok('déjà utilisée' in f, 'utilisateur : e-mail en double refusé')
    t0 = js(p, "DB.users.find(u=>u.email==='ens0@ipein.tn').id")
    nav(p, f'/utilisateurs/{t0}/modifier')
    submit(p, 'userSave', {'grade': 'Maître assistante', 'quota_override': '3', 'phone': '+216 20 111 222'})
    saved(p); u = [r for r in rows('users') if r['id'] == t0][0]
    ok(u['grade'] == 'Maître assistante' and u['quota_override'] == 3, 'utilisateur : modification')
    nav(p, f'/utilisateurs/{t0}')
    f = act(p, f'button[data-act=userReset][data-id="{t0}"]', expect_confirm=True)
    tmp_pwd = re.search(r'provisoire.*?: (\S+)$', f).group(1)
    saved(p); ok([r for r in rows('users') if r['id'] == t0][0]['must_change_password'] is True, 'utilisateur : réinitialisation du mot de passe')
    nav(p, '/utilisateurs/nouveau')
    submit(p, 'userSave', {'last_name': 'Jetable', 'first_name': 'Compte', 'email': 'jetable@ipein.tn', 'role': 'enseignant'})
    tj = js(p, "DB.users.find(u=>u.email==='jetable@ipein.tn').id")
    nav(p, f'/utilisateurs/{tj}')
    act(p, f'button[data-act=userDelete][data-id="{tj}"]', expect_confirm=True)
    saved(p); ok(count('users') == 8, 'utilisateur : suppression')
    p.screenshot(path=SHOTS + '02-users.png')

    # ================= 5. Session et créneaux =================
    nav(p, '/sessions')
    sem1 = js(p, 'DB.semesters[0].id')
    f = submit(p, 'sessionSave', {'name': 'Examens S1 — janvier 2027', 'semester_id': sem1, 'start_date': '2027-01-11', 'end_date': '2027-01-15', 'default_quota': '3', 'max_per_day': '2', 'min_choices': '1'})
    ok('Session créée' in f, f'session : création ({f})')
    sid = js(p, 'DB.sessions[0].id')
    submit(p, 'sessionSave', {'name': 'Examens du semestre 1 — janvier 2027', 'choices_close_at': '2027-01-05T23:59'})
    saved(p); ok(rows('sessions')[0]['name'] == 'Examens du semestre 1 — janvier 2027' and rows('sessions')[0]['choices_close_at'] == '2027-01-05 23:59', 'session : modification')
    p.click('summary:has-text("Générer")')
    f = submit(p, 'creneauxGenerate', {'from': '2027-01-11', 'to': '2027-01-12', 'plages': '08:30-10:30, 11:00-13:00'})
    saved(p); ok(count('creneaux') == 4, f'créneaux : génération ({f})')
    f = submit(p, 'creneauAdd', {'date': '2027-01-13', 'start_time': '08:30', 'end_time': '10:30'})
    saved(p); ok(count('creneaux') == 5, f'créneau : création ({f})')
    f = submit(p, 'creneauAdd', {'date': '2027-01-13', 'start_time': '08:30', 'end_time': '10:30'})
    ok('existe déjà' in f, 'créneau : doublon refusé')
    f = submit(p, 'creneauAdd', {'date': '2027-01-13', 'start_time': '12:00', 'end_time': '10:00'})
    ok('postérieure' in f and count('creneaux') == 5, 'créneau : horaires incohérents refusés')
    c5 = js(p, "DB.creneaux.find(c=>c.date==='2027-01-13').id")
    nav(p, f'/sessions/{sid}?cr={c5}')
    submit(p, 'creneauAdd', {'start_time': '09:00', 'end_time': '11:00'})
    saved(p); ok([r for r in rows('creneaux') if r['id'] == c5][0]['start_time'] == '09:00', 'créneau : modification')
    act(p, f'button[data-act=creneauDelete][data-id="{c5}"]', expect_confirm=True)
    saved(p); ok(count('creneaux') == 4, 'créneau : suppression')
    f = act(p, f'button[data-act=sessionStatus][data-to=choix_ouverts]', expect_confirm=True)
    saved(p); ok(rows('sessions')[0]['status'] == 'choix_ouverts', f'session : ouverture des choix ({f})')

    # ================= 6. Examens =================
    crs = js(p, f"sessionCreneaux({sid}).map(c=>c.id)")
    subj = js(p, "DB.subjects.find(s=>s.code==='ANA').id"); subj2 = js(p, "DB.subjects.find(s=>s.code==='PHY').id")
    cl1 = js(p, "DB.classes.find(c=>c.code==='MP1-A').id"); cl2 = js(p, "DB.classes.find(c=>c.code==='PC1-A').id")
    nav(p, f'/examens/nouveau?session={sid}')
    f = submit(p, 'examSave', {'creneau_id': crs[0], 'subject_id': subj, 'class_id': cl1, 'responsible_id': t0, 'confidential_notes': 'Sujet A — coffre 2'})
    ok('programmé' in f, f'examen : création avec répartition automatique ({f})')
    saved(p); ok(count('exams') == 1 and count('examRooms') >= 1, 'examen et salle enregistrés')
    e1 = js(p, 'DB.exams[0].id')
    nav(p, f'/examens/nouveau?session={sid}')
    f = submit(p, 'examSave', {'creneau_id': crs[0], 'subject_id': subj2, 'class_id': cl1})
    ok('déjà un examen' in f, 'examen : même classe même créneau refusé')
    for i, (c, s_, cl) in enumerate([(crs[1], subj2, cl2), (crs[2], subj2, cl1), (crs[3], subj, cl2)]):
        nav(p, f'/examens/nouveau?session={sid}')
        submit(p, 'examSave', {'creneau_id': c, 'subject_id': s_, 'class_id': cl})
    saved(p); ok(count('exams') == 4, 'examens : 4 programmés')
    nav(p, f'/examens/{e1}/modifier')
    submit(p, 'examSave', {'confidential_notes': 'Sujet B — coffre 3'})
    saved(p); ok([r for r in rows('exams') if r['id'] == e1][0]['confidential_notes'] == 'Sujet B — coffre 3', 'examen : modification')
    er1 = js(p, f"DB.examRooms.find(r=>r.exam_id==={e1}).id")
    nav(p, f'/examens/{e1}')
    submit(p, 'examRoomUpdate', {'students': '30', 'supervisors': '2'})
    saved(p); ok([r for r in rows('examRooms') if r['id'] == er1][0]['students'] == 30, 'salle d’examen : modification')
    f = submit(p, 'examRoomAdd', {'students': '2', 'supervisors': '1'})
    saved(p); ok(sum(1 for r in rows('examRooms') if r['exam_id'] == e1) == 2, f'salle d’examen : ajout ({f})')
    er_extra = js(p, f"DB.examRooms.filter(r=>r.exam_id==={e1}).pop().id")
    act(p, f'button[data-act=examRoomDelete][data-id="{er_extra}"]', expect_confirm=True)
    saved(p); ok(sum(1 for r in rows('examRooms') if r['exam_id'] == e1) == 1, 'salle d’examen : suppression')
    nav(p, f'/examens/nouveau?session={sid}')
    submit(p, 'examSave', {'creneau_id': crs[3], 'subject_id': subj2, 'class_id': cl1})
    ej = js(p, f"DB.exams.find(x=>x.creneau_id==={crs[3]}&&x.class_id==={cl1}).id")
    nav(p, f'/examens/{ej}')
    act(p, f'button[data-act=examCancel][data-id="{ej}"]', expect_confirm=True)
    saved(p); ok([r for r in rows('exams') if r['id'] == ej][0]['status'] == 'annule', 'examen : annulation')
    act(p, f'button[data-act=examDelete][data-id="{ej}"]', expect_confirm=True)
    saved(p); ok(count('exams') == 4, 'examen : suppression')
    p.screenshot(path=SHOTS + '03-exam.png')

    # ================= 7. Tirage =================
    nav(p, f'/tirages/nouveau?examen={e1}')
    fill(p, 'tirageSave', {'date': '2027-01-08', 'location': 'Bureau des examens', 'copies': '35', 'details': 'Clé USB chiffrée n°4'})
    p.check(f'form[data-form=tirageSave] input[name=participants][value="{t0}"]')
    f = submit(p, 'tirageSave')
    ok('invitation' in f, f'tirage : création ({f})')
    saved(p); ok(count('tirages') == 1 and count('tparts') == 1, 'tirage et participant enregistrés')
    tid = js(p, 'DB.tirages[0].id')
    nav(p, f'/tirages/{tid}/modifier')
    submit(p, 'tirageSave', {'start_time': '10:00', 'end_time': '11:00'})
    saved(p); ok(rows('tirages')[0]['status'] == 'modifie', 'tirage : modification (statut « modifié »)')
    f = act(p, f'button[data-act=tirageReminder][data-id="{tid}"]', expect_confirm=True)
    ok('Rappel envoyé' in f, 'tirage : rappel manuel')

    # ================= 8. Annonces, messages =================
    nav(p, '/annonces')
    submit(p, 'annSave', {'title': 'Ouverture des choix', 'body': 'Merci de déclarer vos disponibilités avant le 5 janvier.', 'audience': 'enseignant', 'pinned': True})
    submit(p, 'annSave', {'title': 'À supprimer', 'body': 'Annonce temporaire.'})
    saved(p); ok(count('announcements') == 2, 'annonces : création')
    a1 = js(p, "DB.announcements.find(a=>a.title==='Ouverture des choix').id"); a2 = js(p, "DB.announcements.find(a=>a.title==='À supprimer').id")
    nav(p, f'/annonces?modifier={a1}')
    submit(p, 'annSave', {'title': 'Ouverture des choix — rappel'})
    act(p, f'button[data-act=annDelete][data-id="{a2}"]', expect_confirm=True)
    saved(p); ok(count('announcements') == 1 and rows('announcements')[0]['title'].endswith('rappel'), 'annonces : modification et suppression')
    nav(p, f'/messages?a={t0}')
    submit(p, 'messageSend', {'recipients': [t0], 'subject': 'Bienvenue', 'body': 'Votre compte est prêt.'})
    saved(p); ok(count('messages') == 1, 'message : envoi')
    m1 = js(p, 'DB.messages[0].id')
    nav(p, f'/messages/{m1}')
    act(p, f'button[data-act=deleteMessage][data-id="{m1}"]', expect_confirm=True)
    saved(p); ok(count('messages') == 0, 'message : suppression')

    # ================= 9. Enseignante : changement de mot de passe, choix, tirage =================
    T = make_context(b); pt = page_of(T, 'T')
    boot(pt)
    login(pt, 'ens0@ipein.tn', tmp_pwd)
    ok('mot de passe' in pt.inner_text('h1').lower(), 'enseignante : changement de mot de passe exigé')
    submit(pt, 'passwordChange', {'current': tmp_pwd, 'password': 'Amel2026nouveau', 'confirm': 'Amel2026nouveau'})
    saved(pt); ok([r for r in rows('users') if r['id'] == t0][0]['must_change_password'] is False, 'enseignante : nouveau mot de passe enregistré')
    nav(pt, f'/mes-disponibilites?session={sid}')
    slots = pt.query_selector_all('.slot-choice')
    slots[0].query_selector('label.dispo').click(); slots[1].query_selector('label.dispo').click(); slots[2].query_selector('label.indispo').click()
    f = submit(pt, 'myChoices', button='button[value=soumettre]', expect_confirm=True)
    ok('soumis' in f, f'enseignante : choix soumis ({f})')
    saved(pt); ok(any(r['teacher_id'] == t0 and r['status'] == 'soumis' for r in rows('subs')) and sum(1 for r in rows('avail') if r['teacher_id'] == t0) == 3, 'choix enregistrés dans la base')
    nav(pt, f'/tirages/{tid}')
    submit(pt, 'tirageRespond', button='button[value=confirme]')
    saved(pt); ok(rows('tparts')[0]['response'] == 'confirme', 'enseignante : présence au tirage confirmée')
    nav(pt, '/notifications')
    n_before = sum(1 for r in rows('notifications') if r['user_id'] == t0)
    nid = js(pt, f"DB.notifications.filter(n=>n.user_id==={t0})[0].id")
    act(pt, f'button[data-act=deleteNotif][data-id="{nid}"]')
    saved(pt); ok(sum(1 for r in rows('notifications') if r['user_id'] == t0) == n_before - 1, 'notification : suppression')
    pt.screenshot(path=SHOTS + '04-teacher.png', full_page=False)

    # Autres enseignants : disponibilités pour l'affectation (données directes via l'interface admin = import de choix serait long)
    for i in range(1, 6):
        login(pt, f'ens{i}@ipein.tn', f'Ens{i}pass2026')
        if pt.query_selector('form[data-form=passwordChange]'):
            submit(pt, 'passwordChange', {'current': f'Ens{i}pass2026', 'password': f'Ens{i}nouveau26', 'confirm': f'Ens{i}nouveau26'})
        nav(pt, f'/mes-disponibilites?session={sid}')
        for s_el in pt.query_selector_all('.slot-choice'): s_el.query_selector('label.dispo').click()
        submit(pt, 'myChoices', button='button[value=soumettre]', expect_confirm=True)
    saved(pt)
    ok(sum(1 for r in rows('subs') if r['status'] == 'soumis') == 6, '6 enseignants ont soumis leurs choix')

    # ================= 10. Synchronisation en direct (B voit les choix sans recharger) =================
    p.wait_for_timeout(1200)
    nav(p, f'/choix?session={sid}')
    ok('6/6' in p.inner_text('.kpis'), 'synchronisation : le service voit les choix sans recharger')

    # ================= 11. Planning : auto, retrait, remplacement, publication =================
    nav(p, f'/planning?session={sid}')
    f = act(p, 'button[data-act=autoAssign][data-mode=complete]', expect_confirm=True)
    ok('proposée' in f, f'planning : affectation automatique ({f})')
    saved(p); st = js(p, f'(()=>{{const s=stats({sid});return [s.coverage,s.blocking]}})()')
    ok(st == [100, 0], f'planning : couverture 100 %, aucun conflit bloquant ({st})')
    n_assign = sum(1 for r in rows('assignments') if r['status'] != 'annule')
    ok(n_assign == 8, f'affectations enregistrées ({n_assign})')
    aid = js(p, "DB.assignments.find(a=>a.status!=='annule').id")
    act(p, f'button[data-act=unassign][data-id="{aid}"]', expect_confirm=True)
    saved(p); ok([r for r in rows('assignments') if r['id'] == aid][0]['status'] == 'annule', 'planning : retrait d’un surveillant')
    erx = js(p, f"DB.assignments.find(a=>a.id==={aid}).exam_room_id")
    nav(p, f'/planning/salle/{erx}')
    btn = p.query_selector('button[data-act=assign]')
    clear_toasts(p); btn.click()
    if p.query_selector('#confirm-dialog[open]'): confirm(p)
    p.wait_for_timeout(200)
    saved(p); ok(sum(1 for r in rows('assignments') if r['status'] != 'annule') == 8, 'planning : affectation manuelle')
    a2 = js(p, f"DB.assignments.find(a=>a.status!=='annule'&&a.exam_room_id==={erx}).id")
    nav(p, f'/planning/salle/{erx}?remplacer={a2}')
    clear_toasts(p); p.click('button[data-act=replace]')
    if p.query_selector('#confirm-dialog[open]'): confirm(p)
    p.wait_for_timeout(200); saved(p)
    ok([r for r in rows('assignments') if r['id'] == a2][0]['status'] == 'annule' and any(r.get('replaces_assignment_id') == a2 for r in rows('assignments')), 'planning : remplacement')
    nav(p, f'/planning?session={sid}')
    f = act(p, 'button[data-act=publish]', expect_confirm=True)
    saved(p); ok(rows('sessions')[0]['status'] == 'publie', f'planning : publication ({f})')
    p.screenshot(path=SHOTS + '05-planning.png')

    # Absence demandée par l'enseignante, acceptée avec remplaçant
    login(pt, 'ens0@ipein.tn', 'Amel2026nouveau')
    mine = js(pt, f"DB.assignments.find(a=>a.teacher_id==={t0}&&a.status==='confirme')")
    if mine:
        js(pt, f"(()=>{{const c=get('creneaux',{mine['creneau_id']}); }})()")
        nav(pt, '/mon-planning')
        pt.click('details summary'); pt.fill('details[open] textarea[name=reason]', 'Jury de soutenance')
        clear_toasts(pt); pt.click('details[open] button[type=submit]'); pt.wait_for_timeout(250); saved(pt)
        ok(count('absences') == 1, 'absence : demande enregistrée')
        p.wait_for_timeout(1000)
        nav(p, '/absences')
        p.select_option('form[data-form=absenceDecide] select[name=replacement_id]', index=1)
        f = submit(p, 'absenceDecide', button='button[value=acceptee]', expect_confirm=True)
        saved(p); ok(rows('absences')[0]['status'] == 'acceptee', f'absence : acceptée ({f})')
    nav(p, '/absences')
    submit(p, 'leaveAdd', {'teacher_id': t0, 'start_date': '2027-02-01', 'end_date': '2027-02-05', 'reason': 'Mission'})
    saved(p); ok(count('leaves') == 1, 'période d’absence : création')
    lid = js(p, 'DB.leaves[0].id')
    act(p, f'button[data-act=leaveDelete][data-id="{lid}"]', expect_confirm=True)
    saved(p); ok(count('leaves') == 0, 'période d’absence : suppression')

    # Tirage : effectué puis suppression
    nav(p, f'/tirages/{tid}')
    act(p, f'button[data-act=tirageStatus][data-to=effectue]', expect_confirm=True)
    saved(p); ok(rows('tirages')[0]['status'] == 'effectue', 'tirage : marqué effectué')
    act(p, f'button[data-act=tirageDelete][data-id="{tid}"]', expect_confirm=True)
    saved(p); ok(count('tirages') == 0 and count('tparts') == 0, 'tirage : suppression')

    # Paramètres
    nav(p, '/parametres')
    submit(p, 'settingsSave', {'students_per_supervisor': '25'})
    saved(p); ok(STORE['ipein_meta/app']['settings']['students_per_supervisor'] == 25, 'paramètres : enregistrés dans la base')

    # Exports et document (capacité de téléchargement)
    nav(p, f'/exports?session={sid}')
    DOWNLOADS.clear()
    p.click(f'button[data-key=affectations][data-format=xlsx]'); p.wait_for_timeout(400)
    p.click(f'button[data-key=examens][data-format=csv]'); p.wait_for_timeout(400)
    nav(p, f'/imprimer/convocations/{sid}')
    p.click('button[data-act=downloadDoc]'); p.wait_for_timeout(500)
    nav(p, '/sauvegarde')
    p.click('button[data-act=backupFull]'); p.wait_for_timeout(500)
    names = [d[0] for d in DOWNLOADS]
    ok(any(n.endswith('.xlsx') for n in names) and any(n.endswith('.csv') for n in names) and any(n.endswith('.html') for n in names) and any(n.endswith('.json') for n in names), f'téléchargements via la capacité : {names}')
    backup = next(d for d in DOWNLOADS if d[0].endswith('.json'))

    # ================= 12. Tout est encore là sur un appareil neuf =================
    C = make_context(b); pc = page_of(C, 'C')
    boot(pc); login(pc, *ADMIN)
    counts = js(pc, "({users:DB.users.length, exams:DB.exams.length, sessions:DB.sessions.length, assignments:DB.assignments.filter(a=>a.status!=='annule').length, subjects:DB.subjects.length, ann:DB.announcements.length, avail:DB.avail.length})")
    ok(counts['users'] == 8 and counts['exams'] == 4 and counts['sessions'] == 1 and counts['assignments'] >= 8 and counts['subjects'] == 2 and counts['ann'] == 1 and counts['avail'] >= 23, f'appareil neuf : toutes les données présentes {counts}')
    ok(js(pc, f"stats({sid}).coverage") == 100, 'appareil neuf : planning intact')

    # Coupure réseau : modification gardée puis envoyée
    pc.evaluate('''() => { Store.__offline = true; const orig = Store.writeOne.bind(Store); Store.writeOne = async (k) => { if (Store.__offline) { Store.inflight.add(k); await new Promise((r) => setTimeout(r, 50)); Store.inflight.delete(k); Store.failures.set(k, 1); Store.status = 'offline'; Store.updateIndicator(); setTimeout(() => Store.pump(), 400); return; } return orig(k); }; }''')
    nav(pc, '/referentiels/matieres')
    submit(pc, 'refSave', {'code': 'CHI', 'name': 'Chimie'})
    pc.wait_for_timeout(300)
    ok('attente' in pc.inner_text('#save-state').lower() or 'enregistrement' in pc.inner_text('#save-state').lower(), 'coupure : indicateur « en attente »')
    ok(count('subjects') == 2, 'coupure : rien n’est encore envoyé')
    pc.evaluate("() => { Store.__offline = false; Store.failures.clear(); Store.status = 'idle'; Store.pump(); }")
    saved(pc); ok(count('subjects') == 3, 'retour de connexion : modification envoyée automatiquement')

    # ================= 13. Lecture seule =================
    RO = make_context(b, readonly=True); pr = page_of(RO, 'RO')
    boot(pr); login(pr, *ADMIN)
    ok('Lecture seule' in pr.inner_text('body'), 'lecture seule : bandeau affiché, connexion possible')
    nav(pr, '/referentiels/matieres')
    f = submit(pr, 'refSave', {'code': 'RO1', 'name': 'Interdit'})
    ok('Lecture seule' in f and count('subjects') == 3, f'lecture seule : modification refusée proprement ({f[:50]})')

    # ================= 14. Restauration et effacement protégés =================
    nav(p, '/sauvegarde')
    act(p, 'button[data-act=resetAll]')
    ok(p.query_selector('#confirm-ok').is_disabled(), 'effacement : bouton bloqué tant que EFFACER n’est pas tapé')
    p.click('#confirm-cancel'); p.wait_for_timeout(150)
    ok(count('users') == 8, 'effacement annulé : aucune donnée supprimée')

    # ================= 15. Navigateur qui bloque le stockage (aperçu, mode privé) =================
    X = make_context(b, cloud=False, block_storage=True); px = page_of(X, 'X')
    px.goto(URL); px.wait_for_selector('form[data-form=setup]', timeout=15000)
    ok(js(px, 'Store.mode') == 'memory' and 'bloque' in px.inner_text('body'), 'stockage bloqué : page affichée avec avertissement clair (plus de page blanche)')
    submit(px, 'setup', {'first_name': 'Test', 'last_name': 'Bloqué', 'email': 'x@ipein.tn', 'password': 'Bloque2026x'})
    px.wait_for_selector('.sidebar')
    nav(px, '/referentiels/salles'); submit(px, 'refSave', {'code': 'Z1', 'name': 'Salle Z', 'capacity': '20'})
    ok(js(px, 'DB.rooms.length') == 1, 'stockage bloqué : l’application fonctionne quand même')
    px.screenshot(path=SHOTS + '06-blocked.png')

    # ================= 16. Mode fichier (sans base en ligne) =================
    F = make_context(b, cloud=False); pf = page_of(F, 'F')
    pf.goto(URL); pf.wait_for_selector('form[data-form=setup]')
    ok(js(pf, 'Store.mode') == 'local', 'mode fichier : stockage du navigateur')
    submit(pf, 'setup', {'first_name': 'Local', 'last_name': 'Admin', 'email': 'local@ipein.tn', 'password': 'Local2026abc'})
    pf.wait_for_selector('.sidebar')
    nav(pf, '/referentiels/matieres'); submit(pf, 'refSave', {'code': 'L1', 'name': 'Locale'})
    pf.reload(); pf.wait_for_selector('.sidebar, form[data-form=login]')
    ok(js(pf, 'DB.subjects.length') == 1 and js(pf, 'DB.users.length') == 1, 'mode fichier : données conservées après rechargement')
    pf.evaluate("navigate('/sessions')"); pf.wait_for_timeout(100)
    pf.go_back(); pf.wait_for_timeout(200)
    ok(js(pf, 'ROUTE') != '/sessions', 'mode fichier : bouton Retour du navigateur')

    # Migration : données locales envoyées vers une base en ligne vide
    STORE_BACKUP = dict(STORE); STORE.clear()
    M = make_context(b); pm = page_of(M, 'M')
    pm.goto(URL); pm.wait_for_function("typeof Store!=='undefined' && Store.mode!=='loading'")
    pm.evaluate(f"localStorage.setItem(APP_KEY, {json.dumps(json.dumps(js(pf, 'DB')))})")
    pm.reload(); pm.wait_for_selector('form[data-form=login], .sidebar', timeout=20000); saved(pm)
    ok(count('users') == 1 and count('subjects') == 1, 'migration : les données du navigateur sont transférées dans la base en ligne vide')
    STORE.clear(); STORE.update(STORE_BACKUP)

    # ================= 17. Mobile et thème sombre =================
    MB = make_context(b, viewport=(390, 844)); pmb = page_of(MB, 'MB')
    boot(pmb); login(pmb, 'ens0@ipein.tn', 'Amel2026nouveau')
    nav(pmb, '/mon-planning'); pmb.screenshot(path=SHOTS + '07-mobile.png')
    sw = pmb.evaluate('document.documentElement.scrollWidth')
    ok(sw <= 392, f'mobile : pas de défilement horizontal ({sw}px)')
    DK = b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme='dark')
    for fn_name, fn in [('__store_get', lambda p_: STORE.get(p_)), ('__store_set', lambda p_, j: STORE.__setitem__(p_, json.loads(j))), ('__store_delete', lambda p_: STORE.pop(p_, None) and None), ('__store_list', lambda c: [[k[len(c) + 1:], v] for k, v in STORE.items() if k.startswith(c + '/') and '/' not in k[len(c) + 1:]]), ('__dl', lambda n, s, t: None)]:
        DK.expose_function(fn_name, fn)
    DK.add_init_script(MOCK); pd = page_of(DK, 'DK')
    boot(pd); login(pd, *ADMIN); nav(pd, f'/?session={sid}'); pd.wait_for_timeout(200)
    pd.screenshot(path=SHOTS + '08-dark.png')
    nav(p, f'/?session={sid}'); p.wait_for_timeout(200); p.screenshot(path=SHOTS + '09-dashboard.png')

    b.close()

fails = [r for r in RESULTS if r.startswith('XX')]
print('\n'.join(RESULTS))
print(f'\nRÉSULTAT : {len(RESULTS) - len(fails)}/{len(RESULTS)} vérifications réussies')
print('ERREURS JS :', ERRORS if ERRORS else 'aucune')
print('Documents dans la base simulée :', len(STORE))
