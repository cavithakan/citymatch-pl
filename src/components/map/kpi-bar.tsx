"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Equal, MapPin } from "lucide-react";
import { RAMP_HEX } from "@/lib/map-scale";

export type KpiCity = { slug: string; name: string; formatted: string };

/**
 * The bottom strip: what the current measure looks like across the country.
 *
 * The map shows where the extremes are; this says what they are. Both ends plus
 * the middle is the smallest summary that stops a reader misjudging the scale —
 * a ramp alone tells you the colours, not what they are worth.
 */
export function KpiBar({
  metricLabel,
  summary,
  onSelect,
}: {
  metricLabel: string;
  /** Null when the current filters leave nothing to summarise. */
  summary: {
    low: string;
    high: string;
    median: string;
    highest: KpiCity | null;
    lowest: KpiCity | null;
    count: number;
    /** Cities on screen the measure has no published figure for. */
    missing: number;
  } | null;
  onSelect: (slug: string) => void;
}) {
  const ui = useTranslations("map");

  // The strip keeps its place when the filters match nothing. Letting it vanish
  // moves everything else on the screen and makes an ordinary empty result look
  // like a failure, so it stays put and offers the way out instead.
  if (!summary) {
    return (
      <div className="glass flex items-center gap-4 rounded-2xl px-4 py-2.5">
        <div className="flex h-6 items-end gap-[3px] opacity-30">
          {RAMP_HEX.map((hex, i) => (
            <div
              key={hex}
              className="w-4 rounded-[3px]"
              style={{ backgroundColor: hex, height: `${30 + (i / (RAMP_HEX.length - 1)) * 70}%` }}
            />
          ))}
        </div>
        {/* The way out lives in the list panel, where the reader is looking
            for results. Repeating the same button here would be two controls
            for one action. */}
        <p className="text-[12.5px] text-muted">{ui("noMatches")}</p>
      </div>
    );
  }

  const { low, high, median, highest, lowest, count, missing } = summary;

  return (
    <div className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 items-end gap-[3px]">
          {RAMP_HEX.map((hex, i) => (
            <div
              key={hex}
              className="w-4 rounded-[3px] transition-all duration-300"
              style={{
                backgroundColor: hex,
                // The swatches rise as they warm, because height and colour
                // carry the same number on the map itself.
                height: `${30 + (i / (RAMP_HEX.length - 1)) * 70}%`,
              }}
            />
          ))}
        </div>
        <div className="leading-tight">
          <p className="max-w-[180px] truncate text-[11px] text-muted">{metricLabel}</p>
          <p className="text-[10.5px] text-faint">
            {low} to {high}
          </p>
        </div>
      </div>

      <span className="hidden h-7 w-px bg-glass-line sm:block" />

      {highest && (
        <button
          type="button"
          onClick={() => onSelect(highest.slug)}
          className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-glass-hover"
        >
          <ArrowUp size={14} strokeWidth={2.2} className="shrink-0 text-[var(--color-ramp-5)]" />
          <span className="text-start leading-tight">
            <span className="block text-[10.5px] text-faint">{ui("highest")}</span>
            <span className="block text-[12.5px] text-bright">
              {highest.name} <span className="text-muted">{highest.formatted}</span>
            </span>
          </span>
        </button>
      )}

      {lowest && (
        <button
          type="button"
          onClick={() => onSelect(lowest.slug)}
          className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-glass-hover"
        >
          <ArrowDown size={14} strokeWidth={2.2} className="shrink-0 text-[var(--color-ramp-1)]" />
          <span className="text-start leading-tight">
            <span className="block text-[10.5px] text-faint">{ui("lowest")}</span>
            <span className="block text-[12.5px] text-bright">
              {lowest.name} <span className="text-muted">{lowest.formatted}</span>
            </span>
          </span>
        </button>
      )}

      <div className="flex items-center gap-2 px-1.5">
        <Equal size={14} strokeWidth={2.2} className="shrink-0 text-faint" />
        <span className="leading-tight">
          <span className="block text-[10.5px] text-faint">{ui("median")}</span>
          <span className="block text-[12.5px] text-bright">{median}</span>
        </span>
      </div>

      <div className="flex items-center gap-2 px-1.5">
        <MapPin size={14} strokeWidth={2} className="shrink-0 text-faint" />
        <span className="leading-tight">
          <span className="block text-[10.5px] text-faint">{ui("citiesShown")}</span>
          <span className="block text-[12.5px] text-bright">{count}</span>
        </span>
      </div>

      {/* The hollow ring is a symbol on the map, so it is named here rather
          than left for the reader to work out. Shown only when there is
          actually a gap — a legend entry for a category with no members is
          noise. */}
      {missing > 0 && (
        <div className="flex items-center gap-2 px-1.5">
          <span
            aria-hidden="true"
            className="size-[13px] shrink-0 rounded-full border-[1.8px] border-faint"
          />
          <span className="leading-tight">
            <span className="block text-[10.5px] text-faint">{ui("noData")}</span>
            <span className="block text-[12.5px] text-bright">{missing}</span>
          </span>
        </div>
      )}
    </div>
  );
}
