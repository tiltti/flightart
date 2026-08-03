# flightart

An ambient display for the aircraft passing over one point on the map.

A minimal radar on one side; on the other, one aircraft at a time in a
cinematic spotlight — a photograph of that exact airframe, its type, operator
and route, revealed a character at a time. Every aircraft that crosses the
radar is written to a logbook, so the wall slowly becomes a record of what
flies over your roof.

Built to hang on a wall. It runs in any browser in the meantime.

## Running it

```bash
cp .env.example .env.local     # set at least HOME_LAT, HOME_LON, CONTACT_EMAIL
npm install
npm run dev
```

| Page | What it is |
|---|---|
| `/` | the display: radar and spotlight |
| `/history` | the logbook — statistics, search, filters, per-day view |
| `/aircraft/<hex>` | one airframe: every sighting, its photos, imagery tools |
| `/admin` | curation: browse generated cutouts, ban the poor ones |
| `/settings` | home point, radar range, timing, rotation, view mode |

Out of the box nothing external is required beyond the public data sources:
the logbook is a SQLite file and images are files, both under `data/`. Point
the environment at a hosted database and blob store when you want it to
outlive your laptop.

## Configuration

Everything lives in `.env.local`; see `.env.example` for the full list.

- `HOME_LAT` / `HOME_LON` / `HOME_NAME` — where the radar is centred. **No
  coordinates are committed to this repository**; the fallback is an airport.
  The home point can also be set per browser from the settings page, either
  from the browser's own geolocation or by clicking a map.
- `CONTACT_EMAIL` — Planespotters requires a reachable contact in the
  `User-Agent` of every request it serves. Requests without one are refused.
- `ADMIN_SECRET` — required to change anything on a production build.
- `TURSO_*`, `BLOB_READ_WRITE_TOKEN` — optional hosted storage, see below.

## Data sources

All public, none needs an account.

| Source | Used for | Terms |
|---|---|---|
| [adsb.fi](https://adsb.fi) open data | aircraft in range | community ADS-B network; asks for max ~1 request/s |
| [adsbdb](https://www.adsbdb.com) | type, operator, callsign → route | |
| [Planespotters](https://www.planespotters.net/photo/api) photo API | a photograph of that specific airframe | photographer credit and a contact in the User-Agent are required |
| [Wikimedia Commons](https://commons.wikimedia.org) | further photographs of the same airframe | freely licensed; the photographer is stored and shown |
| [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth) | coastlines and borders behind the radar | public domain, bundled — no requests at runtime |
| [OpenFlights](https://openflights.org) via `airport-data` | airfield markers and route endpoints | bundled |

Photographer credits are shown on every photograph, and a photo whose
credit cannot be established is never re-hosted.

## Deploying

It is an ordinary Next.js application and will run anywhere that runs Node:
a container, a small VM, a Raspberry Pi beside the screen, or a serverless
host. Two things are worth deciding first.

**Storage.** With no configuration the logbook is `data/flightart.db` and
images are files under `data/`. That is perfect for a machine that stays on.
For a host with an ephemeral filesystem, set `TURSO_DATABASE_URL` and
`BLOB_READ_WRITE_TOKEN` and the same code writes to hosted storage instead —
[Turso](https://turso.tech) and [Vercel Blob](https://vercel.com/docs/vercel-blob)
are one combination that works, but any libSQL-compatible database will do,
and the blob layer is a single small module to swap.

**Background removal.** The poster view needs a cutout of the aircraft, which
is produced by `@imgly/background-removal-node` — roughly 290 MB of native
runtime for a few seconds of CPU. On a machine you control it just works. On a
constrained serverless host it may not fit, so it is disabled there unless you
set `ENABLE_CUTOUTS=1`. Aircraft without a cutout simply show their photograph,
and if the display and a local machine share the same database and blob store,
cutouts generated locally appear on the display immediately.

Curation — replacing photos, banning cutouts — requires `ADMIN_SECRET` on a
production build. Development builds allow it without one. The admin panel
asks for the secret once and keeps it in that browser.

## Roadmap

- A local ADS-B receiver as a second source. `readsb` and `dump1090` already
  serve the same JSON shape at `/data/aircraft.json`, so it drops into
  `lib/sources/` and nothing else changes. `sightings.seen_by_own` is in the
  schema, waiting for the badge.
- Rarity highlighting: first sightings, heavies, unusual liveries.
- Night dimming and a kiosk mode for the framed screen.

## Licence

AGPL-3.0-or-later. See [LICENSE](LICENSE).

This is a consequence of `@imgly/background-removal-node`, which is itself
AGPL-3.0: because that code is served over a network here, the corresponding
source has to be available under the same terms. Removing that dependency
would free the rest of the project to be licensed differently.

Photographs are not covered by this licence. They belong to the photographers
who took them and are shown with attribution under the terms of the galleries
they come from.
