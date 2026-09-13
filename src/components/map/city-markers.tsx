"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { easeFactor } from "@/lib/ease";
import {
  DoubleSide,
  Group,
  MathUtils,
  Vector3,
  type Color,
  type Mesh,
  type MeshBasicMaterial,
} from "three";

/**
 * Radius of a city dot, in CSS pixels.
 *
 * Pixels rather than world units, because the thing this component exists to
 * fix is a scale problem. A Polish city with powiat status is a few kilometres
 * across; drawn to scale against a 700 km country it is two or three pixels
 * wide — a speck, invisible, and impossible to aim at. Sizing the symbol in
 * screen space instead means every one of the 66 cities is legible at the
 * country view and stays legible however far the reader zooms in, which is what
 * a point symbol on a map is for.
 */
const DOT_PX = 6;
const ACTIVE_PX = 8.6;
/** Invisible disc that catches the pointer, so the target is not the speck. */
const HIT_PX = 15;

export type MarkerItem = {
  slug: string;
  position: Vector3;
  color: Color;
  /** False when the current measure has no figure for this city. */
  hasValue: boolean;
};

/**
 * A dot per city, sized in screen space.
 *
 * Bigger and more strongly ringed than the first version, because the country
 * around them is no longer empty. Against bare ground a faint dot was plenty;
 * against three hundred counties in the same palette it vanished, and with it
 * the one thing this guide is actually about.
 *
 * Cities the measure covers are filled with its colour; cities it does not are
 * drawn hollow. Hollow rather than grey, and this is the whole point: a grey
 * fill sits a shade away from the cool end of the ramp, so at a glance "no
 * figure published" is indistinguishable from "lowest in the country" — the
 * single worst thing a statistical map can say. An outline with nothing inside
 * it cannot be mistaken for a value, while still leaving the city visible and
 * clickable, which matters because a reader looking for Elbląg does not know in
 * advance whether Elbląg has data.
 */
export function CityMarkers({
  items,
  hovered,
  selected,
  onHover,
  onHoverOut,
  onSelect,
  animate,
}: {
  items: MarkerItem[];
  hovered: string | null;
  selected: string | null;
  /** False under prefers-reduced-motion: colours are set rather than eased. */
  animate: boolean;
  onHover: (slug: string) => void;
  /** Separate from `onHover` so leaving one dot cannot clear another's hover. */
  onHoverOut: (slug: string) => void;
  onSelect: (slug: string) => void;
}) {
  const root = useRef<Group>(null);
  const { camera, size } = useThree();

  /** Scale factors are per-marker state, kept out of React to stay per-frame. */
  const active = useMemo(() => ({ hovered, selected }), [hovered, selected]);

  /** Where each dot's fill is heading, in render order. */
  const targets = useMemo(() => items.map((i) => i.color), [items]);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;

    // The dots cross the ramp with the country beneath them rather than
    // snapping to the new measure a beat ahead of it.
    const ease = animate ? easeFactor(delta, 4) : 1;

    // World units covered by one pixel at the plane the map sits on. The
    // camera's field of view is vertical, so height is the right divisor.
    const fov = MathUtils.degToRad("fov" in camera ? (camera.fov as number) : 50);
    const distance = camera.position.length();
    const unitsPerPixel = (2 * distance * Math.tan(fov / 2)) / size.height;

    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i];
      const slug = child.userData.slug as string;
      const isActive = slug === active.hovered || slug === active.selected;
      const target = (isActive ? ACTIVE_PX : DOT_PX) * unitsPerPixel;
      // Eased rather than set, so growing under the pointer reads as a response
      // to the reader and not as a jump.
      child.scale.setScalar(child.scale.x + (target - child.scale.x) * 0.25);

      /*
       * Found by tag, not by position.
       *
       * The dot's fill only exists when the measure covers the city, so
       * reaching for it by index quietly picks up the pointer target instead
       * on every city it does not — a bug that shows as nothing at all until
       * someone opens a measure with gaps.
       */
      const wanted = targets[i];
      if (wanted) {
        let disc: Mesh | undefined;
        child.traverse((node) => {
          if (node.userData.role === "disc") disc = node as Mesh;
        });
        const material = disc?.material as MeshBasicMaterial | undefined;
        material?.color.lerp(wanted, ease);
      }

      // Billboard. Laid flat on the ground plane the dots project as ellipses
      // under the tilted camera, and an ellipse reads as a shape on the terrain
      // rather than as a symbol placed on the map. Turning each one to face the
      // camera keeps it a circle from every angle, which is what makes it read
      // as notation rather than geography.
      child.quaternion.copy(camera.quaternion);
    }
  });

  return (
    <group ref={root}>
      {items.map((item) => {
        const isSelected = item.slug === selected;
        const isHovered = item.slug === hovered;
        const lit = item.hasValue;

        return (
          <group key={item.slug} position={item.position} userData={{ slug: item.slug }}>
            <group>
              {/* Collar: a hairline so the dot never melts into the land.
                  Kept thin and low-contrast — a heavy ring around a pale fill
                  stops reading as a map symbol and starts reading as an eye.
                  For a city with no figure it is the symbol, not a collar, so
                  it carries the weight instead. */}
              <mesh position={[0, 0, 0.46]} renderOrder={2}>
                <ringGeometry
                  args={[lit ? 1 : 0.68, isSelected || isHovered ? 1.34 : 1.24, 28]}
                />
                <meshBasicMaterial
                  color={
                    isSelected || isHovered ? "#f0b752" : lit ? "#0a1016" : "#8ba0ad"
                  }
                  transparent
                  opacity={isSelected || isHovered ? 0.95 : lit ? 0.85 : 0.75}
                  side={DoubleSide}
                  depthTest={false}
                />
              </mesh>

              {lit && (
                <mesh position={[0, 0, 0.48]} renderOrder={3} userData={{ role: "disc" }}>
                  <circleGeometry args={[1, 28]} />
                  <meshBasicMaterial color={item.color} depthTest={false} />
                </mesh>
              )}

              {/* Pointer target, sized for a finger rather than for the eye. */}
              <mesh
                position={[0, 0, 0.5]}
                scale={HIT_PX / DOT_PX}
                visible={false}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  onHover(item.slug);
                }}
                onPointerOut={() => onHoverOut(item.slug)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(item.slug);
                }}
              >
                <circleGeometry args={[1, 12]} />
                <meshBasicMaterial depthTest={false} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}
