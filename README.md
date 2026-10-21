# My Wardrobe

Mon dressing intelligent et ma styliste personnelle : photographier ses vêtements, recevoir chaque jour une tenue composée uniquement à partir de sa garde-robe réelle et adaptée à la météo, puis enregistrer ses looks favoris.

Site : https://camillestocq.github.io/MY-WARDROBE/

## Démarrer

Prérequis : Node.js 18 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrir http://localhost:5173. Sur iPhone (même réseau Wi-Fi) : utiliser l'adresse « Network » affichée par Vite.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm test` | tests (moteur de stylisme, météo, photos, sauvegardes) |
| `npm run build` | vérification TypeScript + build de production dans `dist/` |

Aucune clé ni variable d'environnement n'est nécessaire.

## Déploiement

Chaque push sur `main` déclenche le workflow `.github/workflows/deploy.yml` : tests, build, puis publication de `dist/` sur la branche `gh-pages` (GitHub Pages). Les routes utilisent le fragment `#/…` : les liens directs (`#/wardrobe`, `#/favorites`, `#/calendar`, `#/settings`) fonctionnent sans configuration serveur.

## Architecture

Application web progressive (PWA) **React 18 + TypeScript + Vite**, sans backend.

```
src/
  domain/     modèle de données, catégories, nuancier, normalisation/validation
  engine/     moteur de stylisme déterministe (météo → besoins, règles, score, génération)
  services/   IndexedDB, photos, détourage, météo, localisation, favoris, calendrier, sauvegarde
  state/      état global de l'application (React context)
  ui/         système de design, composants et écrans
public/sw.js  service worker (ouverture hors ligne)
```

- **Stockage** : IndexedDB sur l'appareil (vêtements, photos en Blob, favoris, calendrier, préférences, cache météo). Photos redimensionnées (1400 px + miniature 480 px, JPEG ; PNG transparent si détourées) et analysées localement.
- **Météo** : [Open-Meteo](https://open-meteo.com/) (sans clé, CC BY 4.0, modèles KNMI HARMONIE / ICON-D2 pour la Belgique). L'IRM ne propose pas d'API de prévisions utilisable depuis un navigateur (service WFS sans CORS, grilles de modèle). Le fournisseur est isolé derrière `WeatherProvider`. En cas de panne : dernières prévisions affichées comme « non actualisées », ou saisie manuelle ; aucune valeur n'est inventée.
- **Moteur** : voir [docs/MOTEUR.md](docs/MOTEUR.md) (contraintes météo obligatoires, score pondéré, variété pièce par pièce, pièces préférées, tenues écartées).
- **Hors ligne** : le service worker garde l'application en cache (réseau d'abord pour la page, cache pour les fichiers). La météo n'est jamais servie depuis ce cache.

## Écrans

- **Aujourd'hui** : date, salutation, météo compacte (température, ressenti, pluie, vent), tenue en rangées défilantes (faire glisser une pièce pour en essayer une autre), explication courte, « Une autre tenue », « Modifier ce look » (remplacer ou verrouiller une pièce), favori, « Je la porte aujourd'hui ».
- **Dressing** : catalogue photographique, recherche, catégories, filtres combinables (type, couleur, saison, style, disponibilité) et tri.
- **Fiche vêtement** : grande photo, marque et nom, type · couleur · saison, actions Favori / Modifier / Supprimer, « À porter avec » (pièces réelles du dressing), bouton « Créer une tenue ».
- **Favoris** : looks enregistrés (onglet « Looks ») et calendrier des tenues portées (onglet « Calendrier »).
- **Profil** : lieu et horaires, confort thermique, style, catégories personnalisées, données (sauvegarde, restauration, état du stockage).

## Direction artistique

Variables dans `src/styles/app.css` : blanc `#FFFFFF`, surfaces photo `#F5F5F5`, texte `#111111` / `#858585`, bordures `#E8E8E8`, boutons noirs. Titres en Instrument Serif, texte en Inter. Aucune couleur décorative : seuls les vêtements apportent la couleur.

## Données et sauvegardes

- Les données ne sont **pas synchronisées** entre appareils. **Profil → Télécharger une sauvegarde** crée un fichier JSON complet (photos comprises) ; sur iPhone, le partage permet de l'enregistrer dans Fichiers.
- **Copies automatiques** : à chaque ouverture de l'app (et au retour au premier plan, au plus toutes les 10 minutes), une copie des données est enregistrée dans l'app si quelque chose a changé ; les 10 dernières sont conservées et consultables dans **Profil → Mes données**. Les photos ne sont pas dupliquées : elles sont conservées tant qu'une copie les utilise. Revenir à une copie copie d'abord l'état actuel (opération réversible). Ces copies disparaissent si l'app est supprimée : elles complètent le fichier de sauvegarde, elles ne le remplacent pas.
- **Restaurer** : le fichier est validé entièrement avant toute écriture (format, version, vêtements, photos, favoris, calendrier), un résumé est affiché pour confirmation, puis tout est écrit en une seule transaction (rien n'est écrit en cas d'erreur). Les éléments déjà présents sont conservés.
- **Limites Safari / iPhone** : le navigateur peut effacer les données d'un site peu utilisé ; une app ajoutée à l'écran d'accueil est mieux protégée mais **supprimer l'app de l'écran d'accueil peut effacer ses données**. L'état « Stockage protégé » est affiché dans Profil. Faire une sauvegarde avant de réinstaller l'app.

## Retouche photo

L'étape « Retoucher » propose détourage automatique, gomme, pinceau de restauration, recadrage et rotation. Le détourage utilise [@imgly/background-removal](https://github.com/imgly/background-removal-js) (AGPL-3.0) et s'exécute sur l'appareil : la photo n'est envoyée nulle part, mais le modèle (≈ 40 Mo) est téléchargé une fois depuis le CDN d'IMG.LY. Durée mesurée sur ordinateur : environ 17 s pour la première photo (téléchargement compris) ; non mesurée sur iPhone.

## Évolutions possibles

- Synchronisation multi-appareils via Supabase (Auth + Postgres avec Row Level Security + Storage pour les photos), en conservant les services actuels comme couche d'accès.
- Détection automatique de la catégorie sur la photo (aujourd'hui seules les couleurs sont suggérées).
