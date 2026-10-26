#!/usr/bin/env python3
"""Assemble IPEIN Examens :
- ipein-examens.html : fichier autonome (ouvrable directement)
- ipein-artifact.html : version publiée (contenu de page, sans doctype)"""
import base64, pathlib, os, json

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'src'
IMG = ROOT / 'img'
data_uri = lambda p: 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()

css = (SRC / 'app.css').read_text(encoding='utf-8')
js = '\n'.join(p.read_text(encoding='utf-8') for p in sorted(SRC.glob('[0-9]-*.js')))
assert '</script' not in js
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">'
DIALOG = '''<div id="app"></div>
<div id="toasts" aria-live="polite"></div>
<dialog class="confirm" id="confirm-dialog" aria-labelledby="confirm-title">
  <form method="dialog">
    <div class="body"><h3 id="confirm-title">Confirmer l’action</h3><p id="confirm-text" class="muted"></p>
      <div id="confirm-typed" hidden><label for="confirm-input" class="label-text">Confirmation</label><input id="confirm-input" type="text" autocomplete="off"></div></div>
    <div class="foot"><button class="btn secondary" value="cancel" id="confirm-cancel">Annuler</button><button class="btn" value="ok" id="confirm-ok">Confirmer</button></div>
  </form>
</dialog>'''
SCRIPT = f"<script>\nconst LOGO = '{data_uri(IMG / 'logo-ipein.png')}';\nconst EMBLEM = '{data_uri(IMG / 'logo-emblem.png')}';\nconst ONLINE_URL = 'https://claude.ai/artifact/G72qHrwpFZo8T2dJr6sxQC';\n{js}\n</script>"
CFG = os.environ.get('IPEIN_SUPA', str(ROOT / 'supa.json'))
supa = json.loads(pathlib.Path(CFG).read_text()) if pathlib.Path(CFG).exists() else {'url': '', 'key': '', 'token': ''}
SCRIPT = SCRIPT.replace('<script>\n', '<script>\nconst SUPA_URL = ' + json.dumps(supa['url']) + ';\nconst SUPA_KEY = ' + json.dumps(supa['key']) + ';\n', 1)
FAV = data_uri(IMG / 'favicon.png')

standalone = f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>IPEIN Examens</title>
<link rel="icon" type="image/png" href="{FAV}">
{FONTS}
<style id="app-style">
{css}
</style>
</head>
<body>
{DIALOG}
{SCRIPT}
</body>
</html>
'''
artifact = f'''<title>IPEIN Examens</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="icon" type="image/png" href="{FAV}">
{FONTS}
<style id="app-style">
{css}
</style>
{DIALOG}
{SCRIPT}
'''
for name, content in (('ipein-examens.html', standalone), ('ipein-artifact.html', artifact)):
    out = pathlib.Path(os.environ.get('IPEIN_OUT', str(ROOT))) / name
    out.write_text(content, encoding='utf-8')
    print(out, f'{out.stat().st_size / 1024:.0f} Ko')
