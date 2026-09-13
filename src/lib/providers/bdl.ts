/**
 * Client for the GUS Bank Danych Lokalnych (Local Data Bank) API.
 *
 * https://bdl.stat.gov.pl/api/v1
 *
 * Two things about this API drive the shape of this module:
 *
 * 1. Anonymous access is throttled in short windows. When the throttle trips,
 *    the API answers with **HTTP 200** and a JSON body containing `errorResult`
 *    instead of a 429, so a naive `res.ok` check silently treats the error as
 *    data. `bdlFetch` inspects the body, not just the status.
 *
 * 2. Requests must be serialised. All calls go through a single promise chain
 *    with a fixed gap between them, and back off exponentially when throttled.
 */

const BASE = "https://bdl.stat.gov.pl/api/v1";

/**
 * Published anonymous limits, as reported by the API itself when it refuses a
 * request: 100 requests per 15 minutes and 1,000 per 12 hours. The 15-minute
 * window is the binding one. A full refresh makes roughly 94 requests, so
 * pacing them 9 seconds apart would finish in 14.9 minutes and trip the limit
 * against its own tail. At 11 seconds the run never exceeds 81 requests in any
 * rolling 15-minute window, which leaves room for the retries. A refresh is
 * therefore slow by design — around 17 minutes — but it runs unattended and
 * only needs to run when GUS publishes new figures.
 *
 * Registering a free API key raises these limits considerably; set BDL_API_KEY
 * and the pacing drops to one second.
 */
const ANONYMOUS_GAP_MS = 11_000;
const KEYED_GAP_MS = 1_000;

/**
 * Backoff policy for a throttle response.
 *
 * The waits double but stop at the length of the rate-limit window: once you
 * have waited a full 15 minutes the window has rolled over completely, so
 * waiting 30 would not improve the odds — it would only make a recoverable run
 * take twice as long. With the cap in place the retries can be generous,
 * because each one costs at most one window.
 */
const MAX_RETRIES = 8;
const BACKOFF_START_MS = 60_000;
/**
 * First wait after a dropped connection.
 *
 * Much shorter than the throttle backoff: a throttle is the server telling us
 * to stop for a while, whereas a connect timeout is usually a moment's noise
 * on the wire and a few seconds is enough.
 */
const TRANSPORT_BACKOFF_MS = 4_000;
/** The rate-limit window: 100 requests per 15 minutes. */
const BACKOFF_CAP_MS = 900_000;

const API_KEY = process.env.BDL_API_KEY;
const REQUEST_GAP_MS = API_KEY ? KEYED_GAP_MS : ANONYMOUS_GAP_MS;

/** Serialises every request in this process into one chain. */
let queue: Promise<unknown> = Promise.resolve();

/** Requests completed in this process, used only for progress reporting. */
let completed = 0;
export const requestCount = () => completed;

/** Rough wall-clock estimate for a run of `n` requests, for progress output. */
export function estimateDuration(n: number): string {
  const seconds = Math.round((n * REQUEST_GAP_MS) / 1000);
  return seconds < 90 ? `${seconds}s` : `${Math.ceil(seconds / 60)} min`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shape the API uses to report a throttle or a bad request. */
type BdlError = { errorResult?: string; message?: string };

export class BdlThrottleError extends Error {}

async function request<T>(path: string): Promise<T> {
  const url = `${BASE}/${path}${path.includes("?") ? "&" : "?"}format=json`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "pl",
  };
  // An API key is optional. Without one the anonymous throttle applies, which is
  // enough for a full refresh as long as the gap above is respected.
  if (API_KEY) headers["X-ClientId"] = API_KEY;

  let backoff = BACKOFF_START_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    /*
     * Transport failures are retried, not fatal.
     *
     * Only the throttle was being retried, so a dropped connection — one
     * `UND_ERR_CONNECT_TIMEOUT` in a run of ninety requests spread over
     * eighteen minutes — threw straight out of this loop and killed the job
     * with two thirds of the indicators loaded. A refresh that long will meet
     * a flaky connection eventually; the right response is to wait and ask
     * again, the same as for a throttle, only sooner because nothing is asking
     * us to back off.
     */
    let res: Response;
    let text: string;
    try {
      res = await fetch(url, { headers });
      text = await res.text();
    } catch (cause) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`BDL unreachable after ${MAX_RETRIES} retries: ${path}`, { cause });
      }
      const wait = Math.min(TRANSPORT_BACKOFF_MS * 2 ** attempt, BACKOFF_CAP_MS);
      console.warn(
        `  ⏳ BDL unreachable, retrying in ${Math.round(wait / 1000)}s ` +
          `(attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(wait);
      continue;
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`BDL returned non-JSON for ${path}: ${text.slice(0, 200)}`);
    }

    const err = body as BdlError;
    if (err?.errorResult) {
      // "Przekroczono limit wywołań API" — the throttle. Anything else is fatal.
      if (/limit/i.test(err.errorResult)) {
        if (attempt === MAX_RETRIES) {
          throw new BdlThrottleError(
            `BDL throttle did not clear after ${MAX_RETRIES} retries: ${err.errorResult}`,
          );
        }
        console.warn(
          `  ⏳ BDL throttled, waiting ${Math.round(backoff / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await sleep(backoff);
        backoff = Math.min(backoff * 2, BACKOFF_CAP_MS);
        continue;
      }
      throw new Error(`BDL error for ${path}: ${err.errorResult}`);
    }

    if (!res.ok) {
      throw new Error(`BDL ${res.status} for ${path}: ${text.slice(0, 200)}`);
    }

    return body as T;
  }

  throw new BdlThrottleError(`BDL request failed: ${path}`);
}

/** Queue a BDL request behind all previous ones, keeping a fixed gap. */
export function bdlFetch<T>(path: string): Promise<T> {
  const result = queue.then(async () => {
    const value = await request<T>(path);
    completed++;
    await sleep(REQUEST_GAP_MS);
    return value;
  });
  // Keep the chain alive even if one call rejects.
  queue = result.catch(() => undefined);
  return result as Promise<T>;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type BdlUnit = {
  id: string;
  name: string;
  parentId: string;
  level: number;
  kind: string;
};

export type BdlVariableValue = { year: string; val: number | null };

export type BdlUnitDataResult = {
  id: number;
  values: BdlVariableValue[];
};

/** Response of /data/by-unit/{unitId} */
export type BdlUnitData = {
  unitId: string;
  unitName: string;
  results: BdlUnitDataResult[];
};

/** One unit's values inside a /data/by-variable response. */
export type BdlVariableUnit = {
  id: string;
  name: string;
  values: BdlVariableValue[];
};

/**
 * Response of /data/by-variable.
 *
 * Note the absence of `pageSize`: unlike /units/search, this endpoint reports
 * only the total. Callers must page using the size they asked for.
 */
export type BdlVariableData = {
  totalRecords: number;
  page: number;
  results: BdlVariableUnit[];
};

export type BdlSearchResponse<T> = { totalRecords: number; results: T[] };

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------

/** Find administrative units by name at a given level (5 = powiat, 6 = gmina). */
export function searchUnits(name: string, level: number) {
  return bdlFetch<BdlSearchResponse<BdlUnit>>(
    `units/search?name=${encodeURIComponent(name)}&level=${level}&page-size=50`,
  );
}

/** Fetch several variables for one unit. */
export function unitData(unitId: string, varIds: number[], years: number[]) {
  const vars = varIds.map((v) => `var-id=${v}`).join("&");
  const yrs = years.map((y) => `year=${y}`).join("&");
  return bdlFetch<BdlUnitData>(`data/by-unit/${unitId}?${vars}&${yrs}`);
}

/**
 * Fetch one variable for every unit at a level, one page at a time.
 * This is what makes a full refresh cheap: 66 cities arrive in a handful of
 * requests instead of 66 separate ones.
 */
export function variableData(
  varId: number,
  unitLevel: number,
  years: number[],
  page = 0,
  pageSize = 100,
) {
  const yrs = years.map((y) => `year=${y}`).join("&");
  return bdlFetch<BdlVariableData>(
    `data/by-variable/${varId}?unit-level=${unitLevel}&${yrs}&page=${page}&page-size=${pageSize}`,
  );
}
