import { getEnrichment } from "@/lib/enrich";
import { latParam, lonParam, numParam } from "@/lib/params";
import { rateLimited, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (rateLimited(req, "enrich", 60, 60_000)) return tooMany(60);
  const p = new URL(req.url).searchParams;
  const hex = p.get("hex");
  if (!hex) return Response.json({ error: "hex required" }, { status: 400 });

  const nm = numParam(p, "nm");
  const brg = numParam(p, "brg");
  const dist = numParam(p, "dist");
  const hasPosition = brg !== undefined && dist !== undefined && dist >= 0;

  const enrichment = await getEnrichment({
    hex,
    callsign: p.get("callsign"),
    registration: p.get("reg"),
    homeLat: latParam(p),
    homeLon: lonParam(p),
    radiusKm: nm !== undefined && nm > 0 ? nm * 1.852 : undefined,
    bearingDeg: hasPosition ? brg : undefined,
    distanceKm: hasPosition ? dist : undefined,
    spotlight: p.get("spotlight") === "1",
  });
  return Response.json(enrichment);
}
