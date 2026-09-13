"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { formatValue } from "@/lib/format";
import { THEME_ICONS } from "@/lib/theme-icons";
import { THEMES, type Theme } from "@/lib/scoring/score";
import { voivodeshipEmblem } from "@/lib/emblems";
import { Emblem } from "@/components/chrome/emblem";
import { RankBar } from "./rank-bar";
import type { PanelIndicator } from "./city-panel";

export type PanelCounty = {
  slug: string;
  name: string;
  voivodeship: string;
  values: Record<string, number>;
};

/**
 * The detail view for a land county.
 *
 * Counties carry the same eighteen GUS series the cities do, so refusing to
 * open them would have been a map that paints a value on four fifths of the
 * country and will not say what it is when you click. What it deliberately
 * does not offer is the rest of the city apparatus — no full profile, no
 * comparison, no place in the ranking — because the guide is about places you
 * might move to, and a county is the ground those places sit in.
 *
 * Ranks here are out of every powiat in Poland, and say so. A city's ranks are
 * out of the 66 cities. Two denominators would be a trap if either were
 * unlabelled; both are.
 */
export function CountyPanel({
  county,
  indicators,
  ranks,
  rankedTotal,
  activeMetric,
  locale,
  onClose,
}: {
  county: PanelCounty;
  indicators: PanelIndicator[];
  /** indicator code → county slug → rank among all powiats. */
  ranks: Map<string, Map<string, number>>;
  /** How many powiats the ranking covers, per indicator code. */
  rankedTotal: Map<string, number>;
  activeMetric: string;
  locale: Locale;
  onClose: () => void;
}) {
  const t = useTranslations("city");
  const ui = useTranslations("map");
  const themeNames = useTranslations("themes");

  const byCode = new Map(indicators.map((i) => [i.code, i]));
  const active = byCode.get(activeMetric);
  const activeValue = county.values[activeMetric];
  const regionArms = voivodeshipEmblem(county.voivodeship);

  const rankOf = (code: string) => ranks.get(code)?.get(county.slug) ?? null;
  const totalOf = (code: string) => rankedTotal.get(code) ?? 0;

  return (
    <div className="glass animate-panel-in flex max-h-[68vh] w-full flex-col overflow-hidden rounded-2xl lg:w-[300px] lg:max-h-[calc(100dvh_-_172px)]">
      <div className="flex items-start gap-3 border-b border-glass-line p-4">
        <div className="min-w-0 flex-1">
          {/* Wraps rather than truncates. Polish county names run long —
              "powiat warszawski zachodni" loses its last two words to an
              ellipsis at this width — and a place name the reader cannot read
              is not worth putting in a heading. */}
          <h2 className="font-display text-xl leading-tight text-bright">{county.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-faint">
            {regionArms && <Emblem emblem={regionArms} size={13} />}
            {t("inVoivodeship", { voivodeship: county.voivodeship })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={ui("close")}
          className="shrink-0 rounded-full p-1.5 text-faint transition-colors hover:bg-glass-hover hover:text-bright"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        {active && typeof activeValue === "number" && (
          <div className="border-b border-glass-line bg-brass/[0.06] px-4 py-3.5">
            <p className="text-[11px] text-brass">{active.label}</p>
            <p className="mt-1 font-display text-3xl leading-none text-bright">
              {formatValue(activeValue, active.unit, locale)}
            </p>
            {rankOf(active.code) !== null && (
              <div className="mt-2.5">
                <RankBar
                  rank={rankOf(active.code)!}
                  total={totalOf(active.code)}
                  label={t("rankOf", {
                    rank: rankOf(active.code)!,
                    total: totalOf(active.code),
                  })}
                />
              </div>
            )}
          </div>
        )}

        {THEMES.map((theme) => {
          const rows = indicators.filter(
            (i) =>
              i.theme === theme &&
              i.role === "SCORED" &&
              typeof county.values[i.code] === "number",
          );
          if (!rows.length) return null;
          const Icon = THEME_ICONS[theme as Theme];

          return (
            <section key={theme} className="border-t border-glass-line px-4 py-3">
              <h3 className="mb-2 flex items-center gap-2 text-[11px] text-faint">
                <Icon size={13} strokeWidth={1.75} />
                {themeNames(theme)}
              </h3>
              <dl className="space-y-2.5">
                {rows.map((indicator) => {
                  const rank = rankOf(indicator.code);
                  return (
                    <div key={indicator.code} className="text-[12.5px]">
                      <dt className="leading-snug text-muted">{indicator.label}</dt>
                      <dd className="flex items-baseline justify-between gap-3">
                        <span className="text-bright">
                          {formatValue(county.values[indicator.code], indicator.unit, locale)}
                        </span>
                        <span className="shrink-0 text-[11px] text-faint">
                          {rank !== null ? `${rank}/${totalOf(indicator.code)}` : ui("noData")}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          );
        })}
      </div>

      {/* Says what this panel is, so the missing "full profile" button reads as
          a boundary of the guide rather than a feature that failed to load. */}
      <p className="border-t border-glass-line px-4 py-3 text-[11.5px] leading-relaxed text-faint">
        {ui("countyNote")}
      </p>
    </div>
  );
}
