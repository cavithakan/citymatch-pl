import { fetchCached } from "../cache";

/**
 * Exchange rates from NBP, the National Bank of Poland.
 *
 * Salaries and flat prices are published in złoty, which is the right unit for
 * readers who live here and an opaque one for readers deciding whether to move.
 * Converting with the central bank's own published table keeps the secondary
 * figure as defensible as the primary one.
 */

const URL = "https://api.nbp.pl/api/exchangerates/tables/A/?format=json";

type Table = { table: string; no: string; effectiveDate: string; rates: { code: string; mid: number }[] };

export type Rates = { date: string; perEur: number | null; perUsd: number | null };

export async function getRates(): Promise<Rates | null> {
  const tables = await fetchCached("NBP", "table-a", async () => {
    const res = await fetch(URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`NBP: ${res.status}`);
    return (await res.json()) as Table[];
  });

  const table = tables?.[0];
  if (!table) return null;

  const rate = (code: string) => table.rates.find((r) => r.code === code)?.mid ?? null;
  return { date: table.effectiveDate, perEur: rate("EUR"), perUsd: rate("USD") };
}

/** Convert złoty to another currency using the supplied rate. */
export function fromPln(amountPln: number, rate: number | null): number | null {
  if (rate === null || rate === 0) return null;
  return amountPln / rate;
}
