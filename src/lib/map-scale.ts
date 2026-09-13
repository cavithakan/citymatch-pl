import { Color } from "three";

/**
 * The map's colour ramp, taken from the interwar WIG survey sheets: blue-grey
 * water through buff paper to the brick red used for built-up land.
 *
 * Blue → red rather than the more obvious green → red, because green and red
 * are the pair that collapses under deuteranopia — the commonest form of colour
 * blindness — and the ramp is the only thing encoding value on a flat view.
 * Height carries the same information for anyone who cannot separate the hues.
 */
const RAMP = ["#4a7c94", "#7fa298", "#d3c9a8", "#e09355", "#d94f43"].map((hex) => new Color(hex));

const scratch = new Color();

/** Colour for a normalised value in 0–1. */
export function rampColor(t: number): Color {
  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (RAMP.length - 1);
  const i = Math.min(Math.floor(scaled), RAMP.length - 2);
  return scratch.copy(RAMP[i]).lerp(RAMP[i + 1], scaled - i);
}

/** Hex strings for the legend, which cannot use a Three.js Color. */
export const RAMP_HEX = ["#4a7c94", "#7fa298", "#d3c9a8", "#e09355", "#d94f43"];

/**
 * Position a value on 0–1 within a set.
 *
 * A COST indicator is not inverted here. On the map, height and colour always
 * mean "more of the measured thing" — taller means more expensive, not worse —
 * because a reader looking at a price map expects the expensive cities to stand
 * up. Judgement about whether more is good belongs to the scoring engine, not
 * to the map.
 */
export function positionInRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max === min) return 0.5;
  return (value - min) / (max - min);
}
