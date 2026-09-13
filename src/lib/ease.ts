/**
 * Frame-rate independent easing, with the stalls taken out.
 *
 * The usual exponential approach — `1 - exp(-rate · delta)` — is written to
 * behave the same at 30 frames a second as at 144. That property quietly
 * breaks when a frame is late for a reason that has nothing to do with the
 * display: changing the measure on the map re-renders three hundred counties
 * and blocks the main thread for a few hundred milliseconds, and the first
 * frame afterwards arrives carrying that whole pause as its delta. The formula
 * does what it was told and advances the transition almost to completion in
 * one step, so the reader sees the new colours appear rather than arrive.
 *
 * Clamping the delta fixes it: a frame that took longer than `MAX_STEP` is
 * treated as having taken `MAX_STEP`. Animations then run slightly slow
 * through a stutter instead of skipping it, which is the right trade — the
 * point of the transition is that someone watches it happen.
 */

/** Longest step any easing will honour: one frame at 30fps. */
const MAX_STEP = 1 / 30;

export function easeFactor(delta: number, rate: number): number {
  return 1 - Math.exp(-rate * Math.min(delta, MAX_STEP));
}
