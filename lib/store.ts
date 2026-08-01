import type { InStatement, InValue } from "@libsql/client";
import { db, ready } from "@/lib/db";
import type {
  Aircraft,
  Enrichment,
  LogPage,
  LogQuery,
  SightingRecord,
  Stats,
  Summary,
} from "@/lib/types";

// The logbook. Sightings are append-only: a row is opened the first time an
// airframe appears and extended while it stays in range. Nothing is deleted.

// a plane seen again within this window extends the same sighting
const MERGE_WINDOW_MS = 60 * 60 * 1000;
// how often a still-visible aircraft is written back to the database
const WRITE_EVERY_MS = 15_000;

interface Pending {
  minDistanceKm: number;
  maxAltFt: number | null;
  lastWrite: number;
}

const g = globalThis as unknown as { __faPending?: Map<string, Pending> };
const pending = (g.__faPending ??= new Map());

const SELECT_SIGHTING = `
  SELECT s.*, m.photo_url AS photo_url
    FROM sightings s
    LEFT JOIN airframe_media m ON m.hex = s.hex`;

interface Row {
  id: string;
  hex: string;
  registration: string | null;
  callsign: string | null;
  type_code: string | null;
  type_name: string | null;
  operator: string | null;
  origin_iata: string | null;
  origin_city: string | null;
  dest_iata: string | null;
  dest_city: string | null;
  photo_url: string | null;
  first_seen: number;
  last_seen: number;
  min_distance_km: number;
  max_alt_ft: number | null;
  spotlighted: number;
  source: string;
}

function toRecord(r: Row): SightingRecord {
  return {
    id: r.id,
    hex: r.hex,
    registration: r.registration,
    callsign: r.callsign,
    typeCode: r.type_code,
    typeName: r.type_name,
    operator: r.operator,
    originIata: r.origin_iata,
    originCity: r.origin_city,
    destIata: r.dest_iata,
    destCity: r.dest_city,
    photoUrl: r.photo_url,
    firstSeen: Number(r.first_seen),
    lastSeen: Number(r.last_seen),
    minDistanceKm: Number(r.min_distance_km),
    maxAltFt: r.max_alt_ft === null ? null : Number(r.max_alt_ft),
    spotlighted: Boolean(r.spotlighted),
    source: r.source,
  };
}

export async function recordAircraft(list: Aircraft[]): Promise<void> {
  if (list.length === 0) return;
  await ready();
  const now = Date.now();
  const cutoff = now - MERGE_WINDOW_MS;
  const statements: InStatement[] = [];

  for (const a of list) {
    // accumulate between writes so a close pass is never lost to throttling
    const acc = pending.get(a.hex);
    const minDistanceKm = Math.min(acc?.minDistanceKm ?? Infinity, a.distanceKm);
    const maxAltFt =
      a.altFt === null ? (acc?.maxAltFt ?? null) : Math.max(acc?.maxAltFt ?? 0, a.altFt);
    if (acc && now - acc.lastWrite < WRITE_EVERY_MS) {
      pending.set(a.hex, { minDistanceKm, maxAltFt, lastWrite: acc.lastWrite });
      continue;
    }
    pending.set(a.hex, { minDistanceKm, maxAltFt, lastWrite: now });

    const args = {
      hex: a.hex,
      cutoff,
      now,
      dist: minDistanceKm,
      alt: maxAltFt,
      callsign: a.callsign,
      registration: a.registration,
      type_code: a.typeCode,
      type_name: a.typeDesc,
      id: `${a.hex}-${now}`,
      source: "adsb.fi",
    };
    // extend the open sighting, if there is one
    statements.push({
      sql: `UPDATE sightings SET
              last_seen = :now,
              min_distance_km = min(min_distance_km, :dist),
              max_alt_ft = CASE WHEN :alt IS NULL THEN max_alt_ft
                                ELSE max(coalesce(max_alt_ft, 0), :alt) END,
              callsign = coalesce(callsign, :callsign),
              registration = coalesce(registration, :registration),
              type_code = coalesce(type_code, :type_code),
              type_name = coalesce(type_name, :type_name)
            WHERE id = (SELECT id FROM sightings
                         WHERE hex = :hex AND last_seen >= :cutoff
                         ORDER BY last_seen DESC LIMIT 1)`,
      args,
    });
    // otherwise open a new one — the guard makes concurrent writers safe
    statements.push({
      sql: `INSERT INTO sightings
              (id, hex, registration, callsign, type_code, type_name,
               first_seen, last_seen, min_distance_km, max_alt_ft, spotlighted, source)
            SELECT :id, :hex, :registration, :callsign, :type_code, :type_name,
                   :now, :now, :dist, :alt, 0, :source
             WHERE NOT EXISTS (SELECT 1 FROM sightings
                                WHERE hex = :hex AND last_seen >= :cutoff)`,
      args,
    });
  }

  if (statements.length === 0) return;
  await db().batch(statements, "write");
}

export async function recordSpotlight(e: Enrichment): Promise<void> {
  await ready();
  const cutoff = Date.now() - MERGE_WINDOW_MS;
  await db().execute({
    sql: `UPDATE sightings SET
            spotlighted = 1,
            registration = coalesce(registration, :registration),
            type_name = coalesce(type_name, :type_name),
            operator = coalesce(operator, :operator),
            origin_iata = coalesce(origin_iata, :origin_iata),
            origin_city = coalesce(origin_city, :origin_city),
            dest_iata = coalesce(dest_iata, :dest_iata),
            dest_city = coalesce(dest_city, :dest_city)
          WHERE id = (SELECT id FROM sightings
                       WHERE hex = :hex AND last_seen >= :cutoff
                       ORDER BY last_seen DESC LIMIT 1)`,
    args: {
      hex: e.hex,
      cutoff,
      registration: e.registration,
      type_name: e.typeName,
      operator: e.operator,
      origin_iata: e.route?.originIata ?? null,
      origin_city: e.route?.originCity ?? null,
      dest_iata: e.route?.destIata ?? null,
      dest_city: e.route?.destCity ?? null,
    },
  });
}

export async function sightingsForHex(hex: string): Promise<SightingRecord[]> {
  await ready();
  const res = await db().execute({
    sql: `${SELECT_SIGHTING} WHERE lower(s.hex) = ? ORDER BY s.last_seen DESC LIMIT 200`,
    args: [hex.toLowerCase()],
  });
  return (res.rows as unknown as Row[]).map(toRecord);
}

const SORT_COLUMNS: Record<string, string> = {
  time: "s.last_seen",
  reg: "coalesce(s.registration, s.hex)",
  type: "s.type_code",
  operator: "s.operator",
  route: "s.origin_iata || s.dest_iata",
  dist: "s.min_distance_km",
  alt: "s.max_alt_ft",
};

export async function querySightings(qy: LogQuery): Promise<LogPage> {
  await ready();
  const where: string[] = [];
  const args: Record<string, InValue> = {};

  if (qy.date) {
    // the viewer's local day, not the server's — Vercel runs in UTC
    const utcMidnight = Date.parse(`${qy.date}T00:00:00Z`);
    if (Number.isFinite(utcMidnight)) {
      const start = utcMidnight - (qy.tzOffsetMin ?? 0) * 60_000;
      where.push("s.last_seen >= :dayStart AND s.last_seen < :dayEnd");
      args.dayStart = start;
      args.dayEnd = start + 24 * 60 * 60 * 1000;
    }
  }
  if (qy.q?.trim()) {
    args.needle = `%${qy.q.trim().toUpperCase()}%`;
    where.push(`(upper(coalesce(s.registration,'')) LIKE :needle
              OR upper(coalesce(s.callsign,'')) LIKE :needle
              OR upper(s.hex) LIKE :needle
              OR upper(coalesce(s.type_code,'')) LIKE :needle
              OR upper(coalesce(s.type_name,'')) LIKE :needle
              OR upper(coalesce(s.operator,'')) LIKE :needle
              OR upper(coalesce(s.origin_iata,'')) LIKE :needle
              OR upper(coalesce(s.origin_city,'')) LIKE :needle
              OR upper(coalesce(s.dest_iata,'')) LIKE :needle
              OR upper(coalesce(s.dest_city,'')) LIKE :needle)`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const per = Math.min(100, Math.max(5, qy.per ?? 25));
  const countRes = await db().execute({
    sql: `SELECT count(*) AS n FROM sightings s ${whereSql}`,
    args,
  });
  const total = Number((countRes.rows[0] as unknown as { n: number }).n);
  const pageCount = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pageCount, Math.max(1, qy.page ?? 1));

  const col = SORT_COLUMNS[qy.sort ?? "time"] ?? SORT_COLUMNS.time;
  const dir = qy.dir === "asc" ? "ASC" : "DESC";
  const res = await db().execute({
    sql: `${SELECT_SIGHTING} ${whereSql}
          ORDER BY ${col} IS NULL, ${col} ${dir}, s.last_seen DESC
          LIMIT :limit OFFSET :offset`,
    args: { ...args, limit: per, offset: (page - 1) * per },
  });
  return {
    rows: (res.rows as unknown as Row[]).map(toRecord),
    total,
    page,
    per,
  };
}

// The wall display polls this every couple of minutes; Turso bills rows read,
// so a short cache keeps a full-table aggregate from running on every poll.
const SUMMARY_TTL_MS = 60_000;
const gs = globalThis as unknown as {
  __faSummary?: Map<number, { at: number; value: Summary }>;
};
const summaryCache = (gs.__faSummary ??= new Map());

export async function getSummary(tzOffsetMin = 0): Promise<Summary> {
  const cached = summaryCache.get(tzOffsetMin);
  if (cached && Date.now() - cached.at < SUMMARY_TTL_MS) return cached.value;

  await ready();
  const startOfDay = (() => {
    const d = new Date(Date.now() + tzOffsetMin * 60_000);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime() - tzOffsetMin * 60_000;
  })();
  const offsetMs = tzOffsetMin * 60_000;

  const [totals, types, operators, hours, recent] = await db().batch(
    [
      {
        sql: `SELECT count(*) AS total,
                     count(DISTINCT coalesce(registration, hex)) AS aircraft,
                     count(DISTINCT type_code) AS types,
                     min(first_seen) AS first_at,
                     sum(CASE WHEN last_seen >= :startOfDay THEN 1 ELSE 0 END) AS today
                FROM sightings`,
        args: { startOfDay },
      },
      {
        sql: `SELECT type_code AS code, max(type_name) AS name, count(*) AS n
                FROM sightings WHERE type_code IS NOT NULL
               GROUP BY type_code ORDER BY n DESC LIMIT 6`,
        args: [],
      },
      {
        sql: `SELECT operator AS name, count(*) AS n
                FROM sightings WHERE operator IS NOT NULL
               GROUP BY operator ORDER BY n DESC LIMIT 6`,
        args: [],
      },
      {
        sql: `SELECT cast(strftime('%H', (first_seen + :offsetMs) / 1000, 'unixepoch') AS INTEGER) AS h,
                     count(*) AS n
                FROM sightings GROUP BY h`,
        args: { offsetMs },
      },
      {
        sql: `${SELECT_SIGHTING} ORDER BY s.last_seen DESC LIMIT 80`,
        args: [],
      },
    ],
    "read",
  );

  const t = totals.rows[0] as unknown as {
    total: number;
    aircraft: number;
    types: number;
    first_at: number | null;
    today: number | null;
  };
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const row of hours.rows as unknown as { h: number; n: number }[]) {
    if (row.h >= 0 && row.h < 24) byHour[row.h] = Number(row.n);
  }

  const stats: Stats = {
    totalSightings: Number(t.total),
    uniqueAircraft: Number(t.aircraft),
    uniqueTypes: Number(t.types),
    today: Number(t.today ?? 0),
    firstAt: t.first_at === null ? null : Number(t.first_at),
    topTypes: (types.rows as unknown as { code: string; name: string | null; n: number }[]).map(
      (r) => ({ code: r.code, name: r.name, count: Number(r.n) }),
    ),
    topOperators: (operators.rows as unknown as { name: string; n: number }[]).map((r) => ({
      name: r.name,
      count: Number(r.n),
    })),
    byHour,
  };
  const summary = { stats, recent: (recent.rows as unknown as Row[]).map(toRecord) };
  summaryCache.set(tzOffsetMin, { at: Date.now(), value: summary });
  return summary;
}
