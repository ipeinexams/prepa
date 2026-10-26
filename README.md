# IPEIN Examens

Application de gestion des examens et des surveillances de l'Institut Préparatoire aux Études d'Ingénieurs de Nabeul.

**Site :** https://ipeinexams.github.io/prepa/

## Contenu
| Élément | Rôle |
|---|---|
| `index.html` | L'application complète (un seul fichier), servie par GitHub Pages |
| `src/` | Code source (JavaScript, CSS) |
| `build.py` | Assemble `src/` en `index.html` : `python3 build.py` puis copier `ipein-examens.html` en `index.html` |
| `supa.json` | Adresse et clé publique de la base (clé « anon », publique par conception) |
| `supabase/` | Scripts SQL de la base (Supabase, projet « IPEIN EXAMS ») |
| `img/` | Logos IPEIN |
| `tests/` | Tests de bout en bout (Playwright) |

## Fonctionnement
- Chaque saisie est enregistrée automatiquement et immédiatement dans la base en ligne ; les autres utilisateurs la voient en quelques secondes.
- Accès aux données uniquement après connexion (e-mail + mot de passe), vérifiée par le serveur ; sessions de 12 h ; verrouillage 15 min après 5 échecs.
- Suppressions = mise en corbeille dans la base ; historique des versions conservé 90 jours.
- Hors connexion : les saisies sont gardées et envoyées au retour du réseau.

## Mise à jour du site
Modifier `src/`, lancer `python3 build.py`, remplacer `index.html` par le fichier généré, puis pousser sur `main`.
