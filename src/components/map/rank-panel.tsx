"use client";

import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { RAMP_HEX } from "@/lib/map-scale";
import { cityEmblem } from "@/lib/emblems";
import { Emblem } from "@/components/chrome/emblem";

export type RankRow = {
  slug: string;
  name: string;
  formatted: string;
  /** Position on the colour ramp, 0 to 1. */
  intensity: number;
};

/**
 * Every city on the current measure, ranked.
 *
 * The map answers "where", this answers "how much, exactly, and in what order".
 * It also keeps the layout balanced: without it the right half of the screen
 * would sit empty until someone clicked a city, and the map would be pushed
 * off-centre by a control panel on one side only.
 *
 * Each row carries the same colour the city has on the map, so a reader can
 * move between the two without re-learning the scale.
 */
export function RankPanel({
  metricLabel,
  rows,
  hovered,
  onHover,
  onSelect,
  onClearFilters,
}: {
  metricLabel: string;
  rows: RankRow[];
  hovered: string | null;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string) => void;
  onClearFilters: () => void;
}) {
  const ui = useTranslations("map");

  return (
    <div className="glass flex max-h-[68vh] w-full flex-col overflow-hidden rounded-2xl lg:w-[300px] lg:max-h-[calc(100dvh_-_172px)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-glass-line px-4 py-3">
        <h2 className="min-w-0 truncate text-[13px] text-bright">{metricLabel}</h2>
        <span className="shrink-0 text-[11px] text-faint">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        // An empty result should say how to get out of it, not just report it.
        <div className="px-4 py-6">
          <p className="text-[12.5px] leading-relaxed text-muted">{ui("noMatches")}</p>
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-3 flex items-center gap-1.5 rounded-xl bg-glass-hover px-3 py-1.5 text-[12.5px] text-bright transition-colors hover:bg-glass-line"
          >
            <RotateCcw size={13} strokeWidth={2} />
            {ui("clearFilters")}
          </button>
        </div>
      ) : (
        <ol className="thin-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
          {rows.map((row, i) => {
            const isHovered = row.slug === hovered;
            const swatch = RAMP_HEX[Math.min(Math.round(row.intensity * (RAMP_HEX.length - 1)), RAMP_HEX.length - 1)];
            const arms = cityEmblem(row.slug);
            return (
              <li key={row.slug}>
                <button
                  type="button"
                  onClick={() => onSelect(row.slug)}
                  onMouseEnter={() => onHover(row.slug)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(row.slug)}
                  onBlur={() => onHover(null)}
                  className={
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-start transition-colors " +
                    (isHovered ? "bg-glass-hover" : "hover:bg-glass-hover")
                  }
                >
                  <span className="w-5 shrink-0 text-end text-[11px] text-faint">{i + 1}</span>
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: swatch }}
                  />
                  {/* The arms sit between the value's colour and the name
                      because that is the order the eye wants them: how much,
                      which place, what figure. */}
                  {arms && <Emblem emblem={arms} size={16} />}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-bright">{row.name}</span>
                  <span className="shrink-0 text-[12px] text-muted">{row.formatted}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
