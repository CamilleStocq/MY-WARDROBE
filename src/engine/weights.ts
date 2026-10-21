/**
 * Pondérations du score esthétique (somme = 1).
 * Les contraintes obligatoires (météo, disponibilité) ne sont PAS ici :
 * elles filtrent les candidats avant le score et ne peuvent pas être compensées.
 * Documentation détaillée : docs/MOTEUR.md
 */
export const WEIGHTS = {
  weather: 0.22, // adéquation fine à la météo (chaleur cumulée, pluie, vent, superposition)
  color: 0.2, // harmonie des couleurs
  pattern: 0.08, // gestion des motifs
  style: 0.13, // cohérence des styles
  formality: 0.08, // niveau d'habillement vs occasion
  proportion: 0.04, // équilibre des volumes
  season: 0.05, // saison des pièces
  preference: 0.08, // goûts déclarés
  trend: 0.02, // base éditoriale de tendances
  diversity: 0.1, // éviter les répétitions (tenue entière et pièce par pièce)
} as const;

export type ScoreComponent = keyof typeof WEIGHTS;

/** Nombre de bases (haut+bas / pièce complète) explorées en détail. */
export const BASE_BEAM = 28;
/** Les propositions sont tirées parmi les N meilleures pour varier. */
export const PICK_AMONG = 5;
/** Plus la valeur est élevée, plus le tirage privilégie le meilleur score. */
export const PICK_SHARPNESS = 30;
