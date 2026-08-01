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

// --- per-airframe photo metadata (credit + source), persisted on disk ---

export interface PhotoMeta {
  photographer?: string;
  pageLink?: string;
  source?: string; // "planespotters" | "commons" | "url" | "upload"
}

const META_FILE = path.join(DIR, "photo-meta.json");
const gm = globalThis as unknown as {
  __faPhotoMeta?: Promise<Record<string, PhotoMeta>>;
};

async function metaAll(): Promise<Record<string, PhotoMeta>> {
  gm.__faPhotoMeta ??= (async () => {
    try {
      return JSON.parse(await fs.readFile(META_FILE, "utf8"));
    } catch {
      return {};
    }
  })();
  return gm.__faPhotoMeta;
}

export async function getPhotoMeta(hex: string): Promise<PhotoMeta | null> {
  return (await metaAll())[hex] ?? null;
}

export async function setPhotoMeta(hex: string, meta: PhotoMeta): Promise<void> {
  const all = await metaAll();
  all[hex] = meta;
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(META_FILE, JSON.stringify(all, null, 1));
}

// Replace an airframe's photo with user-chosen bytes: normalized to jpeg,
// old cutout/rejection state is the caller's responsibility.
export async function replacePhoto(
  hex: string,
  bytes: Buffer,
  meta: PhotoMeta,
): Promise<void> {
  const sharp = (await import("sharp")).default;
  const jpg = await sharp(bytes)
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(photoFile(hex), jpg);
  await setPhotoMeta(hex, meta);
  jobs.set(hex, Promise.resolve(true)); // local file now exists
}
