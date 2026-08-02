import { listCutouts } from "@/lib/media";
import { getSummary, recordSpotlight } from "@/lib/store";
import type { Enrichment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;

  // ?cutouts=1 — the curation listing for the admin panel
  if (p.has("cutouts")) {
    const filter = p.get("filter");
    return Response.json(
      await listCutouts({
        filter:
          filter === "banned" || filter === "all" ? filter : "kept",
        page: Number(p.get("page")) || 1,
        per: Number(p.get("per")) || 24,
      }),
    );
  }

  const tz = Number(p.get("tz"));
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
