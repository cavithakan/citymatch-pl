import { describe, expect, it } from "vitest";
import {
  createProjection,
  geometryToLinePoints,
  geometryToShapes,
  project,
  type GeoGeometry,
} from "../src/lib/geo/projection";

const SIZE = { width: 100, height: 100 };

/** A square with a square hole punched out of the middle. */
const squareWithHole: GeoGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [14, 49],
      [24, 49],
      [24, 55],
      [14, 55],
      [14, 49],
    ],
    [
      [18, 51],
      [20, 51],
      [20, 53],
      [18, 53],
      [18, 51],
    ],
  ],
};

const projection = createProjection([squareWithHole], SIZE);

describe("project", () => {
  it("places northern points above southern ones", () => {
    // The y flip is the easiest thing to get silently wrong: without it Poland
    // renders upside down and every city still appears in a plausible place.
    const north = project(projection, 19, 54.5, SIZE)!;
    const south = project(projection, 19, 49.5, SIZE)!;
    expect(north[1]).toBeGreaterThan(south[1]);
  });

  it("places eastern points to the right of western ones", () => {
    const east = project(projection, 23, 52, SIZE)!;
    const west = project(projection, 15, 52, SIZE)!;
    expect(east[0]).toBeGreaterThan(west[0]);
  });

  it("centres the fitted extent on the origin", () => {
    const xs = [14, 24].map((lon) => project(projection, lon, 52, SIZE)![0]);
    expect(xs[0] + xs[1]).toBeCloseTo(0, 6);
  });

  it("keeps every projected point inside the requested size", () => {
    for (const [lon, lat] of squareWithHole.coordinates[0]) {
      const p = project(projection, lon, lat, SIZE)!;
      expect(Math.abs(p[0])).toBeLessThanOrEqual(SIZE.width / 2 + 1e-6);
      expect(Math.abs(p[1])).toBeLessThanOrEqual(SIZE.height / 2 + 1e-6);
    }
  });
});

describe("geometryToShapes", () => {
  it("preserves holes so enclosed municipalities stay open", () => {
    const shapes = geometryToShapes(squareWithHole, projection, SIZE);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(1);
    expect(shapes[0].holes[0].getPoints().length).toBeGreaterThanOrEqual(3);
  });

  it("returns one shape per polygon of a MultiPolygon", () => {
    const multi: GeoGeometry = {
      type: "MultiPolygon",
      coordinates: [squareWithHole.coordinates, squareWithHole.coordinates],
    };
    expect(geometryToShapes(multi, projection, SIZE)).toHaveLength(2);
  });

  it("skips degenerate rings that cannot form a face", () => {
    const degenerate: GeoGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [19, 52],
          [20, 52],
        ],
      ],
    };
    expect(geometryToShapes(degenerate, projection, SIZE)).toHaveLength(0);
  });

  it("drops a hole that is degenerate without dropping its polygon", () => {
    const badHole: GeoGeometry = {
      type: "Polygon",
      coordinates: [
        squareWithHole.coordinates[0],
        [
          [18, 51],
          [19, 51],
        ],
      ],
    };
    const shapes = geometryToShapes(badHole, projection, SIZE);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].holes).toHaveLength(0);
  });
});

describe("geometryToLinePoints", () => {
  const size = { width: 100, height: 100 };

  it("closes every ring", () => {
    // A unit square, given without a repeated closing point.
    const projection = createProjection(
      [{ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }],
      size,
    );
    const points = geometryToLinePoints(
      { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
      projection,
      size,
    );

    // Four corners → four segments → eight endpoints → 24 floats.
    expect(points).toHaveLength(24);

    // The last segment has to return to where the first one started, or the
    // boundary shows a gap at the scale a reader zooms in to check.
    const firstStart = points.slice(0, 3);
    const lastEnd = points.slice(-3);
    expect(lastEnd).toEqual(firstStart);
  });

  it("emits a segment run for each polygon of a multipolygon", () => {
    const geometry = {
      type: "MultiPolygon" as const,
      coordinates: [
        [[[0, 0], [1, 0], [1, 1]] as [number, number][]],
        [[[2, 2], [3, 2], [3, 3]] as [number, number][]],
      ],
    };
    const projection = createProjection([geometry], size);
    // Two triangles → three segments each → 36 floats.
    expect(geometryToLinePoints(geometry, projection, size)).toHaveLength(36);
  });
});
