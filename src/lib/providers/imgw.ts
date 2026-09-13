import { fetchCached } from "../cache";

/**
 * Current synoptic observations from IMGW, the Institute of Meteorology and
 * Water Management.
 *
 * The endpoint returns every station in Poland in one response — about sixty —
 * so the whole set is cached once and matched locally rather than queried per
 * city. Numbers arrive as strings, and a station that did not report an hour
 * sends an empty string rather than null.
 */

const URL = "https://danepubliczne.imgw.pl/api/data/synop";

type RawReading = {
  id_stacji: string;
  stacja: string;
  data_pomiaru: string;
  godzina_pomiaru: string;
  temperatura: string;
  predkosc_wiatru: string;
  wilgotnosc_wzgledna: string;
  suma_opadu: string;
  cisnienie: string;
};

export type Weather = {
  station: string;
  measuredAt: string;
  temperature: number | null;
  windSpeed: number | null;
  humidity: number | null;
  precipitation: number | null;
};

const toNumber = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * The IMGW station whose name matches this city, if it has one.
 *
 * Only around sixty Polish towns host a synoptic station, so most of the 66
 * cities return null and the page simply omits the live weather block.
 */
export async function getCityWeather(cityName: string): Promise<Weather | null> {
  const readings = await fetchCached("IMGW", "synop", async () => {
    const res = await fetch(URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`IMGW: ${res.status}`);
    return (await res.json()) as RawReading[];
  });
  if (!readings) return null;

  // IMGW writes some names differently from GUS ("Warszawa" vs "Warszawa-Okęcie"),
  // so fall back to a prefix match before giving up.
  const exact = readings.find((r) => r.stacja === cityName);
  const match = exact ?? readings.find((r) => r.stacja.startsWith(cityName));
  if (!match) return null;

  return {
    station: match.stacja,
    measuredAt: `${match.data_pomiaru} ${match.godzina_pomiaru.padStart(2, "0")}:00`,
    temperature: toNumber(match.temperatura),
    windSpeed: toNumber(match.predkosc_wiatru),
    humidity: toNumber(match.wilgotnosc_wzgledna),
    precipitation: toNumber(match.suma_opadu),
  };
}
