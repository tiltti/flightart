import { promises as fs } from "fs";
import path from "path";
import { USER_AGENT } from "@/lib/config";
import { db, ready } from "@/lib/db";
import { getMedia, setPhotoFromBytes } from "@/lib/media";
import { isRemoteBlob, putBlob } from "@/lib/blobstore";
import type { SightingRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
// the platform cap; the import only ever runs locally, where it is not applied
export const maxDuration = 300;

// One-shot import of the old file-based logbook into the database. Reads files
// that only exist on the machine that collected them, so it is inert once
// deployed. Safe to re-run: sightings dedupe on id, media on photo_key.

const DATA = path.join(process.cwd(), "data");

interface Report {
  sightings: { read: number; inserted: number };
  photos: { found: number; migrated: number; skippedNoCredit: number; alreadyDone: number };
  cutouts: { migrated: number; rejected: number };
  notes: string[];
}

async function recoverCredit(
  hex: string,
): Promise<{ photographer: string; pageLink: string } | null> {
  try {
    const res = await fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      photos?: { photographer?: string; link?: string }[];
    };
    const p = body.photos?.[0];
    if (!p?.photographer) return null;
    return {
      photographer: p.photographer,
      pageLink: p.link ?? "https://www.planespotters.net",
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers.get("x-admin-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  await ready();

  const report: Report = {
    sightings: { read: 0, inserted: 0 },
    photos: { found: 0, migrated: 0, skippedNoCredit: 0, alreadyDone: 0 },
    cutouts: { migrated: 0, rejected: 0 },
    notes: [],
  };

  // --- sightings ---
  let sightings: SightingRecord[] = [];
  try {
    const raw = await fs.readFile(path.join(DATA, "sightings.json"), "utf8");
    sightings = (JSON.parse(raw) as { sightings: SightingRecord[] }).sightings ?? [];
  } catch {
    report.notes.push("no sightings.json found — nothing to import");
  }
  report.sightings.read = sightings.length;

  for (let i = 0; i < sightings.length; i += 50) {
    const chunk = sightings.slice(i, i + 50);
    const res = await db().batch(
      chunk.map((s) => ({
        sql: `INSERT OR IGNORE INTO sightings
                (id, hex, registration, callsign, type_code, type_name, operator,
                 origin_iata, origin_city, dest_iata, dest_city,
                 first_seen, last_seen, min_distance_km, max_alt_ft, spotlighted, source)
              VALUES (:id, :hex, :registration, :callsign, :type_code, :type_name, :operator,
                      :origin_iata, :origin_city, :dest_iata, :dest_city,
                      :first_seen, :last_seen, :min_distance_km, :max_alt_ft, :spotlighted, :source)`,
        args: {
          id: s.id,
          hex: s.hex,
          registration: s.registration,
          callsign: s.callsign,
          type_code: s.typeCode,
          type_name: s.typeName,
          operator: s.operator,
          origin_iata: s.originIata,
          origin_city: s.originCity,
          dest_iata: s.destIata,
          dest_city: s.destCity,
          first_seen: s.firstSeen,
          last_seen: s.lastSeen,
          min_distance_km: s.minDistanceKm,
          max_alt_ft: s.maxAltFt,
          spotlighted: s.spotlighted ? 1 : 0,
          source: s.source ?? "adsb.fi",
        },
      })),
      "write",
    );
    report.sightings.inserted += res.reduce((n, r) => n + Number(r.rowsAffected), 0);
  }

  // --- photos, with attribution ---
  let photoFiles: string[] = [];
  try {
    photoFiles = (await fs.readdir(path.join(DATA, "photos"))).filter((f) =>
      /^[0-9a-f]{6}\.jpg$/i.test(f),
    );
  } catch {
    report.notes.push("no photos directory");
  }
  report.photos.found = photoFiles.length;

  let legacyMeta: Record<string, { photographer?: string; pageLink?: string; source?: string }> = {};
  try {
    legacyMeta = JSON.parse(
      await fs.readFile(path.join(DATA, "photos", "photo-meta.json"), "utf8"),
    );
  } catch {
    // no legacy metadata — credits get recovered from the API below
  }

  for (const file of photoFiles) {
    const hex = file.slice(0, 6).toLowerCase();
    const existing = await getMedia(hex);
    // a locally-served URL is useless once blob storage is configured, so
    // those rows are re-uploaded rather than skipped
    const staleLocalUrl =
      isRemoteBlob && Boolean(existing?.photoUrl?.startsWith("/api/blob/"));
    if (existing?.photoKey && !staleLocalUrl) {
      report.photos.alreadyDone++;
      continue;
    }

    let meta = legacyMeta[hex];
    if (!meta?.photographer) {
      // never re-host a gallery photo without its credit
      const recovered = await recoverCredit(hex);
      if (!recovered) {
        report.photos.skippedNoCredit++;
        continue;
      }
      meta = { ...recovered, source: "planespotters" };
    }

    const bytes = await fs.readFile(path.join(DATA, "photos", file));
    await setPhotoFromBytes(hex, bytes, {
      photographer: meta.photographer ?? null,
      pageLink: meta.pageLink ?? null,
      source: meta.source ?? "planespotters",
    });
    report.photos.migrated++;

    // carry over the cutout verdict for this airframe
    const cutPath = path.join(DATA, "cutouts", `${hex}.png`);
    const rejPath = path.join(DATA, "cutouts", `${hex}.rejected`);
    try {
      const cut = await fs.readFile(cutPath);
      const stored = await putBlob(`cutouts/${hex}.png`, cut, "image/png");
      await db().execute({
        sql: `UPDATE airframe_media
                 SET cutout_url = ?, cutout_key = ?, cutout_state = 'ok', updated_at = ?
               WHERE hex = ?`,
        args: [stored.url, stored.key, Date.now(), hex],
      });
      report.cutouts.migrated++;
    } catch {
      try {
        const reason = (await fs.readFile(rejPath, "utf8")).trim() || "auto";
        await db().execute({
          sql: `UPDATE airframe_media
                   SET cutout_state = 'rejected', rejected_reason = ?, updated_at = ?
                 WHERE hex = ?`,
          args: [reason, Date.now(), hex],
        });
        report.cutouts.rejected++;
      } catch {
        // no cutout and no verdict — it will be generated on demand
      }
    }
  }

  if (report.photos.skippedNoCredit > 0) {
    report.notes.push(
      `${report.photos.skippedNoCredit} photos skipped: no photographer credit could be recovered. They will be re-fetched with proper attribution when the aircraft is next featured.`,
    );
  }
  return Response.json(report);
}
