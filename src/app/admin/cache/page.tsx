import { db } from "@/lib/db";
import { Expiry, RelativeTime } from "../relative-time";

export const dynamic = "force-dynamic";

/**
 * A window onto the response cache.
 *
 * Everything else on the site hides the fact that it talks to five public APIs.
 * This page makes it visible: which provider answered, when, how long the
 * answer stays good, and how many page views it has served since. It is the
 * quickest way to tell a caching problem from a data problem — a row with a
 * hit count of zero that keeps refetching is a TTL that is not working.
 *
 * Not localised: this is an operator's view, not part of the guide.
 */
export default async function CacheInspector() {
  const [entries, totals] = await Promise.all([
    db.apiCache.findMany({
      select: { provider: true, cacheKey: true, fetchedAt: true, expiresAt: true, hitCount: true },
      orderBy: [{ provider: "asc" }, { fetchedAt: "desc" }],
      take: 200,
    }),
    db.apiCache.groupBy({
      by: ["provider"],
      _count: { _all: true },
      _sum: { hitCount: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-[1000px] px-5 py-8">
      <h1 className="font-display text-2xl text-bright">Response cache</h1>
      <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted">
        Cached responses from the live providers. Bulk statistics from Statistics Poland are loaded
        by the refresh script into their own tables and never pass through here.
      </p>

      <div className="mt-6 flex flex-wrap gap-8">
        {totals.map((row) => (
          <div key={row.provider}>
            <p className="text-[13px] text-muted">{row.provider}</p>
            <p className="font-display text-xl text-bright">{row._count._all}</p>
            <p className="text-xs text-muted">{row._sum.hitCount ?? 0} hits</p>
          </div>
        ))}
        {totals.length === 0 && (
          <p className="text-[14px] text-muted">
            Nothing cached yet. Open a city page to populate it.
          </p>
        )}
      </div>

      {entries.length > 0 && (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-glass-line text-start">
                <th scope="col" className="py-2 pe-4 text-start font-medium">Key</th>
                <th scope="col" className="py-2 pe-4 text-start font-medium">Provider</th>
                <th scope="col" className="py-2 pe-4 text-end font-medium">Fetched</th>
                <th scope="col" className="py-2 pe-4 text-end font-medium">Expires</th>
                <th scope="col" className="py-2 text-end font-medium">Hits</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                  <tr key={entry.cacheKey} className="border-b border-glass-line">
                    <td className="py-1.5 pe-4 text-bright">{entry.cacheKey}</td>
                    <td className="py-1.5 pe-4 text-muted">{entry.provider}</td>
                    <td className="py-1.5 pe-4 text-end text-muted">
                      <RelativeTime iso={entry.fetchedAt.toISOString()} suffix="ago" />
                    </td>
                    <td className="py-1.5 pe-4 text-end">
                      <Expiry iso={entry.expiresAt.toISOString()} staleLabel="stale" />
                    </td>
                    <td className="py-1.5 text-end text-bright">{entry.hitCount}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
