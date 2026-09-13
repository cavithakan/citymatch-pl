"use client";

import { Html } from "@react-three/drei";
import type { Vector3 } from "three";

export type LabelItem = {
  slug: string;
  name: string;
  /** Top of the city's bar, where the label is pinned. */
  anchor: Vector3;
  formatted: string | null;
  rank: number;
};

/**
 * City names on the map.
 *
 * All 66 at once is unreadable — Upper Silesia alone would stack a dozen labels
 * on top of each other — so by default only the leaders on the current measure
 * are named, plus whichever city the reader is pointing at or has opened. The
 * "show all" switch exists because the right number depends on how far in they
 * have zoomed, and that is their judgement to make, not a threshold we can
 * guess.
 */
export function CityLabels({
  items,
  hovered,
  selected,
  showAll,
  visibleCount,
}: {
  items: LabelItem[];
  hovered: string | null;
  selected: string | null;
  showAll: boolean;
  visibleCount: number;
}) {
  return (
    <>
      {items.map((item) => {
        const isActive = item.slug === selected || item.slug === hovered;
        const withinTop = item.rank <= visibleCount;
        if (!showAll && !withinTop && !isActive) return null;

        return (
          <Html
            key={item.slug}
            position={item.anchor}
            center
            // No distanceFactor: a map label is chrome, not scenery. Scaling it
            // with the camera turns names into billboards the moment anyone
            // zooms in, which is the opposite of what zooming is for.
            // Kept below the floating panels: a label that slides under the
            // control panel is a map label behaving correctly; one that sits on
            // top of it looks like a rendering fault.
            zIndexRange={[10, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div
              className={
                "-translate-y-1/2 whitespace-nowrap rounded-full px-2 py-[3px] text-center leading-tight transition-colors " +
                (isActive
                  ? "bg-brass text-abyss"
                  : "bg-abyss/70 text-bright backdrop-blur-[2px]")
              }
              style={{ fontSize: 11 }}
            >
              <span className="font-medium">{item.name}</span>
              {isActive && item.formatted && (
                <span className="ms-1.5 opacity-80">{item.formatted}</span>
              )}
            </div>
          </Html>
        );
      })}
    </>
  );
}
