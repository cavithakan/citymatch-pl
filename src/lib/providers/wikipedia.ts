import { fetchCached } from "../cache";
import type { Locale } from "@/i18n/routing";

/**
 * The opening paragraph of a city's Wikipedia article.
 *
 * Statistics say what a city measures; they do not say what it is. One
 * paragraph of plain description gives the numbers somewhere to land, and using
 * the reader's own language matters here — the Polish and English articles are
 * written for different audiences, not translated from one another.
 */

export type Summary = { title: string; extract: string; url: string };

export async function getCitySummary(title: string, locale: Locale): Promise<Summary | null> {
  const data = await fetchCached("WIKIPEDIA", `${locale}:${title}`, async () => {
    const res = await fetch(
      `https://${locale}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`Wikipedia ${locale}/${title}: ${res.status}`);
    return (await res.json()) as {
      title: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
  });

  if (!data?.extract) return null;
  return {
    title: data.title,
    extract: data.extract,
    url: data.content_urls?.desktop?.page ?? `https://${locale}.wikipedia.org/wiki/${title}`,
  };
}
