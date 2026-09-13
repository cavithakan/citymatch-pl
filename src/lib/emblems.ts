/**
 * Coats of arms for the 66 cities and 16 voivodeships.
 *
 * The manifest is produced by `npm run fetch-emblems` and committed, so the
 * app has no runtime dependency on Wikimedia — the images are ordinary static
 * files and a clean clone renders them without a network call, which is the
 * same bargain the rest of the data pipeline strikes.
 */
import manifest from "../../public/emblems/manifest.json";

export type Emblem = {
  /** The place as it is written, for credit lines a reader can recognise. */
  name: string;
  /** Path under /emblems. */
  file: string;
  /** Licence short name as Commons states it. */
  license: string;
  /** Commons file page, for attribution. */
  source: string;
};

const cities = manifest.cities as Record<string, Emblem>;
const voivodeships = manifest.voivodeships as Record<string, Emblem>;

export function cityEmblem(slug: string): Emblem | null {
  return cities[slug] ?? null;
}

export function voivodeshipEmblem(name: string): Emblem | null {
  return voivodeships[name] ?? null;
}

export function emblemUrl(emblem: Emblem): string {
  return `/emblems/${emblem.file}`;
}

/**
 * The emblems whose licence asks for attribution, grouped for /about.
 *
 * Most Polish municipal arms are public domain and need no credit; a handful
 * are contributor drawings under Creative Commons and do. Listing only those
 * keeps the credit meaningful instead of burying three real obligations in
 * seventy-nine formalities.
 */
export function attributableEmblems(): { name: string; license: string; source: string }[] {
  return [...Object.entries(cities), ...Object.entries(voivodeships)]
    .filter(([, e]) => !/public domain/i.test(e.license))
    .map(([, e]) => ({ name: e.name, license: e.license, source: e.source }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
