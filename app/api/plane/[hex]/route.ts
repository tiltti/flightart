import { cutoutState } from "@/lib/cutout";
import { getPhotoMeta, hasPhotoFile } from "@/lib/photos";
import { sightingsForHex } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hex: string }> },
) {
  const { hex: raw } = await params;
  if (!/^[0-9a-f]{6}$/i.test(raw)) {
    return Response.json({ error: "bad hex" }, { status: 400 });
  }
  const hex = raw.toLowerCase();
  const sightings = await sightingsForHex(hex);
  const sample = sightings[0] ?? null;
  const [hasPhoto, cutout, meta] = await Promise.all([
    hasPhotoFile(hex),
    cutoutState(hex),
    getPhotoMeta(hex),
  ]);
  return Response.json({
    hex,
    registration: sample?.registration ?? null,
    typeCode: sample?.typeCode ?? null,
    typeName: sample?.typeName ?? null,
    operator: sample?.operator ?? null,
    timesSeen: sightings.length,
    firstSeen: sightings.length ? sightings[sightings.length - 1].firstSeen : null,
    lastSeen: sample?.lastSeen ?? null,
    closestKm: sightings.length
      ? Math.min(...sightings.map((s) => s.minDistanceKm))
      : null,
    maxAltFt: sightings.length
      ? Math.max(...sightings.map((s) => s.maxAltFt ?? 0))
      : null,
    sightings: sightings.slice(0, 100),
    photoUrl: hasPhoto ? `/api/photo/${hex}` : null,
    photoMeta: meta,
    cutout,
    cutoutUrl: cutout === "ok" ? `/api/cutout/${hex}` : null,
  });
}
