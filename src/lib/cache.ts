import { db } from "./db";

/**
 * A TTL cache for the live providers, kept in Postgres.
 *
 * The bulk statistics are loaded by the refresh script and read straight from
 * their own tables. What passes through here is the handful of sources that
 * change during the day — air quality, the weather, exchange rates — plus
 * Wikipedia, which changes rarely but is slow enough to be worth holding.
 *
 * Postgres rather than an in-process map because the site renders on serverless
 * functions: a warm local cache would be per-instance, so most readers would
 * miss it, and every miss is a request to a public service that is doing us a
 * favour by being free.
 */

/** How long each provider's responses stay fresh. */
export const TTL = {
  /** Air quality is recomputed hourly at the station. */
  GIOS: 60 * 60 * 1000,
  /** Synoptic observations are published hourly. */
  IMGW: 60 * 60 * 1000,
  /** The National Bank publishes one table per working day. */
  NBP: 24 * 60 * 60 * 1000,
  /** City articles rarely change in ways that matter here. */
  WIKIPEDIA: 30 * 24 * 60 * 60 * 1000,
} as const;

export type Provider = keyof typeof TTL;

/**
 * Return the cached payload for `key`, or run `fetcher` and store its result.
 *
 * A failed fetch never throws to the caller: a city page that cannot reach GIOŚ
 * should still render every statistic it already has, with the air-quality
 * block absent rather than an error page. Stale content is preferred to nothing
 * when the upstream is down.
 */
export async function fetchCached<T>(
  provider: Provider,
  key: string,
  fetcher: () => Promise<T>,
): Promise<T | null> {
  const cacheKey = `${provider}:${key}`;
  const now = new Date();

  let existing: { payload: unknown; expiresAt: Date } | null = null;
  try {
    existing = await db.apiCache.findUnique({
      where: { cacheKey },
      select: { payload: true, expiresAt: true },
    });
  } catch {
    // No database is not a reason to fail the page; go straight to the source.
    return fetcher().catch(() => null);
  }

  if (existing && existing.expiresAt > now) {
    await db.apiCache
      .update({ where: { cacheKey }, data: { hitCount: { increment: 1 } } })
      .catch(() => undefined);
    return existing.payload as T;
  }

  let fresh: T;
  try {
    fresh = await fetcher();
  } catch (error) {
    // Swallowing this keeps a city page alive when a public service is down,
    // but silence during development hides real bugs — a wrong header or a
    // renamed endpoint looks exactly like an empty panel. Say so outside
    // production.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[cache] ${provider} ${key} failed:`, (error as Error).message);
    }
    // An expired entry is still better than an empty panel.
    return existing ? (existing.payload as T) : null;
  }

  await db.apiCache
    .upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        provider,
        payload: fresh as object,
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + TTL[provider]),
      },
      update: {
        payload: fresh as object,
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + TTL[provider]),
        hitCount: 0,
      },
    })
    .catch(() => undefined);

  return fresh;
}
