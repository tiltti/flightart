import { listCutouts } from "@/lib/media";
import { rateLimited, tooMany } from "@/lib/ratelimit";
import { getSummary } from "@/lib/store";

export const dynamic = "force-dynamic";

// Read-only. Marking a sighting as spotlighted used to be a POST from the
// browser, which meant anyone could write to the logbook; it now happens
// server-side inside the enrichment that the display already requests.
export async function GET(req: Request) {
  if (rateLimited(req, "sightings", 120, 60_000)) return tooMany(60);
  const p = new URL(req.url).searchParams;

  // ?cutouts=1 — the curation listing for the admin panel
  if (p.has("cutouts")) {
    const filter = p.get("filter");
    return Response.json(
      await listCutouts({
        filter: filter === "banned" || filter === "all" ? filter : "kept",
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
