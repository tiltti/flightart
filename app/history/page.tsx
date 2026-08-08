"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";
import type { LogPage, SightingRecord, Summary } from "@/lib/types";

const INPUT =
  "border border-line bg-transparent px-3 py-2 font-mono text-xs uppercase tracking-[0.15em] text-ink placeholder:text-faint focus:border-accent/40 focus:outline-none";

// text columns default ascending, time/distance descending
const DEFAULT_DIR: Record<string, "asc" | "desc"> = {
  time: "desc",
  dist: "desc",
  alt: "desc",
  reg: "asc",
  type: "asc",
  operator: "asc",
  route: "asc",
};

function Th({
  id,
  label,
  right,
  sort,
  dir,
  onSort,
}: {
  id: string;
  label: string;
  right?: boolean;
  sort: string;
  dir: "asc" | "desc";
  onSort: (id: string) => void;
}) {
  const active = sort === id;
  return (
    <th
      className={`border-b border-line pb-2 ${right ? "" : "pr-4"} font-normal`}
    >
      <button
        onClick={() => onSort(id)}
        className={`uppercase tracking-[0.2em] transition-colors ${
          right ? "w-full text-right" : ""
        } ${active ? "text-accent" : "text-faint hover:text-dim"}`}
      >
        {label}
        {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-display text-4xl font-light tracking-wide text-ink md:text-6xl">
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
  const [log, setLog] = useState<LogPage | null>(null);
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState("time");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(async () => {
      const p = new URLSearchParams({
        sort,
        dir,
        page: String(page),
        per: "25",
        tz: String(-new Date().getTimezoneOffset()),
      });
      if (q.trim()) p.set("q", q.trim());
      if (date) p.set("date", date);
      try {
        setLog(await fetch(`/api/sightings/log?${p}`).then((r) => r.json()));
      } catch {
        // keep previous rows on transient failures
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, date, sort, dir, page]);

  const onSort = (id: string) => {
    if (id === sort) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSort(id);
      setDir(DEFAULT_DIR[id] ?? "asc");
    }
    setPage(1);
  };

  useEffect(() => {
    // the server buckets "by hour" and "today" in the viewer's timezone
    fetch(`/api/sightings?tz=${-new Date().getTimezoneOffset()}`)
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
    <main className="min-h-dvh bg-bg px-5 py-6 text-ink md:px-10 md:py-8 lg:px-16">
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
              Sightings
            </h2>

            <div className="mb-5 flex flex-wrap items-center gap-4">
              <input
                value={q}
                placeholder="SEARCH — REG, TYPE, OPERATOR, ROUTE…"
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                className={`${INPUT} w-full sm:w-80`}
              />
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(1);
                }}
                className={INPUT}
              />
              {(q || date) && (
                <button
                  onClick={() => {
                    setQ("");
                    setDate("");
                    setPage(1);
                  }}
                  className="font-mono text-[11px] uppercase tracking-[0.25em] text-faint transition-colors hover:text-accent"
                >
                  clear
                </button>
              )}
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
                {log ? `${log.total} sightings` : "…"}
              </span>
            </div>

            <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[640px] border-collapse font-mono text-xs">
              <thead>
                <tr className="text-left">
                  <Th id="time" label="Time" sort={sort} dir={dir} onSort={onSort} />
                  <Th id="reg" label="Reg" sort={sort} dir={dir} onSort={onSort} />
                  <Th id="type" label="Type" sort={sort} dir={dir} onSort={onSort} />
                  <Th
                    id="operator"
                    label="Operator"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                  />
                  <Th id="route" label="Route" sort={sort} dir={dir} onSort={onSort} />
                  <Th
                    id="dist"
                    label="Min dist"
                    right
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                  />
                </tr>
              </thead>
              <tbody className="text-dim">
                {(log?.rows ?? []).map((s) => (
                  <tr key={s.id}>
                    <td className="border-b border-line py-2 pr-4 whitespace-nowrap">
                      {new Date(s.lastSeen).toLocaleString("fi-FI", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="border-b border-line py-2 pr-4 uppercase">
                      <Link
                        href={`/aircraft/${s.hex}`}
                        className="text-ink transition-colors hover:text-accent"
                      >
                        {s.registration ?? s.hex}
                      </Link>
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
                {log && log.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center uppercase tracking-[0.25em] text-faint"
                    >
                      no matches
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>

            {log && log.total > log.per && (
              <div className="mt-5 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.25em] text-faint">
                <button
                  disabled={log.page <= 1}
                  onClick={() => setPage(log.page - 1)}
                  className="transition-colors hover:text-accent disabled:opacity-30 disabled:hover:text-faint"
                >
                  ← prev
                </button>
                <span>
                  page {log.page} / {Math.ceil(log.total / log.per)}
                </span>
                <button
                  disabled={log.page >= Math.ceil(log.total / log.per)}
                  onClick={() => setPage(log.page + 1)}
                  className="transition-colors hover:text-accent disabled:opacity-30 disabled:hover:text-faint"
                >
                  next →
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
