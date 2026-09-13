"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, MapPin } from "lucide-react";
import { THEME_ICONS } from "@/lib/theme-icons";
import type { Theme } from "@/lib/scoring/score";

export type MetricOption = { code: string; label: string; theme: Theme; unit: string };

/**
 * What the map measures, and which cities it keeps lit.
 *
 * Six theme headings collapse twenty-three measures into a list that fits
 * without scrolling, and only the theme holding the current measure is open —
 * the reader sees the shape of what is available before the detail of it.
 */
export function FilterPanel({
  metrics,
  active,
  onSelectMetric,
  voivodeships,
  activeVoivodeship,
  onSelectVoivodeship,
  matchCount,
}: {
  metrics: MetricOption[];
  active: string;
  onSelectMetric: (code: string) => void;
  voivodeships: string[];
  activeVoivodeship: string | null;
  onSelectVoivodeship: (v: string | null) => void;
  matchCount: number;
}) {
  const t = useTranslations("themes");
  const ui = useTranslations("map");
  const [openThemes, setOpenThemes] = useState<Set<Theme>>(new Set());
  const [regionsOpen, setRegionsOpen] = useState(false);

  const grouped = useMemo(() => {
    const out = new Map<Theme, MetricOption[]>();
    for (const metric of metrics) {
      const list = out.get(metric.theme) ?? [];
      list.push(metric);
      out.set(metric.theme, list);
    }
    return [...out.entries()];
  }, [metrics]);

  const activeTheme = metrics.find((m) => m.code === active)?.theme;
  const isOpen = (theme: Theme) => openThemes.has(theme) || theme === activeTheme;

  const toggleTheme = (theme: Theme) => {
    setOpenThemes((prev) => {
      const next = new Set(prev);
      // The theme holding the current measure is open by default, so toggling
      // it has to be able to close it too.
      if (next.has(theme) || theme === activeTheme) next.delete(theme);
      else next.add(theme);
      return next;
    });
  };

  return (
    <div className="glass flex max-h-[58vh] w-full flex-col overflow-hidden rounded-2xl lg:w-[300px] lg:max-h-[calc(100dvh_-_172px)]">
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {grouped.map(([theme, options]) => {
          const Icon = THEME_ICONS[theme];
          const open = isOpen(theme);
          return (
            <div key={theme} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggleTheme(theme)}
                aria-expanded={open}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-glass-hover"
              >
                <Icon
                  size={15}
                  strokeWidth={1.9}
                  className={"shrink-0 " + (open ? "text-brass" : "text-faint")}
                />
                <span className="flex-1 text-[13px] text-bright">{t(theme)}</span>
                <ChevronDown
                  size={14}
                  strokeWidth={2}
                  className={
                    "shrink-0 text-faint transition-transform duration-200 " +
                    (open ? "rotate-180" : "")
                  }
                />
              </button>

              {open && (
                <ul className="ms-[26px] border-s border-glass-line ps-1">
                  {options.map((option) => {
                    const current = option.code === active;
                    return (
                      <li key={option.code}>
                        <button
                          type="button"
                          onClick={() => onSelectMetric(option.code)}
                          aria-current={current ? "true" : undefined}
                          className={
                            "block w-full rounded-lg px-2.5 py-1.5 text-start text-[12.5px] leading-snug transition-colors " +
                            (current
                              ? "bg-brass/15 text-brass"
                              : "text-muted hover:bg-glass-hover hover:text-bright")
                          }
                        >
                          {option.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Region filter, folded away: most readers want the whole country, and
          sixteen voivodeship names is more text than the panel can carry. */}
      <div className="border-t border-glass-line p-2">
        <button
          type="button"
          onClick={() => setRegionsOpen((v) => !v)}
          aria-expanded={regionsOpen}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-glass-hover"
        >
          <MapPin
            size={15}
            strokeWidth={1.9}
            className={"shrink-0 " + (activeVoivodeship ? "text-brass" : "text-faint")}
          />
          <span className="flex-1 truncate text-[13px] text-bright">
            {activeVoivodeship ?? ui("allRegions")}
          </span>
          {/* The badge belongs to the region control, so it only appears when
              a region is actually selected. Showing a search result count of
              zero next to "All regions" reads as a broken control rather than
              an empty result. */}
          {activeVoivodeship && (
            <span className="shrink-0 rounded-full bg-brass/20 px-1.5 py-0.5 text-[10.5px] text-brass">
              {matchCount}
            </span>
          )}
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={
              "shrink-0 text-faint transition-transform duration-200 " +
              (regionsOpen ? "rotate-180" : "")
            }
          />
        </button>

        {regionsOpen && (
          <div className="thin-scroll mt-1 max-h-[168px] overflow-y-auto">
            <div className="flex flex-wrap gap-1 p-1">
              <button
                type="button"
                onClick={() => onSelectVoivodeship(null)}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] transition-colors " +
                  (activeVoivodeship === null
                    ? "bg-brass/20 text-brass"
                    : "bg-glass-hover text-muted hover:text-bright")
                }
              >
                {ui("allRegions")}
              </button>
              {voivodeships.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onSelectVoivodeship(activeVoivodeship === v ? null : v)}
                  className={
                    "rounded-full px-2.5 py-1 text-[11px] transition-colors " +
                    (activeVoivodeship === v
                      ? "bg-brass/20 text-brass"
                      : "bg-glass-hover text-muted hover:text-bright")
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
