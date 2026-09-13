/**
 * Min–max normalisation, the first half of the Simple Additive Weighting
 * method used to rank cities.
 *
 * Raw indicators are incomparable — salary is in thousands of złoty, the
 * unemployment rate is a single-digit percentage, air quality is an index of
 * 1 to 6. Rescaling each one onto 0–100 across the compared set puts them on
 * one axis so a weighted sum is meaningful.
 */

export type Direction = "BENEFIT" | "COST";

/** Returned when a value cannot be placed on the scale. */
export const NEUTRAL_SCORE = 50;

/**
 * Rescale `value` onto 0–100 relative to the set it belongs to.
 *
 * A BENEFIT indicator (salary, sunshine) scores high when the raw value is
 * high; a COST indicator (price, crime, unemployment) scores high when it is
 * low. Comparing one city against itself, or a set where every value is
 * identical, has no meaningful spread — both collapse to the midpoint rather
 * than dividing by zero or arbitrarily awarding 0 or 100.
 */
export function normalize(
  value: number,
  min: number,
  max: number,
  direction: Direction,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return NEUTRAL_SCORE;
  }
  if (max === min) return NEUTRAL_SCORE;

  const clamped = Math.min(Math.max(value, min), max);
  const ratio = (clamped - min) / (max - min);
  return 100 * (direction === "BENEFIT" ? ratio : 1 - ratio);
}

/** Smallest and largest finite value in a list, or null when there is none. */
export function extent(values: number[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : { min, max };
}
