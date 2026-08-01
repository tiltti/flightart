import { HOME, RADIUS_NM } from "@/lib/config";
import { coordsLabel } from "@/lib/geo";
import { airfieldMarkers, fetchNearby } from "@/lib/sources/adsbfi";
import { recordAircraft } from "@/lib/store";
import type { RadarPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

// adsb.fi asks for max ~1 req/s; short server-side cache also lets several
// browser windows share one upstream request
const g = globalThis as unknown as {
  __faRadarCache?: Map<string, { at: number; payload: RadarPayload }>;
};
const cache =
  g.__faRadarCache instanceof Map
    ? g.__faRadarCache
    : (g.__faRadarCache = new Map());

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const nmParam = Number(p.get("nm"));
  const nm = Math.min(
    250,
    Math.max(10, Number.isFinite(nmParam) && nmParam > 0 ? nmParam : RADIUS_NM),
  );

  // optional home override from client settings (browser location / map pick)
  const latN = Number(p.get("lat"));
  const lonN = Number(p.get("lon"));
  const custom =
    p.get("lat") !== null &&
    p.get("lon") !== null &&
    Number.isFinite(latN) &&
    Number.isFinite(lonN) &&
    Math.abs(latN) <= 90 &&
    Math.abs(lonN) <= 180;
  const home = custom
    ? { lat: latN, lon: lonN }
    : { lat: HOME.lat, lon: HOME.lon };
  const name = (
    p.get("name")?.trim().slice(0, 24) ||
    (custom ? coordsLabel(home.lat, home.lon) : HOME.name)
  ).toUpperCase();

  const key = `${nm}|${home.lat.toFixed(4)}|${home.lon.toFixed(4)}|${name}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 4500) {
    return Response.json(cached.payload);
  }
  try {
    const aircraft = await fetchNearby(nm, home);
    void recordAircraft(aircraft).catch(() => {});
    const payload: RadarPayload = {
      at: Date.now(),
      home: name,
      homeCoords: coordsLabel(home.lat, home.lon),
      radiusKm: nm * 1.852,
      airfields: airfieldMarkers(home),
      aircraft,
    };
    cache.set(key, { at: Date.now(), payload });
    return Response.json(payload);
  } catch {
    if (cached) return Response.json({ ...cached.payload, error: "stale" });
    const empty: RadarPayload = {
      at: Date.now(),
      home: name,
      homeCoords: coordsLabel(home.lat, home.lon),
      radiusKm: nm * 1.852,
      airfields: airfieldMarkers(home),
      aircraft: [],
      error: "unavailable",
    };
    return Response.json(empty);
  }
}
