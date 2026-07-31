"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";
import type { SightingRecord, Summary } from "@/lib/types";

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-display text-6xl font-light tracking-wide text-ink">
        {value}
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
        {label}
      </div>
    </div>
  );
}

function BarList({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <h2 className="mb-5 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
        {title}
      </h2>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-4">
            <span className="w-40 truncate font-mono text-xs uppercase tracking-[0.15em] text-dim">
              {r.label}
            </span>
            <span className="relative h-[3px] flex-1 rounded-full bg-line">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </span>
            <span className="w-10 text-right font-mono text-xs text-dim">
              {r.count}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <span className="font-mono text-xs text-faint">—</span>
        )}
      </div>
    </div>
  );
}

function HourStrip({ byHour }: { byHour: number[] }) {
  const max = Math.max(1, ...byHour);
  return (
    <div>
      <h2 className="mb-5 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
        Activity by hour
      </h2>
      <div className="flex h-24 items-end gap-[3px]">
        {byHour.map((count, h) => (
          <div
            key={h}
            className="flex-1"
            title={`${String(h).padStart(2, "0")}:00 — ${count}`}
          >
            <div
              className="w-full rounded-t-[2px] bg-accent"
              style={{
                height: `${(count / max) * 96}px`,
                opacity: count === 0 ? 0.12 : 0.85,
                minHeight: "2px",
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-faint">
        {["00", "06", "12", "18", "23"].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function Portrait({ s }: { s: SightingRecord }) {
  return (
    <figure className="border border-line bg-panel p-3">
      <div className="relative aspect-[16/9] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- external photo */}
        <img
          src={s.photoUrl ?? ""}
          alt={s.registration ?? s.hex}
          className="h-full w-full object-cover"
          style={{ filter: "saturate(0.8) contrast(1.05) brightness(0.95)" }}
        />
      </div>
      <figcaption className="mt-3 flex items-baseline justify-between px-1 pb-1">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink">
          {s.registration ?? s.hex.toUpperCase()}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
          {[s.typeName ?? s.typeCode, s.originIata && s.destIata ? `${s.originIata}–${s.destIata}` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </figcaption>
    </figure>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [settings] = useSettings();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/sightings")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
  }, []);

  // kiosk rotation: return to the display after the configured dwell
  useEffect(() => {
    if (!settings.rotatePages) return;
    const id = setTimeout(
      () => router.push("/"),
      settings.rotateLogSec * 1000,
    );
    return () => clearTimeout(id);
  }, [settings.rotatePages, settings.rotateLogSec, router]);

  const stats = summary?.stats;
  const recent = summary?.recent ?? [];
  const portraits = recent.filter((s) => s.photoUrl).slice(0, 3);

  return (
    <main className="min-h-dvh bg-bg px-10 py-8 text-ink lg:px-16">
      <header className="mb-14 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.4em] text-dim">
        <span>flightart · log</span>
        <Link href="/" className="text-faint transition-colors hover:text-accent">
          ← display
        </Link>
      </header>

      {!stats ? (
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          loading…
        </div>
      ) : (
        <div className="mx-auto flex max-w-5xl flex-col gap-16">
          <section className="grid grid-cols-2 gap-10 md:grid-cols-4">
            <Tile label="Flights logged" value={stats.totalSightings} />
            <Tile label="Unique aircraft" value={stats.uniqueAircraft} />
            <Tile label="Types seen" value={stats.uniqueTypes} />
            <Tile label="Today" value={stats.today} />
          </section>

          {portraits.length > 0 && (
            <section>
              <h2 className="mb-5 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
                Latest portraits
              </h2>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {portraits.map((s) => (
                  <Portrait key={s.id} s={s} />
                ))}
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 gap-12 md:grid-cols-2">
            <BarList
              title="Most seen types"
              rows={stats.topTypes.map((t) => ({
                key: t.code,
                label: t.code,
                count: t.count,
              }))}
            />
            <BarList
              title="Most seen operators"
              rows={stats.topOperators.map((o) => ({
                key: o.name,
                label: o.name,
                count: o.count,
              }))}
            />
          </section>

          <section>
            <HourStrip byHour={stats.byHour} />
          </section>

          <section className="pb-10">
            <h2 className="mb-5 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
              Recent sightings
            </h2>
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="text-left uppercase tracking-[0.2em] text-faint">
                  <th className="border-b border-line pb-2 pr-4 font-normal">Time</th>
                  <th className="border-b border-line pb-2 pr-4 font-normal">Reg</th>
                  <th className="border-b border-line pb-2 pr-4 font-normal">Type</th>
                  <th className="border-b border-line pb-2 pr-4 font-normal">Operator</th>
                  <th className="border-b border-line pb-2 pr-4 font-normal">Route</th>
                  <th className="border-b border-line pb-2 text-right font-normal">
                    Min dist
                  </th>
                </tr>
              </thead>
              <tbody className="text-dim">
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td className="border-b border-line py-2 pr-4 whitespace-nowrap">
                      {new Date(s.lastSeen).toLocaleString("fi-FI", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="border-b border-line py-2 pr-4 uppercase text-ink">
                      {s.registration ?? s.hex}
                    </td>
                    <td className="border-b border-line py-2 pr-4 uppercase">
                      {s.typeCode ?? "—"}
                    </td>
                    <td className="max-w-56 truncate border-b border-line py-2 pr-4">
                      {s.operator ?? "—"}
                    </td>
                    <td className="border-b border-line py-2 pr-4 uppercase">
                      {s.originIata && s.destIata
                        ? `${s.originIata} → ${s.destIata}`
                        : "—"}
                    </td>
                    <td className="border-b border-line py-2 text-right">
                      {s.minDistanceKm.toFixed(1)} km
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </main>
  );
}
