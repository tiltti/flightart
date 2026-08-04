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

// The background-removal runtime (onnxruntime + model weights, ~290 MB) is not
// deployed to Vercel. Cutouts are produced wherever this runs with the native
// runtime available — in practice the local machine — and land in the same
// database and blob store, so the deployed display picks them up immediately.
export const cutoutsEnabled =
  process.env.ENABLE_CUTOUTS === "1" || !process.env.VERCEL;

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
  stack_collected_at: number | null;
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
  if (!cutoutsEnabled) {
    // leave the state at 'none' so a run with the runtime available picks it up
    return getMedia(hex).then((m) => m ?? upsert(hex, { cutout_state: "none" }));
  }
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
  const bytes = await getBlobBytes(
    media.photoKey ? { key: media.photoKey, url: media.photoUrl } : null,
  );
  if (!bytes) return media;

  try {
    const { removeBackground } = await import("@imgly/background-removal-node");
    // Counted only once the runtime has actually loaded, so an environment
    // without it never burns the budget for one that has it.
    await db().execute({
      sql: "UPDATE airframe_media SET cutout_attempts = cutout_attempts + 1 WHERE hex = ?",
      args: [hex],
    });
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

// --- curation: browsing and banning cutouts ---

export interface CutoutEntry {
  hex: string;
  registration: string | null;
  typeCode: string | null;
  operator: string | null;
  cutoutUrl: string | null;
  photoUrl: string | null;
  photographer: string | null;
  state: CutoutState;
  rejectedReason: string | null;
  timesSeen: number;
  lastSeen: number;
}

export interface CutoutPage {
  rows: CutoutEntry[];
  total: number;
  page: number;
  per: number;
}

// Ordered by how often the airframe has been seen, so the ones that take up
// the most wall time are curated first.
export async function listCutouts(opts: {
  filter?: "kept" | "banned" | "all";
  page?: number;
  per?: number;
}): Promise<CutoutPage> {
  await ready();
  const where =
    opts.filter === "banned"
      ? "m.cutout_state = 'rejected'"
      : opts.filter === "all"
        ? "(m.cutout_state = 'ok' OR m.cutout_state = 'rejected')"
        : "m.cutout_state = 'ok'";

  const per = Math.min(60, Math.max(6, opts.per ?? 24));
  const countRes = await db().execute(
    `SELECT count(*) AS n FROM airframe_media m WHERE ${where}`,
  );
  const total = Number((countRes.rows[0] as unknown as { n: number }).n);
  const pageCount = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pageCount, Math.max(1, opts.page ?? 1));

  const res = await db().execute({
    sql: `SELECT m.hex, m.cutout_url, m.photo_url, m.photographer,
                 m.cutout_state, m.rejected_reason,
                 count(s.id) AS times_seen,
                 max(s.last_seen) AS last_seen,
                 max(s.registration) AS registration,
                 max(s.type_code) AS type_code,
                 max(s.operator) AS operator
            FROM airframe_media m
            LEFT JOIN sightings s ON s.hex = m.hex
           WHERE ${where}
           GROUP BY m.hex
           ORDER BY times_seen DESC, last_seen DESC
           LIMIT :limit OFFSET :offset`,
    args: { limit: per, offset: (page - 1) * per },
  });

  const rows = (
    res.rows as unknown as {
      hex: string;
      cutout_url: string | null;
      photo_url: string | null;
      photographer: string | null;
      cutout_state: string;
      rejected_reason: string | null;
      times_seen: number;
      last_seen: number | null;
      registration: string | null;
      type_code: string | null;
      operator: string | null;
    }[]
  ).map((r) => ({
    hex: r.hex,
    registration: r.registration,
    typeCode: r.type_code,
    operator: r.operator,
    cutoutUrl: r.cutout_url,
    photoUrl: r.photo_url,
    photographer: r.photographer,
    state: r.cutout_state as CutoutState,
    rejectedReason: r.rejected_reason,
    timesSeen: Number(r.times_seen ?? 0),
    lastSeen: Number(r.last_seen ?? 0),
  }));
  return { rows, total, page, per };
}

// --- extra gallery photos for the spotlight stack ---

export interface StackPhoto {
  url: string;
  photographer: string | null;
  pageLink: string | null;
  source: string | null;
}

const MAX_EXTRA_PHOTOS = 2;

export async function getStackPhotos(hex: string): Promise<StackPhoto[]> {
  await ready();
  const res = await db().execute({
    sql: "SELECT url, photographer, page_link, source FROM airframe_photos WHERE hex = ? ORDER BY slot",
    args: [hex],
  });
  return (
    res.rows as unknown as {
      url: string;
      photographer: string | null;
      page_link: string | null;
      source: string | null;
    }[]
  ).map((r) => ({
    url: r.url,
    photographer: r.photographer,
    pageLink: r.page_link,
    source: r.source,
  }));
}

// True once collection has run, even if it found nothing, so an airframe with
// only one known photo is not searched again on every appearance.
export async function stackCollected(hex: string): Promise<boolean> {
  await ready();
  const res = await db().execute({
    sql: "SELECT stack_collected_at FROM airframe_media WHERE hex = ?",
    args: [hex],
  });
  const row = res.rows[0] as unknown as { stack_collected_at: number | null } | undefined;
  return Boolean(row?.stack_collected_at);
}

const gs = globalThis as unknown as { __faStackJobs?: Set<string> };
const stackJobs = (gs.__faStackJobs ??= new Set());

// Downloads up to two further photos of the airframe so the spotlight can show
// a stack. Never re-hosts a photo without a photographer credit.
export async function collectStackPhotos(
  hex: string,
  registration: string | null,
  primaryPageLink: string | null,
): Promise<void> {
  if (stackJobs.has(hex)) return;
  stackJobs.add(hex);
  try {
    if (await stackCollected(hex)) return;
    const { findCandidates, namesRegistration } = await import("@/lib/galleries");
    const candidates = (await findCandidates(hex, registration)).filter(
      (c) =>
        c.photographer &&
        c.link !== primaryPageLink &&
        // a loose text match can be a different airframe entirely, and nothing
        // attached automatically may claim to be an aircraft it is not
        namesRegistration(c, registration),
    );

    let slot = 1;
    for (const c of candidates) {
      if (slot > MAX_EXTRA_PHOTOS) break;
      try {
        const res = await fetch(c.full, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) continue;
        const sharp = (await import("sharp")).default;
        const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
          .rotate()
          .resize({ width: 1000, withoutEnlargement: true })
          .jpeg({ quality: 84 })
          .toBuffer();
        const stored = await putBlob(`photos/${hex}-${slot}.jpg`, jpg, "image/jpeg");
        await db().execute({
          sql: `INSERT INTO airframe_photos (hex, slot, url, key, photographer, page_link, source, collected_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(hex, slot) DO UPDATE SET
                  url = excluded.url, key = excluded.key,
                  photographer = excluded.photographer,
                  page_link = excluded.page_link, source = excluded.source,
                  collected_at = excluded.collected_at`,
          args: [hex, slot, stored.url, stored.key, c.photographer, c.link, c.source, Date.now()],
        });
        slot++;
      } catch {
        // a candidate that will not download is simply skipped
      }
    }
    await upsert(hex, { stack_collected_at: String(Date.now()) });
  } catch {
    // collection is decorative; never let it surface as a failure
  } finally {
    stackJobs.delete(hex);
  }
}

// Banning hides a cutout rather than destroying it. The image costs a few tens
// of kilobytes and keeping it makes the decision reversible from anywhere,
// including a deployment that cannot run background removal.
export async function markPhotoOnly(hex: string): Promise<AirframeMedia> {
  return upsert(hex, {
    cutout_state: "rejected",
    rejected_reason: "manual",
  });
}

export interface CutoutAction {
  media: AirframeMedia;
  // set when a request to remake a cutout was refused to avoid losing the
  // existing one in an environment that cannot produce a replacement
  refused?: boolean;
}

// Lifting a ban. Never destructive: a cutout that is still on file comes back
// immediately, and one that is missing is queued for whichever environment can
// generate it.
export async function restoreCutout(hex: string): Promise<CutoutAction> {
  const media = await getMedia(hex);
  jobs.delete(hex);

  if (media?.cutoutKey && media.cutoutUrl) {
    return {
      media: await upsert(hex, { cutout_state: "ok", rejected_reason: null }),
    };
  }
  await upsert(hex, {
    cutout_url: null,
    cutout_key: null,
    cutout_state: "none",
    rejected_reason: null,
    cutout_attempts: "0",
  });
  return { media: await ensureCutout(hex) };
}

// Deliberately discarding a cutout to make a new one. This is the only path
// that throws an image away, so it refuses where nothing could replace it.
export async function regenerateCutout(hex: string): Promise<CutoutAction> {
  const media = await getMedia(hex);
  if (media?.cutoutState === "ok" && !cutoutsEnabled) {
    return { media, refused: true };
  }
  jobs.delete(hex);
  if (media?.cutoutKey) await deleteBlob(media.cutoutKey);
  await upsert(hex, {
    cutout_url: null,
    cutout_key: null,
    cutout_state: "none",
    rejected_reason: null,
    cutout_attempts: "0", // an explicit retry starts the budget over
  });
  return { media: await ensureCutout(hex) };
}
