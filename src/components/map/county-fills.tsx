"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { easeFactor } from "@/lib/ease";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  ShapeGeometry,
  type Shape,
} from "three";

/**
 * A county's outline. Fixed for the life of the map.
 *
 * Kept apart from its colour, which changes every time the reader picks a
 * different measure. Merging the two into one prop meant the merged buffer was
 * rebuilt on every measure change — 314 polygons re-triangulated for a colour
 * change, and worse, the new colours written straight into the buffer at build
 * time, so the eased transition had nothing left to ease.
 */
export type CountyShape = { slug: string; shapes: Shape[] };

/** What a county is worth on the measure currently drawn. */
export type CountyPaint = { color: Color; hasValue: boolean };

/**
 * A county the measure does not cover.
 *
 * Painted a flat neutral rather than left nearly transparent. Five of the
 * indicators — air quality and the three climate figures — are tied to a
 * measuring station or a coordinate, and counties have neither, so choosing
 * one of those used to empty the country back out and make the map look
 * broken. A slate that sits off the ramp entirely says the honest thing
 * instead: this place is here, and this measure was not taken here.
 */
const MISSING_COLOR = new Color("#2b3c49");
/** How much a county brightens under the pointer. */
const HOVER_LIFT = 1.22;
/** Approach rate of the colour transition, per second. */
const EASE_RATE = 4;
/** Below this, the transition is over and the buffer stops being rewritten. */
const SETTLED = 0.002;

type Merged = {
  geometry: BufferGeometry;
  /** Vertex range per county, parallel to `items`. */
  ranges: { start: number; count: number }[];
  /** Triangle index → position in `items`, for picking. */
  faceToItem: Uint32Array;
};

/**
 * The 314 land counties, as one mesh.
 *
 * GUS publishes every one of these indicators for all 380 powiats, and the
 * request that fetches the cities returns the counties in the same response —
 * so the country between the cities was never short of data, it was short of
 * anyone drawing it.
 *
 * One mesh rather than 314, and that is not premature tidiness: drawn
 * separately they cost a draw call each and put the whole map at seven frames
 * a second, which is slow enough that an eased colour transition finishes in
 * two frames and reads as a jump. Merging them into a single buffer with
 * per-vertex colour is what makes the country both quick and capable of
 * changing measure smoothly. Picking still works per county, through a
 * triangle-to-county table built at the same time as the buffer.
 *
 * Counties share the cities' colour ramp exactly, because a choropleth in
 * which two units with the same value are different colours is not a map of
 * anything. What separates a city is its dot, its label, its arms and its
 * outline; a county is the ground a city's figure is read against.
 */
export function CountyFills({
  shapes,
  paint,
  hovered,
  selected,
  animate,
  onHover,
  onHoverOut,
  onSelect,
}: {
  shapes: CountyShape[];
  /** Colour per county slug for the current measure. */
  paint: Map<string, CountyPaint>;
  hovered: string | null;
  /** The open county, which has to be findable on the map it was opened from. */
  selected: string | null;
  /** False under prefers-reduced-motion: colours are set rather than eased. */
  animate: boolean;
  onHover: (slug: string) => void;
  onHoverOut: (slug: string) => void;
  onSelect: (slug: string) => void;
}) {
  const merged = useMemo(() => mergeShapes(shapes), [shapes]);
  useEffect(() => () => merged.geometry.dispose(), [merged]);

  /**
   * Colour each county is showing now, eased toward the target each frame.
   *
   * Seeded inside the frame loop rather than during render, and deliberately
   * not re-seeded when the measure changes: the whole point is to keep the
   * colour the reader is currently looking at so the next one can be eased
   * from it.
   */
  const current = useRef<Color[]>([]);

  const targets = useMemo(
    () =>
      shapes.map((s) => {
        const p = paint.get(s.slug);
        return p?.hasValue ? p.color : MISSING_COLOR;
      }),
    [shapes, paint],
  );

  const lifted = useRef(new Color());

  useFrame((_, delta) => {
    /*
     * Seeding also has to paint.
     *
     * The merged buffer is created black and the loop is the only thing that
     * ever writes a colour into it, so seeding `current` straight to the
     * target left every county at a distance of zero from where it was meant
     * to be — the loop skipped them all as already settled and the country
     * rendered black.
     */
    let forceWrite = false;
    if (current.current.length !== shapes.length) {
      current.current = targets.map((c) => c.clone());
      forceWrite = true;
    }

    // The same easing the cities use, so a measure change moves the whole
    // country as one thing.
    const k = animate ? easeFactor(delta, EASE_RATE) : 1;
    const attribute = merged.geometry.getAttribute("color") as BufferAttribute;
    const array = attribute.array as Float32Array;
    let changed = false;

    for (let i = 0; i < shapes.length; i++) {
      const colour = current.current[i];
      const target = targets[i];
      if (!colour || !target) continue;

      const active = shapes[i].slug === hovered || shapes[i].slug === selected;
      const wanted = active
        ? lifted.current.copy(target).multiplyScalar(HOVER_LIFT)
        : target;

      const distance =
        Math.abs(colour.r - wanted.r) +
        Math.abs(colour.g - wanted.g) +
        Math.abs(colour.b - wanted.b);
      if (distance < SETTLED && !forceWrite) continue;

      if (!forceWrite) colour.lerp(wanted, k);
      changed = true;

      const { start, count } = merged.ranges[i];
      for (let v = 0; v < count; v++) {
        const at = (start + v) * 3;
        array[at] = colour.r;
        array[at + 1] = colour.g;
        array[at + 2] = colour.b;
      }
    }

    // Only when something moved: uploading 200,000 floats to the GPU on every
    // frame of a still map would undo the point of merging them.
    if (changed) attribute.needsUpdate = true;
  });

  const selectedItem = selected ? shapes.find((s) => s.slug === selected) : undefined;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        geometry={merged.geometry}
        position={[0, 0, -0.005]}
        onPointerMove={(e) => {
          e.stopPropagation();
          const slug = slugAtFace(shapes, merged, e.faceIndex);
          if (slug) onHover(slug);
        }}
        onPointerOut={() => hovered && onHoverOut(hovered)}
        onClick={(e) => {
          e.stopPropagation();
          const slug = slugAtFace(shapes, merged, e.faceIndex);
          if (slug) onSelect(slug);
        }}
      >
        <meshBasicMaterial vertexColors transparent opacity={0.88} side={DoubleSide} depthWrite={false} />
      </mesh>

      {/* The open county, outlined. Without it a reader who opens a panel from
          a country of three hundred identical shapes has no way back to which
          shape they clicked. */}
      {selectedItem && <SelectedOutline shapes={selectedItem.shapes} />}
    </group>
  );
}

function slugAtFace(
  items: CountyShape[],
  merged: Merged,
  faceIndex: number | null | undefined,
): string | null {
  if (faceIndex === undefined || faceIndex === null) return null;
  const index = merged.faceToItem[faceIndex];
  return items[index]?.slug ?? null;
}

/**
 * Triangulate every county once and concatenate the results.
 *
 * Position and colour only: no normals, because the material is unlit, and no
 * index, because `ShapeGeometry` returns non-indexed triangles and keeping
 * them that way makes the triangle-to-county table a simple division.
 */
function mergeShapes(items: CountyShape[]): Merged {
  const parts = items.map((item) => {
    const shaped = new ShapeGeometry(item.shapes);
    /*
     * Expanded to plain triangles before concatenating.
     *
     * `ShapeGeometry` returns an indexed geometry: its position attribute
     * holds each vertex once and an index buffer says how to join them.
     * Concatenating those positions and throwing the indices away joins
     * whatever vertices happen to land next to each other, which draws long
     * triangles from one county across the country to another.
     */
    const geometry = shaped.toNonIndexed();
    const positions = geometry.getAttribute("position").array as Float32Array;
    shaped.dispose();
    geometry.dispose();
    return positions;
  });

  const total = parts.reduce((sum, p) => sum + p.length / 3, 0);
  const positions = new Float32Array(total * 3);
  // Left black. The frame loop owns every colour in this buffer, and seeding
  // it with the current measure here is what made the transition invisible.
  const colors = new Float32Array(total * 3);
  // 32-bit: three hundred counties at this resolution run well past the 65,535
  // faces a Uint16Array can address, and an overflow there silently points a
  // click at the wrong county.
  const faceToItem = new Uint32Array(total / 3);
  const ranges: { start: number; count: number }[] = [];

  let vertex = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const count = part.length / 3;
    positions.set(part, vertex * 3);
    for (let f = 0; f < count / 3; f++) faceToItem[vertex / 3 + f] = i;
    ranges.push({ start: vertex, count });
    vertex += count;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return { geometry, ranges, faceToItem };
}

/** Brass outline of the open county, drawn over the fills. */
function SelectedOutline({ shapes }: { shapes: Shape[] }) {
  const edges = useMemo(
    () => shapes.map((shape) => new EdgesGeometry(new ShapeGeometry(shape))),
    [shapes],
  );
  useEffect(() => () => edges.forEach((e) => e.dispose()), [edges]);

  return (
    <>
      {edges.map((geometry, i) => (
        /*
         * Drawn last, explicitly.
         *
         * The outline and the county fills are both transparent, so three.js
         * sorts them by distance — and at almost the same depth the fills won
         * and painted straight over the line. `depthTest: false` does not help
         * with that: it decides whether a pixel is allowed to draw, not who
         * draws afterwards.
         */
        <lineSegments key={i} geometry={geometry} position={[0, 0, 0.02]} renderOrder={10}>
          <lineBasicMaterial color="#f0b752" transparent opacity={0.95} depthTest={false} />
        </lineSegments>
      ))}
    </>
  );
}
