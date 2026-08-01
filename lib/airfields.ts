import airports from "airport-data";
import { bearingDeg, distanceKm } from "@/lib/geo";
import type { AirfieldMarker } from "@/lib/types";

// Airports from the OpenFlights/OurAirports dataset bundled with the app —
// no network calls, and it works wherever the home point is moved to.

interface AirportRecord {
  icao?: string | null;
  iata?: string | null;
  name?: string;
  latitude?: number;
  longitude?: number;
}

const all = airports as unknown as AirportRecord[];

const g = globalThis as unknown as { __faAirfields?: Map<string, AirfieldMarker[]> };

export function airfieldsNear(
  lat: number,
  lon: number,
  radiusKm: number,
): AirfieldMarker[] {
  const key = `${lat.toFixed(3)}|${lon.toFixed(3)}|${radiusKm.toFixed(1)}`;
  const cache = (g.__faAirfields ??= new Map());
  const hit = cache.get(key);
  if (hit) return hit;

  const found: AirfieldMarker[] = [];
  for (const a of all) {
    if (!a.icao || typeof a.latitude !== "number" || typeof a.longitude !== "number") {
      continue;
    }
    // cheap rejection before the trigonometry
    if (Math.abs(a.latitude - lat) > 2 || Math.abs(a.longitude - lon) > 4) continue;
    const d = distanceKm(lat, lon, a.latitude, a.longitude);
    if (d > radiusKm) continue;
    found.push({
      code: a.icao,
      distanceKm: d,
      bearingDeg: bearingDeg(lat, lon, a.latitude, a.longitude),
    });
  }
  found.sort((x, y) => x.distanceKm - y.distanceKm);
  if (cache.size > 40) cache.clear();
  cache.set(key, found);
  return found;
}

// Resolves an IATA (or ICAO) code to coordinates, for drawing route tracks.
// Built on first use rather than at module load: the dataset is a CommonJS
// package, and its array is not reliably populated during module evaluation.
const gc = globalThis as unknown as { __faAirportsByCode?: Map<string, AirportRecord> };

function codeIndex(): Map<string, AirportRecord> {
  if (gc.__faAirportsByCode) return gc.__faAirportsByCode;
  const byCode = new Map<string, AirportRecord>();
  for (const a of all) {
    if (a.iata) byCode.set(a.iata.toUpperCase(), a);
    if (a.icao) byCode.set(a.icao.toUpperCase(), a);
  }
  gc.__faAirportsByCode = byCode;
  return byCode;
}

export function airportCoords(
  code: string | null | undefined,
): { lat: number; lon: number } | null {
  if (!code) return null;
  const a = codeIndex().get(code.toUpperCase());
  if (!a || typeof a.latitude !== "number" || typeof a.longitude !== "number") {
    return null;
  }
  return { lat: a.latitude, lon: a.longitude };
}
