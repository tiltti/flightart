"use client";

import { useEffect, useRef } from "react";
import { airlineFromCallsign } from "@/lib/airlines";
import type { Aircraft, AirfieldMarker } from "@/lib/types";

const VIEW = 115; // svg half-extent; the outer ring sits at 100
const OUTER = 100;

function toXY(bearing: number, distanceKm: number, radiusKm: number) {
  const r = (distanceKm / radiusKm) * OUTER;
  const a = (bearing * Math.PI) / 180;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

interface Props {
  aircraft: Aircraft[];
  airfields: AirfieldMarker[];
  radiusKm: number;
  selectedHex: string | null;
}

export default function Radar({
  aircraft,
  airfields,
  radiusKm,
  selectedHex,
}: Props) {
  const trails = useRef(new Map<string, { x: number; y: number }[]>());

  useEffect(() => {
    const present = new Set(aircraft.map((a) => a.hex));
    for (const a of aircraft) {
      const trail = trails.current.get(a.hex) ?? [];
      const p = toXY(a.bearingDeg, a.distanceKm, radiusKm);
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.3) trail.push(p);
      trails.current.set(a.hex, trail.slice(-32));
    }
    for (const hex of trails.current.keys()) {
      if (!present.has(hex)) trails.current.delete(hex);
    }
  }, [aircraft, radiusKm]);

  const ringStep = radiusKm > 60 ? 25 : radiusKm > 30 ? 10 : 5;
  const rings: number[] = [];
  for (let km = ringStep; km < radiusKm - 2; km += ringStep) rings.push(km);

  return (
    <div className="relative aspect-square w-full max-w-[88vh]">
      <div
        className="absolute rounded-full animate-[fa-rotate_16s_linear_infinite]"
        style={{
          inset: `${((VIEW - OUTER) / (2 * VIEW)) * 100}%`,
          background:
            "conic-gradient(from 0deg, rgba(217,160,91,0.10) 0deg, rgba(217,160,91,0.02) 40deg, transparent 70deg)",
        }}
      />
      <svg
        viewBox={`-${VIEW} -${VIEW} ${VIEW * 2} ${VIEW * 2}`}
        className="relative h-full w-full"
      >
        <circle r={OUTER} className="fill-none stroke-line" strokeWidth="0.5" />
        {rings.map((km) => (
          <g key={km}>
            <circle
              r={(km / radiusKm) * OUTER}
              className="fill-none stroke-line"
              strokeWidth="0.4"
            />
            <text
              x="1.5"
              y={-(km / radiusKm) * OUTER - 1.5}
              fontSize="3.4"
              className="fill-faint font-mono"
            >
              {km}
            </text>
          </g>
        ))}
        <text
          x="1.5"
          y={-OUTER - 2}
          fontSize="3.4"
          className="fill-faint font-mono"
        >
          {Math.round(radiusKm)} KM
        </text>
        <line
          x1={-OUTER}
          x2={OUTER}
          y1="0"
          y2="0"
          className="stroke-line"
          strokeWidth="0.3"
        />
        <line
          y1={-OUTER}
          y2={OUTER}
          x1="0"
          x2="0"
          className="stroke-line"
          strokeWidth="0.3"
        />
        {/* sunburst rays */}
        {Array.from({ length: 12 }, (_, i) => i * 30)
          .filter((deg) => deg % 90 !== 0)
          .map((deg) => (
            <line
              key={`ray-${deg}`}
              x1="0"
              y1="0"
              x2="0"
              y2={-OUTER}
              transform={`rotate(${deg})`}
              className="stroke-ink"
              strokeWidth="0.3"
              opacity="0.04"
            />
          ))}
        {/* compass ticks every 10°, longer every 30° */}
        {Array.from({ length: 36 }, (_, i) => i * 10).map((deg) => {
          const major = deg % 30 === 0;
          return (
            <line
              key={`tick-${deg}`}
              x1="0"
              y1={-OUTER}
              x2="0"
              y2={-(OUTER + (major ? 4 : 2))}
              transform={`rotate(${deg})`}
              className="stroke-faint"
              strokeWidth={major ? 0.5 : 0.3}
              opacity={major ? 0.7 : 0.4}
            />
          );
        })}
        {(
          [
            ["N", 0, -OUTER - 8.5],
            ["E", OUTER + 9, 1.8],
            ["S", 0, OUTER + 11],
            ["W", -OUTER - 9, 1.8],
          ] as const
        ).map(([c, x, y]) => (
          <text
            key={c}
            x={x}
            y={y}
            textAnchor="middle"
            fontSize="5"
            className="fill-dim font-deco"
          >
            {c}
          </text>
        ))}

        <circle r="1" className="fill-accent" />

        {airfields
          .filter((f) => f.distanceKm < radiusKm)
          .map((f) => {
            const p = toXY(f.bearingDeg, f.distanceKm, radiusKm);
            return (
              <g key={f.code} transform={`translate(${p.x} ${p.y})`}>
                <path
                  d="M-1.6,0 L0,-1.6 L1.6,0 L0,1.6 Z"
                  className="fill-none stroke-faint"
                  strokeWidth="0.4"
                />
                <text
                  x="2.6"
                  y="1"
                  fontSize="3.2"
                  className="fill-faint font-mono"
                >
                  {f.code}
                </text>
              </g>
            );
          })}

        {aircraft.map((a) =>
          (trails.current.get(a.hex) ?? []).slice(0, -1).map((p, i, arr) => (
            <circle
              key={`${a.hex}-t${i}`}
              cx={p.x}
              cy={p.y}
              r="0.45"
              className={a.hex === selectedHex ? "fill-accent" : "fill-dim"}
              opacity={((i + 1) / (arr.length + 1)) * 0.45}
            />
          )),
        )}

        {aircraft.map((a) => {
          const p = toXY(a.bearingDeg, a.distanceKm, radiusKm);
          const sel = a.hex === selectedHex;
          const ident = (a.registration ?? a.callsign ?? a.hex).toUpperCase();
          const detail = [a.typeCode, airlineFromCallsign(a.callsign)]
            .filter(Boolean)
            .join(" · ");
          return (
            <g
              key={a.hex}
              transform={`translate(${p.x} ${p.y})`}
              opacity={a.seenSec > 20 ? 0.4 : 1}
            >
              {sel && (
                <circle
                  r="4"
                  className="fill-none stroke-accent animate-[fa-pulse_2.4s_ease-out_infinite]"
                  strokeWidth="0.5"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />
              )}
              <g transform={`rotate(${a.track ?? 0})`}>
                <path
                  d="M0,-2.6 L1.8,2.2 L0,1 L-1.8,2.2 Z"
                  className={sel ? "fill-accent" : "fill-ink"}
                  fillOpacity={sel ? 1 : 0.85}
                />
              </g>
              <text
                x="4.6"
                y={detail ? "-0.4" : "1.2"}
                fontSize={sel ? 3.4 : 3}
                className={`font-mono ${sel ? "fill-accent" : "fill-dim"}`}
                style={{ letterSpacing: "0.12em" }}
              >
                {ident}
              </text>
              {detail && (
                <text
                  x="4.6"
                  y="3.2"
                  fontSize="2.4"
                  className={`font-mono ${sel ? "fill-accent" : "fill-faint"}`}
                  fillOpacity={sel ? 0.8 : 1}
                  style={{ letterSpacing: "0.1em" }}
                >
                  {detail}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
