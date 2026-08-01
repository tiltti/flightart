import path from "path";
import { createClient, type Client } from "@libsql/client";

// One libSQL client for both worlds: a local file database in dev, the Turso
// replica in production. Same SQL either way — no second code path.
const g = globalThis as unknown as {
  __faDb?: Client;
  __faDbReady?: Promise<void>;
};

export const isRemoteDb = Boolean(process.env.TURSO_DATABASE_URL);

export function db(): Client {
  if (g.__faDb) return g.__faDb;
  const url =
    process.env.TURSO_DATABASE_URL ??
    `file:${path.join(process.cwd(), "data", "flightart.db")}`;
  g.__faDb = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return g.__faDb;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sightings (
     id TEXT PRIMARY KEY,
     hex TEXT NOT NULL,
     registration TEXT,
     callsign TEXT,
     type_code TEXT,
     type_name TEXT,
     operator TEXT,
     origin_iata TEXT,
     origin_city TEXT,
     dest_iata TEXT,
     dest_city TEXT,
     first_seen INTEGER NOT NULL,
     last_seen INTEGER NOT NULL,
     min_distance_km REAL NOT NULL,
     max_alt_ft INTEGER,
     spotlighted INTEGER NOT NULL DEFAULT 0,
     source TEXT NOT NULL,
     seen_by_own INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS sightings_last_seen ON sightings(last_seen DESC)`,
  `CREATE INDEX IF NOT EXISTS sightings_hex_last_seen ON sightings(hex, last_seen DESC)`,
  // one sighting per airframe per pass — makes re-running the import safe
  `CREATE UNIQUE INDEX IF NOT EXISTS sightings_hex_first_seen ON sightings(hex, first_seen)`,
  `CREATE TABLE IF NOT EXISTS airframe_media (
     hex TEXT PRIMARY KEY,
     photo_url TEXT,
     photo_key TEXT,
     photographer TEXT,
     page_link TEXT,
     photo_source TEXT,
     cutout_url TEXT,
     cutout_key TEXT,
     cutout_state TEXT NOT NULL DEFAULT 'none',
     rejected_reason TEXT,
     cutout_attempts INTEGER NOT NULL DEFAULT 0,
     stack_collected_at INTEGER,
     updated_at INTEGER NOT NULL
   )`,
  // Extra gallery photos shown behind the primary one in the spotlight stack.
  // The primary photo lives in airframe_media because it is the curated one:
  // it is what the user replaces and what the cutout is derived from.
  `CREATE TABLE IF NOT EXISTS airframe_photos (
     hex TEXT NOT NULL,
     slot INTEGER NOT NULL,
     url TEXT NOT NULL,
     key TEXT NOT NULL,
     photographer TEXT,
     page_link TEXT,
     source TEXT,
     collected_at INTEGER NOT NULL,
     PRIMARY KEY (hex, slot)
   )`,
];

// Schema creation runs once per process and every caller awaits the same promise.
export function ready(): Promise<void> {
  g.__faDbReady ??= (async () => {
    const client = db();
    for (const stmt of SCHEMA) await client.execute(stmt);
  })().catch((err) => {
    g.__faDbReady = undefined; // let the next request retry
    throw err;
  });
  return g.__faDbReady;
}
