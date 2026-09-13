"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  ShapeGeometry,
  Vector3,
  type Shape,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  createProjection,
  geometryToLinePoints,
  geometryToShapes,
  project,
  type GeoGeometry,
} from "@/lib/geo/projection";
import { rampColor } from "@/lib/map-scale";
import { easeFactor } from "@/lib/ease";
import { RegionMesh } from "./region-mesh";
import { CityLabels, type LabelItem } from "./city-labels";
import { CityMarkers, type MarkerItem } from "./city-markers";
import { RegionLabels, type RegionLabel } from "./region-labels";
import { CountyFills, type CountyPaint, type CountyShape } from "./county-fills";
import { MapSkeleton } from "./map-skeleton";

/**
 * Map plane size in world units, paired with the camera that has to contain it.
 *
 * A perspective camera at distance d with vertical field of view f sees
 * 2·d·tan(f/2) units of height, so the camera must sit far enough back to cover
 * MAP_SIZE or the country is cropped at the edges — which reads as a design
 * choice rather than a bug.
 */
const MAP_SIZE = { width: 100, height: 100 };
const HOME_POSITION = new Vector3(0, 132, 96);
const CAMERA_FOV = 32;

/**
 * Minimum distance between two named cities, in world units, at the default
 * landscape camera. Roughly the width of a label, which is what it has to
 * clear.
 *
 * Scaled by how far the camera has actually been pushed back, because the
 * thinning is really a screen-space question: a label is a fixed number of
 * pixels wide however far away the country is, so the same world gap buys far
 * fewer pixels on a phone. Left constant, the rule that keeps Silesia readable
 * on a laptop lets Kraków and Jaworzno print on top of each other on a phone.
 */
const LABEL_MIN_SPACING = 7;
const BASE_HOME_DISTANCE = HOME_POSITION.length();

/**
 * Near plane.
 *
 * Well away from the default 0.1: depth precision is distributed across the
 * near/far ratio, and a camera that sits 400 units back with a near plane at
 * 0.1 has almost none left at the ground, so the basemap's halo and the land
 * it sits under trade places across the country in wedge-shaped streaks. The
 * controls never let the camera closer than 60, so nothing is clipped.
 */
const CAMERA_NEAR = 20;
const CAMERA_FAR = 1400;

/**
 * How far the camera's focus may be dragged from the centre of the country.
 *
 * Panning has to exist — Upper Silesia packs fourteen cities into a space the
 * country view renders a centimetre wide, and with a fixed focus there is no
 * way to zoom into that cluster at all; the reader can only watch it get
 * bigger in the corner of the screen. But unbounded panning loses the country
 * entirely, so the focus is held inside the map plane.
 */
const PAN_LIMIT = 34;

/**
 * How far the map may be turned away from north.
 *
 * Free rotation lets the reader drag Poland upside down, and a map with
 * Gdańsk at the bottom is not a view of Poland any more — every piece of
 * geographic knowledge they arrived with stops helping them. Enough rotation
 * to look along a different axis, not enough to lose which way is up.
 */
const MAX_AZIMUTH = Math.PI / 5;


export type MapCounty = {
  slug: string;
  name: string;
  value: number | null;
  formatted: string | null;
};

export type MapRegion = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  value: number | null;
  formatted: string | null;
};

type GeoFeature = { properties: { slug?: string; name?: string }; geometry: GeoGeometry };

type Props = {
  regionsUrl: string;
  backgroundUrl?: string | null;
  /** Every county that is not itself a city. */
  countiesUrl?: string | null;
  /** The same measure, for the counties between the cities. */
  counties?: MapCounty[];
  /** Name of the county under the pointer, reported for the readout. */
  onCountyHover?: (county: MapCounty | null) => void;
  /** A county was clicked. */
  onCountySelect?: (slug: string) => void;
  /** The open county, outlined on the map. */
  selectedCounty?: string | null;
  regions: MapRegion[];
  onSelect?: (slug: string | null) => void;
  onHover?: (slug: string | null) => void;
  selected?: string | null;
  /** Hover driven from outside, so the ranked list can light a city. */
  externalHover?: string | null;
  /** Name every city rather than only the leaders on the current measure. */
  showAllLabels?: boolean;
  /** How many cities to name when not showing all. */
  labelCount?: number;
  /** Changes when the reader asks for the whole country back. */
  resetToken?: number;
  /** Reports whether the reader has moved the view off its default framing. */
  onViewMoved?: (moved: boolean) => void;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Subscribes to the reduced-motion preference.
 *
 * `useSyncExternalStore` rather than an effect that calls setState: matchMedia
 * is an external store, and reading it through the store API avoids the extra
 * render pass an effect would cause on every mount.
 */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    // On the server there is no preference to read; assume motion is allowed
    // and let the client correct it on hydration.
    () => false,
  );
}

function useGeoJson(url: string | null | undefined) {
  const [features, setFeatures] = useState<GeoFeature[] | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((fc) => !cancelled && setFeatures(fc.features as GeoFeature[]))
      .catch(() => !cancelled && setFeatures([]));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return features;
}

/**
 * The country the bars stand on.
 *
 * Three layers, because one flat plate disappears into a dark background: a
 * slightly oversized halo that separates the coastline from the void, the land
 * itself, and the voivodeship borders drawn on top. Without the halo Poland has
 * no edge; without the borders it is one undifferentiated blob and the reader
 * loses every landmark they would use to find a city.
 */
function Basemap({ shapes }: { shapes: Shape[] }) {
  const geometries = useMemo(() => shapes.map((s) => new ShapeGeometry(s)), [shapes]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* Halo: the same outline, pushed out slightly and unlit. */}
      <mesh position={[0, 0, -0.12]} scale={[1.004, 1.004, 1]}>
        <shapeGeometry args={[shapes]} />
        <meshBasicMaterial color="#3d5e73" transparent opacity={0.5} side={DoubleSide} />
      </mesh>

      <mesh position={[0, 0, -0.02]}>
        <shapeGeometry args={[shapes]} />
        <meshStandardMaterial color="#1d2c38" roughness={0.92} metalness={0.05} side={DoubleSide} />
      </mesh>

      {geometries.map((geometry, i) => (
        <lineSegments key={i} position={[0, 0, 0.03]}>
          <edgesGeometry args={[geometry]} />
          <lineBasicMaterial color="#46606f" transparent opacity={0.85} />
        </lineSegments>
      ))}
    </group>
  );
}

/**
 * County boundaries, as one line mesh.
 *
 * Poland has 380 counties and only 66 of them are cities, so a map that draws
 * the cities alone leaves each one floating in unmarked ground — zoom in on
 * Opole and it is an island with nothing bordering it, which reads as missing
 * data rather than as the truth that its neighbours simply are not cities.
 *
 * Drawn at a single, deliberately faint weight, below everything the reader is
 * actually measuring. This layer's job is to give the cities somewhere to sit,
 * and the moment it competes with them it has failed at that job.
 *
 * All 314 outlines are merged into one buffer: they never change, never
 * respond to anything, and three hundred separate line objects would cost
 * three hundred draw calls a frame for a static backdrop.
 */
function CountyLines({ points }: { points: Float32Array }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(points, 3));
    return g;
  }, [points]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <lineBasicMaterial color="#38505f" transparent opacity={0.55} />
    </lineSegments>
  );
}

/**
 * Holds the camera's focus inside the map plane.
 *
 * OrbitControls has no notion of bounds, so the clamp is applied after it has
 * had its say each frame. Clamping the target alone is enough: the camera
 * orbits the target, so a target that cannot leave the country is a camera
 * that cannot either.
 */
function PanBounds({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const { x, y, z } = c.target;
    const cx = Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, x));
    const cz = Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, z));
    if (cx !== x || cz !== z || y !== 0) {
      // Move the camera with the target, or clamping the focus would swing the
      // view instead of stopping it.
      c.object.position.add(new Vector3(cx - x, -y, cz - z));
      c.target.set(cx, 0, cz);
    }
  });
  return null;
}

/**
 * Pulls the camera back far enough to contain the country at the current
 * aspect ratio.
 *
 * A perspective camera's field of view is vertical, so a portrait viewport
 * shows *less* horizontally than a landscape one at the same distance. Fitting
 * once for a wide screen therefore crops Poland's east and west edges on a
 * phone, which is exactly where half the cities are. The distance is scaled by
 * the aspect whenever it drops below 1, with a little margin so the coastline
 * is not flush against the edge of the canvas.
 */
const FIT_MARGIN = 1.06;

function useFittedHome() {
  const { size } = useThree();
  return useMemo(() => {
    const aspect = size.width / size.height;

    /*
     * The narrower the viewport, the more nearly the camera looks straight
     * down.
     *
     * Containing a country far wider than it is tall inside a tall screen
     * leaves a band of empty sky above and below it — unavoidable, but the
     * oblique angle makes it worse by foreshortening the one dimension there
     * is room for. Rotating toward plan view on a phone gives Poland back its
     * full north-south extent and puts that empty space to use. The reader can
     * still tilt back with one finger.
     */
    const portrait = Math.min(1, Math.max(0, (1 - aspect) / 0.5));
    const lean = 0.588 + (0.26 - 0.588) * portrait;
    const rise = Math.sqrt(1 - lean * lean);

    // A little more breathing room as the view flattens: seen from overhead the
    // country reaches its true width, and at the tight margin Szczecin and the
    // eastern border end up flush against the edges of the canvas.
    const margin = FIT_MARGIN + 0.07 * portrait;
    const scale = (aspect < 1 ? 1 / aspect : 1) * margin;

    return new Vector3(0, rise, lean).multiplyScalar(BASE_HOME_DISTANCE * scale);
  }, [size.width, size.height]);
}

/**
 * Eases the camera toward a city when one is selected, and back out when the
 * selection is cleared.
 *
 * Moving the camera rather than cutting to it keeps the reader oriented: the
 * country they were looking at is still the country they are looking at, seen
 * from closer in.
 */
function CameraRig({
  target,
  controls,
  animate,
  onHomeDistance,
  resetToken,
}: {
  target: Vector3 | null;
  controls: React.RefObject<OrbitControlsImpl | null>;
  animate: boolean;
  /** Reports how far back the camera has to sit to contain the country. */
  onHomeDistance: (distance: number) => void;
  /** Changes when the reader asks for the whole country back. */
  resetToken: number;
}) {
  const { camera } = useThree();
  const home = useFittedHome();

  useEffect(() => {
    onHomeDistance(home.length());
  }, [home, onHomeDistance]);
  const desiredLook = useRef(new Vector3(0, 0, 0));
  const desiredPosition = useRef(home.clone());
  /**
   * Whether the rig currently owns the camera.
   *
   * This is the whole point of the flag: the rig may only drive the camera
   * while it is flying to a new selection. If it kept lerping every frame it
   * would fight the user — every scroll to zoom in would be dragged straight
   * back to the rig's idea of the right distance, which reads as the map
   * refusing to zoom.
   */
  const flying = useRef(false);

  useEffect(() => {
    if (target) {
      desiredLook.current.set(target.x, 0, target.z);
      // Close enough to read the city, far enough that the country around it is
      // still on screen. Coming in over its shoulder rather than straight down
      // keeps the extruded height legible.
      // Close enough to separate neighbours. Fourteen Silesian cities sit
      // within twenty world units of each other, so a polite distance leaves
      // the reader looking at the same unreadable cluster they clicked to
      // escape.
      desiredPosition.current.set(target.x * 0.7, 72, target.z * 0.7 + 58);
    } else {
      desiredLook.current.set(0, 0, 0);
      desiredPosition.current.copy(home);
    }

    if (!animate) {
      camera.position.copy(desiredPosition.current);
      controls.current?.target.copy(desiredLook.current);
      controls.current?.update();
      return;
    }
    flying.current = true;
  }, [target, camera, controls, animate, home, resetToken]);

  /** Hand the camera back the moment the user touches the controls. */
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const release = () => {
      flying.current = false;
    };
    c.addEventListener("start", release);
    return () => c.removeEventListener("start", release);
  }, [controls]);

  useFrame((_, delta) => {
    if (!flying.current) return;
    const k = easeFactor(delta, 3.2);
    camera.position.lerp(desiredPosition.current, k);
    const c = controls.current;
    if (c) {
      c.target.lerp(desiredLook.current, k);
      c.update();
    }
    // Close enough: stop driving and let the controls take over again.
    if (camera.position.distanceTo(desiredPosition.current) < 0.6) {
      flying.current = false;
    }
  });

  return null;
}

export function PolandMap({
  regionsUrl,
  backgroundUrl,
  countiesUrl,
  counties = [],
  onCountyHover,
  onCountySelect,
  selectedCounty = null,
  regions,
  onSelect,
  onHover,
  selected,
  externalHover = null,
  showAllLabels = false,
  labelCount = 12,
  resetToken = 0,
  onViewMoved,
}: Props) {
  const regionFeatures = useGeoJson(regionsUrl);
  const backgroundFeatures = useGeoJson(backgroundUrl);
  const countyFeatures = useGeoJson(countiesUrl);
  const reducedMotion = usePrefersReducedMotion();
  const [pointerHover, setPointerHover] = useState<string | null>(null);
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);
  // Pointing at the map wins over pointing at the list.
  const hovered = pointerHover ?? externalHover;
  const controls = useRef<OrbitControlsImpl>(null);
  const [homeDistance, setHomeDistance] = useState(200);


  const bySlug = useMemo(() => new Map(regions.map((r) => [r.slug, r])), [regions]);

  useEffect(() => onHover?.(hovered), [hovered, onHover]);

  /**
   * The projection is fitted to the background so switching measure never
   * shifts the country, and the bars stay registered to the outline beneath.
   */
  const projection = useMemo(() => {
    const source = backgroundFeatures?.length ? backgroundFeatures : regionFeatures;
    if (!source?.length) return null;
    return createProjection(source.map((f) => f.geometry), MAP_SIZE);
  }, [backgroundFeatures, regionFeatures]);


  const countyLinePoints = useMemo(() => {
    if (!projection || !countyFeatures?.length) return null;
    const all: number[] = [];
    for (const f of countyFeatures) {
      const points = geometryToLinePoints(f.geometry, projection, MAP_SIZE);
      for (const value of points) all.push(value);
    }
    return new Float32Array(all);
  }, [projection, countyFeatures]);

  const basemapShapes = useMemo(() => {
    if (!projection || !backgroundFeatures) return [];
    return backgroundFeatures.flatMap((f) => geometryToShapes(f.geometry, projection, MAP_SIZE));
  }, [projection, backgroundFeatures]);

  /**
   * Colour by rank, not by raw distance along the range.
   *
   * Most of these measures cluster: fifty of the sixty-six cities earn between
   * 8,500 and 10,500 zł, with two outliers pulling the top of the scale away.
   * Stretching a linear ramp across that range paints almost the whole country
   * the same middling colour and hides every difference that matters. Ranking
   * the values and spacing them evenly is the standard fix for a choropleth
   * (equal-count classification), and it is what makes the map readable.
   */
  const intensityBySlug = useMemo(() => {
    /*
     * Cities and counties are ranked together, on one scale.
     *
     * They have to be. A choropleth where two units with the same figure are
     * painted different colours is not a map of anything, and the reader has
     * no way to know a second scale is in play. So a city's colour means its
     * position among all 380 Polish counties — which is also the more honest
     * claim, since a city's salary looks very different against the country
     * than against the other sixty-five cities. The ranking that answers "which
     * city" is the list, where cities are ordered among themselves.
     */
    const scored = [...regions, ...counties]
      .filter((r): r is typeof r & { value: number } => r.value !== null)
      .sort((a, b) => a.value - b.value);

    const out = new Map<string, number>();
    scored.forEach((r, i) => {
      out.set(r.slug, scored.length === 1 ? 0.5 : i / (scored.length - 1));
    });
    return out;
  }, [regions, counties]);

  const countyBySlug = useMemo(() => new Map(counties.map((c) => [c.slug, c])), [counties]);

  /**
   * One anchor per voivodeship, at the centroid of its largest polygon.
   *
   * Largest rather than an average of all of them: several provinces include
   * small detached pieces, and averaging drags the name off the body of the
   * province and out to sea.
   */
  const regionLabels: RegionLabel[] = useMemo(() => {
    if (!projection || !backgroundFeatures) return [];
    return backgroundFeatures.flatMap((f) => {
      const name = f.properties.name;
      if (!name) return [];
      const shapes = geometryToShapes(f.geometry, projection, MAP_SIZE);
      if (!shapes.length) return [];

      let best = shapes[0];
      let bestSpan = -1;
      for (const shape of shapes) {
        const box = shape.getPoints(1);
        const xs = box.map((v) => v.x);
        const ys = box.map((v) => v.y);
        const span = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        if (span > bestSpan) {
          bestSpan = span;
          best = shape;
        }
      }

      const pts = best.getPoints(1);
      const cx = pts.reduce((a, v) => a + v.x, 0) / pts.length;
      const cy = pts.reduce((a, v) => a + v.y, 0) / pts.length;
      return [
        {
          name: name.charAt(0).toUpperCase() + name.slice(1),
          anchor: new Vector3(cx, 0.5, -cy),
        },
      ];
    });
  }, [projection, backgroundFeatures]);

  const countyShapes: CountyShape[] = useMemo(() => {
    if (!projection || !countyFeatures) return [];
    return countyFeatures.flatMap((f) => {
      const slug = f.properties.slug;
      if (!slug) return [];
      const shapes = geometryToShapes(f.geometry, projection, MAP_SIZE);
      return shapes.length ? [{ slug, shapes }] : [];
    });
  }, [projection, countyFeatures]);

  /** What each county is worth on the measure currently drawn. */
  const countyPaint = useMemo(() => {
    const out = new Map<string, CountyPaint>();
    for (const { slug } of countyShapes) {
      const t = intensityBySlug.get(slug);
      out.set(slug, {
        color: t === undefined ? new Color("#243440") : rampColor(t).clone(),
        hasValue: countyBySlug.get(slug)?.value != null,
      });
    }
    return out;
  }, [countyShapes, countyBySlug, intensityBySlug]);


  const items = useMemo(() => {
    if (!projection || !regionFeatures) return [];
    return regionFeatures.flatMap((f) => {
      const slug = f.properties.slug;
      const region = slug ? bySlug.get(slug) : undefined;
      if (!slug || !region) return [];

      const shapes = geometryToShapes(f.geometry, projection, MAP_SIZE);
      if (!shapes.length) return [];

      const t = intensityBySlug.get(slug) ?? 0;
      const xy = project(projection, region.lon, region.lat, MAP_SIZE);
      return [
        {
          slug,
          shapes,
          intensity: t,
          // A city with no figure for this measure stays the colour of the land
          // it sits on, so an absence never reads as a low value.
          color: region.value === null ? new Color("#243440") : rampColor(t).clone(),
          hasValue: region.value !== null,
          position: xy ? new Vector3(xy[0], 0, -xy[1]) : null,
        },
      ];
    });
  }, [projection, regionFeatures, bySlug, intensityBySlug]);

  /**
   * Province names, minus the ones a city is standing on.
   *
   * A province name is the quietest thing on the map, so where it collides
   * with a city it loses: a name struck through by a dot reads as a rendering
   * fault, and the province is identifiable from its shape and neighbours
   * anyway. Measured in world units scaled to the camera, for the same reason
   * the city-label thinning is.
   */
  const visibleRegionLabels = useMemo(() => {
    // Half a label's width plus a dot's radius, in world units at the default
    // camera. Wider than that and most provinces lose their name to a city
    // that is nowhere near the text.
    const clearance = 3.5 * (homeDistance / BASE_HOME_DISTANCE);
    return regionLabels.filter((label) =>
      items.every(
        (item) =>
          !item.position ||
          Math.hypot(item.position.x - label.anchor.x, item.position.z - label.anchor.z) >
            clearance,
      ),
    );
  }, [regionLabels, items, homeDistance]);

  const selectedItem = items.find((i) => i.slug === selected);

  /**
   * One dot per city, because the polygons alone cannot carry the map.
   *
   * A city with powiat status is a municipal boundary a few kilometres wide.
   * Drawn honestly against the whole country most of them are two or three
   * pixels across — the reader sees scattered specks, cannot tell which have
   * data, and cannot hit them. The dots restore a readable, aimable symbol at
   * every zoom level while the polygons keep carrying the true extent
   * underneath.
   */
  const markers: MarkerItem[] = useMemo(
    () =>
      items.flatMap((item) =>
        item.position
          ? [
              {
                slug: item.slug,
                position: item.position,
                color: item.color,
                hasValue: item.hasValue,
              },
            ]
          : [],
      ),
    [items],
  );

  /**
   * Labels are ranked by the value being mapped, so "the leaders" always means
   * the tallest bars on screen rather than a fixed list of big cities.
   *
   * Rank is then thinned by distance. Polish cities are not spread evenly —
   * Upper Silesia packs a dozen of them into the space Mazovia gives to one —
   * so ranking alone stacks Gliwice, Katowice and Jastrzębie-Zdrój into an
   * unreadable pile. Walking the list from the top and skipping any city too
   * close to one already named keeps the highest value in each cluster and
   * drops the rest, which is the behaviour a reader expects from a map.
   */
  const labels: LabelItem[] = useMemo(() => {
    const withValue = items
      .map((item) => {
        const region = bySlug.get(item.slug);
        return region && region.value !== null && item.position
          ? { item, region, value: region.value }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.value - a.value);

    const spacing = LABEL_MIN_SPACING * (homeDistance / BASE_HOME_DISTANCE);
    const kept: { x: number; z: number }[] = [];
    const out: LabelItem[] = [];

    for (const { item, region } of withValue) {
      const p = item.position!;
      const tooClose = kept.some(
        (k) => Math.hypot(k.x - p.x, k.z - p.z) < spacing,
      );
      // A crowded-out city keeps a rank beyond the cut, so it is still named
      // on hover, on selection, and when "name every city" is switched on.
      out.push({
        slug: item.slug,
        name: region.name,
        anchor: p.clone().setY(item.slug === selected ? 8.4 : 1.3),
        formatted: region.formatted,
        rank: tooClose ? Number.MAX_SAFE_INTEGER : kept.length + 1,
      });
      if (!tooClose) kept.push({ x: p.x, z: p.z });
    }

    return out;
  }, [items, bySlug, selected, homeDistance]);

  // The boundaries are fetched rather than bundled, so there is a real gap
  // between the panels appearing and the country appearing.
  const ready = Boolean(projection && regionFeatures);

  return (
    <div className="absolute inset-0">
      {!ready && <MapSkeleton />}
      <Canvas
        camera={{
          position: HOME_POSITION.toArray(),
          fov: CAMERA_FOV,
          near: CAMERA_NEAR,
          far: CAMERA_FAR,
        }}
        // Framing is corrected for the real aspect ratio once the canvas
        // measures itself; this initial position is only the landscape case.
        dpr={[1, 2]}
        gl={{ antialias: true }}
        // The ranked lists and the detail panel carry the same information in
        // text, so the canvas itself is decorative to a screen reader.
        aria-hidden="true"
        onPointerMissed={() => onSelect?.(null)}
      >
        <color attach="background" args={["#0a1016"]} />
        {/*
          Depth cue: distant parts of the country sink toward the ground colour.
          The range is tied to how far back the camera sits, because a portrait
          viewport pushes it past any fixed far plane and fogs the entire map
          into the background.
        */}
        <fog attach="fog" args={["#0a1016", homeDistance * 1.15, homeDistance * 2.4]} />

        <hemisphereLight intensity={0.5} groundColor="#0a1016" color="#b9cdd8" />
        {/*
          No cast shadows. On a flat map only the selected city has any height,
          so a shadow map buys one silhouette and costs a hard black slab beside
          it that reads as a rendering fault. Selection is already carried by
          height, by the outline and by the label.
        */}
        <directionalLight position={[-46, 78, 40]} intensity={2.1} />
        {/* Rim light: separates the bars from the dark ground at their edges. */}
        <directionalLight position={[60, 26, -50]} intensity={0.7} color="#7fb0cc" />

        {basemapShapes.length > 0 && <Basemap shapes={basemapShapes} />}

        {countyShapes.length > 0 && (
          <CountyFills
            shapes={countyShapes}
            paint={countyPaint}
            hovered={hoveredCounty}
            selected={selectedCounty}
            animate={!reducedMotion}
            onSelect={(slug) => onCountySelect?.(slug)}
            onHover={(slug) => {
              setHoveredCounty(slug);
              onCountyHover?.(countyBySlug.get(slug) ?? null);
            }}
            onHoverOut={(slug) =>
              setHoveredCounty((h) => {
                if (h !== slug) return h;
                onCountyHover?.(null);
                return null;
              })
            }
          />
        )}

        {countyLinePoints && <CountyLines points={countyLinePoints} />}

        <RegionLabels items={visibleRegionLabels} />


        {items.map((item) => (
          <RegionMesh
            key={item.slug}
            shapes={item.shapes}
            intensity={item.intensity}
            color={item.color}
            hovered={hovered === item.slug}
            selected={selected === item.slug}
            hasValue={item.hasValue}
            dimmed={Boolean(selected) && selected !== item.slug}
            animate={!reducedMotion}
            onPointerOver={() => setPointerHover(item.slug)}
            onPointerOut={() => setPointerHover((h) => (h === item.slug ? null : h))}
            onClick={() => onSelect?.(item.slug)}
          />
        ))}

        <CityMarkers
          items={markers}
          hovered={hovered}
          selected={selected ?? null}
          onHover={setPointerHover}
          onHoverOut={(slug) => setPointerHover((h) => (h === slug ? null : h))}
          onSelect={(slug) => onSelect?.(slug)}
          animate={!reducedMotion}
        />

        <CityLabels
          items={labels}
          hovered={hovered}
          selected={selected ?? null}
          showAll={showAllLabels}
          visibleCount={labelCount}
        />

        <CameraRig
          target={selectedItem?.position ?? null}
          controls={controls}
          animate={!reducedMotion}
          onHomeDistance={setHomeDistance}
          resetToken={resetToken}
        />

        <PanBounds controls={controls} />

        <OrbitControls
          ref={controls}
          // Panning on, bounded by PanBounds: without it the dense clusters
          // cannot be reached at all. Rotation stays limited so the country
          // never ends up facing the wrong way.
          enablePan
          // Pan along the ground rather than across the screen, so dragging
          // moves the map the reader is looking at and not the air above it.
          screenSpacePanning={false}
          minAzimuthAngle={-MAX_AZIMUTH}
          maxAzimuthAngle={MAX_AZIMUTH}
          onEnd={() => onViewMoved?.(true)}
          minPolarAngle={Math.PI / 9}
          maxPolarAngle={Math.PI / 2.7}
          minDistance={36}
          // Derived from the fitted distance rather than fixed: a hard ceiling
          // clamps the camera before it can pull back far enough to contain the
          // country on a portrait screen, which silently re-crops the map.
          maxDistance={Math.max(230, homeDistance * 1.6)}
          enableDamping
          dampingFactor={0.07}
        />
      </Canvas>

    </div>
  );
}
