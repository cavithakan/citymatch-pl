import { SiteHeader } from "@/components/chrome/site-header";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { THEMES, type Theme } from "@/lib/scoring/score";
import { getComparisonData, getVisibleIndicators } from "@/lib/queries";
import { CompareView } from "@/components/compare/compare-view";

/** Opens on the three largest cities so the page is never empty on arrival. */
const DEFAULT_CITIES = ["warszawa", "krakow", "wroclaw"];
const DEFAULT_WEIGHT = 50;

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ cities?: string; w?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "compare" });
  return { title: t("title"), description: t("intro") };
}

/** Parse "30-20-15-10-15-10" back into weights, in THEMES order. */
function parseWeights(raw: string | undefined): Record<Theme, number> {
  const parts = raw?.split("-").map(Number) ?? [];
  return Object.fromEntries(
    THEMES.map((theme, i) => {
      const value = parts[i];
      return [theme, Number.isFinite(value) && value >= 0 && value <= 100 ? value : DEFAULT_WEIGHT];
    }),
  ) as Record<Theme, number>;
}

export default async function ComparePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { cities: rawCities, w } = await searchParams;

  const t = await getTranslations("compare");
  const [cities, indicators] = await Promise.all([
    getComparisonData(),
    getVisibleIndicators(locale),
  ]);

  const known = new Set(cities.map((c) => c.slug));
  const requested = rawCities?.split(",").filter((slug) => known.has(slug)) ?? [];
  const selection = requested.length ? requested : DEFAULT_CITIES.filter((slug) => known.has(slug));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1200px] px-5 py-8">
      <h1 className="font-display text-3xl text-bright sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-muted">{t("intro")}</p>

      <CompareView
        cities={cities}
        indicators={indicators
          .filter((i) => i.role === "SCORED")
          .map((i) => ({ code: i.code, theme: i.theme, direction: i.direction }))}
        initialSelection={selection}
        initialWeights={parseWeights(w)}
      />
    </main>
    </>
  );
}
