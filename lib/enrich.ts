import { after } from "next/server";
import { airportCoords } from "@/lib/airfields";
import { HOME, RADIUS_NM, USER_AGENT } from "@/lib/config";
import {
  bearingDeg,
  destinationPoint,
  distanceKm,
  greatCirclePoints,
} from "@/lib/geo";
import type { AirfieldMarker } from "@/lib/types";
import {
  collectStackPhotos,
  ensureCutout,
  getMedia,
  getStackPhotos,
  setPhotoFromUrl,
  stackCollected,
} from "@/lib/media";
import type { Enrichment, PhotoInfo, RouteInfo } from "@/lib/types";

// adsbdb.com: aircraft metadata + callsign routes. planespotters.net: photos
// of the exact airframe, free with photographer credit + link back.
const TTL_HIT = 24 * 60 * 60 * 1000;
const TTL_MISS = 30 * 60 * 1000;
const MAX_ENTRIES = 800;

interface AircraftInfo {
  typeName: string | null;
  registration: string | null;
  operator: string | null;
}

interface CacheEntry<T> {
  at: number;
  ttl: number;
  value: T;
}
type Cache<T> = Map<string, CacheEntry<T>>;

const g = globalThis as unknown as {
  __faAircraft?: Cache<AircraftInfo>;
  __faRoute?: Cache<RouteInfo | null>;
  __faPhoto?: Cache<PhotoInfo | null>;
};
const aircraftCache: Cache<AircraftInfo> = (g.__faAircraft ??= new Map());
const routeCache: Cache<RouteInfo | null> = (g.__faRoute ??= new Map());
const photoCache: Cache<PhotoInfo | null> = (g.__faPhoto ??= new Map());

function getFresh<T>(cache: Cache<T>, key: string): T | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  return undefined;
}

function put<T>(cache: Cache<T>, key: string, value: T, ttl: number) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), ttl, value });
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

interface AdsbdbAirport {
  iata_code?: string;
  municipality?: string;
  name?: string;
}

async function aircraftInfo(hex: string): Promise<AircraftInfo> {
  const cached = getFresh(aircraftCache, hex);
  if (cached) return cached;
  const body = (await getJson(`https://api.adsbdb.com/v0/aircraft/${hex}`)) as {
    response?:
      | {
          aircraft?: {
            type?: string;
            manufacturer?: string;
            registration?: string;
            registered_owner?: string;
          };
        }
      | string;
  } | null;
  const ac =
    typeof body?.response === "object" ? body.response?.aircraft : undefined;
  const value: AircraftInfo = {
    typeName: ac ? [ac.manufacturer, ac.type].filter(Boolean).join(" ") || null : null,
    registration: ac?.registration ?? null,
    operator: ac?.registered_owner ?? null,
  };
  put(aircraftCache, hex, value, ac ? TTL_HIT : TTL_MISS);
  return value;
}

async function routeInfo(callsign: string): Promise<RouteInfo | null> {
  const cached = getFresh(routeCache, callsign);
  if (cached !== undefined) return cached;
  const body = (await getJson(
    `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,
  )) as {
    response?:
      | {
          flightroute?: {
            airline?: { name?: string };
            origin?: AdsbdbAirport;
            destination?: AdsbdbAirport;
          };
        }
      | string;
  } | null;
  const fr =
    typeof body?.response === "object" ? body.response?.flightroute : undefined;
  const value: RouteInfo | null = fr
    ? {
        originIata: fr.origin?.iata_code ?? null,
        originCity: fr.origin?.municipality ?? null,
        destIata: fr.destination?.iata_code ?? null,
        destCity: fr.destination?.municipality ?? null,
        airline: fr.airline?.name ?? null,
      }
    : null;
  put(routeCache, callsign, value, value ? TTL_HIT : TTL_MISS);
  return value;
}

interface PlanespottersPhoto {
  thumbnail_large?: { src?: string };
  link?: string;
  photographer?: string;
}

async function fetchPhoto(url: string): Promise<PhotoInfo | null> {
  const body = (await getJson(url)) as { photos?: PlanespottersPhoto[] } | null;
  const p = body?.photos?.[0];
  if (!p?.thumbnail_large?.src) return null;
  return {
    url: p.thumbnail_large.src,
    pageLink: p.link ?? "https://www.planespotters.net",
    photographer: p.photographer ?? "planespotters.net",
  };
}

async function photoInfo(
  hex: string,
  registration: string | null,
): Promise<PhotoInfo | null> {
  const cached = getFresh(photoCache, hex);
  if (cached !== undefined) return cached;
  let photo = await fetchPhoto(
    `https://api.planespotters.net/pub/photos/hex/${hex}`,
  );
  if (!photo && registration) {
    photo = await fetchPhoto(
      `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(registration)}`,
    );
  }
  put(photoCache, hex, photo, photo ? TTL_HIT : TTL_MISS);
  return photo;
}

// The flown route as far as it crosses the radar, expressed the way aircraft
// are: bearing and distance from home. Drawn as two legs through the aircraft's
// current position rather than one direct great circle, because airliners
// follow airways — a direct line would leave the aircraft sitting beside its
// own route.
function routeTrackFor(
  route: RouteInfo | null,
  home: { lat: number; lon: number },
  radiusKm: number,
  aircraft?: { lat: number; lon: number },
): AirfieldMarker[] {
  const from = airportCoords(route?.originIata);
  const to = airportCoords(route?.destIata);
  if (!from || !to) return [];

  const legs = aircraft
    ? [
        greatCirclePoints(from.lat, from.lon, aircraft.lat, aircraft.lon, 200),
        greatCirclePoints(aircraft.lat, aircraft.lon, to.lat, to.lon, 200),
      ]
    : [greatCirclePoints(from.lat, from.lon, to.lat, to.lon, 400)];

  const keep = radiusKm * 1.15;
  return legs
    .flat()
    .map((p) => ({
      code: "",
      distanceKm: distanceKm(home.lat, home.lon, p.lat, p.lon),
      bearingDeg: bearingDeg(home.lat, home.lon, p.lat, p.lon),
    }))
    .filter((p) => p.distanceKm <= keep);
}

export async function getEnrichment(params: {
  hex: string;
  callsign?: string | null;
  registration?: string | null;
  homeLat?: number;
  homeLon?: number;
  radiusKm?: number;
  // where the aircraft is right now, as reported on the radar
  bearingDeg?: number;
  distanceKm?: number;
}): Promise<Enrichment> {
  const hex = params.hex.toLowerCase();
  const [info, route] = await Promise.all([
    aircraftInfo(hex),
    params.callsign ? routeInfo(params.callsign) : Promise.resolve(null),
  ]);

  // stored media is the source of truth — the photo CDN is hit at most once
  // per airframe, and user-chosen photos override everything
  let media = await getMedia(hex);
  if (!media?.photoUrl) {
    // The radar feed does not always carry the registration on the poll that
    // features an aircraft, and without it only the hex lookup runs — which is
    // why airframes that plainly have photos ended up with none. adsbdb knows
    // the registration independently, so fall back to that.
    const remote = await photoInfo(
      hex,
      params.registration ?? info.registration ?? null,
    );
    if (remote) {
      media =
        (await setPhotoFromUrl(hex, remote.url, {
          photographer: remote.photographer,
          pageLink: remote.pageLink,
          source: "planespotters",
        })) ?? media;
    }
  }

  const servedPhoto: PhotoInfo | null = media?.photoUrl
    ? {
        url: media.photoUrl,
        pageLink: media.pageLink ?? "",
        photographer: media.photographer ?? "",
      }
    : null;

  const photos: PhotoInfo[] = servedPhoto ? [servedPhoto] : [];
  if (media?.photoUrl) {
    for (const extra of await getStackPhotos(hex)) {
      photos.push({
        url: extra.url,
        pageLink: extra.pageLink ?? "",
        photographer: extra.photographer ?? "",
      });
    }
    if (!(await stackCollected(hex))) {
      // gather the rest of the stack after the response has gone out
      after(() =>
        collectStackPhotos(
          hex,
          params.registration ?? info.registration,
          media?.pageLink ?? null,
        ),
      );
    }
  }

  let cutoutUrl: string | null = null;
  if (media?.photoUrl) {
    if (media.cutoutState === "ok") {
      cutoutUrl = media.cutoutUrl;
    } else if (media.cutoutState === "none") {
      // keep generating after the response is sent; a later poll picks it up
      after(() => ensureCutout(hex).catch(() => {}));
    }
  }
  return {
    hex,
    registration: params.registration ?? info.registration,
    typeName: info.typeName,
    operator: route?.airline ?? info.operator,
    route,
    photo: servedPhoto,
    photos,
    cutoutUrl,
    routeTrack: (() => {
      const home = {
        lat: params.homeLat ?? HOME.lat,
        lon: params.homeLon ?? HOME.lon,
      };
      const here =
        params.bearingDeg !== undefined && params.distanceKm !== undefined
          ? destinationPoint(home.lat, home.lon, params.bearingDeg, params.distanceKm)
          : undefined;
      return routeTrackFor(route, home, params.radiusKm ?? RADIUS_NM * 1.852, here);
    })(),
  };
}
