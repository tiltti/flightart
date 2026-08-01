import { ensureCutout, setPhotoFromBytes, setPhotoFromUrl } from "@/lib/media";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 15 * 1024 * 1024;

// Set a new photo for an airframe — either from a URL (gallery pick or pasted
// address) or an uploaded file — then attempt the cutout right away.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ hex: string }> },
) {
  const { hex: raw } = await params;
  if (!/^[0-9a-f]{6}$/i.test(raw)) {
    return Response.json({ error: "bad hex" }, { status: 400 });
  }
  const hex = raw.toLowerCase();
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
      };
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
