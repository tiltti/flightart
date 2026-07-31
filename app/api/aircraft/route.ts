import { HOME, RADIUS_KM } from "@/lib/config";
import { airfieldMarkers, fetchNearby } from "@/lib/sources/adsbfi";
import { recordAircraft } from "@/lib/store";
import type { RadarPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

// adsb.fi asks for max ~1 req/s; short server-side cache also lets several
// browser windows share one upstream request
const g = globalThis as unknown as {
  __faRadar?: { at: number; payload: RadarPayload };
};

export async function GET() {
  const cached = g.__faRadar;
  if (cached && Date.now() - cached.at < 4500) {
    return Response.json(cached.payload);
  }
  try {
    const aircraft = await fetchNearby();
    void recordAircraft(aircraft).catch(() => {});
    const payload: RadarPayload = {
      at: Date.now(),
      home: HOME.name,
      radiusKm: RADIUS_KM,
      airfields: airfieldMarkers(),
      aircraft,
    };
    g.__faRadar = { at: Date.now(), payload };
    return Response.json(payload);
  } catch {
    if (cached) return Response.json({ ...cached.payload, error: "stale" });
    const empty: RadarPayload = {
      at: Date.now(),
      home: HOME.name,
      radiusKm: RADIUS_KM,
      airfields: airfieldMarkers(),
      aircraft: [],
      error: "unavailable",
    };
    return Response.json(empty);
  }
}
