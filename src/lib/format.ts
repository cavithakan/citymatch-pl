import type { Locale } from "@/i18n/routing";

/**
 * Polish and English format numbers differently in ways that matter at a
 * glance: Poland uses a comma for the decimal separator and a narrow space for
 * thousands, so "15 850,25" and "15,850.25" are the same figure. Intl handles
 * it; the point of this module is that no component ever hand-rolls a
 * toFixed().
 */

const FRACTION_DIGITS: Record<string, number> = {
  "mies. / m²": 2,
  "%": 1,
  "m²": 1,
  "na 1000": 1,
  "µg/m³": 1,
  indeks: 1,
  "Polska = 100": 1,
};

export function formatValue(value: number, unit: string, locale: Locale): string {
  const digits = FRACTION_DIGITS[unit] ?? (Math.abs(value) < 100 ? 1 : 0);
  const number = new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

  // Units that read as a suffix stay attached; the rest follow a space.
  return unit === "%" ? `${number}%` : `${number} ${unit}`;
}

/**
 * The number alone, formatted for the locale but with no unit.
 *
 * Tables carry the unit once in the column header instead of repeating it in
 * every cell — eighteen rows of "na 10 tys." is noise that crowds out the
 * figures the column exists to show.
 */
export function formatBare(value: number, unit: string, locale: Locale): string {
  const digits = FRACTION_DIGITS[unit] ?? (Math.abs(value) < 100 ? 1 : 0);
  return new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(value: number, locale: Locale, digits = 0): string {
  return new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Signed percentage difference from a reference, e.g. "+21%" against the median. */
export function formatDelta(value: number, reference: number, locale: Locale): string | null {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return null;
  const pct = ((value - reference) / Math.abs(reference)) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return "0%";
  const formatted = new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-GB", {
    signDisplay: "always",
    maximumFractionDigits: 0,
  }).format(rounded);
  return `${formatted}%`;
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
