import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { IndicatorReading } from "@/lib/queries";
import { formatDelta, formatValue } from "@/lib/format";
import { RankGauge } from "./rank-gauge";
import { Sparkline } from "./sparkline";

/**
 * One indicator, stated four ways: the figure, where it sits among the 66
 * cities, how far it is from the national middle, and which way it has moved.
 * Each answers a different question, and none of them is the headline on its
 * own.
 */
export async function IndicatorRow({
  reading,
  locale,
}: {
  reading: IndicatorReading;
  locale: Locale;
}) {
  const t = await getTranslations("city");
  const { indicator, value, year, rank, ranked, median, history } = reading;

  const delta = value !== null && median !== null ? formatDelta(value, median, locale) : null;

  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1.5 border-b border-glass-line py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <p className="text-[15px] leading-snug text-bright">{indicator.label}</p>
        {indicator.description && (
          <p className="mt-0.5 max-w-[52ch] text-[13px] leading-snug text-muted">
            {indicator.description}
          </p>
        )}
      </div>

      <div className="text-end">
        {value === null ? (
          <p className="text-[15px] text-muted">{t("noData")}</p>
        ) : (
          <>
            <p className="text-[15px] font-medium text-bright">
              {formatValue(value, indicator.unit, locale)}
            </p>
            <p className="text-xs text-muted">
              {year}
              {delta && indicator.role === "SCORED" ? ` · ${delta} ${t("vsMedian")}` : ""}
            </p>
          </>
        )}
      </div>

      <div className="col-span-2 flex items-center gap-4 sm:col-span-1 sm:justify-end">
        {rank !== null && indicator.role === "SCORED" && (
          <RankGauge rank={rank} total={ranked} label={t("rankOf", { rank, total: ranked })} />
        )}
        {history.length > 1 && (
          <Sparkline
            points={history}
            ariaLabel={`${indicator.label}, ${history[0].year}–${history[history.length - 1].year}`}
          />
        )}
      </div>
    </div>
  );
}
