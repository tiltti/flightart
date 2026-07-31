import { promises as fs } from "fs";
import { cutoutFile } from "@/lib/cutout";

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
    const buf = await fs.readFile(cutoutFile(hex.toLowerCase()));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
