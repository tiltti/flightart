"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CutoutEntry, CutoutPage } from "@/lib/media";

const TABS = ["cutouts"] as const;
type Tab = (typeof TABS)[number];

const FILTERS = ["kept", "banned", "all"] as const;
type Filter = (typeof FILTERS)[number];

const BTN =
  "border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-faint transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-40";

// muted print fields, matching the poster spotlight
const FIELDS = ["#31584a", "#22405c", "#5c4a35", "#3f3a5c"];

function Tile({
  entry,
  busy,
  onBan,
  onRestore,
}: {
  entry: CutoutEntry;
  busy: boolean;
  onBan: (hex: string) => void;
  onRestore: (hex: string) => void;
}) {
  const banned = entry.state === "rejected";
  const field = FIELDS[parseInt(entry.hex, 16) % FIELDS.length];
  return (
    <figure className="border border-line bg-panel p-3">
      <div
        className="relative flex aspect-[16/10] items-center justify-center overflow-hidden"
        style={{ background: banned ? "#0a0f14" : field }}
      >
        {entry.cutoutUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated cutout
          <img
            src={entry.cutoutUrl}
            alt=""
            className="max-h-full max-w-[92%] object-contain"
          />
        ) : entry.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- gallery photo
          <img
            src={entry.photoUrl}
            alt=""
            className="h-full w-full object-cover opacity-45"
          />
        ) : null}
        {banned && (
          <span className="absolute bottom-2 left-2 border border-line bg-bg/80 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.25em] text-faint">
            gallery only
          </span>
        )}
      </div>

      <figcaption className="mt-3 px-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink">
            {entry.registration ?? entry.hex.toUpperCase()}
          </span>
          <span className="font-mono text-[10px] tracking-[0.15em] text-accent">
            {entry.timesSeen}×
          </span>
        </div>
        <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
          {[entry.typeCode, entry.operator].filter(Boolean).join(" · ") || "—"}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Link
            href={`/aircraft/${entry.hex}`}
            className="font-mono text-[10px] uppercase tracking-[0.25em] text-faint transition-colors hover:text-accent"
          >
            open
          </Link>
          {banned ? (
            <button
              disabled={busy}
              onClick={() => onRestore(entry.hex)}
              className={BTN}
            >
              Restore
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => onBan(entry.hex)}
              className={BTN}
            >
              Ban
            </button>
          )}
        </div>
      </figcaption>
    </figure>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("cutouts");
  const [filter, setFilter] = useState<Filter>("kept");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CutoutPage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/sightings?cutouts=1&filter=${filter}&page=${page}&per=24`,
      );
      setData(await res.json());
    } catch {
      // keep the previous page on a transient failure
    }
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (hex: string, mode: "photo-only" | "auto") => {
    setBusy(hex);
    try {
      await fetch(`/api/plane/${hex}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;

  return (
    <main className="min-h-dvh bg-bg px-10 py-8 text-ink lg:px-16">
      <header className="mb-10 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.4em] text-dim">
        <span>flightart · admin</span>
        <Link href="/" className="text-faint transition-colors hover:text-accent">
          ← display
        </Link>
      </header>

      <div className="mx-auto max-w-6xl">
        <nav className="mb-8 flex gap-8 border-b border-line">
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

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex border border-line">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className={`px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] transition-colors ${
                  f === filter
                    ? "bg-accent/15 text-accent"
                    : "text-faint hover:text-dim"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-faint">
            {data ? `${data.total} airframes · most seen first` : "…"}
          </span>
        </div>

        {!data ? (
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
            loading…
          </div>
        ) : data.rows.length === 0 ? (
          <div className="py-16 text-center font-mono text-xs uppercase tracking-[0.3em] text-faint">
            nothing here
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.rows.map((e) => (
              <Tile
                key={e.hex}
                entry={e}
                busy={busy === e.hex}
                onBan={(h) => act(h, "photo-only")}
                onRestore={(h) => act(h, "auto")}
              />
            ))}
          </div>
        )}

        {data && data.total > data.per && (
          <div className="my-10 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.25em] text-faint">
            <button
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
              className="transition-colors hover:text-accent disabled:opacity-30"
            >
              ← prev
            </button>
            <span>
              page {data.page} / {pageCount}
            </span>
            <button
              disabled={data.page >= pageCount}
              onClick={() => setPage(data.page + 1)}
              className="transition-colors hover:text-accent disabled:opacity-30"
            >
              next →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
