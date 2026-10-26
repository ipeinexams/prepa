"""Simulation fidèle de la base IPEIN EXAMS (mêmes fonctions et règles que Supabase) : site protégé par connexion."""
import json, datetime, secrets, hashlib
from playwright.sync_api import sync_playwright
D='/tmp/claude-0/-home-claude/47be0ffe-69a4-58a0-a0aa-5359d04f7812/scratchpad/'
URL='file://'+D+'supabuild/ipein-examens.html'
DOCS={}; SESS={}; ATT={}
OFFLINE={'on':False}
RES=[]; ERR=[]
def ok(c,l): RES.append(('OK ' if c else 'XX ')+l); print(('OK ' if c else 'XX ')+l, flush=True)
def now(): return datetime.datetime.now(datetime.timezone.utc)
def users(): return [d['body'] for p,d in DOCS.items() if p.startswith('ipein_users/') and not d['deleted']]
def initialized(): return bool(users())
def check(tok):
    s=SESS.get(tok)
    if not s or s['exp']<now(): return False
    if s['kind']=='user': s['exp']=now()+datetime.timedelta(hours=12)
    return True
def handle(route):
    if OFFLINE['on']: return route.abort()
    req=route.request; fn=req.url.rsplit('/',1)[1]; a=json.loads(req.post_data or '{}')
    if req.headers.get('apikey')!='test-publishable-key': return route.fulfill(status=401, body='{}')
    def J(o, st=200): route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
    if fn=='ipein_state': return J(initialized())
    if fn=='ipein_setup':
        if initialized(): return J({'message':'deja'},403)
        t=secrets.token_hex(16); SESS[t]={'kind':'setup','uid':None,'exp':now()+datetime.timedelta(hours=2)}; return J(t)
    if fn=='ipein_salt':
        e=a['p_email'].strip().lower()
        for u in users():
            if u['email'].lower()==e: return J(u['password_hash'].split('$')[0])
        return J(hashlib.md5(('ipein-salt:'+e).encode()).hexdigest())
    if fn=='ipein_login':
        e=a['p_email'].strip().lower(); at=ATT.setdefault(e,{'f':0,'lock':None})
        if at['lock'] and at['lock']>now(): return J({'error':'verrouille','until':'12:00'})
        u=next((u for u in users() if u['email'].lower()==e), None)
        if not u or u['password_hash'].split('$')[1]!=a['p_hash']:
            at['f']+=1
            if at['f']>=5: at['lock']=now()+datetime.timedelta(minutes=15); at['f']=0
            return J({'error':'identifiants'})
        if u.get('active') is False: return J({'error':'desactive'})
        at['f']=0; t=secrets.token_hex(16); SESS[t]={'kind':'user','uid':u['id'],'exp':now()+datetime.timedelta(hours=12)}
        return J({'token':t,'user_id':u['id']})
    if fn=='ipein_logout':
        if a.get('p_token') in SESS: SESS[a['p_token']]['exp']=now()
        return route.fulfill(status=204, body='')
    if not check(a.get('p_token')): return J({'message':'session invalide'},403)
    if fn=='ipein_now': return J(now().isoformat())
    if fn=='ipein_get':
        d=DOCS.get(a['p_path']); return J(None if not d or d['deleted'] else d['body'])
    if fn=='ipein_list':
        c=a['p_coll']; rows=sorted((p,d) for p,d in DOCS.items() if p.startswith(c+'/') and '/' not in p[len(c)+1:] and not d['deleted'] and p>(a['p_after'] or ''))
        return J([{'path':p,'body':d['body']} for p,d in rows[:a['p_limit']]])
    if fn=='ipein_since':
        s=datetime.datetime.fromisoformat(a['p_since'].replace('Z','+00:00'))
        rows=sorted(((p,d) for p,d in DOCS.items() if d['ts']>s), key=lambda x:x[1]['ts'])
        return J([{'path':p,'body':d['body'],'deleted':d['deleted'],'updated_at':d['ts'].isoformat()} for p,d in rows])
    if fn=='ipein_put': DOCS[a['p_path']]={'body':a['p_body'],'deleted':False,'ts':now()}; return route.fulfill(status=204, body='')
    if fn=='ipein_del':
        if a['p_path'] in DOCS: DOCS[a['p_path']].update(deleted=True, ts=now())
        return route.fulfill(status=204, body='')
    J({'message':'?'},404)
def ctx_new(b):
    c=b.new_context(viewport={'width':1300,'height':850})
    c.route('https://ipein-test.supabase.co/rest/v1/rpc/*', handle)
    c.route('https://fonts.*/**', lambda r: r.abort())
    return c
def page(c,tag):
    p=c.new_page(); p.on('pageerror',lambda e:ERR.append(f'[{tag}] {e}')); p.on('console',lambda m: ERR.append(f'[{tag}] {m.text}') if m.type=='error' and 'net::' not in m.text else None)
    p.goto(URL); p.wait_for_function("document.querySelector('form[data-form=login], form[data-form=setup], .sidebar')", timeout=30000); return p
def saved(p,t=20000): p.wait_for_function("Store.pending.size===0 && Store.inflight.size===0", timeout=t)
def alive(n): return sum(1 for p,d in DOCS.items() if p.startswith(f'ipein_{n}/') and not d['deleted'])
def login(p, email, pwd):
    f=p.locator('form[data-form=login]'); f.locator('[name=email]').fill(email); f.locator('[name=password]').fill(pwd); f.locator('button[type=submit]').click()
    p.wait_for_timeout(1500)
PWD='MotDePasse2026'
with sync_playwright() as pw:
    b=pw.chromium.launch()
    A=page(ctx_new(b),'A')
    ok(A.locator('form[data-form=setup]').count()==1, 'base vide : création du compte administrateur')
    f=A.locator('form[data-form=setup]')
    for k,v in {'first_name':'Amel','last_name':'Admin','email':'admin@ipein.tn','password':PWD}.items(): f.locator(f'[name={k}]').fill(v)
    f.locator('button[type=submit]').click(); A.wait_for_selector('.sidebar', timeout=30000); saved(A)
    ok(alive('users')==1, 'administrateur enregistré en ligne')
    ok(any(s['kind']=='user' for s in SESS.values()), 'session personnelle ouverte automatiquement')
    A.evaluate("() => tx(() => { for (let i=0;i<3;i++) ins('rooms',{name:'Salle '+i, capacity:30}); ins('users',{email:'prof@ipein.tn', password_hash: hashPassword('Professeur2026'), first_name:'Sami', last_name:'Prof', role:'enseignant', active:true, must_change_password:false}); })")
    saved(A); ok(alive('rooms')==3 and alive('users')==2, 'saisies enregistrées automatiquement (salles, enseignant)')
    # sans connexion : rien n'est lisible
    B=page(ctx_new(b),'B')
    ok(B.locator('form[data-form=login]').count()==1 and B.evaluate("DB.rooms.length")==0, 'autre appareil sans connexion : écran de connexion, aucune donnée chargée')
    for i in range(1): login(B,'admin@ipein.tn','Faux12345678')
    ok(B.locator('form[data-form=login]').count()==1 and 'incorrect' in B.inner_text('body'), 'mauvais mot de passe refusé')
    # enseignant se connecte et ajoute
    login(B,'prof@ipein.tn','Professeur2026'); B.wait_for_selector('.sidebar', timeout=30000)
    ok(B.evaluate("DB.rooms.length")==3, 'enseignant connecté : voit les données')
    B.evaluate("() => tx(() => ins('rooms',{name:'Ajout prof', capacity:12}))"); saved(B)
    A.wait_for_function("DB.rooms.length===4", timeout=15000); ok(True,'saisie de l’enseignant visible chez l’admin en direct')
    # session expirée : la saisie n'est pas perdue
    tokA=[t for t,s in SESS.items() if s['kind']=='user'][0]
    for t in list(SESS): 
        if SESS[t]['uid']==A.evaluate("ME.id"): SESS[t]['exp']=now()
    A.evaluate("() => tx(() => ins('rooms',{name:'Après expiration', capacity:5}))"); A.wait_for_timeout(2500)
    ok(A.locator('form[data-form=login]').count()==1, 'session expirée : retour à la connexion')
    login(A,'admin@ipein.tn',PWD); A.wait_for_selector('.sidebar', timeout=30000); saved(A)
    ok(any(d['body'].get('name')=='Après expiration' for p,d in DOCS.items() if p.startswith('ipein_rooms/')), 'saisie faite pendant l’expiration : envoyée après reconnexion')
    # coupure réseau
    OFFLINE['on']=True; A.evaluate("() => tx(() => ins('rooms',{name:'Hors ligne', capacity:10}))"); A.wait_for_timeout(1500)
    ok(A.evaluate("Store.pending.size")>0, 'coupure : saisie gardée')
    OFFLINE['on']=False; saved(A,60000)
    ok(any(d['body'].get('name')=='Hors ligne' for p,d in DOCS.items() if p.startswith('ipein_rooms/')), 'retour réseau : envoyée automatiquement')
    # rechargement : toujours connecté, rien perdu
    n=A.evaluate("DB.rooms.length"); A.reload(); A.wait_for_selector('.sidebar', timeout=30000)
    ok(A.evaluate("DB.rooms.length")==n, 'rechargement : connecté et rien de perdu')
    # verrouillage
    C=page(ctx_new(b),'C')
    for i in range(5): login(C,'admin@ipein.tn','Mauvais123456')
    login(C,'admin@ipein.tn',PWD)
    ok('verrouillé' in C.inner_text('body'), '5 échecs : compte verrouillé 15 min (côté serveur)')
    # déconnexion
    B.evaluate("ACTS.logout()"); B.wait_for_selector('form[data-form=login]', timeout=15000)
    ok(B.evaluate("DB.rooms.length")==0 and B.evaluate("localStorage.getItem(APP_KEY)") is None, 'déconnexion : données effacées de cet appareil (restent en ligne)')
    ok(alive('rooms')==n, 'aucune donnée supprimée en ligne')
    b.close()
print('\nRÉSULTAT', sum(r.startswith('OK') for r in RES), '/', len(RES)); print('ERREURS', ERR)
