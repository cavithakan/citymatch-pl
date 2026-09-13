"use client";

import { useTranslations } from "next-intl";

/**
 * What the reader looks at while the map's geometry downloads.
 *
 * The panels around the map are server-rendered and appear immediately, so
 * without this the centre of the screen is a black rectangle for the seconds it
 * takes to fetch half a megabyte of boundaries. An empty middle surrounded by
 * full panels does not read as loading; it reads as broken.
 *
 * The shape is a rough silhouette of Poland rather than a spinner, so the thing
 * that arrives is the thing that was promised.
 */
export function MapSkeleton() {
  const ui = useTranslations("map");

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-abyss">
      <div className="flex flex-col items-center gap-5">
        <svg
          width="220"
          height="180"
          viewBox="0 0 220 180"
          aria-hidden="true"
          className="opacity-40"
        >
          {/* A coarse outline of the country, drawn once rather than fetched. */}
          <path
            d="M28 74 L24 52 L46 34 L82 26 L112 18 L146 22 L178 16 L198 34 L204 62 L192 92 L196 120 L176 142 L150 150 L118 164 L92 156 L74 140 L48 132 L34 108 Z"
            fill="none"
            stroke="var(--color-glass-line)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-[12.5px] text-faint">{ui("loadingMap")}</p>
      </div>
    </div>
  );
}
