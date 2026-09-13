/**
 * Downloads the coat of arms of every city and voivodeship on the map.
 *
 * Why these are worth having: the statistics say what a place is like, and say
 * nothing at all about what it is. A herb is the one piece of a Polish town's
 * identity that every reader recognises instantly and that no indicator can
 * carry — it turns a row in a ranking back into a place.
 *
 * The chain is three public APIs, none of which needs a key, which is the same
 * constraint the rest of the data pipeline is built under:
 *
 *   1. pl.wikipedia  — article title        → Wikidata item id
 *   2. Wikidata      — item id              → coat of arms file name (P94)
 *   3. Commons       — file name            → thumbnail URL + licence
 *
 * Everything is batched fifty at a time, because all three endpoints accept
 * fifty titles or ids per request and asking sixty-six times for what fits in
 * two requests is rude to a service that charges nothing.
 *
 * The licence of every file is recorded alongside it in the manifest. Most
 * Polish municipal arms are public domain, but not all of them are, and an
 * image used without knowing its terms is a problem shipped rather than
 * avoided — /about renders what this writes.
 *
 * Run: npm run fetch-emblems
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const UA = "CityMatchPL/0.1 (diploma project; https://github.com/)";
const OUT_DIR = path.join(process.cwd(), "public", "emblems");
const MANIFEST = path.join(OUT_DIR, "manifest.json");
/** Rendered width in pixels. Displayed at 24-40px, so this covers retina. */
const THUMB_WIDTH = 96;
const BATCH = 25;
/** Courtesy gap between calls to the same host. */
const GAP_MS = 400;
const MAX_RETRIES = 6;
const BACKOFF_START_MS = 2_000;

type Entry = {
  /** The place as it is written, for credit lines a reader can recognise. */
  name: string;
  /** File served from /emblems/<file>. */
  file: string;
  /** Licence short name as Commons states it, e.g. "Public domain". */
  license: string;
  /** Commons file page, so the attribution can be followed. */
  source: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch JSON, backing off when Wikimedia says to.
 *
 * Anonymous callers get a modest budget and a 429 when they exceed it, which
 * on a run of this size is an ordinary event rather than a failure — the whole
 * job is a hundred-odd requests and the right response to being asked to wait
 * is to wait. `Retry-After` is honoured when present, since it is the server
 * telling us exactly how long it wants.
 */
async function getJson(url: string): Promise<Record<string, unknown>> {
  let wait = BACKOFF_START_MS;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return (await res.json()) as Record<string, unknown>;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }

    const header = Number(res.headers.get("retry-after"));
    const pause = Number.isFinite(header) && header > 0 ? header * 1000 : wait;
    process.stderr.write(`  throttled, waiting ${Math.round(pause / 1000)}s\n`);
    await sleep(pause);
    wait = Math.min(wait * 2, 60_000);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Article titles → Wikidata item ids, preserving which title produced which. */
async function resolveItems(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  for (const group of chunk(titles, BATCH)) {
    const url =
      "https://pl.wikipedia.org/w/api.php?action=query&format=json&redirects=1" +
      "&prop=pageprops&ppprop=wikibase_item&titles=" +
      encodeURIComponent(group.join("|"));
    const data = await getJson(url);
    const query = data.query as {
      pages?: Record<string, { title: string; pageprops?: { wikibase_item?: string } }>;
      // A redirect changes the title, so the answer has to be mapped back to
      // what we asked for or the city it belongs to is lost.
      normalized?: { from: string; to: string }[];
      redirects?: { from: string; to: string }[];
    };

    const backwards = new Map<string, string>();
    for (const step of [...(query.normalized ?? []), ...(query.redirects ?? [])]) {
      backwards.set(step.to, backwards.get(step.from) ?? step.from);
    }

    for (const page of Object.values(query.pages ?? {})) {
      const item = page.pageprops?.wikibase_item;
      if (!item) continue;
      out.set(backwards.get(page.title) ?? page.title, item);
    }
    await sleep(GAP_MS);
  }

  return out;
}

/** Wikidata item ids → coat of arms file names (property P94). */
async function resolveArms(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  for (const group of chunk(ids, BATCH)) {
    const url =
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=" +
      encodeURIComponent(group.join("|"));
    const data = await getJson(url);
    const entities = data.entities as Record<
      string,
      { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> }
    >;

    for (const [id, entity] of Object.entries(entities ?? {})) {
      const value = entity.claims?.P94?.[0]?.mainsnak?.datavalue?.value;
      if (typeof value === "string") out.set(id, value);
    }
    await sleep(GAP_MS);
  }

  return out;
}

type CommonsFile = { thumbUrl: string; license: string; descriptionUrl: string };

/** Commons file names → a rendered thumbnail URL and the licence terms. */
async function resolveFiles(names: string[]): Promise<Map<string, CommonsFile>> {
  const out = new Map<string, CommonsFile>();

  for (const group of chunk(names, BATCH)) {
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json" +
      `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${THUMB_WIDTH}&titles=` +
      encodeURIComponent(group.map((n) => `File:${n}`).join("|"));
    const data = await getJson(url);
    const pages = (data.query as {
      pages?: Record<
        string,
        {
          title: string;
          imageinfo?: {
            thumburl?: string;
            url?: string;
            descriptionurl?: string;
            extmetadata?: Record<string, { value?: string }>;
          }[];
        }
      >;
    }).pages;

    for (const page of Object.values(pages ?? {})) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      // thumburl is absent when the file is already smaller than the request.
      const thumbUrl = info.thumburl ?? info.url;
      if (!thumbUrl) continue;
      out.set(page.title.replace(/^File:/, ""), {
        thumbUrl,
        license: info.extmetadata?.LicenseShortName?.value ?? "unknown",
        descriptionUrl: info.descriptionurl ?? "",
      });
    }
    await sleep(GAP_MS);
  }

  return out;
}

async function download(url: string, destination: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} downloading ${url}`);
  await writeFile(destination, Buffer.from(await res.arrayBuffer()));
}

type Target = { slug: string; title: string; name: string };

/**
 * Resolve and download one family of emblems.
 *
 * Every stage can come up empty for an individual place — an article without a
 * Wikidata item, an item without P94, a file Commons will not render — so each
 * stage drops what it cannot carry and the misses are reported at the end
 * rather than failing the run. A town with no herb loses a picture, not the
 * whole pipeline.
 */
async function collect(kind: string, targets: Target[]): Promise<Record<string, Entry>> {
  process.stderr.write(`→ ${kind}: ${targets.length} places\n`);

  const items = await resolveItems(targets.map((t) => t.title));
  const arms = await resolveArms([...new Set(items.values())]);
  const files = await resolveFiles([...new Set(arms.values())]);

  const dir = path.join(OUT_DIR, kind);
  await mkdir(dir, { recursive: true });

  const manifest: Record<string, Entry> = {};
  const missing: string[] = [];

  for (const target of targets) {
    const item = items.get(target.title);
    const armsName = item ? arms.get(item) : undefined;
    const file = armsName ? files.get(armsName) : undefined;
    if (!file) {
      missing.push(target.title);
      continue;
    }

    const name = `${target.slug}.png`;
    await download(file.thumbUrl, path.join(dir, name));
    manifest[target.slug] = {
      name: target.name,
      file: `${kind}/${name}`,
      license: file.license,
      source: file.descriptionUrl,
    };
    await sleep(GAP_MS / 4);
  }

  process.stderr.write(`  ${Object.keys(manifest).length} written`);
  process.stderr.write(missing.length ? `, no arms for: ${missing.join(", ")}\n` : "\n");
  return manifest;
}

async function readGeoJson(file: string) {
  const raw = await readFile(path.join(process.cwd(), "public", "geo", file), "utf8");
  return JSON.parse(raw) as {
    features: { properties: { slug?: string; name?: string } }[];
  };
}

async function main() {
  const cities = await readGeoJson("poland-cities.geojson");
  const voivodeships = await readGeoJson("poland-voivodeships.geojson");

  const cityTargets: Target[] = cities.features.flatMap((f) =>
    f.properties.slug && f.properties.name
      ? [{ slug: f.properties.slug, title: f.properties.name, name: f.properties.name }]
      : [],
  );

  const voivodeshipTargets: Target[] = voivodeships.features.flatMap((f) =>
    f.properties.name
      ? [
          {
            slug: f.properties.name,
            // The article is about the province, not the adjective that names
            // it, and only the full form resolves.
            title: `województwo ${f.properties.name}`,
            name: `${f.properties.name.charAt(0).toUpperCase()}${f.properties.name.slice(1)}`,
          },
        ]
      : [],
  );

  await mkdir(OUT_DIR, { recursive: true });
  const manifest = {
    cities: await collect("cities", cityTargets),
    voivodeships: await collect("voivodeships", voivodeshipTargets),
  };

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stderr.write("✓ emblems written\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
