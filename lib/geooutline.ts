import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, MultiPolygon, Polygon } from "geojson";

// Coastlines and borders for the radar backdrop. Natural Earth 1:10m via the
// world-atlas package (public domain), projected to radar-local units where
// 100 = the outer ring. Server-side only — the client gets plain polylines.

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32;
const KEEP = 155; // clip margin in radar units (outer ring = 100)

type Ring = number[][];

const g = globalThis as unknown as {
  __faWorldRings?: Ring[];
  __faOutlineCache?: Map<string, number[][][]>;
};

function worldRings(): Ring[] {
  if (g.__faWorldRings) return g.__faWorldRings;
  // required lazily so the 3.6 MB atlas is only parsed when first needed
  const topo = require("world-atlas/countries-10m.json") as Topology<{
    countries: GeometryCollection;
  }>;
  const fc = feature(topo, topo.objects.countries) as unknown as {
    features: Feature<Polygon | MultiPolygon>[];
  };
  const rings: Ring[] = [];
  for (const f of fc.features) {
    const geom = f.geometry;
    if (geom.type === "Polygon") {
      rings.push(...(geom.coordinates as Ring[]));
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates as Ring[][]) rings.push(...poly);
    }
  }
  g.__faWorldRings = rings;
  return rings;
}

export function outlinePaths(
  lat: number,
  lon: number,
  radiusKm: number,
): number[][][] {
  const key = `${lat.toFixed(3)}|${lon.toFixed(3)}|${radiusKm.toFixed(1)}`;
  const cache = (g.__faOutlineCache ??= new Map());
  const hit = cache.get(key);
  if (hit) return hit;

  const kmPerDegLon = KM_PER_DEG_LON * Math.cos((lat * Math.PI) / 180);
  const project = (p: number[]): [number, number] => [
    ((p[0] - lon) * kmPerDegLon * 100) / radiusKm,
    (-(p[1] - lat) * KM_PER_DEG_LAT * 100) / radiusKm,
  ];
  // quick reject in degrees before doing per-point work
  const dLat = (radiusKm * (KEEP / 100)) / KM_PER_DEG_LAT;
  const dLon = (radiusKm * (KEEP / 100)) / Math.max(1, kmPerDegLon);

  const paths: number[][][] = [];
  for (const ring of worldRings()) {
    let current: number[][] | null = null;
    let prevOutside: number[] | null = null;
    for (const p of ring) {
      const near =
        Math.abs(p[1] - lat) < dLat &&
        Math.abs(((p[0] - lon + 540) % 360) - 180) < dLon;
      if (near) {
        if (!current) {
          current = [];
          if (prevOutside) current.push(project(prevOutside)); // enter cleanly
        }
        current.push(project(p));
      } else {
        if (current) {
          current.push(project(p)); // leave cleanly
          if (current.length > 1) paths.push(current);
          current = null;
        }
        prevOutside = p;
      }
    }
    if (current && current.length > 1) paths.push(current);
  }

  // round to keep the payload small; 0.1 unit ≈ 90 m at a 93 km radius
  const rounded = paths.map((p) =>
    p.map(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))]),
  );
  if (cache.size > 40) cache.clear();
  cache.set(key, rounded);
  return rounded;
}
