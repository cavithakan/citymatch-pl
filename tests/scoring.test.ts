import { describe, expect, it } from "vitest";
import { extent, normalize, NEUTRAL_SCORE } from "../src/lib/scoring/normalize";
import {
  rankByIndicator,
  scoreCities,
  type IndicatorMeta,
  type ScoreInput,
} from "../src/lib/scoring/score";

describe("normalize", () => {
  it("maps a benefit indicator onto 0-100 in ascending order", () => {
    expect(normalize(10, 10, 20, "BENEFIT")).toBe(0);
    expect(normalize(15, 10, 20, "BENEFIT")).toBe(50);
    expect(normalize(20, 10, 20, "BENEFIT")).toBe(100);
  });

  it("inverts a cost indicator so the cheapest city scores highest", () => {
    expect(normalize(10, 10, 20, "COST")).toBe(100);
    expect(normalize(15, 10, 20, "COST")).toBe(50);
    expect(normalize(20, 10, 20, "COST")).toBe(0);
  });

  it("returns the midpoint when the set has no spread", () => {
    // One city compared against itself, or several with identical values:
    // there is no ranking information, so neither 0 nor 100 would be honest.
    expect(normalize(42, 42, 42, "BENEFIT")).toBe(NEUTRAL_SCORE);
    expect(normalize(42, 42, 42, "COST")).toBe(NEUTRAL_SCORE);
  });

  it("returns the midpoint rather than NaN for non-finite input", () => {
    expect(normalize(NaN, 0, 10, "BENEFIT")).toBe(NEUTRAL_SCORE);
    expect(normalize(5, -Infinity, Infinity, "COST")).toBe(NEUTRAL_SCORE);
  });

  it("clamps values outside the supplied range", () => {
    expect(normalize(30, 10, 20, "BENEFIT")).toBe(100);
    expect(normalize(0, 10, 20, "BENEFIT")).toBe(0);
  });

  it("ignores non-finite values when measuring extent", () => {
    expect(extent([3, NaN, 7, Infinity, 1])).toEqual({ min: 1, max: 7 });
    expect(extent([])).toBeNull();
    expect(extent([NaN])).toBeNull();
  });
});

const indicators: IndicatorMeta[] = [
  { code: "avg_salary", theme: "EARNINGS", direction: "BENEFIT" },
  { code: "price_per_m2", theme: "HOUSING", direction: "COST" },
  { code: "crimes_per_1000", theme: "SAFETY", direction: "COST" },
];

const cities: ScoreInput[] = [
  {
    id: 1,
    slug: "warszawa",
    name: "Warszawa",
    values: { avg_salary: 10715, price_per_m2: 15850, crimes_per_1000: 26.57 },
  },
  {
    id: 2,
    slug: "krakow",
    name: "Kraków",
    values: { avg_salary: 10455, price_per_m2: 13738, crimes_per_1000: 25.46 },
  },
  {
    id: 3,
    slug: "wroclaw",
    name: "Wrocław",
    values: { avg_salary: 9425, price_per_m2: 11913, crimes_per_1000: 28.79 },
  },
];

describe("scoreCities", () => {
  it("ranks the highest earner first when only earnings are weighted", () => {
    const result = scoreCities(cities, indicators, { EARNINGS: 100 });
    expect(result[0].slug).toBe("warszawa");
    expect(result[0].score).toBe(100);
    expect(result.at(-1)!.slug).toBe("wroclaw");
  });

  it("reverses the ranking when only housing cost is weighted", () => {
    // The same three cities, the opposite order: Warszawa pays best and costs
    // most. This is the behaviour the weighting sliders exist to expose.
    const result = scoreCities(cities, indicators, { HOUSING: 100 });
    expect(result[0].slug).toBe("wroclaw");
    expect(result.at(-1)!.slug).toBe("warszawa");
  });

  it("assigns consecutive ranks starting at 1", () => {
    const result = scoreCities(cities, indicators, {
      EARNINGS: 60,
      HOUSING: 30,
      SAFETY: 10,
    });
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("lets a salary advantage cancel a housing-cost disadvantage exactly", () => {
    // With equal weight on earnings and housing, Warszawa and Wrocław land on
    // the same score: Warszawa tops the salary scale and bottoms the price
    // scale, Wrocław does the reverse, so both average to the midpoint. Kraków
    // wins by being second on both rather than first on either.
    const result = scoreCities(cities, indicators, { EARNINGS: 50, HOUSING: 50 });
    expect(result[0].slug).toBe("krakow");
    const warszawa = result.find((r) => r.slug === "warszawa")!;
    const wroclaw = result.find((r) => r.slug === "wroclaw")!;
    expect(warszawa.score).toBeCloseTo(wroclaw.score, 10);
    expect(warszawa.rank).toBe(wroclaw.rank);
  });

  it("gives tied cities the same rank and skips the next one", () => {
    const tied: ScoreInput[] = [
      { id: 1, slug: "a", name: "A", values: { avg_salary: 100 } },
      { id: 2, slug: "b", name: "B", values: { avg_salary: 100 } },
      { id: 3, slug: "c", name: "C", values: { avg_salary: 50 } },
    ];
    const result = scoreCities(tied, indicators, { EARNINGS: 100 });
    expect(result.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("keeps theme contributions summing to the composite score", () => {
    const result = scoreCities(cities, indicators, {
      EARNINGS: 50,
      HOUSING: 30,
      SAFETY: 20,
    });
    for (const city of result) {
      const summed = city.themes.reduce((s, t) => s + t.contribution, 0);
      // This is what the "why this rank" panel asserts visually.
      expect(summed).toBeCloseTo(city.score, 10);
    }
  });

  it("does not penalise a city for an indicator GUS never published", () => {
    // Wrocław is missing the crime figure. It should still be ranked on what it
    // does have, not pushed down as though its crime rate were the worst.
    const withGap: ScoreInput[] = [
      cities[0],
      cities[1],
      { ...cities[2], values: { avg_salary: 9425, price_per_m2: 11913 } },
    ];
    const result = scoreCities(withGap, indicators, { SAFETY: 100 });
    const wroclaw = result.find((r) => r.slug === "wroclaw")!;
    expect(wroclaw.themes.some((t) => t.theme === "SAFETY")).toBe(false);
    expect(Number.isFinite(wroclaw.score)).toBe(true);
  });

  it("ignores weight given to a theme no city has data for", () => {
    // LABOUR carries half the weight but no indicator feeds it, so the result
    // must match scoring on EARNINGS alone rather than halving every score.
    const withPhantom = scoreCities(cities, indicators, { EARNINGS: 50, LABOUR: 50 });
    const earningsOnly = scoreCities(cities, indicators, { EARNINGS: 50 });
    expect(withPhantom.map((c) => c.score)).toEqual(earningsOnly.map((c) => c.score));
  });

  it("returns zero scores rather than NaN when every weight is zero", () => {
    const result = scoreCities(cities, indicators, {});
    expect(result.every((c) => c.score === 0)).toBe(true);
  });

  it("handles a single city without dividing by zero", () => {
    const result = scoreCities([cities[0]], indicators, { EARNINGS: 100 });
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(NEUTRAL_SCORE);
    expect(result[0].rank).toBe(1);
  });

  it("returns an empty list for an empty comparison", () => {
    expect(scoreCities([], indicators, { EARNINGS: 100 })).toEqual([]);
  });
});

describe("rankByIndicator", () => {
  it("ranks benefit indicators with the largest value first", () => {
    const ranks = rankByIndicator(
      [
        { id: 1, value: 10715 },
        { id: 2, value: 10455 },
        { id: 3, value: 9425 },
      ],
      "BENEFIT",
    );
    expect([ranks.get(1), ranks.get(2), ranks.get(3)]).toEqual([1, 2, 3]);
  });

  it("ranks cost indicators with the smallest value first", () => {
    const ranks = rankByIndicator(
      [
        { id: 1, value: 15850 },
        { id: 2, value: 13738 },
        { id: 3, value: 11913 },
      ],
      "COST",
    );
    expect([ranks.get(1), ranks.get(2), ranks.get(3)]).toEqual([3, 2, 1]);
  });

  it("shares a rank between equal values", () => {
    const ranks = rankByIndicator(
      [
        { id: 1, value: 5 },
        { id: 2, value: 5 },
        { id: 3, value: 9 },
      ],
      "BENEFIT",
    );
    expect([ranks.get(3), ranks.get(1), ranks.get(2)]).toEqual([1, 2, 2]);
  });
});
