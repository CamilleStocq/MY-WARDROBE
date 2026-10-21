# My Wardrobe

Mon dressing intelligent et ma styliste personnelle : photographier ses vêtements, recevoir chaque jour une tenue composée uniquement à partir de sa garde-robe réelle et adaptée à la météo, puis enregistrer ses looks favoris.

## Démarrer

Prérequis : Node.js 18 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrir http://localhost:5173. Sur iPhone (même réseau Wi-Fi) : utiliser l'adresse « Network » affichée par Vite, puis « Partager → Sur l'écran d'accueil » pour l'installer comme une app.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm test` | tests du moteur de stylisme |
| `npm run build` | vérification TypeScript + build de production dans `dist/` |

Aucune clé ni variable d'environnement n'est nécessaire pour la V1.

## Architecture

Application web progressive (PWA) **React 18 + TypeScript + Vite**, sans backend.

```
src/
  domain/     modèle de données, catégories, nuancier, normalisation/validation
  engine/     moteur de stylisme déterministe (météo → besoins, règles, score, génération)
  services/   IndexedDB, photos, météo (fournisseur interchangeable), localisation, favoris, sauvegarde
  state/      état global de l'application (React context)
  ui/         système de design, composants et écrans
```

- **Stockage** : IndexedDB dans le navigateur (vêtements, photos en Blob, favoris, préférences, cache météo). Les photos sont redimensionnées (1400 px + miniature 480 px, JPEG ; PNG transparent si détourées) et analysées localement : rien n'est envoyé à un service externe.
- **Météo** : [Open-Meteo](https://open-meteo.com/) (sans clé, CC BY 4.0, modèles KNMI HARMONIE / ICON-D2 pour la Belgique). L'IRM ne propose pas d'API de prévisions utilisable directement depuis un navigateur (service WFS sans CORS, grilles de modèle). Le fournisseur est isolé derrière l'interface `WeatherProvider` (`src/services/weather/provider.ts`).
- **Tendances** : base éditoriale rédigée manuellement (`src/engine/trends.ts`), clairement signalée comme telle dans l'interface.

## Écrans

- **Garde-robe** : catalogue photographique (vignettes gris clair), recherche, catégories, filtres et tri.
- **Fiche vêtement** (écran de référence du design) : grande photo, marque et nom, actions Lavage / Modifier / Retoucher, suggestions « À porter avec » calculées par le moteur, bouton « Créer une tenue ».
- **Outfit du jour** : météo résumée en une ligne, tenue en rangées défilantes (faire glisser une pièce pour en essayer une autre), courte explication, « Générer une autre tenue », favori, « Je la porte aujourd'hui ».
- **Calendrier** : historique mensuel des tenues portées, pièce la plus portée du mois, série de jours consécutifs.
- **Favoris** et **Profil**.

## Direction artistique

Application de mode minimaliste et photographique, définie par les variables de `src/styles/app.css` : blanc `#FFFFFF`, surfaces photo `#F5F5F5`, texte `#111111` / `#858585`, bordures `#EAEAEA`, boutons noirs. Typographie système (SF Pro sur iPhone, Inter ailleurs). Aucune couleur décorative : seuls les vêtements apportent la couleur.

## Limites connues de la V1

- Les données vivent sur un seul appareil/navigateur. Utiliser **Profil → Télécharger une sauvegarde** régulièrement. Sur iPhone, Safari peut effacer les données d'un site non utilisé pendant 7 jours : installer l'app sur l'écran d'accueil l'évite.
- **Retouche photo** : après la prise de vue, l'étape « Retoucher » propose le détourage automatique, une gomme, un pinceau de restauration, le recadrage et la rotation. Le détourage utilise [@imgly/background-removal](https://github.com/imgly/background-removal-js) (AGPL-3.0) et s'exécute sur l'appareil : la photo n'est envoyée nulle part, mais le modèle d'IA (≈ 40 Mo) et le moteur WebAssembly sont téléchargés une fois depuis le CDN d'IMG.LY, puis mis en cache. Mesuré à environ 17 s sur ordinateur pour la première photo, téléchargement du modèle compris ; la durée sur iPhone n'a pas encore été mesurée. Les images détourées sont stockées en PNG transparent. Une image déjà détourée (iOS : appui long sur le sujet dans Photos) garde aussi sa transparence.
- L'analyse de photo ne suggère que les couleurs ; la catégorie est choisie par l'utilisateur.

Évolution prévue : synchronisation multi-appareils via Supabase (Auth + Postgres avec Row Level Security + Storage pour les photos), en conservant les services actuels comme couche d'accès.
