import { SiteHeader } from "@/components/chrome/site-header";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { attributableEmblems } from "@/lib/emblems";

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title"), description: t("intro") };
}

const SOURCES = [
  { key: "gus", href: "https://bdl.stat.gov.pl/api/v1", label: "bdl.stat.gov.pl" },
  { key: "gios", href: "https://api.gios.gov.pl/pjp-api/swagger-ui/", label: "api.gios.gov.pl" },
  { key: "imgw", href: "https://danepubliczne.imgw.pl/apiinfo", label: "danepubliczne.imgw.pl" },
  { key: "openmeteo", href: "https://open-meteo.com/en/docs/historical-weather-api", label: "open-meteo.com" },
  { key: "nbp", href: "https://api.nbp.pl/", label: "api.nbp.pl" },
  { key: "osm", href: "https://github.com/ppatrzyk/polska-geojson", label: "polska-geojson" },
] as const;

const LIMITS = ["counties", "countyGaps", "district", "health", "air", "years"] as const;

/**
 * The trust page.
 *
 * A guide that ranks places has to say where its numbers came from and what
 * they cannot tell you, or the ranking is just an opinion with a typeface.
 */
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const credits = attributableEmblems();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[760px] px-5 py-10">
      <h1 className="font-display text-3xl text-bright sm:text-4xl">{t("title")}</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-bright">{t("intro")}</p>

      <section className="mt-10">
        <h2 className="font-display text-xl text-bright">{t("sourcesTitle")}</h2>
        <dl className="mt-4 border-t border-glass-line">
          {SOURCES.map((source) => (
            <div key={source.key} className="border-b border-glass-line py-4">
              <dt>
                <a
                  href={source.href}
                  className="text-[13px] text-muted underline underline-offset-2 hover:text-bright"
                >
                  {source.label}
                </a>
              </dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-bright">
                {t(`sources.${source.key}`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/*
        Emblem credit.
        
        Sixty-three of the seventy-nine arms on the map are public domain and
        need no notice; three are contributor drawings under Creative Commons
        and do. Listing only those keeps the credit legible instead of burying
        three real obligations in seventy-nine formalities.
      */}
      <section className="mt-10">
        <h2 className="font-display text-xl text-bright">{t("emblemsTitle")}</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-bright">{t("emblems")}</p>
        {credits.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {credits.map((credit) => (
              <li key={credit.name} className="text-[13.5px] text-muted">
                <a
                  href={credit.source}
                  className="underline underline-offset-2 hover:text-bright"
                >
                  {credit.name}
                </a>{" "}
                — {credit.license}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13.5px] text-muted">{t("emblemsAllPublicDomain")}</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-bright">{t("methodTitle")}</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-bright">{t("method")}</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-bright">{t("limitsTitle")}</h2>
        <ul className="mt-3 space-y-3">
          {LIMITS.map((key) => (
            <li key={key} className="border-s-2 border-glass-line ps-4 text-[15px] leading-relaxed text-bright">
              {t(`limits.${key}`)}
            </li>
          ))}
        </ul>
      </section>
    </main>
    </>
  );
}
