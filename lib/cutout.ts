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

function rejectedFile(hex: string): string {
  return path.join(DIR, `${hex}.rejected`);
}

// Background removal mangles ground shots taken from a front quarter —
// wings vanish, wires remain. A clean side view is wide and low: the
// "core" (columns/rows holding ≥10 % of the peak alpha mass) must be
// clearly wider than tall. Calibrated on real cutouts: good side views
// score 4.3–5.9, a mangled front-quarter ATR scored 1.7.
const MIN_CORE_RATIO = 2.3;
const MIN_COVERAGE = 0.05;

async function qualityTrim(png: Buffer): Promise<Buffer | null> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const colCounts = new Array<number>(width).fill(0);
  const rowCounts = new Array<number>(height).fill(0);
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 25) {
        colCounts[x]++;
        rowCounts[y]++;
        total++;
      }
    }
  }
  if (total === 0) return null;
  const coverage = total / (width * height);
  const maxCol = Math.max(...colCounts);
  const maxRow = Math.max(...rowCounts);
  const coreCols = colCounts.filter((c) => c >= maxCol * 0.1).length;
  const coreRows = rowCounts.filter((c) => c >= maxRow * 0.1).length;
  if (coverage < MIN_COVERAGE || coreCols / Math.max(1, coreRows) < MIN_CORE_RATIO) {
    return null;
  }
  // trim to the subject with a small margin for consistent poster framing
  const first = (arr: number[]) => arr.findIndex((c) => c > 0);
  const last = (arr: number[]) => arr.length - 1 - [...arr].reverse().findIndex((c) => c > 0);
  const m = 8;
  const left = Math.max(0, first(colCounts) - m);
  const top = Math.max(0, first(rowCounts) - m);
  return sharp(png)
    .extract({
      left,
      top,
      width: Math.min(width, last(colCounts) + m) - left,
      height: Math.min(height, last(rowCounts) + m) - top,
    })
    .png()
    .toBuffer();
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
    try {
      await fs.access(rejectedFile(hex));
      return false; // known-bad photo, don't burn cycles again
    } catch {
      // not rejected — proceed
    }
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
    const cleaned = await qualityTrim(Buffer.from(await cut.arrayBuffer()));
    if (!cleaned) {
      await fs.writeFile(rejectedFile(hex), "");
      return false; // torso cutout — the dark photo mode handles this one
    }
    await fs.writeFile(cutoutFile(hex), cleaned);
    return true;
  } catch {
    jobs.delete(hex); // allow a retry on the next spotlight
    return false;
  }
}
