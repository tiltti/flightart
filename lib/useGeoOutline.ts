"use client";

import { useEffect, useState } from "react";

// Coastline / border polylines for the radar backdrop, already projected to
// radar units by the server. When no home point is configured in the browser
// the coordinates are left out of the request and the server uses its own, so
// no location is ever baked into the client.
export function useGeoOutline(
  enabled: boolean,
  lat: number | null,
  lon: number | null,
  nm: number,
): number[][][] | null {
  const [paths, setPaths] = useState<number[][][] | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPaths(null);
      return;
    }
    let live = true;
    const q = new URLSearchParams({ nm: String(nm) });
    if (lat != null && lon != null) {
      q.set("lat", String(lat));
      q.set("lon", String(lon));
    }
    fetch(`/api/geo?${q}`)
      .then((r) => r.json())
      .then((d: { paths?: number[][][] }) => {
        if (live) setPaths(d.paths ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, lat, lon, nm]);

  return paths;
}
