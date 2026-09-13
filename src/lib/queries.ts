import { cache } from "react";
import { db } from "./db";
import type { Locale } from "@/i18n/routing";

export type Theme = "EARNINGS" | "HOUSING" | "LABOUR" | "SAFETY" | "ENVIRONMENT" | "LIVING";
export type Direction = "BENEFIT" | "COST";
export type Role = "SCORED" | "DISPLAY_ONLY" | "INPUT";

export type IndicatorView = {
  id: number;
  code: string;
  theme: Theme;
  direction: Direction;
  role: Role;
  unit: string;
  label: string;
  description: string | null;
  source: string;
  availableAtDistrict: boolean;
  sortOrder: number;
};

/** Pick the language-specific columns once, so nothing downstream branches on locale. */
function toView(
  i: {
    id: number;
    code: string;
    theme: string;
    direction: string;
    role: string;
    unit: string;
    unitEn: string;
    labelPl: string;
    labelEn: string;
    descPl: string | null;
    descEn: string | null;
    source: string;
    availableAtDistrict: boolean;
    sortOrder: number;
  },
  locale: Locale,
): IndicatorView {
  return {
    id: i.id,
    code: i.code,
    theme: i.theme as Theme,
    direction: i.direction as Direction,
    role: i.role as Role,
    unit: locale === "pl" ? i.unit : i.unitEn,
    label: locale === "pl" ? i.labelPl : i.labelEn,
    description: locale === "pl" ? i.descPl : i.descEn,
    source: i.source,
    availableAtDistrict: i.availableAtDistrict,
    sortOrder: i.sortOrder,
  };
}

/**
 * Every indicator meant to be shown, in display order.
 * INPUT rows are excluded — they exist only to feed derived metrics.
 */
export const getVisibleIndicators = cache(async (locale: Locale): Promise<IndicatorView[]> => {
  const rows = await db.indicator.findMany({
    where: { role: { in: ["SCORED", "DISPLAY_ONLY"] } },
    orderBy: [{ theme: "asc" }, { sortOrder: "asc" }],
  });
  return rows.map((r) => toView(r, locale));
});

export type CityValue = {
  slug: string;
  name: string;
  voivodeship: string;
  lat: number;
  lon: number;
  value: number | null;
  year: number | null;
};

/**
 * The most recent value of one indicator for every city.
 *
 * Cities are not all measured in the same year — GUS publishes some series
 * later than others — so this takes each city's latest available year rather
 * than forcing one year across the country and dropping whoever lags.
 */
export const getIndicatorAcrossCities = cache(
  async (code: string): Promise<CityValue[]> => {
    const cities = await db.city.findMany({
      select: { id: true, slug: true, name: true, voivodeship: true, lat: true, lon: true },
      orderBy: { name: "asc" },
    });

    const indicator = await db.indicator.findUnique({ where: { code }, select: { id: true } });
    if (!indicator) {
      return cities.map((c) => ({ ...c, value: null, year: null }));
    }

    const rows = await db.cityIndicator.findMany({
      where: { indicatorId: indicator.id },
      select: { cityId: true, year: true, value: true },
      orderBy: { year: "desc" },
    });

    const latest = new Map<number, { year: number; value: number }>();
    for (const r of rows) {
      if (!latest.has(r.cityId)) latest.set(r.cityId, { year: r.year, value: r.value });
    }

    return cities.map((c) => {
      const hit = latest.get(c.id);
      return {
        slug: c.slug,
        name: c.name,
        voivodeship: c.voivodeship,
        lat: c.lat,
        lon: c.lon,
        value: hit?.value ?? null,
        year: hit?.year ?? null,
      };
    });
  },
);

export type CountyData = {
  slug: string;
  name: string;
  voivodeship: string;
  /** Latest value per indicator code. */
  values: Record<string, number>;
};

/**
 * Every land county's latest figure for every visible indicator.
 *
 * Sent with the page in one piece, like the cities, and for the same reason:
 * switching measure has to repaint the map immediately, and a round trip per
 * measure would make the country flicker on every click. Three hundred
 * counties by eighteen figures is a few thousand numbers.
 */
export const getCountyData = cache(async (): Promise<CountyData[]> => {
  const counties = await db.county.findMany({
    select: { id: true, slug: true, name: true, voivodeship: true },
    orderBy: { name: "asc" },
  });

  const indicators = await db.indicator.findMany({
    where: { role: { in: ["SCORED", "DISPLAY_ONLY"] } },
    select: { id: true, code: true },
  });
  const codeById = new Map(indicators.map((i) => [i.id, i.code]));

  const rows = await db.countyIndicator.findMany({
    where: { indicatorId: { in: indicators.map((i) => i.id) } },
    select: { countyId: true, indicatorId: true, year: true, value: true },
    orderBy: { year: "desc" },
  });

  const perCounty = new Map<number, Record<string, number>>();
  for (const r of rows) {
    const code = codeById.get(r.indicatorId);
    if (!code) continue;
    const bucket = perCounty.get(r.countyId) ?? {};
    // Newest first, so the first value per code is the latest.
    if (bucket[code] === undefined) bucket[code] = r.value;
    perCounty.set(r.countyId, bucket);
  }

  return counties.map((c) => ({
    slug: c.slug,
    name: c.name,
    voivodeship: c.voivodeship,
    values: perCounty.get(c.id) ?? {},
  }));
});

/** True once the refresh script has loaded observations. */
export const hasObservations = cache(async () => (await db.cityIndicator.count()) > 0);

export type IndicatorReading = {
  indicator: IndicatorView;
  value: number | null;
  year: number | null;
  /** Position among all cities, 1 = best for this indicator's direction. */
  rank: number | null;
  /** How many cities have a value for this indicator. */
  ranked: number;
  /** Median across all cities, for the comparison line. */
  median: number | null;
  history: { year: number; value: number }[];
};

export type CityProfile = {
  slug: string;
  name: string;
  voivodeship: string;
  lat: number;
  lon: number;
  wikipediaTitle: string | null;
  climate: {
    year: number;
    comfortableDays: number;
    sunshineHours: number;
    rainyDays: number;
    avgTemp: number;
  } | null;
  readings: IndicatorReading[];
  hasDistricts: boolean;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Everything the city page shows, in one pass.
 *
 * Ranks and medians are computed against all 66 cities rather than the page's
 * own city, which is the whole point of the rank gauge: a salary figure means
 * little until you know it is the second highest in the country.
 */
export const getCityProfile = cache(
  async (slug: string, locale: Locale): Promise<CityProfile | null> => {
    const city = await db.city.findUnique({
      where: { slug },
      include: { climate: true, _count: { select: { districts: true } } },
    });
    if (!city) return null;

    const indicators = await getVisibleIndicators(locale);

    // One query for every city's values; ranking needs the whole field anyway.
    const rows = await db.cityIndicator.findMany({
      select: { cityId: true, indicatorId: true, year: true, value: true },
      orderBy: { year: "desc" },
    });

    const latestByIndicator = new Map<number, Map<number, number>>();
    const historyHere = new Map<number, { year: number; value: number }[]>();

    for (const r of rows) {
      let perCity = latestByIndicator.get(r.indicatorId);
      if (!perCity) {
        perCity = new Map();
        latestByIndicator.set(r.indicatorId, perCity);
      }
      // Rows arrive newest first, so the first hit per city is its latest.
      if (!perCity.has(r.cityId)) perCity.set(r.cityId, r.value);

      if (r.cityId === city.id) {
        const list = historyHere.get(r.indicatorId) ?? [];
        list.push({ year: r.year, value: r.value });
        historyHere.set(r.indicatorId, list);
      }
    }

    const latestYearHere = new Map<number, number>();
    for (const r of rows) {
      if (r.cityId !== city.id) continue;
      if (!latestYearHere.has(r.indicatorId)) latestYearHere.set(r.indicatorId, r.year);
    }

    const readings: IndicatorReading[] = indicators.map((indicator) => {
      const perCity = latestByIndicator.get(indicator.id) ?? new Map<number, number>();
      const value = perCity.get(city.id) ?? null;
      const all = [...perCity.values()];

      let rank: number | null = null;
      if (value !== null) {
        const better = all.filter((v) =>
          indicator.direction === "BENEFIT" ? v > value : v < value,
        ).length;
        rank = better + 1;
      }

      const history = (historyHere.get(indicator.id) ?? [])
        .slice()
        .sort((a, b) => a.year - b.year);

      return {
        indicator,
        value,
        year: latestYearHere.get(indicator.id) ?? null,
        rank,
        ranked: all.length,
        median: median(all),
        history,
      };
    });

    return {
      slug: city.slug,
      name: city.name,
      voivodeship: city.voivodeship,
      lat: city.lat,
      lon: city.lon,
      wikipediaTitle: locale === "pl" ? city.wikipediaTitlePl : city.wikipediaTitleEn,
      climate: city.climate,
      readings,
      hasDistricts: city._count.districts > 0,
    };
  },
);

/** Slugs for static generation and the comparison picker. */
export const getAllCities = cache(async () =>
  db.city.findMany({ select: { slug: true, name: true, voivodeship: true }, orderBy: { name: "asc" } }),
);

export type DistrictReading = {
  name: string;
  slug: string;
  values: Record<string, { value: number; year: number }>;
};

export type DistrictPanel = {
  districts: DistrictReading[];
  /** Indicators GUS publishes per district. */
  available: IndicatorView[];
  /**
   * Indicators shown on the city page that stop at city level. Listed rather
   * than dropped, so the gap in the official data stays visible to the reader.
   */
  missing: IndicatorView[];
};

/**
 * District-level figures for the one city that has them.
 *
 * Warsaw's 18 dzielnice are the only sub-city units in the Local Data Bank, and
 * only ten of the indicators on the city page exist at that level — salary,
 * flat prices, unemployment and crime are all published for the city as a
 * whole and no finer.
 */
export const getDistrictPanel = cache(
  async (citySlug: string, locale: Locale): Promise<DistrictPanel | null> => {
    const city = await db.city.findUnique({
      where: { slug: citySlug },
      select: { id: true, districts: { select: { id: true, slug: true, name: true } } },
    });
    if (!city || city.districts.length === 0) return null;

    const indicators = await getVisibleIndicators(locale);
    const available = indicators.filter((i) => i.availableAtDistrict);
    const missing = indicators.filter((i) => !i.availableAtDistrict && i.role === "SCORED");

    const rows = await db.districtIndicator.findMany({
      where: { districtId: { in: city.districts.map((d) => d.id) } },
      select: { districtId: true, indicatorId: true, year: true, value: true },
      orderBy: { year: "desc" },
    });

    const codeById = new Map(indicators.map((i) => [i.id, i.code]));
    const perDistrict = new Map<number, Record<string, { value: number; year: number }>>();

    for (const r of rows) {
      const code = codeById.get(r.indicatorId);
      if (!code) continue;
      const bucket = perDistrict.get(r.districtId) ?? {};
      // Newest first, so the first value seen for a code is the latest.
      if (!bucket[code]) bucket[code] = { value: r.value, year: r.year };
      perDistrict.set(r.districtId, bucket);
    }

    return {
      districts: city.districts
        .map((d) => ({ name: d.name, slug: d.slug, values: perDistrict.get(d.id) ?? {} }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
      available,
      missing,
    };
  },
);

export type ComparisonCity = {
  slug: string;
  name: string;
  voivodeship: string;
  lat: number;
  lon: number;
  /** Latest value per indicator code. */
  values: Record<string, number>;
};

/**
 * Values for every city, keyed by indicator code.
 *
 * The comparison page scores in the browser so the sliders respond as they are
 * dragged, which means the whole field has to travel with the page. Only the
 * latest value per indicator is sent — roughly 66 × 20 numbers — not the ten
 * years of history the city pages use.
 */
export const getComparisonData = cache(async (): Promise<ComparisonCity[]> => {
  const cities = await db.city.findMany({
    select: { id: true, slug: true, name: true, voivodeship: true, lat: true, lon: true },
    orderBy: { name: "asc" },
  });

  const indicators = await db.indicator.findMany({
    where: { role: { in: ["SCORED", "DISPLAY_ONLY"] } },
    select: { id: true, code: true },
  });
  const codeById = new Map(indicators.map((i) => [i.id, i.code]));

  const rows = await db.cityIndicator.findMany({
    where: { indicatorId: { in: indicators.map((i) => i.id) } },
    select: { cityId: true, indicatorId: true, year: true, value: true },
    orderBy: { year: "desc" },
  });

  const perCity = new Map<number, Record<string, number>>();
  for (const r of rows) {
    const code = codeById.get(r.indicatorId);
    if (!code) continue;
    const bucket = perCity.get(r.cityId) ?? {};
    // Newest first, so the first value per code is the latest.
    if (bucket[code] === undefined) bucket[code] = r.value;
    perCity.set(r.cityId, bucket);
  }

  return cities.map((c) => ({
    slug: c.slug,
    name: c.name,
    voivodeship: c.voivodeship,
    lat: c.lat,
    lon: c.lon,
    values: perCity.get(c.id) ?? {},
  }));
});
