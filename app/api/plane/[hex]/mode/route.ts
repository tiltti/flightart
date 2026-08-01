import { markPhotoOnly, resetCutout } from "@/lib/media";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  const media =
    mode === "photo-only"
      ? await markPhotoOnly(hex)
      : mode === "auto"
        ? await resetCutout(hex)
        : null;
  if (!media) return Response.json({ error: "bad mode" }, { status: 400 });

  return Response.json({
    ok: true,
    cutout: media.cutoutState,
    cutoutUrl: media.cutoutUrl,
  });
}
