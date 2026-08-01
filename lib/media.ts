import { USER_AGENT } from "@/lib/config";
import { deleteBlob, getBlobBytes, putBlob } from "@/lib/blobstore";
import { db, ready } from "@/lib/db";

// Per-airframe imagery: the original gallery photo and the background-removed
// poster cutout. Binaries live in blob storage, state in the database.

export type CutoutState = "ok" | "rejected" | "none";

export interface AirframeMedia {
  hex: string;
  photoUrl: string | null;
  photoKey: string | null;
  photographer: string | null;
  pageLink: string | null;
  photoSource: string | null;
  cutoutUrl: string | null;
  cutoutKey: string | null;
  cutoutState: CutoutState;
  rejectedReason: string | null;
  cutoutAttempts: number;
}

// background removal is best-effort; stop retrying a photo that keeps failing
const MAX_CUTOUT_ATTEMPTS = 3;

interface MediaRow {
  hex: string;
  photo_url: string | null;
  photo_key: string | null;
  photographer: string | null;
  page_link: string | null;
  photo_source: string | null;
  cutout_url: string | null;
  cutout_key: string | null;
  cutout_state: string;
  rejected_reason: string | null;
  cutout_attempts: number;
}

function toMedia(r: MediaRow): AirframeMedia {
  return {
    hex: r.hex,
    photoUrl: r.photo_url,
    photoKey: r.photo_key,
    photographer: r.photographer,
    pageLink: r.page_link,
    photoSource: r.photo_source,
    cutoutUrl: r.cutout_url,
    cutoutKey: r.cutout_key,
    cutoutState: (r.cutout_state as CutoutState) ?? "none",
    rejectedReason: r.rejected_reason,
    cutoutAttempts: Number(r.cutout_attempts ?? 0),
  };
}

export async function getMedia(hex: string): Promise<AirframeMedia | null> {
  await ready();
  const res = await db().execute({
    sql: "SELECT * FROM airframe_media WHERE hex = ?",
    args: [hex],
  });
  const row = res.rows[0] as unknown as MediaRow | undefined;
  return row ? toMedia(row) : null;
}

async function upsert(
  hex: string,
  patch: Partial<Record<keyof MediaRow, string | null>>,
): Promise<AirframeMedia> {
  await ready();
  const cols = Object.keys(patch);
  await db().execute({
    sql: `INSERT INTO airframe_media (hex, updated_at, ${cols.join(", ")})
          VALUES (?, ?, ${cols.map(() => "?").join(", ")})
          ON CONFLICT(hex) DO UPDATE SET updated_at = excluded.updated_at,
            ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}`,
    args: [hex, Date.now(), ...cols.map((c) => patch[c as keyof MediaRow] ?? null)],
  });
  return (await getMedia(hex))!;
}

// --- photos ---

export interface PhotoMetaInput {
  photographer?: string | null;
  pageLink?: string | null;
  source?: string | null;
}

export async function setPhotoFromBytes(
  hex: string,
  bytes: Buffer,
  meta: PhotoMetaInput,
): Promise<AirframeMedia> {
  const sharp = (await import("sharp")).default;
  const jpg = await sharp(bytes)
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

  const previous = await getMedia(hex);
  const stored = await putBlob(`photos/${hex}.jpg`, jpg, "image/jpeg");
  if (previous?.photoKey && previous.photoKey !== stored.key) {
    await deleteBlob(previous.photoKey);
  }
  // a new photo invalidates any cutout or rejection derived from the old one
  if (previous?.cutoutKey) await deleteBlob(previous.cutoutKey);
  return upsert(hex, {
    photo_url: stored.url,
    photo_key: stored.key,
    photographer: meta.photographer ?? null,
    page_link: meta.pageLink ?? null,
    photo_source: meta.source ?? null,
    cutout_url: null,
    cutout_key: null,
    cutout_state: "none",
    rejected_reason: null,
    cutout_attempts: "0",
  });
}

export async function setPhotoFromUrl(
  hex: string,
  url: string,
  meta: PhotoMetaInput,
): Promise<AirframeMedia | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await setPhotoFromBytes(hex, Buffer.from(await res.arrayBuffer()), meta);
  } catch {
    return null;
  }
}

// --- cutouts ---

// Background removal mangles ground shots taken from a front quarter — wings
// vanish, tow bars remain. A clean side view is wide and low: the "core"
// (columns/rows holding >= 10 % of peak alpha mass) must be clearly wider than
// tall. Calibrated on real cutouts: good side views 4.3-5.9, a mangled ATR 1.7.
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
  const first = (arr: number[]) => arr.findIndex((c) => c > 0);
  const last = (arr: number[]) =>
    arr.length - 1 - [...arr].reverse().findIndex((c) => c > 0);
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

const g = globalThis as unknown as { __faCutoutJobs?: Map<string, Promise<AirframeMedia>> };
const jobs = (g.__faCutoutJobs ??= new Map());

// Generates the poster cutout if the airframe has a photo and no verdict yet.
// Safe to call repeatedly: rejected airframes are never retried automatically.
export function ensureCutout(hex: string): Promise<AirframeMedia> {
  let job = jobs.get(hex);
  if (!job) {
    job = generateCutout(hex).finally(() => jobs.delete(hex));
    jobs.set(hex, job);
  }
  return job;
}

async function generateCutout(hex: string): Promise<AirframeMedia> {
  const media = await getMedia(hex);
  if (
    !media?.photoUrl ||
    media.cutoutState !== "none" ||
    media.cutoutAttempts >= MAX_CUTOUT_ATTEMPTS
  ) {
    return media ?? (await upsert(hex, { cutout_state: "none" }));
  }
  // count the attempt up front so a crashing runtime cannot loop forever
  await db().execute({
    sql: "UPDATE airframe_media SET cutout_attempts = cutout_attempts + 1 WHERE hex = ?",
    args: [hex],
  });
  const bytes = await getBlobBytes(
    media.photoKey ? { key: media.photoKey, url: media.photoUrl } : null,
  );
  if (!bytes) return media;

  try {
    const { removeBackground } = await import("@imgly/background-removal-node");
    const cut = await removeBackground(
      new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
      { output: { format: "image/png" } },
    );
    const cleaned = await qualityTrim(Buffer.from(await cut.arrayBuffer()));
    if (!cleaned) {
      return upsert(hex, { cutout_state: "rejected", rejected_reason: "auto" });
    }
    const stored = await putBlob(`cutouts/${hex}.png`, cleaned, "image/png");
    return upsert(hex, {
      cutout_url: stored.url,
      cutout_key: stored.key,
      cutout_state: "ok",
      rejected_reason: null,
    });
  } catch (err) {
    // background removal unavailable (e.g. missing native runtime) — leave the
    // state untouched so it can be retried from the aircraft page
    console.error("[flightart] cutout failed for", hex, err);
    return media;
  }
}

export async function markPhotoOnly(hex: string): Promise<AirframeMedia> {
  const media = await getMedia(hex);
  if (media?.cutoutKey) await deleteBlob(media.cutoutKey);
  return upsert(hex, {
    cutout_url: null,
    cutout_key: null,
    cutout_state: "rejected",
    rejected_reason: "manual",
  });
}

export async function resetCutout(hex: string): Promise<AirframeMedia> {
  const media = await getMedia(hex);
  if (media?.cutoutKey) await deleteBlob(media.cutoutKey);
  jobs.delete(hex);
  await upsert(hex, {
    cutout_url: null,
    cutout_key: null,
    cutout_state: "none",
    rejected_reason: null,
    cutout_attempts: "0", // an explicit retry starts the budget over
  });
  return ensureCutout(hex);
}
