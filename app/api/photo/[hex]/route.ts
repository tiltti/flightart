import { promises as fs } from "fs";
import { photoFile } from "@/lib/photos";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hex: string }> },
) {
  const { hex } = await params;
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return new Response("bad hex", { status: 400 });
  }
  try {
    const buf = await fs.readFile(photoFile(hex.toLowerCase()));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
