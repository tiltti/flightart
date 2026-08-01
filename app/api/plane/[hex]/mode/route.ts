import {
  cutoutState,
  ensureCutout,
  markPhotoOnly,
  resetCutout,
} from "@/lib/cutout";
import { hasPhotoFile } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// "photo-only" pins the airframe to the gallery photo (no cutout attempts);
// "auto" clears that and re-attempts the cutout right away.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ hex: string }> },
) {
  const { hex: raw } = await params;
  if (!/^[0-9a-f]{6}$/i.test(raw)) {
    return Response.json({ error: "bad hex" }, { status: 400 });
  }
  const hex = raw.toLowerCase();
  const { mode } = (await req.json()) as { mode?: string };

  if (mode === "photo-only") {
    await markPhotoOnly(hex);
  } else if (mode === "auto") {
    await resetCutout(hex);
    if (await hasPhotoFile(hex)) await ensureCutout(hex, "");
  } else {
    return Response.json({ error: "bad mode" }, { status: 400 });
  }
  const cutout = await cutoutState(hex);
  return Response.json({
    ok: true,
    cutout,
    cutoutUrl: cutout === "ok" ? `/api/cutout/${hex}` : null,
  });
}
