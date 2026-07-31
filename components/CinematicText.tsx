"use client";

import { useEffect, useState } from "react";

export interface Line {
  label: string;
  value: string;
  sub?: string;
  size?: "xl" | "lg";
}

// reveal rhythm derives from the per-character speed
export function revealTiming(charMs: number) {
  return {
    start: charMs * 12,
    stagger: charMs * 18,
    labelLead: charMs * 6,
  };
}

export default function CinematicText({
  lines,
  charMs = 75,
}: {
  lines: Line[];
  charMs?: number;
}) {
  const [t, setT] = useState(0);
  const { start, stagger, labelLead } = revealTiming(charMs);

  const totalMs =
    start +
    (lines.length - 1) * stagger +
    Math.max(0, ...lines.map((l) => l.value.length)) * charMs +
    1500;

  useEffect(() => {
    setT(0);
    const startedAt = performance.now();
    const id = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setT(elapsed);
      if (elapsed > totalMs) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [totalMs]);

  return (
    <div className="flex flex-col gap-4">
      {lines.map((line, i) => {
        const startAt = start + i * stagger;
        const shown = Math.max(0, Math.floor((t - startAt) / charMs));
        const text = line.value.slice(0, shown);
        const done = shown >= line.value.length;
        const xl = line.size === "xl";
        return (
          <div key={`${line.label}-${i}`}>
            <div
              className={`font-mono text-[11px] uppercase tracking-[0.45em] text-faint transition-opacity duration-700 ${
                t > startAt - labelLead ? "opacity-100" : "opacity-0"
              }`}
            >
              {line.label}
            </div>
            <div
              className={`font-display font-light uppercase text-ink ${
                xl
                  ? "mt-2 text-5xl tracking-[0.1em]"
                  : "mt-1 text-2xl tracking-[0.14em]"
              }`}
            >
              {text}
              {!done && shown > 0 && (
                <span className="text-accent animate-[fa-blink_0.8s_steps(1)_infinite]">
                  ▍
                </span>
              )}
              {done && line.sub && (
                <span className="ml-4 align-middle font-mono text-xs tracking-[0.3em] text-dim animate-[fa-fade_0.9s_ease_both]">
                  {line.sub}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
