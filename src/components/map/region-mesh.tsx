"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { easeFactor } from "@/lib/ease";
import {
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShapeGeometry,
  type Group,
  type LineBasicMaterial,
  type Mesh,
  type Shape,
} from "three";

/**
 * Resting thickness. Not zero: a plate with a little depth catches the light
 * along its edge, which is what keeps 66 flat shapes from reading as a printed
 * texture rather than an object on a map.
 */
const FLAT_HEIGHT = 0.18;
/** How far the selected city rises above the plane. */
const RAISED_HEIGHT = 5.5;

type Props = {
  shapes: Shape[];
  /** Value position on 0 to 1, which drives colour. */
  intensity: number;
  color: Color;
  hovered: boolean;
  selected: boolean;
  /** False when the current measure has no figure for this city. */
  hasValue: boolean;
  dimmed: boolean;
  onPointerOver: () => void;
  onPointerOut: () => void;
  onClick: () => void;
  animate: boolean;
};

/**
 * One city on the map.
 *
 * The map is a choropleth: colour carries the measure and every city lies flat,
 * so the country reads as a map rather than a field of columns. Height is
 * reserved for one thing only, selection, which makes it unambiguous — anything
 * standing up is the city you picked.
 *
 * The outline is drawn separately at ground level and stays there when the city
 * rises, leaving its footprint behind so the reader can still see where it sits
 * among its neighbours.
 *
 * Selection is marked by height and by the outline, never by repainting the
 * shape: the city being studied is the last one whose colour should stop
 * meaning what it means everywhere else on the map.
 */
export function RegionMesh({
  shapes,
  color,
  hovered,
  selected,
  hasValue,
  dimmed,
  onPointerOver,
  onPointerOut,
  onClick,
  animate,
}: Props) {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  /**
   * Every ring's material, not just the first.
   *
   * A city is not always one polygon — several of them take in detached
   * exclaves — and animating only the first ring left the rest of the same
   * city's border frozen at its resting strength, so hovering lit part of a
   * city and not the other part.
   */
  const outlines = useRef<LineBasicMaterial[]>([]);

  const geometry = useMemo(
    () =>
      new ExtrudeGeometry(shapes, {
        depth: 1,
        bevelEnabled: false,
        curveSegments: 1,
      }),
    [shapes],
  );

  /**
   * Two materials, because ExtrudeGeometry splits itself into two groups: the
   * cap and the side walls.
   *
   * The walls need their own treatment. A Polish municipal boundary is a
   * crenellated line of hundreds of short segments facing every compass
   * direction, so a lit material gives each little facet its own brightness and
   * the raised city comes out striped like corrugated iron — the geometry is
   * right and the picture is wrong. An unlit wall in a fixed darker tint of the
   * city's own colour reads as one solid side and lets the lit cap carry the
   * shading.
   */
  const materials = useMemo(
    () => [
      new MeshStandardMaterial({ transparent: true, roughness: 0.62, metalness: 0.05 }),
      new MeshBasicMaterial({ transparent: true }),
    ],
    [],
  );

  /** Flat outlines of the same shapes, for the administrative border. */
  const edges = useMemo(
    () => shapes.map((shape) => new EdgesGeometry(new ShapeGeometry(shape))),
    [shapes],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      edges.forEach((e) => e.dispose());
      materials.forEach((m) => m.dispose());
    };
  }, [geometry, edges, materials]);

  useEffect(() => {
    if (group.current) group.current.scale.z = FLAT_HEIGHT;
  }, []);

  useFrame((_, delta) => {
    const g = group.current;
    const m = mesh.current;
    if (!g || !m) return;

    const target = selected ? RAISED_HEIGHT : FLAT_HEIGHT;
    const k = animate ? easeFactor(delta, 7) : 1;
    g.scale.z += (target - g.scale.z) * k;

    const [cap, wall] = m.material as [MeshStandardMaterial, MeshBasicMaterial];
    const material = cap;
    material.color.lerp(color, k);
    wall.color.copy(material.color).multiplyScalar(0.38);
    // The polygon is context, not the reading.
    //
    // At full strength the true municipal boundary and the dot drawn over it
    // fight: the boundary is a ragged few-pixel blob in the same colour, so the
    // symbol grows a torn edge and the map looks damaged. Holding the fill well
    // back turns the polygon into what it should be — the city's real extent,
    // there when you zoom to it — and lets the dot carry the value.
    const base = hasValue ? 0.72 : 0.3;
    const wanted = dimmed ? base * 0.5 : selected || hovered ? 1 : base;
    material.opacity += (wanted - material.opacity) * k;

    /*
     * Transparency is switched off once the shape is opaque.
     *
     * A raised city is an extruded solid whose side walls face each other. Left
     * marked transparent, the renderer sorts those walls by distance and draws
     * them in the wrong order — the column comes out shredded into vertical
     * stripes, which reads as a broken mesh rather than a selected city. An
     * opaque material uses the depth buffer instead and the walls resolve.
     */
    wall.opacity = material.opacity;

    const wantsBlending = material.opacity < 0.985;
    for (const mat of [material, wall]) {
      if (mat.transparent !== wantsBlending) {
        mat.transparent = wantsBlending;
        mat.depthWrite = !wantsBlending;
        mat.needsUpdate = true;
      }
    }

    // Strong enough to read against a filled county, which is what a city now
    // borders on every side. When the country around it was bare ground a
    // faint line was plenty.
    const strength = selected || hovered ? 1 : hasValue ? 0.95 : 0.45;
    for (const line of outlines.current) {
      line.opacity += (strength - line.opacity) * k;
    }
  });

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={group}>
        <mesh
          ref={mesh}
          geometry={geometry}
          material={materials}
          onPointerOver={(e) => {
            e.stopPropagation();
            onPointerOver();
          }}
          onPointerOut={onPointerOut}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        />
      </group>

      {/* Border, held at ground level so a raised city leaves its footprint. */}
      {edges.map((edge, i) => (
        <lineSegments
          key={i}
          ref={(node) => {
            if (node) outlines.current[i] = node.material as LineBasicMaterial;
          }}
          geometry={edge}
          position={[0, 0, 0.22]}
        >
          {/*
            The boundary is a line, so it is one pixel wide whatever the city's
            real size — which makes it the only part of a small city that
            survives the country view. Świętochłowice is four kilometres across
            against Warszawa's twenty-nine; its fill is smaller than the dot
            standing on it, and without a legible outline it has no visible
            border at all. Hence a crisp line and a subdued fill rather than
            the other way round.
          */}
          <lineBasicMaterial
            color={hovered || selected ? "#f0b752" : "#0a1016"}
            transparent
            opacity={0.35}
          />
        </lineSegments>
      ))}
    </group>
  );
}
