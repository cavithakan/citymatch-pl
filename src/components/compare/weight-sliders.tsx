"use client";

import { useTranslations } from "next-intl";
import { THEMES, type Theme } from "@/lib/scoring/score";

/**
 * Six sliders, one per theme.
 *
 * The weights are not normalised as you drag — the engine divides by their sum,
 * so what matters is their ratio, and forcing them to total 100 would make
 * every slider move the other five. Each one stays where it is put.
 */
export function WeightSliders({
  weights,
  onChange,
  onReset,
  resetLabel,
}: {
  weights: Record<Theme, number>;
  onChange: (theme: Theme, value: number) => void;
  onReset: () => void;
  resetLabel: string;
}) {
  const t = useTranslations("themes");

  return (
    <div>
      {THEMES.map((theme) => (
        <div key={theme} className="border-b border-glass-line py-3">
          <label className="block">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] leading-snug text-bright">{t(theme)}</span>
              <span className="shrink-0 text-[13px] text-muted">{weights[theme]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={weights[theme]}
              onChange={(e) => onChange(theme, Number(e.target.value))}
              className="mt-2 block w-full accent-[var(--color-brass)]"
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="mt-3 text-[13px] text-muted underline underline-offset-2 hover:text-bright"
      >
        {resetLabel}
      </button>
    </div>
  );
}
