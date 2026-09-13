"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatValue } from "@/lib/format";
import { THEME_ICONS } from "@/lib/theme-icons";
import { THEMES, type Theme } from "@/lib/scoring/score";
import { cityEmblem, voivodeshipEmblem } from "@/lib/emblems";
import { Emblem } from "@/components/chrome/emblem";
import { RankBar } from "./rank-bar";

export type PanelIndicator = {
  code: string;
  label: string;
  unit: string;
  theme: Theme;
  direction: "BENEFIT" | "COST";
  role: "SCORED" | "DISPLAY_ONLY" | "INPUT";
};

export type PanelCity = {
  slug: string;
  name: string;
  voivodeship: string;
  values: Record<string, number>;
};

/**
 * The detail view, as a panel over the map rather than a page of its own.
 *
 * Opening a city should not cost the reader the map they were reading — the
 * country stays on screen, the selected city stays lit, and closing the panel
 * returns them exactly where they were.
 */
export function CityPanel({
  city,
  indicators,
  ranks,
  activeMetric,
  locale,
  onClose,
}: {
  city: PanelCity;
  indicators: PanelIndicator[];
  /** indicator code → city slug → rank. */
  ranks: Map<string, Map<string, number>>;
  activeMetric: string;
  locale: Locale;
  onClose: () => void;
}) {
  const t = useTranslations("city");
  const themeNames = useTranslations("themes");
  const ui = useTranslations("map");

  const byCode = useMemo(() => new Map(indicators.map((i) => [i.code, i])), [indicators]);

  const rankOf = (code: string) => ranks.get(code)?.get(city.slug) ?? null;
  const rankedTotal = (code: string) => ranks.get(code)?.size ?? 0;

  const arms = cityEmblem(city.slug);
  const regionArms = voivodeshipEmblem(city.voivodeship);

  const active = byCode.get(activeMetric);
  const activeValue = city.values[activeMetric];

  return (
    <div className="glass animate-panel-in flex max-h-[68vh] w-full flex-col overflow-hidden rounded-2xl lg:w-[300px] lg:max-h-[calc(100dvh_-_172px)]">
      <div className="flex items-start gap-3 border-b border-glass-line p-4">
        {/* The arms, because the figures below describe what a place is like
            and say nothing about what it is. */}
        {arms && <Emblem emblem={arms} size={38} className="mt-0.5" />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-2xl leading-tight text-bright">{city.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-faint">
            {regionArms && <Emblem emblem={regionArms} size={13} />}
            {t("inVoivodeship", { voivodeship: city.voivodeship })}
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
        {/* The measure currently drawn on the map, called out so the panel and
            the country are visibly answering the same question. */}
        {active && typeof activeValue === "number" && (
          <div className="border-b border-glass-line bg-brass/[0.06] px-4 py-3.5">
            <p className="text-[11px] text-brass">{active.label}</p>
            <p className="mt-1 font-display text-3xl leading-none text-bright">
              {formatValue(activeValue, active.unit, locale)}
            </p>
            {rankOf(active.code) !== null && active.role === "SCORED" && (
              <div className="mt-2.5">
                <RankBar
                  rank={rankOf(active.code)!}
                  total={rankedTotal(active.code)}
                  label={t("rankOf", {
                    rank: rankOf(active.code)!,
                    total: rankedTotal(active.code),
                  })}
                />
              </div>
            )}
          </div>
        )}

        {THEMES.map((theme) => {
          const rows = indicators.filter(
            (i) => i.theme === theme && i.role === "SCORED" && typeof city.values[i.code] === "number",
          );
          if (!rows.length) return null;
          const Icon = THEME_ICONS[theme];

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
                    /* Two lines rather than one: at this width a single row
                       truncates almost every indicator name, and a measure
                       whose name the reader cannot read is not worth listing. */
                    <div key={indicator.code} className="text-[12.5px]">
                      <dt className="leading-snug text-muted">{indicator.label}</dt>
                      <dd className="flex items-baseline justify-between gap-3">
                        <span className="text-bright">
                          {formatValue(city.values[indicator.code], indicator.unit, locale)}
                        </span>
                        <span className="shrink-0 text-[11px] text-faint">
                          {rank !== null ? `${rank}/${rankedTotal(indicator.code)}` : "no rank"}
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

      <div className="border-t border-glass-line p-3">
        <Link
          href={`/city/${city.slug}`}
          className="flex items-center justify-center gap-2 rounded-xl bg-glass-hover py-2.5 text-[13px] text-bright transition-colors hover:bg-glass-line"
        >
          {ui("fullProfile")}
          <ExternalLink size={14} strokeWidth={1.75} />
        </Link>
      </div>
    </div>
  );
}
