export interface Aircraft {
  hex: string;
  callsign: string | null;
  registration: string | null;
  typeCode: string | null;
  typeDesc: string | null;
  altFt: number | null;
  gsKt: number | null;
  track: number | null;
  vertRateFpm: number | null;
  distanceKm: number;
  bearingDeg: number;
  seenSec: number;
}

export interface AirfieldMarker {
  code: string;
  distanceKm: number;
  bearingDeg: number;
}

export interface RadarPayload {
  at: number;
  home: string;
  homeCoords: string;
  radiusKm: number;
  airfields: AirfieldMarker[];
  aircraft: Aircraft[];
  error?: string;
}

export interface RouteInfo {
  originIata: string | null;
  originCity: string | null;
  destIata: string | null;
  destCity: string | null;
  airline: string | null;
}

export interface PhotoInfo {
  url: string;
  pageLink: string;
  photographer: string;
}

export interface Enrichment {
  hex: string;
  registration: string | null;
  typeName: string | null;
  operator: string | null;
  route: RouteInfo | null;
  photo: PhotoInfo | null;
  // the primary photo first, then any further gallery photos for the stack
  photos: PhotoInfo[];
  cutoutUrl: string | null;
  // the flown route, as far as it reaches across the radar
  routeTrack: AirfieldMarker[];
}

export interface SightingRecord {
  id: string;
  hex: string;
  registration: string | null;
  callsign: string | null;
  typeCode: string | null;
  typeName: string | null;
  operator: string | null;
  originIata: string | null;
  originCity: string | null;
  destIata: string | null;
  destCity: string | null;
  photoUrl: string | null;
  firstSeen: number;
  lastSeen: number;
  minDistanceKm: number;
  maxAltFt: number | null;
  spotlighted: boolean;
  source: string;
}

export interface Stats {
  totalSightings: number;
  uniqueAircraft: number;
  uniqueTypes: number;
  today: number;
  firstAt: number | null;
  topTypes: { code: string; name: string | null; count: number }[];
  topOperators: { name: string; count: number }[];
  byHour: number[];
}

export interface Summary {
  stats: Stats;
  recent: SightingRecord[];
}

export interface LogQuery {
  q?: string;
  date?: string; // YYYY-MM-DD in the viewer's local day
  tzOffsetMin?: number; // minutes to add to UTC to get the viewer's local time
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  per?: number;
}

export interface LogPage {
  rows: SightingRecord[];
  total: number;
  page: number;
  per: number;
}
