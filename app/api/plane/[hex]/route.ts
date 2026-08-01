import { USER_AGENT } from "@/lib/config";
import {
  ensureCutout,
  getMedia,
  markPhotoOnly,
  resetCutout,
  setPhotoFromBytes,
  setPhotoFromUrl,
} from "@/lib/media";
import { sightingsForHex } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

function parseHex(raw: string): string | null {
  return /^[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
}

// --- photo candidates from the public galleries ---

interface PhotoCandidate {
  id: string;
  thumb: string;
  full: string;
  source: string;
  photographer: string;
  link: string;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

interface PsPhoto {
  id?: string;
  thumbnail_large?: { src?: string };
  link?: string;
  photographer?: string;
}

async function planespotters(path: string): Promise<PhotoCandidate[]> {
  const body = (await getJson(
    `https://api.planespotters.net/pub/photos/${path}`,
  )) as { photos?: PsPhoto[] } | null;
  return (body?.photos ?? [])
    .filter((p) => p.thumbnail_large?.src)
    .map((p) => ({
      id: `ps-${p.id ?? p.thumbnail_large!.src}`,
      thumb: p.thumbnail_large!.src!,
      full: p.thumbnail_large!.src!,
      source: "planespotters",
      photographer: p.photographer ?? "planespotters.net",
      link: p.link ?? "https://www.planespotters.net",
    }));
}

interface CommonsPage {
  title?: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: { Artist?: { value?: string } };
    mime?: string;
  }[];
}

async function commons(reg: string): Promise<PhotoCandidate[]> {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `"${reg}" aircraft`,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "800",
  });
  const body = (await getJson(`https://commons.wikimedia.org/w/api.php?${q}`)) as {
    query?: { pages?: Record<string, CommonsPage> };
  } | null;
  return Object.values(body?.query?.pages ?? {})
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl || !/^image\/(jpeg|png)/.test(ii.mime ?? "")) return null;
      const artist = (ii.extmetadata?.Artist?.value ?? "")
        .replace(/<[^>]*>/g, "")
        .trim();
      return {
        id: `wc-${p.title}`,
        thumb: ii.thumburl,
        full: ii.thumburl,
        source: "commons",
        photographer: artist || "Wikimedia Commons",
        link: ii.descriptionurl ?? "https://commons.wikimedia.org",
      };
    })
    .filter((c): c is PhotoCandidate => c !== null);
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
    const reg = search.get("reg")?.trim() ?? "";
    const [psHex, psReg, wc] = await Promise.all([
      planespotters(`hex/${hex}`),
      reg ? planespotters(`reg/${encodeURIComponent(reg)}`) : Promise.resolve([]),
      reg ? commons(reg) : Promise.resolve([]),
    ]);
    const seen = new Set<string>();
    const candidates = [...psHex, ...psReg, ...wc].filter((c) => {
      if (seen.has(c.thumb)) return false;
      seen.add(c.thumb);
      return true;
    });
    return Response.json({ candidates });
  }

  const [sightings, media] = await Promise.all([sightingsForHex(hex), getMedia(hex)]);
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
    cutout: media?.cutoutState ?? "none",
    cutoutUrl: media?.cutoutUrl ?? null,
  });
}

// POST /api/plane/<hex>
//   multipart body           — replace the photo with an upload
//   {url, photographer, …}   — replace the photo from a gallery pick or address
//   {mode: 'auto'|'photo-only'} — retry background removal, or pin to the photo
export async function POST(
  req: Request,
  { params }: { params: Promise<{ hex: string }> },
) {
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
      if (body.mode === "auto") {
        const media = await resetCutout(hex);
        return Response.json({
          ok: true,
          cutout: media.cutoutState,
          cutoutUrl: media.cutoutUrl,
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
