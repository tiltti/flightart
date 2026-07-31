import { promises as fs } from "fs";
import path from "path";
import type {
  Aircraft,
  Enrichment,
  SightingRecord,
  Summary,
} from "@/lib/types";

// Append-only logbook in a plain JSON file — enough for a single local
// display; swap for a real database if this ever grows beyond one wall.
const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "sightings.json");
// a plane seen again within this window is the same sighting, not a new one
const MERGE_WINDOW_MS = 60 * 60 * 1000;

interface StoreState {
  data: { sightings: SightingRecord[] };
  lastByHex: Map<string, SightingRecord>;
  chain: Promise<void>;
}

const g = globalThis as unknown as { __faStore?: Promise<StoreState> };

async function state(): Promise<StoreState> {
  g.__faStore ??= (async () => {
    let data: StoreState["data"] = { sightings: [] };
    try {
      data = JSON.parse(await fs.readFile(FILE, "utf8"));
    } catch {
      // first run — empty logbook
    }
    const lastByHex = new Map<string, SightingRecord>();
    for (const s of data.sightings) lastByHex.set(s.hex, s);
    return { data, lastByHex, chain: Promise.resolve() };
  })();
  return g.__faStore;
}

function persist(st: StoreState) {
  st.chain = st.chain
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(st.data));
      await fs.rename(tmp, FILE);
    })
    .catch(() => {});
}

export async function recordAircraft(list: Aircraft[]): Promise<void> {
  if (list.length === 0) return;
  const st = await state();
  const now = Date.now();
  for (const a of list) {
    const prev = st.lastByHex.get(a.hex);
    if (prev && now - prev.lastSeen < MERGE_WINDOW_MS) {
      prev.lastSeen = now;
      prev.minDistanceKm = Math.min(prev.minDistanceKm, a.distanceKm);
      if (a.altFt !== null) prev.maxAltFt = Math.max(prev.maxAltFt ?? 0, a.altFt);
      prev.callsign ??= a.callsign;
      prev.registration ??= a.registration;
      prev.typeCode ??= a.typeCode;
      prev.typeName ??= a.typeDesc;
    } else {
      const rec: SightingRecord = {
        id: `${a.hex}-${now}`,
        hex: a.hex,
        registration: a.registration,
        callsign: a.callsign,
        typeCode: a.typeCode,
        typeName: a.typeDesc,
        operator: null,
        originIata: null,
        originCity: null,
        destIata: null,
        destCity: null,
        photoUrl: null,
        firstSeen: now,
        lastSeen: now,
        minDistanceKm: a.distanceKm,
        maxAltFt: a.altFt,
        spotlighted: false,
        source: "adsb.fi",
      };
      st.data.sightings.push(rec);
      st.lastByHex.set(a.hex, rec);
    }
  }
  persist(st);
}

export async function recordSpotlight(e: Enrichment): Promise<void> {
  const st = await state();
  const rec = st.lastByHex.get(e.hex);
  if (!rec) return;
  rec.spotlighted = true;
  rec.registration ??= e.registration;
  rec.typeName ??= e.typeName;
  rec.operator ??= e.operator;
  rec.originIata ??= e.route?.originIata ?? null;
  rec.originCity ??= e.route?.originCity ?? null;
  rec.destIata ??= e.route?.destIata ?? null;
  rec.destCity ??= e.route?.destCity ?? null;
  rec.photoUrl ??= e.photo?.url ?? null;
  persist(st);
}

export async function getSummary(): Promise<Summary> {
  const st = await state();
  const s = st.data.sightings;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const typeCounts = new Map<string, { name: string | null; count: number }>();
  const opCounts = new Map<string, number>();
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const x of s) {
    if (x.typeCode) {
      const t = typeCounts.get(x.typeCode) ?? { name: null, count: 0 };
      t.count++;
      t.name ??= x.typeName;
      typeCounts.set(x.typeCode, t);
    }
    if (x.operator) opCounts.set(x.operator, (opCounts.get(x.operator) ?? 0) + 1);
    byHour[new Date(x.firstSeen).getHours()]++;
  }

  return {
    stats: {
      totalSightings: s.length,
      uniqueAircraft: new Set(s.map((x) => x.registration ?? x.hex)).size,
      uniqueTypes: typeCounts.size,
      today: s.filter((x) => x.lastSeen >= startOfDay.getTime()).length,
      firstAt: s.length ? s[0].firstSeen : null,
      topTypes: [...typeCounts]
        .map(([code, v]) => ({ code, name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      topOperators: [...opCounts]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      byHour,
    },
    recent: [...s].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 80),
  };
}
