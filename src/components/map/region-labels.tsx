"use client";

import { Html } from "@react-three/drei";
import type { Vector3 } from "three";

export type RegionLabel = { name: string; anchor: Vector3 };

/**
 * Voivodeship names, written across the country itself.
 *
 * Without them the map has sixteen unnamed compartments, most of them holding
 * a single city and a great deal of empty ground — which reads as missing data
 * rather than as the truth, that only sixty-six Polish towns hold county
 * rights and the rest of each province is governed from elsewhere. Naming the
 * provinces turns that emptiness into geography the reader can navigate by.
 *
 * Set well below the city names in weight and brightness: these are the ground
 * the data sits on, not the data.
 */
export function RegionLabels({ items }: { items: RegionLabel[] }) {
  return (
    <>
      {items.map((item) => (
        <Html
          key={item.name}
          position={item.anchor}
          center
          // Behind the city labels and behind the panels, and never a pointer
          // target — a province name is a caption, not a control.
          zIndexRange={[4, 0]}
          style={{ pointerEvents: "none" }}
        >
          {/* A chip, now that the ground underneath is painted. Set on bare
              land the name read fine as plain text; over three hundred filled
              counties in every colour of the ramp it had no reliable contrast
              anywhere, which is the one thing a label cannot be without. */}
          <span
            className="whitespace-nowrap rounded-full bg-abyss/70 px-2 py-[2px] text-muted backdrop-blur-[2px]"
            style={{ fontSize: 10.5, letterSpacing: "0.07em" }}
          >
            {item.name}
          </span>
        </Html>
      ))}
    </>
  );
}
