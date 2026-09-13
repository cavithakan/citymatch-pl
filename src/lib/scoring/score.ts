/**
 * The weighted scoring engine.
 *
 * Method: Simple Additive Weighting (SAW). Each indicator is normalised onto
 * 0–100 (see normalize.ts), indicators are averaged within their theme, and the
 * six theme scores are combined using the weights the reader chose.
 *
 * Two rules keep the output honest rather than merely plausible:
 *
 *   - A city is never penalised for a gap in GUS's publishing. An indicator
 *     with no value is dropped from its theme average instead of counting as
 *     zero.
 *   - A theme nobody has data for is dropped from the composite and its weight
 *     is removed from the divisor, so the remaining themes are not diluted.
 *
 * Every result carries the per-theme contribution that produced it, which is
 * what the "why this rank" panel renders.
 */
import { extent, normalize, type Direction } from "./normalize";

export const THEMES = [
  "EARNINGS",
  "HOUSING",
  "LABOUR",
  "SAFETY",
  "ENVIRONMENT",
  "LIVING",
] as const;

export type Theme = (typeof THEMES)[number];

export type IndicatorMeta = {
  code: string;
  theme: Theme;
  direction: Direction;
};

export type ScoreInput = {
  id: number;
  slug: string;
  name: string;
  /** Indicator code → raw value. Missing codes are treated as "no data". */
  values: Record<string, number | undefined>;
};

export type ThemeWeights = Partial<Record<Theme, number>>;

export type IndicatorContribution = {
  code: string;
  raw: number;
  normalized: number;
};

export type ThemeContribution = {
  theme: Theme;
  /** Mean of the normalised indicators in this theme, 0–100. */
  score: number;
  /** Weight as supplied by the caller. */
  weight: number;
  /** How many points of the composite score came from this theme. */
  contribution: number;
  indicators: IndicatorContribution[];
};

export type ScoredCity = {
  id: number;
  slug: string;
  name: string;
  score: number;
  rank: number;
  themes: ThemeContribution[];
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Rank cities against each other.
 *
 * Normalisation is relative to the supplied set, so the same city can score
 * differently in different comparisons — that is the intended behaviour of SAW
 * and is stated in the UI.
 */
export function scoreCities(
  cities: ScoreInput[],
  indicators: IndicatorMeta[],
  weights: ThemeWeights,
): ScoredCity[] {
  if (cities.length === 0) return [];

  // Range of each indicator across the compared set.
  const ranges = new Map<string, { min: number; max: number }>();
  for (const ind of indicators) {
    const values = cities
      .map((c) => c.values[ind.code])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const range = extent(values);
    if (range) ranges.set(ind.code, range);
  }

  const byTheme = new Map<Theme, IndicatorMeta[]>();
  for (const ind of indicators) {
    if (!ranges.has(ind.code)) continue; // nothing in the set has this indicator
    const list = byTheme.get(ind.theme) ?? [];
    list.push(ind);
    byTheme.set(ind.theme, list);
  }

  const scored = cities.map((city) => {
    const themes: ThemeContribution[] = [];

    for (const theme of THEMES) {
      const inds = byTheme.get(theme) ?? [];
      const contributions: IndicatorContribution[] = [];

      for (const ind of inds) {
        const raw = city.values[ind.code];
        if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
        const { min, max } = ranges.get(ind.code)!;
        contributions.push({
          code: ind.code,
          raw,
          normalized: normalize(raw, min, max, ind.direction),
        });
      }

      // No data for this theme in this city — leave it out entirely rather than
      // scoring it zero, which would read as "bad" instead of "unknown".
      if (contributions.length === 0) continue;

      themes.push({
        theme,
        score: mean(contributions.map((c) => c.normalized)),
        weight: weights[theme] ?? 0,
        contribution: 0, // filled in below, once the divisor is known
        indicators: contributions,
      });
    }

    const divisor = themes.reduce((sum, t) => sum + t.weight, 0);
    let score = 0;
    for (const t of themes) {
      t.contribution = divisor > 0 ? (t.weight * t.score) / divisor : 0;
      score += t.contribution;
    }

    return { id: city.id, slug: city.slug, name: city.name, score, rank: 0, themes };
  });

  scored.sort((a, b) => b.score - a.score);
  // Cities with identical scores share a rank; the next rank skips accordingly.
  scored.forEach((c, i) => {
    c.rank = i > 0 && scored[i - 1].score === c.score ? scored[i - 1].rank : i + 1;
  });

  return scored;
}

/**
 * Position of every city on one indicator, best first.
 * Drives the "3rd of 66" badges on the city page, which are computed against
 * all cities rather than against a comparison set.
 */
export function rankByIndicator(
  entries: { id: number; value: number }[],
  direction: Direction,
): Map<number, number> {
  const sorted = [...entries].sort((a, b) =>
    direction === "BENEFIT" ? b.value - a.value : a.value - b.value,
  );
  const ranks = new Map<number, number>();
  sorted.forEach((e, i) => {
    const prev = sorted[i - 1];
    const rank = i > 0 && prev.value === e.value ? ranks.get(prev.id)! : i + 1;
    ranks.set(e.id, rank);
  });
  return ranks;
}
