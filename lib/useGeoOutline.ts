"use client";

import { useEffect, useState } from "react";

// Coastline / border polylines for the radar backdrop, already projected to
// radar units by the server. Refetched whenever the home point or range moves.
export function useGeoOutline(
  enabled: boolean,
  lat: number,
  lon: number,
  nm: number,
): number[][][] | null {
  const [paths, setPaths] = useState<number[][][] | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPaths(null);
      return;
    }
    let live = true;
    fetch(`/api/geo?lat=${lat}&lon=${lon}&nm=${nm}`)
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
