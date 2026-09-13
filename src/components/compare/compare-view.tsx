"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  scoreCities,
  THEMES,
  type IndicatorMeta,
  type Theme,
} from "@/lib/scoring/score";
import type { ComparisonCity } from "@/lib/queries";
import { WeightSliders } from "./weight-sliders";
import { ScoreTable } from "./score-table";

/** A starting point that favours nothing: every theme counts the same. */
const DEFAULT_WEIGHT = 50;

type Props = {
  cities: ComparisonCity[];
  indicators: IndicatorMeta[];
  initialSelection: string[];
  initialWeights: Record<Theme, number>;
};

export function CompareView({ cities, indicators, initialSelection, initialWeights }: Props) {
  const t = useTranslations("compare");
  const router = useRouter();
  const pathname = usePathname();

  const [selected, setSelected] = useState<string[]>(initialSelection);
  const [weights, setWeights] = useState<Record<Theme, number>>(initialWeights);
  const [copied, setCopied] = useState(false);

  const chosen = useMemo(
    () => cities.filter((c) => selected.includes(c.slug)),
    [cities, selected],
  );

  const scored = useMemo(
    () =>
      scoreCities(
        chosen.map((c) => ({ id: 0, slug: c.slug, name: c.name, values: c.values })),
        indicators,
        weights,
      ),
    [chosen, indicators, weights],
  );

  /**
   * The comparison lives in the address bar rather than in a saved record.
   * There are no accounts here, so a link is how a comparison is kept and
   * passed on — and it survives a reload without asking anyone to sign in.
   */
  const syncUrl = useCallback(
    (nextSelected: string[], nextWeights: Record<Theme, number>) => {
      const params = new URLSearchParams();
      if (nextSelected.length) params.set("cities", nextSelected.join(","));
      params.set("w", THEMES.map((theme) => nextWeights[theme]).join("-"));
      // replace, not push: dragging a slider should not fill the back button.
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [router, pathname],
  );

  const toggleCity = (slug: string) => {
    const next = selected.includes(slug)
      ? selected.filter((s) => s !== slug)
      : [...selected, slug];
    setSelected(next);
    syncUrl(next, weights);
  };

  const changeWeight = (theme: Theme, value: number) => {
    const next = { ...weights, [theme]: value };
    setWeights(next);
    syncUrl(selected, next);
  };

  const reset = () => {
    const next = Object.fromEntries(THEMES.map((x) => [x, DEFAULT_WEIGHT])) as Record<Theme, number>;
    setWeights(next);
    syncUrl(selected, next);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[300px_1fr]">
      <div>
        <WeightSliders
          weights={weights}
          onChange={changeWeight}
          onReset={reset}
          resetLabel={t("reset")}
        />

        <button
          type="button"
          onClick={copyLink}
          className="mt-5 w-full border border-glass-line px-3 py-2 text-[13px] text-bright hover:bg-shelf"
        >
          {copied ? t("copied") : t("shareLink")}
        </button>
      </div>

      <div>
        <fieldset>
          <legend className="text-[13px] text-muted">{t("addCity")}</legend>
          <div className="mt-2 flex max-h-44 flex-wrap gap-x-3 gap-y-1.5 overflow-y-auto border border-glass-line p-3">
            {cities.map((city) => {
              const active = selected.includes(city.slug);
              return (
                <label key={city.slug} className="cursor-pointer text-[13px]">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleCity(city.slug)}
                    className="sr-only"
                  />
                  <span
                    className={
                      active
                        ? "border-b-2 border-brass text-bright"
                        : "border-b-2 border-transparent text-muted hover:text-bright"
                    }
                  >
                    {city.name}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6">
          {scored.length < 2 ? (
            <p className="text-[15px] text-muted">{t("selectAtLeast")}</p>
          ) : (
            <ScoreTable cities={scored} />
          )}
        </div>
      </div>
    </div>
  );
}
