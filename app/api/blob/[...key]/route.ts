import { isRemoteBlob, readLocalBlob } from "@/lib/blobstore";

export const dynamic = "force-dynamic";

// Local-dev only: serves images stored under data/. In production the browser
// loads blob URLs straight from the CDN and never reaches this route.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (isRemoteBlob) return new Response("not found", { status: 404 });
  const { key } = await params;
  const joined = key.join("/");
  if (!/^(photos|cutouts)\/[0-9a-f]{6}\.(jpg|png)$/i.test(joined)) {
    return new Response("bad key", { status: 400 });
  }
  const bytes = await readLocalBlob(joined);
  if (!bytes) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": joined.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": "public, max-age=300",
    },
  });
}
