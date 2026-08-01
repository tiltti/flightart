import { getEnrichment } from "@/lib/enrich";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const hex = p.get("hex");
  if (!hex) return Response.json({ error: "hex required" }, { status: 400 });
  // Number(null) is 0, not NaN — an absent coordinate must not read as the
  // equator, so each parameter is checked for presence before conversion.
  const num = (key: string): number | undefined => {
    const raw = p.get(key);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const lat = num("lat");
  const lon = num("lon");
  const nm = num("nm");
  const enrichment = await getEnrichment({
    hex,
    callsign: p.get("callsign"),
    registration: p.get("reg"),
    homeLat: lat !== undefined && Math.abs(lat) <= 90 ? lat : undefined,
    homeLon: lon !== undefined && Math.abs(lon) <= 180 ? lon : undefined,
    radiusKm: nm !== undefined && nm > 0 ? nm * 1.852 : undefined,
  });
  return Response.json(enrichment);
}
