import { promises as fs } from "fs";
import path from "path";
import { USER_AGENT } from "@/lib/config";

// Original airframe photos cached on disk — fetched from the planespotters
// CDN exactly once per airframe, then served locally via /api/photo/<hex>.
const DIR = path.join(process.cwd(), "data", "photos");

const g = globalThis as unknown as {
  __faPhotoJobs?: Map<string, Promise<boolean>>;
};
const jobs = (g.__faPhotoJobs ??= new Map());

export function photoFile(hex: string): string {
  return path.join(DIR, `${hex}.jpg`);
}

export async function hasPhotoFile(hex: string): Promise<boolean> {
  try {
    await fs.access(photoFile(hex));
    return true;
  } catch {
    return false;
  }
}

export function ensurePhotoFile(
  hex: string,
  remoteUrl: string,
): Promise<boolean> {
  let job = jobs.get(hex);
  if (!job) {
    job = download(hex, remoteUrl);
    jobs.set(hex, job);
  }
  return job;
}

async function download(hex: string, remoteUrl: string): Promise<boolean> {
  try {
    if (await hasPhotoFile(hex)) return true;
    const res = await fetch(remoteUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`photo fetch ${res.status}`);
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(photoFile(hex), Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    jobs.delete(hex); // allow a retry later
    return false;
  }
}
