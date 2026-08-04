import { denied, isCurationAllowed } from "@/lib/auth";
import { findCandidates } from "@/lib/galleries";
import { rateLimited, tooMany } from "@/lib/ratelimit";
import {
  ensureCutout,
  getMedia,
  getStackPhotos,
  markPhotoOnly,
  regenerateCutout,
  restoreCutout,
  setPhotoFromBytes,
  setPhotoFromUrl,
} from "@/lib/media";
import { sightingsForHex } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

function parseHex(raw: string): string | null {
  return /^[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
}

// GET /api/plane/<hex>             — details, sighting history and media state
// GET /api/plane/<hex>?candidates= — photo candidates from the galleries
export async function GET(
  req: Request,
  { params }: { params: Promise<{ hex: string }> },
) {
  const hex = parseHex((await params).hex);
  if (!hex) return Response.json({ error: "bad hex" }, { status: 400 });
  const search = new URL(req.url).searchParams;

  if (search.has("candidates")) {
    // this one fans out to two external galleries, so it is limited hardest
    if (rateLimited(req, "candidates", 20, 60_000)) return tooMany(60);
    return Response.json({
      candidates: await findCandidates(hex, search.get("reg")),
    });
  }

  const [sightings, media, stack] = await Promise.all([
    sightingsForHex(hex),
    getMedia(hex),
    getStackPhotos(hex),
  ]);
  const sample = sightings[0] ?? null;
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
    photoUrl: media?.photoUrl ?? null,
    photoMeta: media
      ? {
          photographer: media.photographer,
          pageLink: media.pageLink,
          source: media.photoSource,
        }
      : null,
    stackPhotos: stack,
    cutout: media?.cutoutState ?? "none",
    cutoutUrl: media?.cutoutUrl ?? null,
  });
}

// POST /api/plane/<hex>
//   multipart body              — replace the photo with an upload
//   {url, photographer, …}      — replace the photo from a gallery pick or address
//   {mode: 'auto'|'photo-only'} — retry background removal, or pin to the photo
export async function POST(
  req: Request,
  { params }: { params: Promise<{ hex: string }> },
) {
  if (!isCurationAllowed(req)) return denied();
  if (rateLimited(req, "plane-write", 60, 60_000)) return tooMany(60);

  const hex = parseHex((await params).hex);
  if (!hex) return Response.json({ error: "bad hex" }, { status: 400 });
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) {
        return Response.json({ error: "no image given" }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return Response.json({ error: "file too large" }, { status: 413 });
      }
      await setPhotoFromBytes(hex, Buffer.from(await file.arrayBuffer()), {
        source: "upload",
      });
    } else {
      const body = (await req.json()) as {
        url?: string;
        photographer?: string;
        pageLink?: string;
        source?: string;
        mode?: string;
      };

      if (body.mode === "photo-only") {
        const media = await markPhotoOnly(hex);
        return Response.json({
          ok: true,
          cutout: media.cutoutState,
          cutoutUrl: media.cutoutUrl,
        });
      }
      if (body.mode === "auto" || body.mode === "regenerate") {
        const { media, refused } =
          body.mode === "regenerate"
            ? await regenerateCutout(hex)
            : await restoreCutout(hex);
        return Response.json({
          ok: true,
          cutout: media.cutoutState,
          cutoutUrl: media.cutoutUrl,
          ...(refused
            ? {
                note: "kept the existing cutout — background removal is not available here, so it could not be replaced",
              }
            : {}),
        });
      }

      if (!body.url || !/^https?:\/\//.test(body.url)) {
        return Response.json({ error: "no image given" }, { status: 400 });
      }
      const saved = await setPhotoFromUrl(hex, body.url, {
        photographer: body.photographer,
        pageLink: body.pageLink ?? body.url,
        source: body.source ?? "url",
      });
      if (!saved) {
        return Response.json({ error: "could not fetch image" }, { status: 502 });
      }
    }
  } catch {
    return Response.json({ error: "not a valid image" }, { status: 400 });
  }

  const media = await ensureCutout(hex);
  return Response.json({
    ok: true,
    photoUrl: media.photoUrl,
    cutout: media.cutoutState,
    cutoutUrl: media.cutoutUrl,
  });
}
