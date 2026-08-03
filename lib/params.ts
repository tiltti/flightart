// Number(null) is 0, not NaN, so an absent query parameter silently reads as
// a valid zero — which for a coordinate means the Gulf of Guinea. Every route
// that takes optional numbers goes through here.
export function numParam(
  p: URLSearchParams,
  key: string,
): number | undefined {
  const raw = p.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function latParam(p: URLSearchParams, key = "lat"): number | undefined {
  const n = numParam(p, key);
  return n !== undefined && Math.abs(n) <= 90 ? n : undefined;
}

export function lonParam(p: URLSearchParams, key = "lon"): number | undefined {
  const n = numParam(p, key);
  return n !== undefined && Math.abs(n) <= 180 ? n : undefined;
}
