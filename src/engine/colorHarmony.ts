import { getColor, hueDistance } from '../domain/colors';

export interface HarmonyResult {
  score: number;
  note: string;
}

/**
 * Évalue l'harmonie d'un ensemble de couleurs.
 * `main` : couleurs des pièces principales (haut, bas, couche, veste, pièce complète, chaussures).
 * `accents` : couleurs des accessoires (seulement si vives, elles comptent comme une touche).
 */
export function colorHarmony(main: string[], accents: string[] = []): HarmonyResult {
  const all = [...main, ...accents];
  const nonNeutral = unique(all.filter((k) => getColor(k).tone !== 'neutral'));
  const labels = (keys: string[]) => keys.map((k) => getColor(k).label.toLowerCase());

  if (nonNeutral.length === 0) {
    const neutrals = unique(main).slice(0, 3);
    const warm = neutrals.filter((k) => getColor(k).temp === 'warm').length;
    const cool = neutrals.filter((k) => getColor(k).temp === 'cool').length;
    const tonal = warm === 0 || cool === 0;
    return {
      score: tonal ? 0.88 : 0.82,
      note: tonal
        ? `Palette neutre (${labels(neutrals).join(', ')}) : un ensemble sobre et facile.`
        : `Neutres chauds et froids mêlés (${labels(neutrals).join(', ')}) : un contraste doux et moderne.`,
    };
  }

  if (nonNeutral.length === 1) {
    const c = getColor(nonNeutral[0]);
    const count = all.filter((k) => k === c.key).length;
    return {
      score: 1,
      note:
        count > 1
          ? `Le ${c.label.toLowerCase()} est repris sur plusieurs pièces : un rappel de couleur réussi.`
          : `Une seule couleur forte (${c.label.toLowerCase()}) sur une base neutre : elle attire l'œil sans surcharger.`,
    };
  }

  const defs = nonNeutral.map(getColor);
  const hues = defs.map((d) => d.hue ?? 0);
  const allSoft = defs.every((d) => d.tone === 'soft');
  const bolds = defs.filter((d) => d.tone === 'bold');

  if (nonNeutral.length === 2) {
    const d = hueDistance(hues[0], hues[1]);
    if (d <= 40) {
      return { score: 0.95, note: `Camaïeu ${labels(nonNeutral).join(' et ')} : des teintes voisines qui se répondent.` };
    }
    if (allSoft) {
      return { score: 0.9, note: `Duo de tons pastel (${labels(nonNeutral).join(', ')}) : un ensemble doux et lumineux.` };
    }
    if (d >= 150) {
      return {
        score: bolds.length === 2 ? 0.72 : 0.82,
        note: `Contraste de complémentaires (${labels(nonNeutral).join(' / ')}) : une association audacieuse et assumée.`,
      };
    }
    if (bolds.length === 2) {
      return { score: 0.42, note: `${labels(nonNeutral).join(' et ')} se disputent l'attention.` };
    }
    return { score: 0.72, note: `Une teinte douce pour équilibrer une couleur plus vive (${labels(nonNeutral).join(', ')}).` };
  }

  // 3 couleurs non neutres ou plus
  const maxSpread = Math.max(...hues.flatMap((a) => hues.map((b) => hueDistance(a, b))));
  if (maxSpread <= 60) {
    return { score: 0.85, note: `Palette analogue (${labels(nonNeutral).join(', ')}) : un dégradé harmonieux.` };
  }
  if (allSoft) {
    return { score: 0.72, note: 'Plusieurs pastels réunis : joyeux, à porter avec assurance.' };
  }
  return { score: bolds.length >= 2 ? 0.25 : 0.45, note: 'Beaucoup de couleurs différentes : la tenue risque de manquer de point focal.' };
}

function unique<T>(a: T[]): T[] {
  return [...new Set(a)];
}
