"use client";

import { useEffect, useRef, useState } from "react";
import CinematicText, {
  revealTiming,
  type Line,
} from "@/components/CinematicText";
import type { Settings } from "@/lib/settings";
import type { Aircraft, Enrichment } from "@/lib/types";

interface Props {
  aircraft: Aircraft;
  enrichment: Enrichment | null;
  settings: Settings;
  footer?: string;
}

// muted print-field colors for poster mode, picked per airframe
const POSTER_FIELDS = ["#31584a", "#22405c", "#5c4a35", "#3f3a5c"];

const POSTER_INK = {
  "--color-ink": "#efe8d8",
  "--color-dim": "rgba(239,232,216,0.75)",
  "--color-faint": "rgba(239,232,216,0.5)",
  "--color-line": "rgba(239,232,216,0.25)",
} as React.CSSProperties;

function LiveField({
  label,
  value,
  startMs,
  charMs,
}: {
  label: string;
  value: string;
  startMs: number;
  charMs: number;
}) {
  const [t, setT] = useState(0);
  // The clock origin is fixed at mount, but the finish line is not: enrichment
  // arriving adds text lines, which pushes startMs later. Freezing the finish
  // line at mount stopped the timer before the animation had even begun.
  const originRef = useRef<number | null>(null);
  originRef.current ??= performance.now();
  const endAt = startMs + value.length * charMs + 800;

  useEffect(() => {
    const origin = originRef.current!;
    const id = setInterval(() => {
      const elapsed = performance.now() - origin;
      setT(elapsed);
      if (elapsed > endAt) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [endAt]);

  const shown = Math.max(0, Math.floor((t - startMs) / charMs));
  const typing = shown > 0 && shown < value.length;
  return (
    <div>
      <div
        className={`font-mono text-[11px] uppercase tracking-[0.45em] text-faint transition-opacity duration-700 ${
          t > startMs - 500 ? "opacity-100" : "opacity-0"
        }`}
      >
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-light uppercase tracking-[0.15em] text-dim">
        {value.slice(0, shown)}
        {typing && (
          <span className="text-accent animate-[fa-blink_0.8s_steps(1)_infinite]">
            ▍
          </span>
        )}
      </div>
    </div>
  );
}

function LiveRow({
  a,
  startMs,
  charMs,
}: {
  a: Aircraft;
  startMs: number;
  charMs: number;
}) {
  const climb =
    a.vertRateFpm && Math.abs(a.vertRateFpm) > 300
      ? a.vertRateFpm > 0
        ? " ↗"
        : " ↘"
      : "";
  const fields: { label: string; value: string }[] = [];
  if (a.altFt !== null) {
    fields.push({
      label: "altitude",
      value: `${a.altFt.toLocaleString("en-US").replace(/,/g, " ")} FT${climb}`,
    });
  }
  if (a.gsKt !== null) {
    fields.push({ label: "speed", value: `${Math.round(a.gsKt)} KT` });
  }
  fields.push({ label: "distance", value: `${a.distanceKm.toFixed(1)} KM` });
  return (
    <div className="mt-6 flex gap-14">
      {fields.map((f, i) => (
        <LiveField
          key={f.label}
          label={f.label}
          value={f.value}
          startMs={startMs + i * charMs * 9}
          charMs={charMs}
        />
      ))}
    </div>
  );
}

export default function Spotlight({
  aircraft,
  enrichment,
  settings,
  footer,
}: Props) {
  const title = (
    aircraft.registration ??
    enrichment?.registration ??
    aircraft.callsign ??
    aircraft.hex
  ).toUpperCase();

  const lines: Line[] = [{ label: "aircraft", value: title, size: "xl" }];
  const typeName = enrichment?.typeName ?? aircraft.typeDesc;
  if (typeName) {
    lines.push({ label: "type", value: typeName.toUpperCase() });
  }
  if (enrichment?.operator) {
    lines.push({ label: "operator", value: enrichment.operator.toUpperCase() });
  }
  if (enrichment?.route?.originIata && enrichment.route.destIata) {
    lines.push({
      label: "route",
      value: `${enrichment.route.originIata} ⟶ ${enrichment.route.destIata}`,
      sub: [enrichment.route.originCity, enrichment.route.destCity]
        .filter(Boolean)
        .join(" — ")
        .toUpperCase(),
    });
  } else if (aircraft.callsign && aircraft.callsign.toUpperCase() !== title) {
    lines.push({ label: "flight", value: aircraft.callsign.toUpperCase() });
  }

  const charMs = settings.charMs;
  const { start, stagger } = revealTiming(charMs);
  const liveStart = start + lines.length * stagger + 400;

  const photo = enrichment?.photo ?? null;
  const cutout =
    settings.displayMode !== "photo" ? (enrichment?.cutoutUrl ?? null) : null;

  if (cutout) {
    const field =
      POSTER_FIELDS[parseInt(aircraft.hex, 16) % POSTER_FIELDS.length];
    return (
      <div
        key={`${aircraft.hex}-poster`}
        className="relative h-full w-full overflow-hidden bg-bg p-[4%] animate-[fa-fade_1.4s_ease_both]"
      >
        <div
          className="fa-grain relative h-full w-full"
          style={{ background: field, ...POSTER_INK }}
        >
          <div className="pointer-events-none absolute inset-4 border border-line" />
          <div className="absolute left-9 top-8 z-10 font-deco text-[13px] tracking-[0.55em] text-ink">
            {new Date()
              .toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
              .toUpperCase()}
          </div>
          <div className="relative z-10 flex h-full flex-col px-12 pb-14 pt-16">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated cutout */}
              <img
                src={cutout}
                alt={title}
                className="max-h-[46vh] w-auto max-w-[82%] animate-[fa-rise_1.6s_ease_both]"
                style={{
                  filter:
                    "drop-shadow(0 26px 30px rgba(0,0,0,0.35)) saturate(0.92)",
                }}
              />
            </div>
            <div className="shrink-0 pt-4">
              <CinematicText lines={lines} charMs={charMs} />
              <LiveRow a={aircraft} startMs={liveStart} charMs={charMs} />
            </div>
          </div>
          <div className="absolute inset-x-9 bottom-4 z-10 flex justify-between font-mono text-[9px] uppercase tracking-[0.3em] text-faint">
            <span>{footer}</span>
            {photo?.photographer && <span>photo — {photo.photographer}</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      key={aircraft.hex}
      className="fa-grain relative h-full w-full overflow-hidden animate-[fa-fade_1.4s_ease_both]"
    >
      {/* ambient backdrop from the same photo — blur hides the small source */}
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- external photo backdrop
        <img
          src={photo.url}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover"
          style={{
            filter: "blur(48px) saturate(0.6) brightness(0.4)",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(5,8,12,0.55) 0%, rgba(5,8,12,0.25) 35%, rgba(5,8,12,0.7) 70%, #05080c 100%)",
        }}
      />

      <div className="relative z-10 flex h-full flex-col px-10 pb-12 pt-10">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden pt-10">
          {photo ? (
            <figure
              className="border border-line bg-panel/70 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-sm animate-[fa-rise_1.6s_ease_both]"
              style={{ width: "min(46vw, 640px)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- gallery print */}
              <img
                src={photo.url}
                alt={title}
                className="block w-full"
                style={{
                  filter:
                    "grayscale(0.15) saturate(0.85) contrast(1.05) brightness(0.96)",
                }}
              />
            </figure>
          ) : (
            <span className="select-none font-display text-[13rem] font-light leading-none tracking-widest text-ink/[0.05]">
              {(aircraft.typeCode ?? "✈").toUpperCase()}
            </span>
          )}
        </div>

        <div className="shrink-0 pt-6">
          <CinematicText lines={lines} charMs={charMs} />
          <LiveRow a={aircraft} startMs={liveStart} charMs={charMs} />
        </div>
      </div>

      {photo?.photographer && (
        <div className="absolute bottom-4 right-5 z-10 font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
          photo — {photo.photographer}
        </div>
      )}
    </div>
  );
}
