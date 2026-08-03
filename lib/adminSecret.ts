"use client";

// The curation secret, kept in the browser so the panel only asks once.
const KEY = "flightart-admin-secret";

export function getAdminSecret(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) ?? "";
}

export function setAdminSecret(value: string): void {
  if (value) localStorage.setItem(KEY, value);
  else localStorage.removeItem(KEY);
}

export function adminHeaders(extra?: HeadersInit): HeadersInit {
  const secret = getAdminSecret();
  return { ...(extra ?? {}), ...(secret ? { "x-admin-secret": secret } : {}) };
}
