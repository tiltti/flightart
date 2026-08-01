"use client";

import Link from "next/link";
import { useState } from "react";
import MapPicker from "@/components/MapPicker";
import Radar from "@/components/Radar";
import { DEFAULT_SETTINGS, useSettings, type Settings } from "@/lib/settings";
import { useGeoOutline } from "@/lib/useGeoOutline";

const BTN =
  "border border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-faint transition-colors hover:border-accent/40 hover:text-accent";
const INPUT =
  "border border-line bg-transparent px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-ink focus:border-accent/40 focus:outline-none";

const TABS = ["location", "display", "radar", "rotation"] as const;
type Tab = (typeof TABS)[number];

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-6 border-b border-line py-5">
      <div>
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-dim">
          {label}
        </div>
        {hint && (
          <div className="mt-1 font-mono text-[10px] tracking-[0.15em] text-faint">
            {hint}
          </div>
        )}
      </div>
      <div className="flex items-center gap-5">{children}</div>
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-accent lg:w-56"
      />
      <span className="w-20 text-right font-mono text-xs text-ink">
        {value} {unit}
      </span>
    </>
  );
}

function Segmented<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex border border-line">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] transition-colors ${
            o === value ? "bg-accent/15 text-accent" : "text-faint hover:text-dim"
          }`}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, update] = useSettings();
  const [tab, setTab] = useState<Tab>("location");
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  const lat = settings.homeLat ?? 60.25;
  const lon = settings.homeLon ?? 24.065;
  const previewGeo = useGeoOutline(settings.showMap, lat, lon, settings.radarNm);

  const useBrowserLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("geolocation not available in this browser");
      return;
    }
    setGeoStatus("locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update({
          homeLat: Number(pos.coords.latitude.toFixed(4)),
          homeLon: Number(pos.coords.longitude.toFixed(4)),
        });
        setGeoStatus(
          `set to ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        );
      },
      (err) => setGeoStatus(`failed — ${err.message}`),
      { timeout: 10_000 },
    );
  };

  return (
    <main className="min-h-dvh bg-bg px-10 py-8 text-ink lg:px-16">
      <header className="mb-10 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.4em] text-dim">
        <span>flightart · settings</span>
        <Link href="/" className="text-faint transition-colors hover:text-accent">
          ← display
        </Link>
      </header>

      <div className="mx-auto max-w-4xl">
        <nav className="mb-10 flex gap-8 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b pb-3 font-mono text-[11px] uppercase tracking-[0.3em] transition-colors ${
                tab === t
                  ? "border-accent text-accent"
                  : "border-transparent text-faint hover:text-dim"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === "location" && (
          <section>
            <Row
              label="Home point"
              hint={
                settings.homeLat != null && settings.homeLon != null
                  ? `custom · ${settings.homeLat.toFixed(4)}, ${settings.homeLon.toFixed(4)}`
                  : "server default (.env)"
              }
            >
              <button onClick={useBrowserLocation} className={BTN}>
                Use browser location
              </button>
              <button
                onClick={() => {
                  update({ homeLat: null, homeLon: null, homeName: null });
                  setGeoStatus(null);
                }}
                className={BTN}
              >
                Reset
              </button>
            </Row>
            {geoStatus && (
              <div className="border-b border-line py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
                {geoStatus}
              </div>
            )}
            <Row label="Name" hint="shown in the header · optional">
              <input
                value={settings.homeName ?? ""}
                placeholder="AUTO"
                onChange={(e) =>
                  update({ homeName: e.target.value.trim() ? e.target.value : null })
                }
                className={`${INPUT} w-52`}
              />
            </Row>
            <div className="py-6">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
                Click the map to set the home point
              </div>
              <MapPicker
                lat={lat}
                lon={lon}
                onPick={(la, lo) => update({ homeLat: la, homeLon: lo })}
              />
            </div>
          </section>
        )}

        {tab === "display" && (
          <section>
            <Row
              label="Spotlight view"
              hint="photo = always the photograph · auto/poster = poster art when a clean cutout exists"
            >
              <Segmented
                value={settings.displayMode}
                options={["photo", "auto", "poster"] as const}
                onChange={(displayMode: Settings["displayMode"]) =>
                  update({ displayMode })
                }
              />
            </Row>
            <Row label="Text reveal speed" hint="ms per character — lower is faster">
              <Slider
                value={settings.charMs}
                min={40}
                max={140}
                step={5}
                unit="ms"
                onChange={(charMs) => update({ charMs })}
              />
            </Row>
            <Row label="Spotlight duration" hint="how long one aircraft is featured">
              <Slider
                value={settings.spotlightSec}
                min={30}
                max={300}
                step={15}
                unit="s"
                onChange={(spotlightSec) => update({ spotlightSec })}
              />
            </Row>
          </section>
        )}

        {tab === "rotation" && (
          <section>
            <Row label="Rotate pages" hint="flip between display and logbook">
              <Segmented
                value={settings.rotatePages ? "on" : "off"}
                options={["off", "on"] as const}
                onChange={(v) => update({ rotatePages: v === "on" })}
              />
            </Row>
            <Row label="Logbook every">
              <Slider
                value={settings.rotateIntervalMin}
                min={2}
                max={60}
                unit="min"
                onChange={(rotateIntervalMin) => update({ rotateIntervalMin })}
              />
            </Row>
            <Row label="Logbook dwell">
              <Slider
                value={settings.rotateLogSec}
                min={10}
                max={120}
                step={5}
                unit="s"
                onChange={(rotateLogSec) => update({ rotateLogSec })}
              />
            </Row>
          </section>
        )}

        {tab === "radar" && (
          <section className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">
            <div>
              <Row label="Radar range" hint="1 NM = 1.852 km">
                <Slider
                  value={settings.radarNm}
                  min={10}
                  max={100}
                  step={5}
                  unit="NM"
                  onChange={(radarNm) => update({ radarNm })}
                />
              </Row>
              <Row
                label="Map outline"
                hint="coastlines and borders behind the radar"
              >
                <Segmented
                  value={settings.showMap ? "on" : "off"}
                  options={["off", "on"] as const}
                  onChange={(v) => update({ showMap: v === "on" })}
                />
              </Row>
              <Row label="Airfields" hint="airports within range, by ICAO code">
                <Segmented
                  value={settings.showAirfields ? "on" : "off"}
                  options={["off", "on"] as const}
                  onChange={(v) => update({ showAirfields: v === "on" })}
                />
              </Row>
              <Row
                label="Route track"
                hint="the featured flight's great circle across the radar"
              >
                <Segmented
                  value={settings.showRouteTrack ? "on" : "off"}
                  options={["off", "on"] as const}
                  onChange={(v) => update({ showRouteTrack: v === "on" })}
                />
              </Row>
              <Row label="Radar poll" hint="adsb.fi asks for max ~1 req/s">
                <Slider
                  value={settings.pollSec}
                  min={4}
                  max={30}
                  unit="s"
                  onChange={(pollSec) => update({ pollSec })}
                />
              </Row>
              <Row
                label="Repeat cooldown"
                hint="same airframe not featured twice within"
              >
                <Slider
                  value={settings.cooldownMin}
                  min={5}
                  max={60}
                  step={5}
                  unit="min"
                  onChange={(cooldownMin) => update({ cooldownMin })}
                />
              </Row>
            </div>

            <div>
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
                Preview · {Math.round(settings.radarNm * 1.852)} km
              </div>
              <Radar
                aircraft={[]}
                airfields={[]}
                radiusKm={settings.radarNm * 1.852}
                selectedHex={null}
                geo={previewGeo}
              />
            </div>
          </section>
        )}

        <button
          onClick={() => update({ ...DEFAULT_SETTINGS })}
          className={`${BTN} mt-14 mb-10`}
        >
          Reset defaults
        </button>
      </div>
    </main>
  );
}
