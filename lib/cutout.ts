import { promises as fs } from "fs";
import path from "path";
import { USER_AGENT } from "@/lib/config";
import { photoFile } from "@/lib/photos";

// Poster mode: aircraft photo -> background removed -> PNG with alpha,
// cached on disk. First run downloads the ONNX model, so generation is
// fire-and-forget; the UI falls back to the framed photo until ready.
const DIR = path.join(process.cwd(), "data", "cutouts");

const g = globalThis as unknown as {
  __faCutoutJobs?: Map<string, Promise<boolean>>;
};
const jobs = (g.__faCutoutJobs ??= new Map());

export function cutoutFile(hex: string): string {
  return path.join(DIR, `${hex}.png`);
}

export async function hasCutout(hex: string): Promise<boolean> {
  try {
    await fs.access(cutoutFile(hex));
    return true;
  } catch {
    return false;
  }
}

export function ensureCutout(hex: string, photoUrl: string): Promise<boolean> {
  let job = jobs.get(hex);
  if (!job) {
    job = generate(hex, photoUrl);
    jobs.set(hex, job);
  }
  return job;
}

async function generate(hex: string, photoUrl: string): Promise<boolean> {
  try {
    if (await hasCutout(hex)) return true;
    // prefer the locally cached photo; fall back to one remote fetch
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(photoFile(hex));
    } catch {
      const res = await fetch(photoUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`photo fetch ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
    }
    const source = new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
    const { removeBackground } = await import("@imgly/background-removal-node");
    const cut = await removeBackground(source, {
      output: { format: "image/png" },
    });
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(cutoutFile(hex), Buffer.from(await cut.arrayBuffer()));
    return true;
  } catch {
    jobs.delete(hex); // allow a retry on the next spotlight
    return false;
  }
}
