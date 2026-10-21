# Moteur de stylisme

Moteur **déterministe, testable et explicable** (`src/engine/`). Aucun modèle d'IA, aucun appel réseau.

## 1. Météo → besoins (`weatherNeeds.ts`)

1. On garde les heures comprises dans les **heures de sortie** de l'utilisateur (8 h–19 h par défaut).
2. Ressenti retenu = `0,6 × ressenti minimum + 0,4 × ressenti moyen` (prudence vers le moment le plus froid).
3. Sensibilité au froid : ±3 °C (« sensible » = le froid compte 3 °C de plus).
4. Bande de température selon des seuils **configurables** (Profil → Confort thermique) :

| Bande | Ressenti ajusté (défaut) | Chaleur cumulée visée | Couche extérieure |
| --- | --- | --- | --- |
| chaud | ≥ 26 °C | 2–4 | à éviter (sauf pluie) |
| agréable | 20–26 | 3–5 | facultative (suggérée si pluie, vent, écart) |
| doux | 14–20 | 4–7 | suggérée |
| frais | 8–14 | 6–9 | obligatoire, chaleur ≥ 2 |
| froid | 2–8 | 8–12 | obligatoire, chaleur ≥ 3 |
| glacial | < 2 | 10–16 | obligatoire, chaleur ≥ 4 |

Chaleur cumulée = haut + couche + bas + veste (pièce complète = sa chaleur + 1). Chaque vêtement a une chaleur de 1 à 5.

Pluie probable : probabilité ≥ 60 % ou ≥ 2 mm sur les heures de sortie ; possible : ≥ 30 % ou ≥ 0,5 mm. Vent : rafales ≥ 45 km/h ou vent ≥ 30 km/h. Variable : écart ≥ 8 °C.

## 2. Contraintes obligatoires (`rules.ts › weatherIssue`, `outfitIssues`)

Appliquées **avant** le score : elles ne peuvent pas être compensées par une belle harmonie.

- Disponibilité : seules les pièces « disponibles » sont proposées.
- Pas de pièce de chaleur ≥ 4 par temps chaud, pas de short ni de chaussures ouvertes par temps frais ou froid, pas de sandales sous la pluie, pas d'accessoires d'hiver par temps chaud, veste obligatoire quand la bande l'exige.

Si aucune tenue ne les respecte toutes, le moteur cherche la **meilleure alternative** et l'affiche comme un compromis, avec chaque problème listé. Si même cela est impossible (pas de haut + bas ni de pièce complète), il explique ce qui manque.

Une pièce **verrouillée** est conservée, sauf si elle viole une contrainte obligatoire : elle est alors remplacée et l'utilisateur est prévenu.

## 3. Score (`weights.ts`)

| Composant | Poids | Ce qui est évalué |
| --- | --- | --- |
| météo | 24 % | écart à la chaleur visée, pluie (veste imperméable, chaussures fermées, daim/toile), vent, superposition si écart de température |
| couleurs | 20 % | neutres, une couleur forte, camaïeu, complémentaires, pastels, couleurs vives concurrentes ; bonus « rappel de couleur » |
| styles | 13 % | compatibilité deux à deux (table `STYLE_COMPAT`), cohérence avec l'occasion |
| motifs | 8 % | une pièce à motif = idéal, deux = pénalité, trois = forte pénalité |
| formalité | 8 % | écart au niveau visé par l'occasion, écart entre les pièces |
| préférences | 8 % | couleurs et styles aimés / évités / rares |
| diversité | 6 % | similarité (Jaccard) avec les 15 dernières propositions ; bonus pour un favori non porté récemment |
| saison | 5 % | pièce prévue pour la saison en cours |
| proportions | 4 % | ample + ajusté favorisé, ample + ample pénalisé |
| tendances | 4 % | règles de la base éditoriale (`trends.ts`) |

## 4. Génération (`generator.ts`)

1. Toutes les bases haut × bas et pièces complètes sont pré-notées ; les 28 meilleures (avec un léger aléa) sont explorées.
2. Pour chaque base : couche intermédiaire (si frais/froid/variable), veste, chaussures, puis sac et accessoire de froid sont choisis un par un en maximisant le score.
3. La proposition est tirée au hasard parmi les 5 meilleures, pondérée par le score, en excluant celles déjà montrées : « Autre proposition » donne toujours un look différent.
4. « Pourquoi ce look ? » est construit uniquement à partir des pièces réellement retenues et des composants du score.
