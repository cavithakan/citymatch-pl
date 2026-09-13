"use client";

import { useTranslations } from "next-intl";
import { GitCompare, Info, Maximize2, Search, Tag, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LocaleSwitch } from "@/components/chrome/locale-switch";

/**
 * The top bar: identity, search, and the switches that change what the map
 * shows rather than what it measures.
 *
 * Search sits here rather than in the filter panel because it is the one
 * control a reader reaches for without knowing what else the interface offers.
 *
 * Laid out as three equal columns rather than a flex row. In a flex row the
 * search field starts wherever the logo happens to end, so it reads as shoved
 * to one side and its centre drifts with the length of the wordmark. Equal
 * columns put it on the axis of the screen and hold it there.
 */
export function TopBar({
  query,
  onQueryChange,
  showLabels,
  onToggleLabels,
  canReset,
  onReset,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  /** True once the view has been panned, turned, zoomed or focused on a city. */
  canReset: boolean;
  onReset: () => void;
}) {
  const ui = useTranslations("map");
  const nav = useTranslations("nav");

  return (
    /* Two rows on a phone, where three equal columns would leave the search
       field too narrow to type a city name into; one row from sm upward. */
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 grid grid-cols-2 items-start gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-4">
      <div className="glass pointer-events-auto col-start-1 row-start-1 justify-self-start rounded-2xl px-3.5 py-2.5">
        <p className="whitespace-nowrap font-display text-[15px] leading-none text-bright">
          CityMatch <span className="text-brass">PL</span>
        </p>
      </div>

      <div className="glass pointer-events-auto relative col-span-2 row-start-2 flex w-full min-w-0 items-center rounded-2xl sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:max-w-[440px] sm:justify-self-center">
        <Search
          size={16}
          strokeWidth={2}
          className="pointer-events-none absolute start-3.5 text-faint"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={ui("searchCity")}
          className="w-full rounded-2xl bg-transparent py-2.5 pe-9 ps-10 text-[13.5px] text-bright placeholder:text-faint focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label={ui("close")}
            className="absolute end-3 rounded-full p-0.5 text-faint transition-colors hover:text-bright"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="glass pointer-events-auto col-start-2 row-start-1 flex items-center gap-0.5 justify-self-end rounded-2xl p-1.5 sm:col-start-3">
        <button
          type="button"
          onClick={onToggleLabels}
          aria-pressed={showLabels}
          title={ui("allLabels")}
          className={
            "rounded-xl p-2 transition-colors " +
            (showLabels ? "bg-brass/20 text-brass" : "text-faint hover:bg-glass-hover hover:text-bright")
          }
        >
          <Tag size={15} strokeWidth={1.9} />
        </button>

        {/*
          The way back, kept with the other view controls rather than floating
          over the map. Panning and turning are what make the dense clusters
          reachable, and they are also how a reader ends up in a corner of
          Mazovia with no idea how to undo it. It appears only once the view
          has actually moved, so it is absent exactly when it would be noise.
        */}
        {canReset && (
          <button
            type="button"
            onClick={onReset}
            title={ui("resetView")}
            aria-label={ui("resetView")}
            className="rounded-xl p-2 text-brass transition-colors hover:bg-glass-hover"
          >
            <Maximize2 size={15} strokeWidth={1.9} />
          </button>
        )}

        <Link
          href="/compare"
          title={nav("compare")}
          className="rounded-xl p-2 text-faint transition-colors hover:bg-glass-hover hover:text-bright"
        >
          <GitCompare size={15} strokeWidth={1.9} />
        </Link>
        <Link
          href="/about"
          title={nav("about")}
          className="rounded-xl p-2 text-faint transition-colors hover:bg-glass-hover hover:text-bright"
        >
          <Info size={15} strokeWidth={1.9} />
        </Link>

        <span className="mx-0.5 h-4 w-px bg-glass-line" />

        <LocaleSwitch compact />
      </div>
    </div>
  );
}
