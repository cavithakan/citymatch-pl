"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ScoredCity } from "@/lib/scoring/score";

/**
 * The ranking, with each city's score broken into the six themes that produced
 * it.
 *
 * The bar under each row is not decoration: its segments are the per-theme
 * contributions, so their widths add up to the score itself. A reader who
 * disagrees with a ranking can see which theme carried it and move that slider.
 */
export function ScoreTable({ cities }: { cities: ScoredCity[] }) {
  const t = useTranslations("compare");
  const themes = useTranslations("themes");

  /** One colour per theme, distinguishable against the dark panel. */
  const SEGMENT_COLORS: Record<string, string> = {
    EARNINGS: "#4a7c94",
    HOUSING: "#d94f43",
    LABOUR: "#7fa298",
    SAFETY: "#9b7bb0",
    ENVIRONMENT: "#3f9d86",
    LIVING: "#f0b752",
  };

  return (
    <ol className="border-t border-glass-line">
      {cities.map((city) => (
        <li key={city.slug} className="border-b border-glass-line py-4">
          <div className="flex items-baseline justify-between gap-4">
            <Link
              href={`/city/${city.slug}`}
              className="font-display text-lg text-bright hover:underline"
            >
              <span className="text-muted">{city.rank}.</span> {city.name}
            </Link>
            <span className="text-[15px] font-medium text-bright">{city.score.toFixed(1)}</span>
          </div>

          <div className="mt-2 flex h-2 w-full overflow-hidden bg-glass-line">
            {city.themes.map((theme) => (
              <div
                key={theme.theme}
                style={{
                  width: `${theme.contribution}%`,
                  backgroundColor: SEGMENT_COLORS[theme.theme],
                }}
                title={`${themes(theme.theme)}: ${theme.contribution.toFixed(1)}`}
              />
            ))}
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
            {city.themes
              .filter((theme) => theme.weight > 0)
              .map((theme) => (
                <div key={theme.theme} className="flex items-baseline gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 shrink-0"
                    style={{ backgroundColor: SEGMENT_COLORS[theme.theme] }}
                  />
                  <dt>{themes(theme.theme)}</dt>
                  <dd className="text-bright">{theme.contribution.toFixed(1)}</dd>
                </div>
              ))}
          </dl>
          <p className="sr-only">{t("whyThisRank")}</p>
        </li>
      ))}
    </ol>
  );
}
