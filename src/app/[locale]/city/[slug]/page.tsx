import { SiteHeader } from "@/components/chrome/site-header";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { THEMES } from "@/lib/scoring/score";
import { getAllCities, getCityProfile } from "@/lib/queries";
import { formatValue } from "@/lib/format";
import { ThemeSection } from "@/components/city/theme-section";
import { RankGauge } from "@/components/city/rank-gauge";
import { LiveNow } from "@/components/city/live-now";
import { DistrictPanel } from "@/components/city/district-panel";
import { getDistrictPanel } from "@/lib/queries";
import { getCitySummary } from "@/lib/providers/wikipedia";
import { cityEmblem, voivodeshipEmblem } from "@/lib/emblems";
import { Emblem } from "@/components/chrome/emblem";

/** The four figures people ask about before anything else. */
const HEADLINE_CODES = ["avg_salary", "price_per_m2", "affordability", "unemployment_rate"];

type Props = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateStaticParams() {
  const cities = await getAllCities();
  return cities.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const city = await getCityProfile(slug, locale);
  if (!city) return {};
  const t = await getTranslations({ locale, namespace: "city" });
  return {
    title: city.name,
    description: t("inVoivodeship", { voivodeship: city.voivodeship }),
  };
}

export default async function CityPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const city = await getCityProfile(slug, locale);
  if (!city) notFound();

  const t = await getTranslations("city");
  const [summary, districts] = await Promise.all([
    city.wikipediaTitle ? getCitySummary(city.wikipediaTitle, locale) : null,
    city.hasDistricts ? getDistrictPanel(city.slug, locale) : null,
  ]);

  const byCode = new Map(city.readings.map((r) => [r.indicator.code, r]));
  const headlines = HEADLINE_CODES.map((code) => byCode.get(code)).filter(
    (r): r is NonNullable<typeof r> => Boolean(r) && r!.value !== null,
  );

  const arms = cityEmblem(city.slug);
  const regionArms = voivodeshipEmblem(city.voivodeship);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1000px] px-5 py-8">
      <Link href="/" className="text-sm text-muted hover:text-bright">
        {t("backToMap")}
      </Link>

      <header className="mt-4 border-b border-glass-line pb-6">
        <div className="flex items-start gap-4">
          {/* The arms lead the profile. Everything below this line is a
              measurement; this is the one thing on the page that says which
              place is being measured in the town's own terms. */}
          {arms && <Emblem emblem={arms} size={64} className="mt-1" />}
          <div className="min-w-0">
            <h1 className="font-display text-4xl leading-none text-bright sm:text-5xl">
              {city.name}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-[15px] text-muted">
              {regionArms && <Emblem emblem={regionArms} size={18} />}
              {t("inVoivodeship", { voivodeship: city.voivodeship })}
            </p>
          </div>
        </div>
        {summary && (
          <p className="prose-figures mt-5 max-w-[66ch] text-[15px] leading-relaxed text-bright">
            {summary.extract}
          </p>
        )}
      </header>

      <LiveNow cityName={city.name} locale={locale} />

      {headlines.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl text-bright">{t("atAGlance")}</h2>
          <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {headlines.map((reading) => (
              <div key={reading.indicator.code}>
                <p className="text-[13px] leading-snug text-muted">{reading.indicator.label}</p>
                <p className="mt-1 font-display text-2xl text-bright">
                  {formatValue(reading.value!, reading.indicator.unit, locale)}
                </p>
                {reading.rank !== null && (
                  <div className="mt-2">
                    <RankGauge
                      rank={reading.rank}
                      total={reading.ranked}
                      label={t("rankOf", { rank: reading.rank, total: reading.ranked })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {THEMES.map((theme) => (
        <ThemeSection
          key={theme}
          theme={theme}
          readings={city.readings.filter((r) => r.indicator.theme === theme)}
          locale={locale}
        />
      ))}

      {districts && <DistrictPanel panel={districts} cityName={city.name} locale={locale} />}

      {summary && (
        <section className="mt-12 border-t border-glass-line pt-5">
          <h2 className="font-display text-lg text-bright">{t("sources")}</h2>
          <ul className="mt-2 space-y-1 text-[13px] text-muted">
            <li>Główny Urząd Statystyczny — Bank Danych Lokalnych (bdl.stat.gov.pl)</li>
            <li>Główny Inspektorat Ochrony Środowiska — Jakość powietrza (api.gios.gov.pl)</li>
            <li>Instytut Meteorologii i Gospodarki Wodnej (danepubliczne.imgw.pl)</li>
            <li>Open-Meteo — historical climate archive (open-meteo.com)</li>
            <li>
              <a className="underline underline-offset-2 hover:text-bright" href={summary.url}>
                Wikipedia — {summary.title}
              </a>
            </li>
          </ul>
        </section>
      )}
    </main>
    </>
  );
}
