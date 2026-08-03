import { HOME, RADIUS_NM } from "@/lib/config";
import { outlinePaths } from "@/lib/geooutline";
import { latParam, lonParam, numParam } from "@/lib/params";
import { rateLimited, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (rateLimited(req, "geo", 30, 60_000)) return tooMany(60);
  const p = new URL(req.url).searchParams;

  const lat = latParam(p) ?? HOME.lat;
  const lon = lonParam(p) ?? HOME.lon;
  const nmRaw = numParam(p, "nm");
  const nm = Math.min(250, Math.max(10, nmRaw && nmRaw > 0 ? nmRaw : RADIUS_NM));

  return Response.json(
    { paths: outlinePaths(lat, lon, nm * 1.852) },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
