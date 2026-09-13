/**
 * Builds the two geometry files the 3D map renders from:
 *
 *   data/poland-cities.geojson     66 miasta na prawach powiatu
 *   data/warsaw-districts.geojson  18 Warsaw dzielnice
 *
 * Each feature carries the properties the app needs (slug, BDL unit id,
 * voivodeship, centroid) so the runtime never has to resolve them again.
 *
 * Run once: npm run fetch-geometry
 */
import { writeFile } from "node:fs/promises";
import { searchUnits, variableData, type BdlUnit } from "../src/lib/providers/bdl";

// Administrative boundaries for Poland, published as GeoJSON by ppatrzyk.
// The powiat file contains all 380 powiats; the 66 with city status are the
// ones whose name is "powiat <Proper Noun>" rather than "powiat <adjective>".
const POWIAT_URL =
  "https://raw.githubusercontent.com/ppatrzyk/polska-geojson/master/powiaty/powiaty-medium.geojson";
const WOJ_URL =
  "https://raw.githubusercontent.com/ppatrzyk/polska-geojson/master/wojewodztwa/wojewodztwa-medium.geojson";

/**
 * TERYT voivodeship codes, which every BDL unit id carries at digits 3-4.
 *
 * This is what makes the counties joinable. Ten county names occur twice in
 * Poland — there is a powiat grodziski in Mazovia and another in Greater
 * Poland — so matching the boundary file to BDL on name alone would silently
 * give twenty counties each other's statistics, which is worse than having no
 * statistics for them at all. Name plus voivodeship is unique.
 *
 * Verified against the 66 cities, where both the unit id and the voivodeship
 * were already known: all sixteen prefixes map without ambiguity.
 */
const TERYT_VOIVODESHIPS: Record<string, string> = {
  "02": "dolnośląskie",
  "04": "kujawsko-pomorskie",
  "06": "lubelskie",
  "08": "lubuskie",
  "10": "łódzkie",
  "12": "małopolskie",
  "14": "mazowieckie",
  "16": "opolskie",
  "18": "podkarpackie",
  "20": "podlaskie",
  "22": "pomorskie",
  "24": "śląskie",
  "26": "świętokrzyskie",
  "28": "warmińsko-mazurskie",
  "30": "wielkopolskie",
  "32": "zachodniopomorskie",
};

/**
 * Counties the boundary file and BDL disagree about the name of.
 *
 * Not a data error on either side — a real administrative rename that one
 * source has and the other has not caught up with. powiat jeleniogórski became
 * powiat karkonoski on 1 January 2021; GUS publishes under the new name and
 * the published boundary file still carries the old one.
 *
 * Kept as an explicit table rather than matched fuzzily, because a rename is a
 * fact to be recorded, and a similarity threshold loose enough to pair
 * "jeleniogórski" with "karkonoski" would pair a great deal else besides.
 */
const COUNTY_RENAMES: Record<string, string> = {
  "powiat jeleniogórski": "powiat karkonoski",
};

/**
 * How BDL and the boundary file are matched: name plus voivodeship.
 *
 * The trailing time qualifier is stripped. BDL keeps a superseded unit
 * alongside its replacement when a county's extent changes, distinguishing
 * them as "Powiat jeleniogórski do 2020" and "Powiat jeleniogórski od 2021",
 * so an exact-name match finds neither. This is the same behaviour the city
 * resolver has to allow for, and `unitRank` below picks between the versions
 * by the same rule.
 */
function unitKey(name: string, voivodeship: string): string {
  const bare = name.trim().replace(/\s+(?:do|od)\s+\d{4}$/i, "").toLowerCase();
  return `${COUNTY_RENAMES[bare] ?? bare}|${voivodeship}`;
}

/**
 * Which version of a time-split unit to keep.
 *
 * No qualifier means the unit was never split and is current; "od YYYY" is the
 * current version of one that was; "do YYYY" is always superseded. Higher
 * wins, and among equals the later year.
 */
function unitRank(name: string): { rank: number; year: number } {
  const m = /\s+(do|od)\s+(\d{4})$/i.exec(name.trim());
  if (!m) return { rank: 2, year: 0 };
  return { rank: m[1].toLowerCase() === "od" ? 1 : 0, year: Number(m[2]) };
}

/** Population. Any level-5 variable enumerates the units; this one is universal. */
const POPULATION_VAR_ID = 72305;
const UNIT_PROBE_YEAR = 2023;

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Nominatim's usage policy allows at most one request per second.
const NOMINATIM_GAP_MS = 1100;

type Position = [number, number];
type Ring = Position[];
type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };
type Feature<P> = { type: "Feature"; properties: P; geometry: Geometry };
type FeatureCollection<P> = { type: "FeatureCollection"; features: Feature<P>[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Progress goes to stderr.
 *
 * Node block-buffers stdout the moment it is not a terminal, so a run piped to
 * a file or a log shows nothing at all until it exits — which on a job this
 * long is indistinguishable from a hang. stderr is unbuffered.
 */
function log(message: string) {
  process.stderr.write(`${message}\n`);
}

/**
 * Which layers to build, because they do not cost the same.
 *
 * Resolving the 66 cities' BDL unit ids means 66 searches against an endpoint
 * that accepts one anonymous request every eleven seconds — a quarter of an
 * hour before anything is written. The boundary layers are two file downloads.
 * Re-running the expensive pass to add a cheap layer is a waste, so each pass
 * can be asked for on its own: `npm run fetch-geometry powiats`.
 */
const PASSES = ["cities", "powiats", "voivodeships", "districts"] as const;
type Pass = (typeof PASSES)[number];

function selectedPasses(): Set<Pass> {
  const asked = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (!asked.length) return new Set(PASSES);

  const unknown = asked.filter((a) => !PASSES.includes(a as Pass));
  if (unknown.length) {
    log(`unknown pass: ${unknown.join(", ")}. known: ${PASSES.join(", ")}`);
    process.exit(2);
  }
  return new Set(asked as Pass[]);
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

/** Polish letters that ASCII-folding alone gets wrong (ł → l, not l-with-stroke). */
const PL_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL_MAP[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Every ring of a geometry, flattened. */
function rings(g: Geometry): Ring[] {
  return g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
}

/**
 * Area-weighted centroid of the largest ring, which for a city polygon is a
 * better label anchor than the bounding-box centre.
 */
function centroid(g: Geometry): Position {
  let best: Ring = [];
  let bestArea = -1;
  for (const ring of rings(g)) {
    const a = Math.abs(shoelace(ring));
    if (a > bestArea) {
      bestArea = a;
      best = ring;
    }
  }
  let x = 0;
  let y = 0;
  let a2 = 0;
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
    const cross = best[j][0] * best[i][1] - best[i][0] * best[j][1];
    a2 += cross;
    x += (best[j][0] + best[i][0]) * cross;
    y += (best[j][1] + best[i][1]) * cross;
  }
  if (a2 === 0) return best[0] ?? [0, 0];
  return [x / (3 * a2), y / (3 * a2)];
}

function shoelace(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

/** Ray-casting point-in-polygon, used to assign each city to a voivodeship. */
function pointInGeometry(pt: Position, g: Geometry): boolean {
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polygons) {
    // First ring is the outer boundary, the rest are holes.
    if (!pointInRing(pt, poly[0])) continue;
    const inHole = poly.slice(1).some((hole) => pointInRing(pt, hole));
    if (!inHole) return true;
  }
  return false;
}

function pointInRing([px, py]: Position, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Perpendicular distance from p to segment ab, in degrees. */
function perpendicular(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker line simplification. */
function simplifyRing(points: Position[], epsilon: number): Position[] {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicular(points[i], points[0], points[points.length - 1]);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }
  if (maxDistance <= epsilon) return [points[0], points[points.length - 1]];
  return [
    ...simplifyRing(points.slice(0, index + 1), epsilon).slice(0, -1),
    ...simplifyRing(points.slice(index), epsilon),
  ];
}

/**
 * Simplify a geometry used only as background.
 *
 * The voivodeship outlines exist to give the map a country to sit on, so they
 * carry 77k points of coastline detail nobody can see at this scale. Thinning
 * them to roughly 800 m tolerance cuts the file from 1.4 MB to 75 KB with no
 * visible change. City polygons are left at full detail — those are the data.
 */
function simplifyGeometry(g: Geometry, epsilon: number): Geometry {
  const simplify = (ring: Ring) => {
    const s = simplifyRing(ring, epsilon);
    // A ring needs four points (first repeated as last) to stay closed.
    return s.length >= 4 ? s : ring;
  };
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: g.coordinates.map(simplify) }
    : { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(simplify)) };
}

/** Tolerance for the background outlines, in degrees (~800 m). */
const BACKGROUND_SIMPLIFY_EPSILON = 0.008;

/**
 * Counties are simplified far less than the voivodeship backdrop.
 *
 * The backdrop is only ever stroked, so folding a boundary slightly is
 * invisible. The counties are filled, and a filled polygon has to survive
 * triangulation: simplify a concave boundary hard enough and the line crosses
 * itself, which earcut resolves by emitting a stray triangle spanning half a
 * province. It looks exactly like a corrupted mesh, because it is one.
 */
const COUNTY_SIMPLIFY_EPSILON = 0.003;

/** Round coordinates to ~11 m precision — far finer than the map needs. */
function roundGeometry(g: Geometry): Geometry {
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  const ring = (x: Ring): Ring => x.map(([a, b]) => [r(a), r(b)] as Position);
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: g.coordinates.map(ring) }
    : { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(ring)) };
}

/**
 * Resolve a city name to its BDL level-5 unit id.
 *
 * BDL names city powiats "Powiat m. <Name>" (and "Powiat m. st. Warszawa").
 * Cities whose powiat status changed carry a time qualifier, because BDL keeps
 * the historical units alongside the current one — Wałbrzych lost city-powiat
 * status in 2003 and regained it in 2013, so it appears three times:
 *
 *   Powiat m. Wałbrzych do 2002    (historical)
 *   Powiat m. Wałbrzych od 2013    (current)
 *
 * We rank candidates so the currently valid unit always wins.
 */
async function resolveCityUnit(name: string): Promise<BdlUnit | null> {
  const { results } = await searchUnits(name, 5);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^Powiat m\\.\\s*(?:st\\.\\s*)?${escaped}(?:\\s+(do|od)\\s+(\\d{4}))?$`,
    "i",
  );

  const ranked = results
    .map((unit) => ({ unit, m: pattern.exec(unit.name) }))
    .filter((c): c is { unit: BdlUnit; m: RegExpExecArray } => c.m !== null)
    .map(({ unit, m }) => {
      const qualifier = m[1]?.toLowerCase();
      const year = m[2] ? Number(m[2]) : 0;
      // No qualifier means the unit was never split in time, so it is current.
      // "od YYYY" is the current unit of a city whose status changed.
      // "do YYYY" is always a superseded unit.
      const rank = qualifier === undefined ? 2 : qualifier === "od" ? 1 : 0;
      return { unit, rank, year };
    })
    .sort((a, b) => b.rank - a.rank || b.year - a.year);

  return ranked[0]?.unit ?? null;
}

type BoundaryCollection = FeatureCollection<{ id: number; nazwa: string }>;
type BoundaryFeature = BoundaryCollection["features"][number];

/**
 * Every county, except the sixty-six that are cities.
 *
 * Without this layer a city zoomed into is an island: its own boundary is
 * drawn and its neighbours' are not, so Opole floats in blank ground with
 * nothing touching it and the reader reasonably asks where the rest of the
 * borders went. The answer is that only sixty-six towns hold county rights —
 * but that is a fact about statistics, not about the land.
 *
 * And not only about the land: GUS publishes all eighteen variables for all
 * 380 powiats, so the counties have the same figures the cities do. The
 * boundary file therefore carries the BDL unit id as well as the outline, and
 * the map colours them.
 *
 * The city counties are left out because they are already drawn, in colour and
 * with their own data, by the city layer; a second polygon over the same
 * ground would double every value on the map.
 */
async function writePowiats(
  powiaty: BoundaryCollection,
  cityFeatures: BoundaryFeature[],
  wojewodztwa: BoundaryCollection,
) {
  const background = powiaty.features.filter((f) => !cityFeatures.includes(f));

  /*
   * Every level-5 unit id, in four requests.
   *
   * `/data/by-variable` returns each unit's id alongside its values, so asking
   * for any variable at level 5 is also the cheapest possible way to enumerate
   * the units — four pages of a hundred against 314 separate name searches at
   * eleven seconds each, which would be an hour.
   */
  log("→ resolving county unit ids (4 requests)");
  const unitIds = new Map<string, { id: string; rank: number; year: number }>();
  for (let page = 0; ; page++) {
    const res = await variableData(POPULATION_VAR_ID, 5, [UNIT_PROBE_YEAR], page, 100);
    for (const unit of res.results) {
      const voivodeship = TERYT_VOIVODESHIPS[unit.id.slice(2, 4)];
      if (!voivodeship) continue;

      const key = unitKey(unit.name, voivodeship);
      const candidate = { id: unit.id, ...unitRank(unit.name) };
      const held = unitIds.get(key);
      if (
        !held ||
        candidate.rank > held.rank ||
        (candidate.rank === held.rank && candidate.year > held.year)
      ) {
        unitIds.set(key, candidate);
      }
    }
    if (res.results.length === 0) break;
    if ((page + 1) * 100 >= res.totalRecords) break;
  }
  log(`  ${unitIds.size} level-5 units`);

  /*
   * Ten county names occur twice, so ten slugs would too.
   *
   * Both members of a colliding pair get the voivodeship appended, not just
   * the second one to be encountered: picking a winner by iteration order
   * makes the short slug mean whichever county the boundary file happened to
   * list first, which is a URL that silently changes meaning if the source
   * data is ever reordered.
   */
  const baseSlugs = new Map<string, number>();
  for (const f of background) {
    const base = slugify(f.properties.nazwa.replace(/^powiat\s+/i, ""));
    baseSlugs.set(base, (baseSlugs.get(base) ?? 0) + 1);
  }

  const counties: Feature<Record<string, unknown>>[] = [];
  const unmatched: string[] = [];

  for (const f of background) {
    const name = f.properties.nazwa;
    const [lon, lat] = centroid(f.geometry);
    const woj = wojewodztwa.features.find((w) => pointInGeometry([lon, lat], w.geometry));
    const voivodeship = woj?.properties.nazwa ?? "unknown";
    const bdlUnitId = unitIds.get(unitKey(name, voivodeship))?.id;

    if (!bdlUnitId) {
      unmatched.push(`${name} (${voivodeship})`);
      continue;
    }

    const base = slugify(name.replace(/^powiat\s+/i, ""));
    const countySlug =
      (baseSlugs.get(base) ?? 0) > 1 ? `${base}-${slugify(voivodeship)}` : base;

    counties.push({
      type: "Feature",
      properties: {
        slug: countySlug,
        name,
        bdlUnitId,
        voivodeship,
      },
      geometry: roundGeometry(simplifyGeometry(f.geometry, COUNTY_SIMPLIFY_EPSILON)),
    });
  }

  if (unmatched.length) {
    // A county with no unit id is a county with no data — a hole in the map
    // that looks exactly like a rendering fault. Name them so the gap is
    // traceable to its cause rather than discovered by a reader.
    console.warn(
      `  ⚠ ${unmatched.length} county(s) had no BDL unit and will be absent ` +
        `from the map: ${unmatched.join(", ")}`,
    );
  }

  await writeFile(
    "public/geo/poland-powiats.geojson",
    JSON.stringify({ type: "FeatureCollection", features: counties }),
  );
  log(`\u2713 public/geo/poland-powiats.geojson \u2014 ${counties.length} counties`);
}

/**
 * The 66 city polygons alone do not read as Poland — they are scattered dots
 * with no coastline or border between them. The voivodeships are written out
 * as a flat base layer purely so the map has a country to sit on.
 */
async function writeVoivodeships(wojewodztwa: BoundaryCollection) {
  await writeFile(
    "public/geo/poland-voivodeships.geojson",
    JSON.stringify({
      type: "FeatureCollection",
      features: wojewodztwa.features.map((f) => ({
        type: "Feature" as const,
        properties: { name: f.properties.nazwa },
        geometry: roundGeometry(simplifyGeometry(f.geometry, BACKGROUND_SIMPLIFY_EPSILON)),
      })),
    }),
  );
  log(`\u2713 public/geo/poland-voivodeships.geojson \u2014 ${wojewodztwa.features.length} voivodeships`);
}

async function main() {
  const passes = selectedPasses();

  log("→ downloading administrative boundaries");
  const [powiaty, wojewodztwa] = await Promise.all([
    getJson<FeatureCollection<{ id: number; nazwa: string }>>(POWIAT_URL),
    getJson<FeatureCollection<{ id: number; nazwa: string }>>(WOJ_URL),
  ]);
  log(`  ${powiaty.features.length} powiats, ${wojewodztwa.features.length} voivodeships`);

  // "powiat Kraków" (city) vs "powiat krakowski" (surrounding rural powiat):
  // only city powiats capitalise the word after "powiat".
  const cityFeatures = powiaty.features.filter((f) => {
    const second = f.properties.nazwa.split(" ")[1];
    return Boolean(second) && second[0] === second[0].toUpperCase();
  });
  log(`  ${cityFeatures.length} city powiats (miasta na prawach powiatu)`);

  if (passes.has("powiats")) await writePowiats(powiaty, cityFeatures, wojewodztwa);
  if (passes.has("voivodeships")) await writeVoivodeships(wojewodztwa);
  if (!passes.has("cities")) return;

  log("→ resolving BDL unit ids");
  const cities: Feature<Record<string, unknown>>[] = [];
  const unresolved: string[] = [];

  for (const f of cityFeatures) {
    const name = f.properties.nazwa.replace(/^powiat\s+/i, "");
    const unit = await resolveCityUnit(name);
    if (!unit) {
      unresolved.push(name);
      continue;
    }

    const [lon, lat] = centroid(f.geometry);
    const woj = wojewodztwa.features.find((w) => pointInGeometry([lon, lat], w.geometry));

    cities.push({
      type: "Feature",
      properties: {
        slug: slugify(name),
        name,
        bdlUnitId: unit.id,
        voivodeship: woj?.properties.nazwa ?? "unknown",
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
      },
      geometry: roundGeometry(f.geometry),
    });
    process.stderr.write(".");
  }
  log("");

  if (unresolved.length) {
    console.warn(`  ⚠ ${unresolved.length} unresolved: ${unresolved.join(", ")}`);
  }
  const noWoj = cities.filter((c) => c.properties.voivodeship === "unknown");
  if (noWoj.length) {
    console.warn(`  ⚠ ${noWoj.length} without voivodeship: ${noWoj.map((c) => c.properties.name).join(", ")}`);
  }

  await writeFile(
    "public/geo/poland-cities.geojson",
    JSON.stringify({ type: "FeatureCollection", features: cities }),
  );
  log(`✓ data/poland-cities.geojson — ${cities.length} cities`);

  if (!passes.has("districts")) return;

  // --- Warsaw districts -----------------------------------------------------
  // Only Warsaw publishes district-level statistics in BDL, so this is the one
  // city that gets a district layer.
  log("→ fetching Warsaw district boundaries (Nominatim, 1 req/s)");
  const districtUnits = await searchUnits("dzielnica", 6);
  const warsawDistricts = districtUnits.results.filter((u) => u.name.endsWith("- dzielnica"));
  log(`  ${warsawDistricts.length} district units in BDL`);

  const districts: Feature<Record<string, unknown>>[] = [];
  for (const unit of warsawDistricts) {
    const name = unit.name.replace(/\s*-\s*dzielnica$/, "");
    const query = `${name}, Warszawa`;
    const hits = await getJson<{ geojson?: Geometry; class?: string; type?: string }[]>(
      `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=5`,
      { "User-Agent": "CityMatchPL/1.0 (diploma project)" },
    );
    const hit = hits.find(
      (h) => h.class === "boundary" && h.type === "administrative" && h.geojson,
    );
    if (!hit?.geojson) {
      console.warn(`  ⚠ no boundary for ${name}`);
      await sleep(NOMINATIM_GAP_MS);
      continue;
    }
    const [lon, lat] = centroid(hit.geojson);
    districts.push({
      type: "Feature",
      properties: {
        slug: slugify(name),
        name,
        bdlUnitId: unit.id,
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
      },
      geometry: roundGeometry(hit.geojson),
    });
    process.stderr.write(".");
    await sleep(NOMINATIM_GAP_MS);
  }
  log("");

  await writeFile(
    "public/geo/warsaw-districts.geojson",
    JSON.stringify({ type: "FeatureCollection", features: districts }),
  );
  log(`✓ data/warsaw-districts.geojson — ${districts.length} districts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
