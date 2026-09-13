import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MapShell } from "@/components/map/map-shell";
import { getComparisonData, getCountyData, getVisibleIndicators } from "@/lib/queries";
import { readMapState } from "@/lib/map-url-state";

/** The measure the map opens on: the one people ask about first. */
const DEFAULT_METRIC = "avg_salary";

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * The map is the application.
 *
 * Everything the panels need travels with the page — 66 cities and the 314
 * counties around them, by roughly two dozen figures each, is a few thousand
 * numbers: small enough to send once and cheap enough to make filtering,
 * ranking and switching measure instant rather than a round trip each.
 */
export default async function ExplorePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const initial = readMapState(await searchParams);

  const [cities, counties, indicators] = await Promise.all([
    getComparisonData(),
    getCountyData(),
    getVisibleIndicators(locale),
  ]);

  const coordinates = Object.fromEntries(
    cities.map((c) => [c.slug, { lat: c.lat, lon: c.lon }]),
  );

  return (
    <MapShell
      cities={cities.map((c) => ({
        slug: c.slug,
        name: c.name,
        voivodeship: c.voivodeship,
        values: c.values,
      }))}
      counties={counties}
      coordinates={coordinates}
      indicators={indicators.map((i) => ({
        code: i.code,
        label: i.label,
        unit: i.unit,
        theme: i.theme,
        direction: i.direction,
        role: i.role,
      }))}
      defaultMetric={DEFAULT_METRIC}
      locale={locale}
      initial={initial}
    />
  );
}
