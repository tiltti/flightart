// The home point comes from the environment; the fallback is a well-known
// airport rather than anyone's home, so a fresh clone runs without publishing
// a real location and no coordinates live in the repository.
export const HOME = {
  name: process.env.HOME_NAME ?? "EFHK",
  lat: Number(process.env.HOME_LAT ?? 60.3172),
  lon: Number(process.env.HOME_LON ?? 24.9633),
};

// nautical miles; adsb.fi query radius = outer radar ring
export const RADIUS_NM = Number(process.env.RADIUS_NM ?? 40);
export const RADIUS_KM = RADIUS_NM * 1.852;

// planespotters.net requires a reachable contact in the User-Agent
export const USER_AGENT = `flightart/0.1 (+mailto:${
  process.env.CONTACT_EMAIL ?? "unset@example.invalid"
})`;

// nearby fields drawn on the radar for orientation
export const AIRFIELDS = [
  { code: "EFHK", lat: 60.3172, lon: 24.9633 },
  { code: "EFNU", lat: 60.3339, lon: 24.2964 },
];
