import { getEnrichment } from "@/lib/enrich";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const hex = p.get("hex");
  if (!hex) return Response.json({ error: "hex required" }, { status: 400 });
  const enrichment = await getEnrichment({
    hex,
    callsign: p.get("callsign"),
    registration: p.get("reg"),
  });
  return Response.json(enrichment);
}
