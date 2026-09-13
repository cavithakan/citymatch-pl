import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import { getCityAirQuality } from "@/lib/providers/gios";
import { getCityWeather } from "@/lib/providers/imgw";

/**
 * The one part of the page that is not an annual statistic.
 *
 * Everything else here describes a city over a year; this says what it is like
 * this hour. It is deliberately small — a guide is not a weather site — but
 * without it the page would be entirely historical.
 *
 * Both sources are optional: only about sixty Polish towns host a synoptic
 * station, and not every city has an air-quality station either. Whichever is
 * missing is left out rather than filled with a placeholder.
 */
export async function LiveNow({ cityName, locale }: { cityName: string; locale: Locale }) {
  const t = await getTranslations("city");
  const [weather, air] = await Promise.all([
    getCityWeather(cityName),
    getCityAirQuality(cityName),
  ]);

  if (!weather && !air) return null;

  return (
    <section className="mt-8 border border-glass-line bg-shelf px-5 py-4">
      <h2 className="font-display text-lg text-bright">{t("liveNow")}</h2>

      <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-4">
        {weather?.temperature !== null && weather && (
          <div>
            <dt className="text-[13px] text-muted">
              {t("weatherStation")} · {weather.station}
            </dt>
            <dd className="mt-0.5 font-display text-2xl text-bright">
              {formatNumber(weather.temperature!, locale, 1)} °C
            </dd>
            <dd className="text-xs text-muted">
              {weather.humidity !== null && `${formatNumber(weather.humidity, locale, 0)}% · `}
              {weather.measuredAt}
            </dd>
          </div>
        )}

        {air?.index !== null && air && (
          <div>
            <dt className="text-[13px] text-muted">{t("airStations", { count: air.stationCount })}</dt>
            <dd className="mt-0.5 font-display text-2xl text-bright">
              {air.category ?? formatNumber(air.index!, locale, 1)}
            </dd>
            <dd className="text-xs text-muted">
              {air.stationNames.slice(0, 2).join(", ")}
              {air.stationNames.length > 2 && ` +${air.stationNames.length - 2}`}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
