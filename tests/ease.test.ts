import { describe, expect, it } from "vitest";
import { easeFactor } from "../src/lib/ease";

describe("easeFactor", () => {
  it("advances further over a longer frame", () => {
    expect(easeFactor(1 / 60, 4)).toBeLessThan(easeFactor(1 / 30, 4));
  });

  it("ignores time beyond one frame at 30fps", () => {
    // The case this exists for: the main thread blocks for half a second while
    // a new measure is prepared, and the first frame afterwards must not spend
    // the whole transition in one step.
    const stall = easeFactor(0.5, 4);
    expect(stall).toBe(easeFactor(1 / 30, 4));
    expect(stall).toBeLessThan(0.2);
  });

  it("never overshoots", () => {
    for (const delta of [0, 1 / 240, 1 / 60, 10]) {
      const k = easeFactor(delta, 7);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1);
    }
  });
});
