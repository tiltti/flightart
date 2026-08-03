// A small fixed-window limiter, mainly to keep a single misbehaving client
// from burning database quota or hammering the upstream ADS-B feed through
// this server's User-Agent.
//
// It counts per process, so on a serverless platform each instance keeps its
// own tally and the effective limit is higher than the number configured. That
// is fine for its purpose — stopping casual abuse and runaway scripts. Anything
// adversarial belongs at the edge (a platform firewall or WAF), not here.

interface Window {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __faRate?: Map<string, Window> };
const buckets = (g.__faRate ??= new Map());

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export function rateLimited(
  req: Request,
  name: string,
  limit: number,
  windowMs: number,
): boolean {
  const key = `${name}:${clientKey(req)}`;
  const now = Date.now();
  const w = buckets.get(key);

  if (!w || now >= w.resetAt) {
    if (buckets.size > 5000) buckets.clear(); // crude ceiling on memory
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  w.count += 1;
  return w.count > limit;
}

export function tooMany(retryAfterSec: number): Response {
  return Response.json(
    { error: "too many requests" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
