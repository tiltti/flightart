import { HOME, RADIUS_NM } from "@/lib/config";
import { outlinePaths } from "@/lib/geooutline";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const latN = Number(p.get("lat"));
  const lonN = Number(p.get("lon"));
  const nmN = Number(p.get("nm"));

  const lat = Number.isFinite(latN) && Math.abs(latN) <= 90 ? latN : HOME.lat;
  const lon = Number.isFinite(lonN) && Math.abs(lonN) <= 180 ? lonN : HOME.lon;
  const nm = Math.min(250, Math.max(10, Number.isFinite(nmN) && nmN > 0 ? nmN : RADIUS_NM));

  return Response.json(
    { paths: outlinePaths(lat, lon, nm * 1.852) },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
