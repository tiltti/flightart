"use client";

import { useEffect, useState } from "react";

// Wall display = one browser, so settings live in localStorage.
export interface Settings {
  displayMode: "auto" | "poster" | "photo"; // auto = poster when a cutout exists
  charMs: number; // typewriter speed, ms per character
  spotlightSec: number; // how long one aircraft stays featured
  cooldownMin: number; // same airframe not re-featured within
  pollSec: number; // radar data poll interval
  radarNm: number; // radar range in nautical miles
  rotatePages: boolean; // rotate display <-> log
  rotateIntervalMin: number; // show the log every N minutes
  rotateLogSec: number; // how long the log stays up
  showMap: boolean; // coastline / border outline behind the radar
  showAirfields: boolean; // nearby airports as markers
  showRouteTrack: boolean; // the featured flight's route across the radar
  homeLat: number | null; // null = server default from .env
  homeLon: number | null;
  homeName: string | null; // shown in the header; null = auto
}

export const DEFAULT_SETTINGS: Settings = {
  displayMode: "photo",
  charMs: 75,
  spotlightSec: 75,
  cooldownMin: 20,
  pollSec: 6,
  radarNm: 50,
  rotatePages: false,
  rotateIntervalMin: 10,
  rotateLogSec: 30,
  showMap: true,
  showAirfields: true,
  showRouteTrack: true,
  homeLat: null,
  homeLon: null,
  homeName: null,
};

const KEY = "flightart-settings";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    // the photo mode used to be stored as "dark"
    if (stored.displayMode === "dark") stored.displayMode = "photo";
    return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setSettings(loadSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };
  return [settings, update];
}
