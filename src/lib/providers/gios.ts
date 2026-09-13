import { fetchCached } from "../cache";

/**
 * Air quality from GIOŚ, the Chief Inspectorate of Environmental Protection.
 *
 * Two things shape this module:
 *
 * 1. The v1 API returns Polish field names, spaces and diacritics included
 *    ("Wartość indeksu"), wrapped in a JSON-LD-ish envelope whose top-level key
 *    is also Polish. The mapping to plain fields happens here so nothing else
 *    has to know.
 *
 * 2. The service answers `Accept: application/json` with 406 Not Acceptable —
 *    its payload is JSON-LD, and it will not negotiate down to plain JSON. No
 *    Accept header is sent at all, which is what a browser or curl does and
 *    what the service expects.
 *
 * 3. A city is not a station. Kraków has nine, spread across valley and hill
 *    districts that genuinely differ. Picking one would misrepresent the city,
 *    so every station in the city is averaged and the count is reported
 *    alongside, letting the page say what the number is made of.
 */

const BASE = "https://api.gios.gov.pl/pjp-api/v1/rest";

type RawStation = Record<string, unknown>;

export type Station = {
  id: number;
  name: string;
  city: string;
  lat: number;
  lon: number;
};

/**
 * The Polish air quality index runs 0 to 5. It is an ordinal scale, so the
 * average across a city's stations is a comparison aid rather than a reading
 * any single station produced — the band below is derived from the rounded
 * average so the words and the number always agree.
 */
/**
 * The index runs 0 to 5. GIOŚ reports -1 for a station that has no index for
 * the hour — a sensor offline, or too few readings to compute one — so any
 * value outside the scale is a status code, not a measurement, and averaging it
 * in drags a city's figure below zero.
 */
const INDEX_MIN = 0;
const INDEX_MAX = 5;

const INDEX_BANDS = [
  "Bardzo dobry",
  "Dobry",
  "Umiarkowany",
  "Dostateczny",
  "Zły",
  "Bardzo zły",
] as const;

export type AirQuality = {
  /** Mean index across the city's stations, 0 (very good) to 5 (very bad). */
  index: number | null;
  /** Band matching the rounded mean. */
  category: string | null;
  /** The worst single station, which is what someone living there may breathe. */
  worst: number | null;
  pm25: number | null;
  pm10: number | null;
  stationCount: number;
  stationNames: string[];
};

/** Read the first key whose name contains all the given fragments. */
function pick(row: RawStation, ...fragments: string[]): unknown {
  const key = Object.keys(row).find((k) => fragments.every((f) => k.includes(f)));
  return key ? row[key] : undefined;
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A reading, or null when the API returned a status code in its place. */
function toIndex(v: unknown): number | null {
  const n = toNumber(v);
  return n !== null && n >= INDEX_MIN && n <= INDEX_MAX ? n : null;
}

async function loadStations(): Promise<Station[]> {
  const data = await fetchCached("GIOS", "stations", async () => {
    const res = await fetch(`${BASE}/station/findAll?size=1000`);
    if (!res.ok) throw new Error(`GIOŚ stations: ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  });
  if (!data) return [];

  // The array sits under a Polish key whose exact wording has changed between
  // releases, so find it by shape rather than by name.
  const list = Object.values(data).find(Array.isArray) as RawStation[] | undefined;
  if (!list) return [];

  return list.flatMap((row) => {
    const id = toNumber(pick(row, "Identyfikator", "stacji"));
    const name = pick(row, "Nazwa", "stacji");
    const city = pick(row, "Nazwa", "miasta");
    const lat = toNumber(pick(row, "φ"));
    const lon = toNumber(pick(row, "λ"));
    if (id === null || typeof name !== "string" || typeof city !== "string") return [];
    return [{ id, name, city, lat: lat ?? 0, lon: lon ?? 0 }];
  });
}

async function loadIndex(stationId: number) {
  return fetchCached("GIOS", `index:${stationId}`, async () => {
    const res = await fetch(`${BASE}/aqindex/getIndex/${stationId}`);
    if (!res.ok) throw new Error(`GIOŚ index ${stationId}: ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  });
}

/** Average air quality across every GIOŚ station inside one city. */
export async function getCityAirQuality(cityName: string): Promise<AirQuality | null> {
  const stations = await loadStations();
  const inCity = stations.filter((s) => s.city === cityName);
  if (!inCity.length) return null;

  const indices: number[] = [];
  const pm25: number[] = [];
  const pm10: number[] = [];

  for (const station of inCity) {
    const raw = await loadIndex(station.id);
    if (!raw) continue;
    const body = (raw.AqIndex ?? raw) as RawStation;

    const overall = toIndex(pick(body, "Wartość indeksu"));
    if (overall !== null) indices.push(overall);
    const p25 = toIndex(pick(body, "Wartość indeksu dla wskaźnika PM2.5"));
    if (p25 !== null) pm25.push(p25);
    const p10 = toIndex(pick(body, "Wartość indeksu dla wskaźnika PM10"));
    if (p10 !== null) pm10.push(p10);
  }

  if (!indices.length) return null;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const average = mean(indices)!;
  const band = INDEX_BANDS[Math.round(average)] ?? null;

  return {
    index: average,
    category: band,
    worst: Math.max(...indices),
    pm25: mean(pm25),
    pm10: mean(pm10),
    stationCount: inCity.length,
    stationNames: inCity.map((s) => s.name),
  };
}
