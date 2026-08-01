import { USER_AGENT } from "@/lib/config";
import { cutoutState, ensureCutout, resetCutout } from "@/lib/cutout";
import { replacePhoto, type PhotoMeta } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;

// Set a new photo for an airframe — either from a URL (gallery pick or
// pasted address) or an uploaded file — then re-attempt the cutout.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ hex: string }> },
) {
  const { hex: raw } = await params;
  if (!/^[0-9a-f]{6}$/i.test(raw)) {
    return Response.json({ error: "bad hex" }, { status: 400 });
  }
  const hex = raw.toLowerCase();

  let bytes: Buffer | null = null;
  let meta: PhotoMeta = {};

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      if (file instanceof File) {
        if (file.size > MAX_BYTES) {
          return Response.json({ error: "file too large" }, { status: 413 });
        }
        bytes = Buffer.from(await file.arrayBuffer());
        meta = { source: "upload", photographer: "", pageLink: "" };
      }
    } else {
      const body = (await req.json()) as {
        url?: string;
        photographer?: string;
        pageLink?: string;
        source?: string;
      };
      if (body.url && /^https?:\/\//.test(body.url)) {
        const res = await fetch(body.url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          return Response.json(
            { error: `fetch failed (${res.status})` },
            { status: 502 },
          );
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_BYTES) {
          return Response.json({ error: "file too large" }, { status: 413 });
        }
        bytes = buf;
        meta = {
          source: body.source ?? "url",
          photographer: body.photographer ?? "",
          pageLink: body.pageLink ?? body.url,
        };
      }
    }
  } catch {
    return Response.json({ error: "could not read image" }, { status: 400 });
  }

  if (!bytes) return Response.json({ error: "no image given" }, { status: 400 });

  try {
    await replacePhoto(hex, bytes, meta);
  } catch {
    return Response.json({ error: "not a valid image" }, { status: 400 });
  }
  await resetCutout(hex);
  await ensureCutout(hex, "");
  const cutout = await cutoutState(hex);
  return Response.json({
    ok: true,
    photoUrl: `/api/photo/${hex}`,
    cutout,
    cutoutUrl: cutout === "ok" ? `/api/cutout/${hex}` : null,
  });
}
