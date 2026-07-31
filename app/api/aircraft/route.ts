import { HOME, RADIUS_NM } from "@/lib/config";
import { airfieldMarkers, fetchNearby } from "@/lib/sources/adsbfi";
import { recordAircraft } from "@/lib/store";
import type { RadarPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

// adsb.fi asks for max ~1 req/s; short server-side cache also lets several
// browser windows share one upstream request
const g = globalThis as unknown as {
  __faRadarByNm?: Map<number, { at: number; payload: RadarPayload }>;
};
const cache =
  g.__faRadarByNm instanceof Map ? g.__faRadarByNm : (g.__faRadarByNm = new Map());

export async function GET(req: Request) {
  const nmParam = Number(new URL(req.url).searchParams.get("nm"));
  const nm = Math.min(
    250,
    Math.max(10, Number.isFinite(nmParam) && nmParam > 0 ? nmParam : RADIUS_NM),
  );

  const cached = cache.get(nm);
  if (cached && Date.now() - cached.at < 4500) {
    return Response.json(cached.payload);
  }
  try {
    const aircraft = await fetchNearby(nm);
    void recordAircraft(aircraft).catch(() => {});
    const payload: RadarPayload = {
      at: Date.now(),
      home: HOME.name,
      radiusKm: nm * 1.852,
      airfields: airfieldMarkers(),
      aircraft,
    };
    cache.set(nm, { at: Date.now(), payload });
    return Response.json(payload);
  } catch {
    if (cached) return Response.json({ ...cached.payload, error: "stale" });
    const empty: RadarPayload = {
      at: Date.now(),
      home: HOME.name,
      radiusKm: nm * 1.852,
      airfields: airfieldMarkers(),
      aircraft: [],
      error: "unavailable",
    };
    return Response.json(empty);
  }
}
