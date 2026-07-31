"use client";

import Link from "next/link";
import { DEFAULT_SETTINGS, useSettings, type Settings } from "@/lib/settings";

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
    <div className="flex items-center justify-between gap-10 border-b border-line py-5">
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
        className="w-56 accent-accent"
      />
      <span className="w-24 text-right font-mono text-xs text-ink">
        {value} {unit}
      </span>
    </>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex border border-line">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] transition-colors ${
            o === value
              ? "bg-accent/15 text-accent"
              : "text-faint hover:text-dim"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, update] = useSettings();

  return (
    <main className="min-h-dvh bg-bg px-10 py-8 text-ink lg:px-16">
      <header className="mb-14 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.4em] text-dim">
        <span>flightart · settings</span>
        <Link href="/" className="text-faint transition-colors hover:text-accent">
          ← display
        </Link>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-14">
        <section>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
            Display
          </h2>
          <Row
            label="Spotlight view"
            hint="auto = poster when a cutout image is ready, otherwise photo"
          >
            <Segmented
              value={settings.displayMode}
              options={["auto", "poster", "dark"] as const}
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

        <section>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
            Rotation
          </h2>
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

        <section>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
            Data
          </h2>
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
        </section>

        <button
          onClick={() => update({ ...DEFAULT_SETTINGS })}
          className="self-start border border-line px-5 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-faint transition-colors hover:border-accent/40 hover:text-accent"
        >
          Reset defaults
        </button>
      </div>
    </main>
  );
}
