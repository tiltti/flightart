import { querySightings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return Response.json(
    await querySightings({
      q: p.get("q") ?? undefined,
      date: p.get("date") ?? undefined,
      sort: p.get("sort") ?? undefined,
      dir: p.get("dir") === "asc" ? "asc" : "desc",
      page: Number(p.get("page")) || 1,
      per: Number(p.get("per")) || 25,
    }),
  );
}
