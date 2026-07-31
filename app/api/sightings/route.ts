import { getSummary, recordSpotlight } from "@/lib/store";
import type { Enrichment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSummary());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Enrichment;
  if (!body?.hex) return Response.json({ error: "hex required" }, { status: 400 });
  await recordSpotlight(body);
  return Response.json({ ok: true });
}
