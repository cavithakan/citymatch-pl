/**
 * Turns GeoJSON boundaries into flat Three.js shapes that ExtrudeGeometry can
 * raise into the 3D map.
 *
 * Two coordinate conventions collide here and both have to be handled
 * deliberately:
 *
 *   - d3-geo projects to screen space, where y grows downward.
 *   - Three.js shapes live in the XY plane with y growing upward, and the map
 *     lays that plane flat so y becomes depth.
 *
 * `project` flips y once, in one place, so Poland is not rendered upside down.
 */
import { geoMercator, type GeoProjection } from "d3-geo";
import { Shape, Vector2 } from "three";

export type Ring = [number, number][];
export type GeoGeometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

/** Longitude/latitude bounding box of every ring in the supplied geometries. */
function lonLatBounds(geometries: GeoGeometry[]) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const g of geometries) {
    const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
  }

  if (minLon === Infinity) return null;
  return { minLon, minLat, maxLon, maxLat };
}

/**
 * A Mercator projection fitted to the supplied features.
 *
 * Mercator distorts area badly at world scale, but across Poland's ~5° of
 * latitude the distortion is small and it keeps city outlines the shape people
 * recognise.
 *
 * The fit is computed from a MultiPoint of the bounding-box corners rather than
 * from the polygons themselves, and that detail is load-bearing. d3-geo reads a
 * polygon as a *spherical* region and expects its exterior ring to wind
 * clockwise — the opposite of what GeoJSON (RFC 7946) specifies. Hand d3 a
 * counter-clockwise ring and it decides the polygon is everything except that
 * area, measures the whole globe, and scales Poland down to a smudge in the
 * middle of the map. Points carry no winding, so bounding-box corners give the
 * correct extent whatever convention the source data follows. Mercator is
 * monotonic in longitude and latitude independently, so the corners really do
 * bound the projection.
 */
export function createProjection(
  geometries: GeoGeometry[],
  size: { width: number; height: number },
): GeoProjection {
  const bounds = lonLatBounds(geometries);
  if (!bounds) return geoMercator();

  const corners: [number, number][] = [
    [bounds.minLon, bounds.minLat],
    [bounds.maxLon, bounds.minLat],
    [bounds.maxLon, bounds.maxLat],
    [bounds.minLon, bounds.maxLat],
  ];

  return geoMercator().fitSize([size.width, size.height], {
    type: "MultiPoint",
    coordinates: corners,
  });
}

/**
 * Project one lon/lat pair into map space, with the y flip applied.
 * Returns null when the projection cannot place the point.
 */
export function project(
  projection: GeoProjection,
  lon: number,
  lat: number,
  size: { width: number; height: number },
): [number, number] | null {
  const p = projection([lon, lat]);
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  // Centre the map on the origin and flip y so north points along +y.
  return [p[0] - size.width / 2, size.height / 2 - p[1]];
}

/**
 * Project a geometry's rings into a flat array of line-segment endpoints.
 *
 * For boundaries that are only ever drawn as lines, this is the cheap path:
 * `ShapeGeometry` triangulates a polygon so it can be filled, which for three
 * hundred counties is a great deal of work to produce something that is then
 * only outlined. Walking the rings and emitting consecutive pairs skips
 * triangulation entirely and yields one buffer that can be drawn in a single
 * call.
 *
 * Every ring is closed by repeating its first point, since a boundary that
 * stops one segment short of itself shows a gap at exactly the scale a reader
 * zooms in to check.
 */
export function geometryToLinePoints(
  geometry: GeoGeometry,
  projection: GeoProjection,
  size: { width: number; height: number },
): number[] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const out: number[] = [];

  for (const polygon of polygons) {
    for (const ring of polygon) {
      const points = ringToPoints(ring, projection, size);
      if (points.length < 2) continue;

      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        out.push(a.x, a.y, 0, b.x, b.y, 0);
      }
    }
  }

  return out;
}

function ringToPoints(
  ring: Ring,
  projection: GeoProjection,
  size: { width: number; height: number },
): Vector2[] {
  const points: Vector2[] = [];
  for (const [lon, lat] of ring) {
    const p = project(projection, lon, lat, size);
    if (p) points.push(new Vector2(p[0], p[1]));
  }
  return points;
}

/**
 * Convert a GeoJSON geometry into Three.js shapes.
 *
 * A GeoJSON polygon's first ring is its outer boundary and any further rings
 * are holes — Polish cities genuinely have them, since several surround a
 * smaller municipality entirely. Passing the holes to `Shape.holes` keeps those
 * gaps open instead of filling them with solid geometry.
 *
 * Rings with fewer than three usable points cannot form a face and are skipped.
 */
export function geometryToShapes(
  geometry: GeoGeometry,
  projection: GeoProjection,
  size: { width: number; height: number },
): Shape[] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const shapes: Shape[] = [];

  for (const polygon of polygons) {
    const [outer, ...holes] = polygon;
    if (!outer) continue;

    const outerPoints = ringToPoints(outer, projection, size);
    if (outerPoints.length < 3) continue;

    const shape = new Shape();
    shape.setFromPoints(outerPoints);

    for (const hole of holes) {
      const holePoints = ringToPoints(hole, projection, size);
      if (holePoints.length < 3) continue;
      const path = new Shape();
      path.setFromPoints(holePoints);
      shape.holes.push(path);
    }

    shapes.push(shape);
  }

  return shapes;
}
