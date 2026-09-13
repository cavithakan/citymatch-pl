"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { List, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatValue } from "@/lib/format";
import { writeMapState, type MapState } from "@/lib/map-url-state";
import { rankByIndicator } from "@/lib/scoring/score";
import type { CountyData } from "@/lib/queries";
import type { MapCounty } from "./poland-map";
import { FilterPanel, type MetricOption } from "./filter-panel";
import { CityPanel, type PanelCity, type PanelIndicator } from "./city-panel";
import { CountyPanel } from "./county-panel";
import { TopBar } from "./top-bar";
import { KpiBar } from "./kpi-bar";
import { RankPanel, type RankRow } from "./rank-panel";
import { MapSkeleton } from "./map-skeleton";

// Three.js reaches for window at import time, so the scene is browser-only.
const PolandMap = dynamic(() => import("./poland-map").then((m) => m.PolandMap), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

type Props = {
  cities: PanelCity[];
  /** The land counties between the cities, so the map has data everywhere. */
  counties: CountyData[];
  /** Coordinates keyed by slug, for placing the bars. */
  coordinates: Record<string, { lat: number; lon: number }>;
  indicators: PanelIndicator[];
  defaultMetric: string;
  locale: Locale;
  /** State read from the URL on the server, so a shared link renders correctly. */
  initial: MapState;
};

/**
 * The application shell.
 *
 * Everything lives on one screen: the map fills the viewport and the panels
 * float over it. Selecting a city opens a panel rather than navigating, so the
 * reader never loses the map they were reading — the full profile page is still
 * there for anyone who wants to link to a city or print it.
 */
export function MapShell({
  cities,
  counties,
  coordinates,
  indicators,
  defaultMetric,
  locale,
  initial,
}: Props) {
  const ui = useTranslations("map");

  const router = useRouter();
  const pathname = usePathname();

  const [metric, setMetric] = useState(initial.metric ?? defaultMetric);
  const [selected, setSelected] = useState<string | null>(initial.city);
  /**
   * The open county, held apart from the open city.
   *
   * One slot would be simpler and wrong: the two open different panels, the
   * camera flies to a city and not to a county, and a slug alone cannot say
   * which kind of place it names — there is a powiat grodziski and no city of
   * that name, but nothing guarantees that stays true.
   */
  const [selectedCounty, setSelectedCounty] = useState<string | null>(initial.county);
  const [query, setQuery] = useState(initial.query);
  const [voivodeship, setVoivodeship] = useState<string | null>(initial.region);
  /**
   * Phones have no room for two permanent panels, so both become sheets that
   * open on demand. Without the list, a phone reader could only tap unlabelled
   * shapes; browsing the country by name has to stay possible on the device
   * most people will open this on.
   */
  const [sheet, setSheet] = useState<"filters" | "list" | null>(null);
  const [showAllLabels, setShowAllLabels] = useState(initial.showAllLabels);
  /** Shared between the map and the ranked list, so pointing at one lights the other. */
  const [hovered, setHovered] = useState<string | null>(null);

  const byCode = useMemo(() => new Map(indicators.map((i) => [i.code, i])), [indicators]);
  const active = byCode.get(metric);

  const voivodeships = useMemo(
    () => [...new Set(cities.map((c) => c.voivodeship))].sort((a, b) => a.localeCompare(b, locale)),
    [cities, locale],
  );

  /**
   * Ranks are computed over every city, never over the filtered set: "4th of
   * 66" has to mean the same thing whatever is currently on screen.
   */
  const ranks = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const indicator of indicators) {
      const entries = cities
        .filter((c) => typeof c.values[indicator.code] === "number")
        .map((c, i) => ({ id: i, slug: c.slug, value: c.values[indicator.code] }));
      if (!entries.length) continue;
      const ranked = rankByIndicator(entries, indicator.direction);
      out.set(indicator.code, new Map(entries.map((e) => [e.slug, ranked.get(e.id)!])));
    }
    return out;
  }, [cities, indicators]);

  /**
   * County ranks, over every powiat in Poland rather than over the counties.
   *
   * A county's position means little against the other counties alone — the
   * cities are where the top of most of these distributions actually is, and a
   * ranking that leaves them out would tell a reader powiat piaseczyński is
   * first on salary when what it is, is first among the places that are not
   * cities. The panel labels the denominator, so nothing is ambiguous.
   */
  const countyRanks = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    const totals = new Map<string, number>();

    for (const indicator of indicators) {
      const entries = [...cities, ...counties]
        .filter((u) => typeof u.values[indicator.code] === "number")
        .map((u, i) => ({ id: i, slug: u.slug, value: u.values[indicator.code] }));
      if (!entries.length) continue;
      const ranked = rankByIndicator(entries, indicator.direction);
      out.set(indicator.code, new Map(entries.map((e) => [e.slug, ranked.get(e.id)!])));
      totals.set(indicator.code, entries.length);
    }
    return { ranks: out, totals };
  }, [cities, counties, indicators]);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return new Set(
      cities
        .filter((c) => !voivodeship || c.voivodeship === voivodeship)
        .filter((c) => !needle || c.name.toLocaleLowerCase(locale).includes(needle))
        .map((c) => c.slug),
    );
  }, [cities, query, voivodeship, locale]);

  /**
   * Cities filtered out keep their polygon but lose their value, so they sit
   * flat and unlit. Removing them outright would punch holes in the country and
   * cost the geographic context the filter is meant to be read against.
   */
  const regions = useMemo(
    () =>
      cities.map((c) => {
        const raw = c.values[metric];
        const inScope = matches.has(c.slug) && typeof raw === "number";
        return {
          slug: c.slug,
          name: c.name,
          lat: coordinates[c.slug]?.lat ?? 0,
          lon: coordinates[c.slug]?.lon ?? 0,
          value: inScope ? raw : null,
          formatted: inScope && active ? formatValue(raw, active.unit, locale) : null,
        };
      }),
    [cities, coordinates, metric, matches, active, locale],
  );

  /**
   * The same measure for the counties.
   *
   * Not filtered by the search box or the region picker: those narrow which
   * cities are being considered, and narrowing the ground underneath them as
   * well would leave the reader comparing a shortlist against a blank country.
   */
  const countyRegions = useMemo(
    () =>
      counties.map((c) => {
        const raw = c.values[metric];
        const has = typeof raw === "number";
        return {
          slug: c.slug,
          name: c.name,
          value: has ? raw : null,
          formatted: has && active ? formatValue(raw, active.unit, locale) : null,
        };
      }),
    [counties, metric, active, locale],
  );

  /** Highest, lowest and middle on the current measure, across what is shown. */
  const summary = useMemo(() => {
    if (!active) return null;
    const scored = regions
      .filter((r): r is typeof r & { value: number } => r.value !== null)
      .sort((a, b) => b.value - a.value);
    if (!scored.length) return null;

    const values = scored.map((r) => r.value);
    const mid = Math.floor(values.length / 2);
    const medianValue =
      values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

    const top = scored[0];
    const bottom = scored[scored.length - 1];
    return {
      low: formatValue(Math.min(...values), active.unit, locale),
      high: formatValue(Math.max(...values), active.unit, locale),
      median: formatValue(medianValue, active.unit, locale),
      highest: { slug: top.slug, name: top.name, formatted: top.formatted ?? "" },
      lowest: { slug: bottom.slug, name: bottom.name, formatted: bottom.formatted ?? "" },
      count: scored.length,
      // Cities the filters keep but the measure does not cover. Counted apart
      // from the filtered-out ones, because "GUS does not publish this here"
      // and "you filtered this away" are different statements and the legend
      // must not merge them.
      missing: cities.filter(
        (c) => matches.has(c.slug) && typeof c.values[metric] !== "number",
      ).length,
    };
  }, [regions, active, locale, cities, matches, metric]);

  const rankRows: RankRow[] = useMemo(() => {
    if (!active || !summary) return [];
    const scored = regions.filter(
      (r): r is typeof r & { value: number } => r.value !== null,
    );
    // Same equal-count classification the map uses, so a city's swatch here is
    // the colour it has on the country.
    const ascending = [...scored].sort((a, b) => a.value - b.value);
    const intensity = new Map(
      ascending.map((r, i) => [r.slug, ascending.length === 1 ? 0.5 : i / (ascending.length - 1)]),
    );

    return [...scored]
      // Best first, which for a cost indicator means the lowest number.
      .sort((a, b) => (active.direction === "BENEFIT" ? b.value - a.value : a.value - b.value))
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        formatted: r.formatted ?? "",
        intensity: intensity.get(r.slug) ?? 0.5,
      }));
  }, [regions, active, summary]);

  const selectedCity = selected ? cities.find((c) => c.slug === selected) : undefined;
  const openCounty = selectedCounty
    ? counties.find((c) => c.slug === selectedCounty)
    : undefined;

  /**
   * Mirror state into the URL.
   *
   * `replace` rather than `push` for typing and slider-like changes, so the
   * back button steps between places the reader chose to go rather than every
   * keystroke. Selecting a city does push, because "go back to the map" is a
   * thing people expect back to do.
   */
  const state: MapState = useMemo(
    () => ({
      metric,
      city: selected,
      county: selectedCounty,
      query,
      region: voivodeship,
      showAllLabels,
    }),
    [metric, selected, selectedCounty, query, voivodeship, showAllLabels],
  );

  const lastPushed = useRef(initial.city);
  useEffect(() => {
    const url = `${pathname}${writeMapState(state, defaultMetric)}`;
    const cityChanged = state.city !== lastPushed.current;
    lastPushed.current = state.city;
    if (cityChanged && state.city) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }, [state, pathname, router, defaultMetric]);

  const clearFilters = useCallback(() => {
    setQuery("");
    setVoivodeship(null);
  }, []);

  /**
   * View framing, owned here because the control that restores it lives in the
   * top bar rather than inside the canvas — over the map it collided with the
   * ranked panel, which is the one place on screen it must not be.
   */
  /** What the pointer is over in the country between the cities. */
  const [hoveredCounty, setHoveredCounty] = useState<MapCounty | null>(null);
  const [viewMoved, setViewMoved] = useState(false);
  const [resetToken, setResetToken] = useState(0);

  const resetView = useCallback(() => {
    setSelected(null);
    setSelectedCounty(null);
    setViewMoved(false);
    setResetToken((n) => n + 1);
  }, []);

  /** Opening a county puts away whatever else was open, and the reverse. */
  const handleCountySelect = useCallback((slug: string | null) => {
    setSelectedCounty(slug);
    if (slug) {
      setSelected(null);
      setSheet(null);
    }
  }, []);

  const handleSelect = useCallback((slug: string | null) => {
    setSelected(slug);
    if (slug) setSelectedCounty(null);
    // On a phone the sheets share the bottom of the screen, so opening a city
    // puts the others away rather than stacking them.
    if (slug) setSheet(null);
  }, []);

  const metricOptions: MetricOption[] = indicators
    .filter((i) => i.role === "SCORED" || i.code === "population")
    .map((i) => ({ code: i.code, label: i.label, theme: i.theme, unit: i.unit }));

  return (
    <div className="fixed inset-0 overflow-hidden bg-abyss">
      <PolandMap
        regionsUrl="/geo/poland-cities.geojson"
        backgroundUrl="/geo/poland-voivodeships.geojson"
        countiesUrl="/geo/poland-powiats.geojson"
        counties={countyRegions}
        onCountyHover={setHoveredCounty}
        onCountySelect={handleCountySelect}
        selectedCounty={selectedCounty}
        regions={regions}
        selected={selected}
        onSelect={handleSelect}
        onHover={setHovered}
        externalHover={hovered}
        showAllLabels={showAllLabels}
        resetToken={resetToken}
        onViewMoved={setViewMoved}
      />

      <TopBar
        query={query}
        onQueryChange={setQuery}
        showLabels={showAllLabels}
        onToggleLabels={() => setShowAllLabels((v) => !v)}
        canReset={viewMoved || Boolean(selected) || Boolean(selectedCounty)}
        onReset={resetView}
      />

      {/* Phone-only controls. The measure is on the left because it is what the
          colours mean; the city list is on the right because it is the way in
          for anyone who knows the name but not the shape. */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-2 p-3 lg:hidden">
        <button
          type="button"
          onClick={() => setSheet((v) => (v === "filters" ? null : "filters"))}
          aria-expanded={sheet === "filters"}
          className="glass flex min-w-0 items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] text-bright"
        >
          {sheet === "filters" ? (
            <X size={15} strokeWidth={2} className="shrink-0" />
          ) : (
            <SlidersHorizontal size={15} strokeWidth={2} className="shrink-0" />
          )}
          <span className="truncate">{active?.label ?? ui("filters")}</span>
        </button>

        <button
          type="button"
          onClick={() => setSheet((v) => (v === "list" ? null : "list"))}
          aria-expanded={sheet === "list"}
          aria-label={ui("cityList")}
          className="glass flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] text-bright"
        >
          {sheet === "list" ? <X size={15} strokeWidth={2} /> : <List size={15} strokeWidth={2} />}
          <span>{matches.size}</span>
        </button>
      </div>

      {/* Controls on the left, detail on the right — the country stays between.
          Below the large breakpoint both become sheets anchored to the bottom. */}
      <div
        className={
          "pointer-events-none absolute z-20 flex flex-col p-4 " +
          "inset-x-0 bottom-16 h-[56vh] " +
          "lg:inset-y-0 lg:end-auto lg:start-0 lg:bottom-auto lg:h-auto lg:max-h-full lg:justify-start lg:pb-24 lg:pt-[76px] " +
          (sheet === "filters" ? "" : "hidden lg:flex")
        }
      >
        <div className="pointer-events-auto flex min-h-0 flex-col">
          <FilterPanel
            metrics={metricOptions}
            active={metric}
            onSelectMetric={setMetric}
            voivodeships={voivodeships}
            activeVoivodeship={voivodeship}
            onSelectVoivodeship={setVoivodeship}
            matchCount={matches.size}
          />
        </div>
      </div>

      {/* The right column is never empty: the ranked list holds the space when
          no city is open, which is what keeps the map centred. */}
      <div
        className={
          "pointer-events-none absolute z-20 flex flex-col p-4 " +
          "inset-x-0 bottom-16 h-[56vh] justify-end " +
          "lg:inset-y-0 lg:start-auto lg:end-0 lg:bottom-auto lg:h-auto lg:max-h-full lg:justify-start lg:pb-24 lg:pt-[76px] " +
          (selectedCity || openCounty || sheet === "list" ? "" : "hidden lg:flex")
        }
      >
        <div className="pointer-events-auto flex min-h-0 flex-col">
          {openCounty ? (
            <CountyPanel
              county={openCounty}
              indicators={indicators}
              ranks={countyRanks.ranks}
              rankedTotal={countyRanks.totals}
              activeMetric={metric}
              locale={locale}
              onClose={() => setSelectedCounty(null)}
            />
          ) : selectedCity ? (
            <CityPanel
              city={selectedCity}
              indicators={indicators}
              ranks={ranks}
              activeMetric={metric}
              locale={locale}
              onClose={() => setSelected(null)}
            />
          ) : (
            active && (
              <RankPanel
                metricLabel={active.label}
                rows={rankRows}
                hovered={hovered}
                onHover={setHovered}
                onSelect={handleSelect}
                onClearFilters={clearFilters}
              />
            )
          )}
        </div>
      </div>

      {active && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden flex-col items-center gap-2 p-4 lg:flex">
          {/*
            The county readout.
            
            Counties are painted but not listed, pinned or named, so without
            this the ground between the cities is colour the reader cannot
            interrogate — which is its own kind of dishonesty: a map that shows
            a value and will not say what it is. It appears only on hover, so
            the country stays quiet until asked.
          */}
          {hoveredCounty && (
            <div className="glass flex items-baseline gap-2.5 rounded-full px-3.5 py-1.5">
              <span className="text-[12.5px] text-bright">{hoveredCounty.name}</span>
              <span className="text-[12.5px] text-muted">
                {hoveredCounty.formatted ?? ui("noData")}
              </span>
            </div>
          )}

          <div className="pointer-events-auto">
            <KpiBar
              metricLabel={active.label}
              summary={summary}
              onSelect={handleSelect}
            />
          </div>
        </div>
      )}

    </div>
  );
}
