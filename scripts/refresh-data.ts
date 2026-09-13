import "dotenv/config";
/**
 * Pulls every observation the app displays into Postgres.
 *
 * Split into four passes so a failure in one does not lose the others:
 *
 *   1. city values      — GUS BDL, one request per variable per page
 *   2. district values  — GUS BDL, one request per Warsaw district
 *   3. climate          — Open-Meteo, one request per city
 *   4. derived metrics  — computed locally from what the first three stored
 *
 * Pass 1 uses /data/by-variable, which returns every powiat in one response.
 * That turns "19 variables × 66 cities" into roughly 76 requests instead of
 * 1,254, which matters because anonymous BDL access is throttled.
 *
 *   npm run refresh-data
 */
import { db } from "../src/lib/db";
import { getCityAirQuality } from "../src/lib/providers/gios";
import { variableData, unitData, estimateDuration, requestCount } from "../src/lib/providers/bdl";

/**
 * Records per page when pulling a variable for every powiat. BDL caps this, and
 * a bigger page means fewer requests against the 100-per-15-minutes limit.
 */
const PAGE_SIZE = 100;
/** Poland has 380 powiats; that is what pass 1 pages through. */
const POWIAT_COUNT = 380;

/** How many years of history to keep. Drives the sparklines on the city page. */
const YEARS_BACK = 10;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: YEARS_BACK }, (_, i) => CURRENT_YEAR - i);

/** Reference year for the climate archive — the last full calendar year. */
const CLIMATE_YEAR = CURRENT_YEAR - 1;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Progress goes to stderr, not stdout.
 *
 * Beyond the Unix convention that stdout carries data and stderr carries
 * commentary, it is the difference between seeing this script work and not:
 * Node block-buffers stdout when it is redirected to a file, so a run that
 * takes a quarter of an hour would show nothing until it finished.
 */
const log = (line = "") => process.stderr.write(`${line}\n`);

type IndicatorRow = {
  id: number;
  code: string;
  bdlVarId: number | null;
  availableAtDistrict: boolean;
  zeroIsMissing: boolean;
};

/**
 * Should this value be stored?
 *
 * The Local Data Bank returns a row of zeros for a year it has not published
 * yet rather than omitting the series, so a naive "latest year wins" reads the
 * placeholder as a measurement — a city page showing a living area of 0.0 m²
 * per person, or worse, a city with no cinemas ranking best on "inhabitants per
 * cinema seat" because zero is the lowest number. Indicators where zero is a
 * real observation are marked in the catalogue and keep theirs.
 */
function keepValue(indicator: IndicatorRow, value: number): boolean {
  return value !== 0 || !indicator.zeroIsMissing;
}

// ---------------------------------------------------------------------------
// Pass 1 — county-level values from BDL, for cities and land counties alike
// ---------------------------------------------------------------------------

/**
 * Loads every level-5 unit's values: the 66 cities and the 314 counties.
 *
 * Both come out of the same requests. `/data/by-variable?unit-level=5` returns
 * all 380 powiats whether we want them or not, so for a long time this pass
 * fetched the counties and immediately dropped them on the floor — which is
 * why the map had colour in sixty-six places and nothing in between. Keeping
 * them costs no additional request.
 *
 * They are written to different tables because they mean different things to
 * the rest of the application, not because they were fetched differently.
 */
async function loadCityValues(indicators: IndicatorRow[]) {
  const cities = await db.city.findMany({ select: { id: true, bdlUnitId: true } });
  const cityByUnit = new Map(cities.map((c) => [c.bdlUnitId, c.id]));
  const counties = await db.county.findMany({ select: { id: true, bdlUnitId: true } });
  const countyByUnit = new Map(counties.map((c) => [c.bdlUnitId, c.id]));

  const bdlIndicators = indicators.filter((i) => i.bdlVarId !== null);
  const pages = Math.ceil(POWIAT_COUNT / PAGE_SIZE);
  const requests = bdlIndicators.length * pages;
  log(
    `→ city values: ${bdlIndicators.length} variables × ${YEARS_BACK} years ` +
      `(~${requests} requests, ~${estimateDuration(requests)})`,
  );

  let written = 0;
  let countyWritten = 0;
  for (const ind of bdlIndicators) {
    const rows: { cityId: number; indicatorId: number; year: number; value: number }[] = [];
    const countyRows: { countyId: number; indicatorId: number; year: number; value: number }[] = [];

    let page = 0;
    for (;;) {
      const res = await variableData(ind.bdlVarId!, 5, YEARS, page, PAGE_SIZE);
      for (const unit of res.results) {
        const cityId = cityByUnit.get(unit.id);
        const countyId = cityId === undefined ? countyByUnit.get(unit.id) : undefined;
        if (cityId === undefined && countyId === undefined) continue;

        for (const v of unit.values) {
          if (v.val === null || !keepValue(ind, v.val)) continue;
          const year = Number(v.year);
          if (cityId !== undefined) {
            rows.push({ cityId, indicatorId: ind.id, year, value: v.val });
          } else {
            countyRows.push({ countyId: countyId!, indicatorId: ind.id, year, value: v.val });
          }
        }
      }
      // Stop on our own page size, not the response's. /data/by-variable
      // reports `totalRecords` but omits `pageSize` — the field exists on
      // /units/search, which makes the omission easy to miss. Trusting it gives
      // `(page + 1) * undefined`, which is NaN, and NaN >= totalRecords is
      // false forever: the loop never ends and the script pages silently until
      // it is killed.
      if (res.results.length === 0) break;
      if ((page + 1) * PAGE_SIZE >= res.totalRecords) break;
      page++;
    }

    if (rows.length) {
      await db.cityIndicator.createMany({ data: rows, skipDuplicates: true });
      written += rows.length;
    }
    if (countyRows.length) {
      await db.countyIndicator.createMany({ data: countyRows, skipDuplicates: true });
      countyWritten += countyRows.length;
    }
    log(
      `  ${ind.code.padEnd(22)} ${String(rows.length).padStart(5)} city` +
        ` ${String(countyRows.length).padStart(6)} county   [${requestCount()} req]`,
    );
  }
  log(`  ${written} city values, ${countyWritten} county values written`);
}

// ---------------------------------------------------------------------------
// Pass 2 — Warsaw district values from BDL
// ---------------------------------------------------------------------------

async function loadDistrictValues(indicators: IndicatorRow[]) {
  const districts = await db.district.findMany({ select: { id: true, bdlUnitId: true, name: true } });
  const districtIndicators = indicators.filter((i) => i.bdlVarId !== null && i.availableAtDistrict);

  log(
    `→ district values: ${districts.length} districts × ${districtIndicators.length} variables ` +
      `(~${districts.length} requests, ~${estimateDuration(districts.length)})`,
  );

  const byVarId = new Map(districtIndicators.map((i) => [i.bdlVarId!, i]));
  const varIds = districtIndicators.map((i) => i.bdlVarId!);

  let written = 0;
  for (const d of districts) {
    // One request covers every variable for this district.
    const res = await unitData(d.bdlUnitId, varIds, YEARS);
    const rows: { districtId: number; indicatorId: number; year: number; value: number }[] = [];
    for (const r of res.results) {
      const indicator = byVarId.get(r.id);
      if (!indicator) continue;
      for (const v of r.values) {
        if (v.val === null || !keepValue(indicator, v.val)) continue;
        rows.push({ districtId: d.id, indicatorId: indicator.id, year: Number(v.year), value: v.val });
      }
    }
    if (rows.length) {
      await db.districtIndicator.createMany({ data: rows, skipDuplicates: true });
      written += rows.length;
    }
    process.stderr.write(".");
  }
  log(`\n  ${written} district values written`);
}

// ---------------------------------------------------------------------------
// Pass 3 — climate from Open-Meteo
// ---------------------------------------------------------------------------

type ArchiveResponse = {
  daily: {
    time: string[];
    temperature_2m_mean: (number | null)[];
    precipitation_sum: (number | null)[];
    sunshine_duration: (number | null)[];
  };
};

async function loadClimate(indicators: IndicatorRow[]) {
  const cities = await db.city.findMany({ select: { id: true, name: true, lat: true, lon: true } });
  log(`→ climate: ${cities.length} cities, reference year ${CLIMATE_YEAR}`);

  // The three climate figures are also written as ordinary indicator rows.
  // CityClimate keeps the raw reduction from the daily series, but the map,
  // the scoring engine and the city page all read CityIndicator — a metric that
  // lives only in its own table is a metric none of them can see.
  const climateIds = new Map(
    (["comfortable_days", "sunshine_hours", "rainy_days"] as const).flatMap((code) => {
      const id = indicators.find((i) => i.code === code)?.id;
      return id === undefined ? [] : [[code, id] as const];
    }),
  );
  const climateRows: { cityId: number; indicatorId: number; year: number; value: number }[] = [];

  for (const c of cities) {
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.lon}` +
      `&start_date=${CLIMATE_YEAR}-01-01&end_date=${CLIMATE_YEAR}-12-31` +
      `&daily=temperature_2m_mean,precipitation_sum,sunshine_duration&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  ⚠ ${c.name}: ${res.status}`);
      continue;
    }
    const { daily } = (await res.json()) as ArchiveResponse;

    const temps = daily.temperature_2m_mean.filter((v): v is number => v !== null);
    const rain = daily.precipitation_sum.filter((v): v is number => v !== null);
    const sun = daily.sunshine_duration.filter((v): v is number => v !== null);

    // Reduce 365 daily records to the four numbers the app actually shows.
    const data = {
      year: CLIMATE_YEAR,
      comfortableDays: temps.filter((t) => t >= 15 && t <= 25).length,
      sunshineHours: Math.round(sun.reduce((a, b) => a + b, 0) / 3600),
      rainyDays: rain.filter((p) => p > 1).length,
      avgTemp: Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)),
      fetchedAt: new Date(),
    };
    await db.cityClimate.upsert({
      where: { cityId: c.id },
      create: { cityId: c.id, ...data },
      update: data,
    });

    for (const [code, value] of [
      ["comfortable_days", data.comfortableDays],
      ["sunshine_hours", data.sunshineHours],
      ["rainy_days", data.rainyDays],
    ] as const) {
      const indicatorId = climateIds.get(code);
      if (indicatorId !== undefined) {
        climateRows.push({ cityId: c.id, indicatorId, year: CLIMATE_YEAR, value });
      }
    }

    process.stderr.write(".");
    await sleep(120);
  }

  if (climateRows.length) {
    // Replace rather than accumulate: re-running the pass for the same
    // reference year should not leave two values behind.
    await db.cityIndicator.deleteMany({
      where: { year: CLIMATE_YEAR, indicatorId: { in: [...climateIds.values()] } },
    });
    await db.cityIndicator.createMany({ data: climateRows, skipDuplicates: true });
  }
  log(`\n  climate written — ${climateRows.length} indicator values`);
}

// ---------------------------------------------------------------------------
// Pass 4 — air quality snapshot from GIOŚ
// ---------------------------------------------------------------------------

/**
 * Air quality is the one indicator that is not an annual statistic.
 *
 * GIOŚ publishes an index per station per hour, so what lands in the indicator
 * table is a snapshot taken when the refresh ran, stored under the current
 * year. The city page shows the live reading alongside it; this stored copy
 * exists so the map can colour 66 cities without making 66 live calls on every
 * page view, and so air quality can take part in the weighted score.
 *
 * Station indexes are cached per station, so cities that share one do not
 * refetch it.
 */
async function loadAirQuality(indicators: IndicatorRow[]) {
  const indexId = indicators.find((i) => i.code === "air_quality_index")?.id;
  const pm25Id = indicators.find((i) => i.code === "pm25")?.id;
  if (indexId === undefined && pm25Id === undefined) return;

  const cities = await db.city.findMany({ select: { id: true, name: true } });
  log(`→ air quality: ${cities.length} cities (GIOŚ, snapshot for ${CURRENT_YEAR})`);

  const rows: { cityId: number; indicatorId: number; year: number; value: number }[] = [];
  let covered = 0;

  for (const c of cities) {
    const air = await getCityAirQuality(c.name).catch(() => null);
    if (air) {
      covered++;
      if (indexId !== undefined && air.index !== null) {
        rows.push({ cityId: c.id, indicatorId: indexId, year: CURRENT_YEAR, value: Number(air.index.toFixed(2)) });
      }
      if (pm25Id !== undefined && air.pm25 !== null) {
        rows.push({ cityId: c.id, indicatorId: pm25Id, year: CURRENT_YEAR, value: Number(air.pm25.toFixed(2)) });
      }
    }
    process.stderr.write(air ? "." : "·");
    await sleep(80);
  }

  if (rows.length) {
    // A snapshot replaces the previous one for the same year rather than
    // accumulating duplicates.
    await db.cityIndicator.deleteMany({
      where: {
        year: CURRENT_YEAR,
        indicatorId: { in: [indexId, pm25Id].filter((x): x is number => x !== undefined) },
      },
    });
    await db.cityIndicator.createMany({ data: rows, skipDuplicates: true });
  }
  log(`\n  ${covered} of ${cities.length} cities have a GIOŚ station`);
}

// ---------------------------------------------------------------------------
// Pass 5 — derived metrics
// ---------------------------------------------------------------------------

/**
 * Metrics that only exist once two sources sit in the same table.
 * `affordability` is the one that carries the project: neither the salary
 * series nor the price series says how hard a flat is to buy, but their ratio
 * does.
 */
const DERIVED: Record<string, { inputs: [string, string]; compute: (a: number, b: number) => number }> = {
  affordability: {
    inputs: ["price_per_m2", "avg_salary"],
    compute: (price, salary) => Number((price / salary).toFixed(3)),
  },
  green_per_capita: {
    inputs: ["green_area_ha", "population"],
    compute: (ha, pop) => Number(((ha * 10_000) / pop).toFixed(2)),
  },
  sewerage_rate: {
    inputs: ["pop_on_treatment", "population"],
    compute: (served, pop) => Number(Math.min((served / pop) * 100, 100).toFixed(1)),
  },
  pupils_per_1000: {
    inputs: ["primary_pupils", "population"],
    compute: (pupils, pop) => Number(((pupils / pop) * 1000).toFixed(1)),
  },
};

/** Builds a code → year → value lookup for one unit's stored observations. */
function index(
  rows: { indicatorId: number; year: number; value: number }[],
  codeById: Map<number, string>,
) {
  const out = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const code = codeById.get(r.indicatorId);
    if (!code) continue;
    if (!out.has(code)) out.set(code, new Map());
    out.get(code)!.set(r.year, r.value);
  }
  return out;
}

async function computeDerived(indicators: IndicatorRow[]) {
  const idByCode = new Map(indicators.map((i) => [i.code, i.id]));
  const codeById = new Map(indicators.map((i) => [i.id, i.code]));
  log(`→ derived metrics: ${Object.keys(DERIVED).join(", ")}`);

  // Cities
  const cities = await db.city.findMany({ select: { id: true } });
  let cityRows = 0;
  for (const c of cities) {
    const rows = await db.cityIndicator.findMany({
      where: { cityId: c.id },
      select: { indicatorId: true, year: true, value: true },
    });
    const byCode = index(rows, codeById);
    const out: { cityId: number; indicatorId: number; year: number; value: number }[] = [];

    for (const [code, { inputs, compute }] of Object.entries(DERIVED)) {
      const indicatorId = idByCode.get(code);
      const a = byCode.get(inputs[0]);
      const b = byCode.get(inputs[1]);
      if (indicatorId === undefined || !a || !b) continue;
      // Only years where both inputs exist can produce a derived value.
      for (const [year, av] of a) {
        const bv = b.get(year);
        if (bv === undefined || bv === 0) continue;
        out.push({ cityId: c.id, indicatorId, year, value: compute(av, bv) });
      }
    }
    if (out.length) {
      await db.cityIndicator.createMany({ data: out, skipDuplicates: true });
      cityRows += out.length;
    }
  }
  log(`  ${cityRows} derived city values`);

  /*
   * Counties, by exactly the same arithmetic.
   *
   * These four are the metrics no single GUS series answers — what a square
   * metre costs in months of local pay, how much park there is per person —
   * and they are the ones a reader actually compares places on. Computing them
   * for the cities only would leave the map's most interesting measures blank
   * across four fifths of the country.
   */
  const counties = await db.county.findMany({ select: { id: true } });
  let countyRows = 0;
  for (const c of counties) {
    const rows = await db.countyIndicator.findMany({
      where: { countyId: c.id },
      select: { indicatorId: true, year: true, value: true },
    });
    const byCode = index(rows, codeById);
    const out: { countyId: number; indicatorId: number; year: number; value: number }[] = [];

    for (const [code, { inputs, compute }] of Object.entries(DERIVED)) {
      const indicatorId = idByCode.get(code);
      const a = byCode.get(inputs[0]);
      const b = byCode.get(inputs[1]);
      if (indicatorId === undefined || !a || !b) continue;
      for (const [year, av] of a) {
        const bv = b.get(year);
        if (bv === undefined || bv === 0) continue;
        out.push({ countyId: c.id, indicatorId, year, value: compute(av, bv) });
      }
    }
    if (out.length) {
      await db.countyIndicator.createMany({ data: out, skipDuplicates: true });
      countyRows += out.length;
    }
  }
  log(`  ${countyRows} derived county values`);

  // Warsaw districts — only the derived metrics whose inputs exist per district
  const districts = await db.district.findMany({ select: { id: true } });
  let districtRows = 0;
  for (const d of districts) {
    const rows = await db.districtIndicator.findMany({
      where: { districtId: d.id },
      select: { indicatorId: true, year: true, value: true },
    });
    const byCode = index(rows, codeById);
    const out: { districtId: number; indicatorId: number; year: number; value: number }[] = [];

    for (const [code, { inputs, compute }] of Object.entries(DERIVED)) {
      const indicatorId = idByCode.get(code);
      const a = byCode.get(inputs[0]);
      const b = byCode.get(inputs[1]);
      if (indicatorId === undefined || !a || !b) continue;
      for (const [year, av] of a) {
        const bv = b.get(year);
        if (bv === undefined || bv === 0) continue;
        out.push({ districtId: d.id, indicatorId, year, value: compute(av, bv) });
      }
    }
    if (out.length) {
      await db.districtIndicator.createMany({ data: out, skipDuplicates: true });
      districtRows += out.length;
    }
  }
  log(`  ${districtRows} derived district values`);
}

// ---------------------------------------------------------------------------

const PASSES = ["cities", "districts", "climate", "air", "derived"] as const;
type Pass = (typeof PASSES)[number];

/**
 * Passes can be run individually:
 *
 *   npm run refresh-data              every pass
 *   npm run refresh-data air derived  just those two
 *
 * The BDL passes take a quarter of an hour because of the rate limit, so being
 * able to re-run only the air-quality snapshot — which changes hourly and costs
 * nothing — matters more than it looks. Every pass is idempotent, so repeating
 * one never duplicates rows.
 */
/**
 * Narrow a pass to named indicators: `--only=avg_salary,tourist_beds`.
 *
 * A full city pass is seventy-two requests at eleven seconds each. When a run
 * dies partway — a dropped connection is enough — repeating the whole thing to
 * recover four series wastes a quarter of an hour and a chunk of the day's
 * anonymous quota. Writes are idempotent, so a narrowed re-run is safe.
 */
function requestedIndicators(): Set<string> | null {
  const flag = process.argv.slice(2).find((a) => a.startsWith("--only="));
  if (!flag) return null;
  const codes = flag
    .slice("--only=".length)
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return codes.length ? new Set(codes) : null;
}

function requestedPasses(): Set<Pass> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (!args.length) return new Set(PASSES);

  const unknown = args.filter((a) => !PASSES.includes(a as Pass));
  if (unknown.length) {
    throw new Error(`Unknown pass: ${unknown.join(", ")}. Choose from ${PASSES.join(", ")}`);
  }
  return new Set(args as Pass[]);
}

async function main() {
  const passes = requestedPasses();
  const all = await db.indicator.findMany({
    select: {
      id: true,
      code: true,
      bdlVarId: true,
      availableAtDistrict: true,
      zeroIsMissing: true,
    },
    // Fixed order. Without it the run works through the catalogue in whatever
    // order Postgres returns, so a run that stops early stops somewhere
    // different each time and the log cannot be compared with the last one.
    orderBy: { sortOrder: "asc" },
  });
  if (!all.length) throw new Error("No indicators — run `npm run seed` first");

  const only = requestedIndicators();
  const indicators = only ? all.filter((i) => only.has(i.code)) : all;
  if (only) {
    const unknown = [...only].filter((c) => !all.some((i) => i.code === c));
    if (unknown.length) throw new Error(`Unknown indicator: ${unknown.join(", ")}`);
    log(`→ limited to ${indicators.length} indicator(s): ${[...only].join(", ")}`);
  }

  if (passes.has("cities")) await loadCityValues(indicators);
  if (passes.has("districts")) await loadDistrictValues(indicators);
  if (passes.has("climate")) await loadClimate(indicators);
  if (passes.has("air")) await loadAirQuality(indicators);
  // Derived metrics read what the passes above stored, so they run last.
  if (passes.has("derived")) await computeDerived(indicators);

  log(`✓ refresh complete — ${requestCount()} BDL requests`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
