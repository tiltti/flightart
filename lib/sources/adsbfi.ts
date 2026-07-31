import { AIRFIELDS, HOME, RADIUS_NM, USER_AGENT } from "@/lib/config";
import { bearingDeg, distanceKm } from "@/lib/geo";
import type { Aircraft, AirfieldMarker } from "@/lib/types";

// adsb.fi community feed, readsb JSON shape. The future own ADS-B receiver
// serves the same shape at http://<receiver>/data/aircraft.json — add it here
// as a second source when the antenna arrives.
interface AdsbFiAircraft {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  alt_baro?: number | "ground";
  gs?: number;
  track?: number;
  baro_rate?: number;
  lat?: number;
  lon?: number;
  seen?: number;
  seen_pos?: number;
}

export async function fetchNearby(nm: number = RADIUS_NM): Promise<Aircraft[]> {
  const url = `https://opendata.adsb.fi/api/v2/lat/${HOME.lat}/lon/${HOME.lon}/dist/${nm}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`adsb.fi responded ${res.status}`);
  // adsb.fi wraps the list as "aircraft"; plain readsb receivers use "ac"
  const body = (await res.json()) as {
    aircraft?: AdsbFiAircraft[];
    ac?: AdsbFiAircraft[];
  };
  return (body.aircraft ?? body.ac ?? [])
    .filter(
      (a) =>
        typeof a.lat === "number" &&
        typeof a.lon === "number" &&
        (a.seen_pos ?? 999) < 60 &&
        a.alt_baro !== "ground",
    )
    .map((a) => ({
      hex: a.hex,
      callsign: a.flight?.trim() || null,
      registration: a.r?.trim() || null,
      typeCode: a.t ?? null,
      typeDesc: a.desc ?? null,
      altFt: typeof a.alt_baro === "number" ? a.alt_baro : null,
      gsKt: a.gs ?? null,
      track: a.track ?? null,
      vertRateFpm: a.baro_rate ?? null,
      distanceKm: distanceKm(HOME.lat, HOME.lon, a.lat as number, a.lon as number),
      bearingDeg: bearingDeg(HOME.lat, HOME.lon, a.lat as number, a.lon as number),
      seenSec: a.seen ?? 0,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function airfieldMarkers(): AirfieldMarker[] {
  return AIRFIELDS.map((f) => ({
    code: f.code,
    distanceKm: distanceKm(HOME.lat, HOME.lon, f.lat, f.lon),
    bearingDeg: bearingDeg(HOME.lat, HOME.lon, f.lat, f.lon),
  }));
}
