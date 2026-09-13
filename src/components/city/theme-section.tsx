import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { IndicatorReading, Theme } from "@/lib/queries";
import { IndicatorRow } from "./indicator-row";

export async function ThemeSection({
  theme,
  readings,
  locale,
}: {
  theme: Theme;
  readings: IndicatorReading[];
  locale: Locale;
}) {
  const t = await getTranslations("themes");
  if (!readings.length) return null;

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-bright">{t(theme)}</h2>
      <div className="mt-3 border-t border-glass-line">
        {readings.map((reading) => (
          <IndicatorRow key={reading.indicator.code} reading={reading} locale={locale} />
        ))}
      </div>
    </section>
  );
}
