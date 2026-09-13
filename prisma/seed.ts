import "dotenv/config";
/**
 * Seeds the static half of the database: the 66 cities, the 314 land counties
 * around them, Warsaw's 18 districts and the indicator catalogue. None of this needs a network call — the geometry
 * files are committed to the repo — so a fresh clone can reach a working schema
 * before touching any external API.
 *
 * Observations (the actual numbers) are loaded separately by refresh-data.ts.
 *
 *   npm run seed
 */
import { readFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { INDICATORS } from "./indicators";

type CityProps = {
  slug: string;
  name: string;
  bdlUnitId: string;
  voivodeship: string;
  lat: number;
  lon: number;
};
type CountyProps = { slug: string; name: string; bdlUnitId: string; voivodeship: string };
type DistrictProps = { slug: string; name: string; bdlUnitId: string; lat: number; lon: number };
type Feature<P> = { properties: P; geometry: unknown };
type FeatureCollection<P> = { features: Feature<P>[] };

async function readGeoJson<P>(path: string): Promise<Feature<P>[]> {
  const raw = await readFile(path, "utf8");
  return (JSON.parse(raw) as FeatureCollection<P>).features;
}

async function main() {
  console.log("→ seeding indicator catalogue");
  for (const ind of INDICATORS) {
    await db.indicator.upsert({
      where: { code: ind.code },
      create: ind,
      update: ind,
    });
  }
  console.log(`  ${INDICATORS.length} indicators`);

  console.log("→ seeding cities");
  const cities = await readGeoJson<CityProps>("public/geo/poland-cities.geojson");
  for (const f of cities) {
    const { slug, name, bdlUnitId, voivodeship, lat, lon } = f.properties;
    const data = {
      slug,
      name,
      bdlUnitId,
      voivodeship,
      lat,
      lon,
      geometry: f.geometry as object,
      // Polish and English Wikipedia use the plain city name for every one of
      // these 66 cities, so no per-city override table is needed.
      wikipediaTitlePl: name,
      wikipediaTitleEn: name,
    };
    await db.city.upsert({ where: { slug }, create: data, update: data });
  }
  console.log(`  ${cities.length} cities`);

  /*
   * The counties are seeded the same way and from the same source as the
   * cities, because they are the same kind of thing: GUS publishes every one
   * of the eighteen variables for all 380 powiats. They are held apart only
   * because the guide is about cities — counties have no districts, no
   * Wikipedia profile and no page of their own; they exist so the map has
   * data everywhere rather than in sixty-six scattered patches.
   */
  console.log("→ seeding counties");
  const counties = await readGeoJson<CountyProps>("public/geo/poland-powiats.geojson");
  for (const f of counties) {
    const { slug, name, bdlUnitId, voivodeship } = f.properties;
    const data = { slug, name, bdlUnitId, voivodeship, geometry: f.geometry as object };
    await db.county.upsert({ where: { slug }, create: data, update: data });
  }
  console.log(`  ${counties.length} counties`);

  console.log("→ seeding Warsaw districts");
  const warsaw = await db.city.findUnique({ where: { slug: "warszawa" } });
  if (!warsaw) throw new Error("Warszawa missing — cannot attach districts");

  const districts = await readGeoJson<DistrictProps>("public/geo/warsaw-districts.geojson");
  for (const f of districts) {
    const { slug, name, bdlUnitId } = f.properties;
    const data = {
      slug,
      name,
      bdlUnitId,
      cityId: warsaw.id,
      geometry: f.geometry as object,
    };
    await db.district.upsert({ where: { slug }, create: data, update: data });
  }
  console.log(`  ${districts.length} districts attached to ${warsaw.name}`);

  console.log("✓ seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
