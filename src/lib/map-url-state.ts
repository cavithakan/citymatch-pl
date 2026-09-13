/**
 * The map's state lives in the address bar.
 *
 * Without this, the application has one URL: choosing a measure, opening a
 * city or filtering to a region leaves no trace, the browser's back button does
 * nothing, and nobody can send anyone else what they are looking at. Those are
 * the three things people expect from a page, and a canvas is not an excuse for
 * dropping them.
 *
 * Keys are short because they end up in shared links.
 */
export const MAP_PARAMS = {
  metric: "m",
  city: "c",
  /** A land county, which is a different kind of selection from a city. */
  county: "p",
  query: "q",
  region: "r",
  labels: "l",
} as const;

export type MapState = {
  metric: string | null;
  city: string | null;
  county: string | null;
  query: string;
  region: string | null;
  showAllLabels: boolean;
};

type ParamBag = { [key: string]: string | string[] | undefined };

const first = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/** Read state out of Next's searchParams, server or client. */
export function readMapState(params: ParamBag): MapState {
  return {
    metric: first(params[MAP_PARAMS.metric]),
    city: first(params[MAP_PARAMS.city]),
    county: first(params[MAP_PARAMS.county]),
    query: first(params[MAP_PARAMS.query]) ?? "",
    region: first(params[MAP_PARAMS.region]),
    showAllLabels: first(params[MAP_PARAMS.labels]) === "1",
  };
}

/**
 * Serialise state back to a query string.
 *
 * Defaults are omitted so the common case stays a clean URL, and so a link
 * someone shares does not pin settings they never chose.
 */
export function writeMapState(state: MapState, defaultMetric: string): string {
  const params = new URLSearchParams();
  if (state.metric && state.metric !== defaultMetric) params.set(MAP_PARAMS.metric, state.metric);
  if (state.city) params.set(MAP_PARAMS.city, state.city);
  if (state.county) params.set(MAP_PARAMS.county, state.county);
  if (state.query.trim()) params.set(MAP_PARAMS.query, state.query.trim());
  if (state.region) params.set(MAP_PARAMS.region, state.region);
  if (state.showAllLabels) params.set(MAP_PARAMS.labels, "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}
