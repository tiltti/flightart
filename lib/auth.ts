// Curation — replacing photos, banning cutouts, importing — is gated behind a
// shared secret. One rule everywhere: a production build always requires it,
// local development does not, so a fresh clone is usable without setup while
// the deployed display stays read-only to the public.
export function isCurationAllowed(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (process.env.NODE_ENV !== "production") return true;
  if (!secret) return false; // fail closed: no secret configured, no writes
  return req.headers.get("x-admin-secret") === secret;
}

export function denied(): Response {
  return Response.json(
    { error: "curation requires the admin secret" },
    { status: 401 },
  );
}
