import { getSummary, recordSpotlight } from "@/lib/store";
import type { Enrichment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const tz = Number(new URL(req.url).searchParams.get("tz"));
  return Response.json(
    await getSummary(Number.isFinite(tz) ? Math.max(-840, Math.min(840, tz)) : 0),
  );
}

export async function POST(req: Request) {
  const body = (await req.json()) as Enrichment;
  if (!body?.hex) return Response.json({ error: "hex required" }, { status: 400 });
  await recordSpotlight(body);
  return Response.json({ ok: true });
}
