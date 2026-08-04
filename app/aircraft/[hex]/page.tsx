"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { adminHeaders } from "@/lib/adminSecret";
import type { SightingRecord } from "@/lib/types";

interface PhotoMeta {
  photographer: string | null;
  pageLink: string | null;
  source: string | null;
}

const BTN =
  "border border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-faint transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-40";
const INPUT =
  "border border-line bg-transparent px-3 py-2 font-mono text-xs tracking-[0.15em] text-ink placeholder:text-faint focus:border-accent/40 focus:outline-none";

interface Detail {
  hex: string;
  registration: string | null;
  typeCode: string | null;
  typeName: string | null;
  operator: string | null;
  timesSeen: number;
  firstSeen: number | null;
  lastSeen: number | null;
  closestKm: number | null;
  maxAltFt: number | null;
  sightings: SightingRecord[];
  photoUrl: string | null;
  photoMeta: PhotoMeta | null;
  cutout: "ok" | "rejected" | "none";
  cutoutUrl: string | null;
}

interface Candidate {
  id: string;
  thumb: string;
  full: string;
  source: string;
  photographer: string;
  link: string;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-4xl font-light tracking-wide text-ink">
        {value}
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
        {label}
      </div>
    </div>
  );
}

const fmtDay = (t: number | null) =>
  t
    ? new Date(t).toLocaleDateString("fi-FI", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    : "—";

export default function AircraftPage() {
  const { hex } = useParams<{ hex: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [v, setV] = useState(0); // cache-buster for photo/cutout imgs
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await fetch(`/api/plane/${hex}`).then((r) => r.json()));
    } catch {
      // transient
    }
  }, [hex]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshed = async () => {
    await load();
    setV((x) => x + 1);
  };

  const findPhotos = async () => {
    setBusy("searching galleries…");
    try {
      const p = detail?.registration
        ? `&reg=${encodeURIComponent(detail.registration)}`
        : "";
      const r = await fetch(`/api/plane/${hex}?candidates=1${p}`).then((res) =>
        res.json(),
      );
      setCands(r.candidates ?? []);
    } finally {
      setBusy(null);
    }
  };

  const setFromUrl = async (
    src: string,
    meta?: { photographer?: string; pageLink?: string; source?: string },
  ) => {
    setBusy("setting photo + trying background removal…");
    try {
      await fetch(`/api/plane/${hex}`, {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ url: src, ...meta }),
      });
      await refreshed();
    } finally {
      setBusy(null);
    }
  };

  const onUpload = async (file: File) => {
    setBusy("uploading + trying background removal…");
    try {
      const fd = new FormData();
      fd.set("file", file);
      await fetch(`/api/plane/${hex}`, {
        method: "POST",
        headers: adminHeaders(),
        body: fd,
      });
      await refreshed();
    } finally {
      setBusy(null);
    }
  };

  const setMode = async (mode: "regenerate" | "photo-only") => {
    setBusy(mode === "regenerate" ? "re-attempting cutout…" : "pinning photo only…");
    try {
      const res = await fetch(`/api/plane/${hex}`, {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ mode }),
      });
      const out = (await res.json().catch(() => null)) as { note?: string } | null;
      if (out?.note) setNote(out.note);
      await refreshed();
    } finally {
      setBusy(null);
    }
  };

  const title = (detail?.registration ?? String(hex)).toUpperCase();

  return (
    <main className="min-h-dvh bg-bg px-10 py-8 text-ink lg:px-16">
      <header className="mb-12 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.4em] text-dim">
        <span>flightart · aircraft</span>
        <Link
          href="/history"
          className="text-faint transition-colors hover:text-accent"
        >
          ← log
        </Link>
      </header>

      {!detail ? (
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          loading…
        </div>
      ) : (
        <div className="mx-auto flex max-w-5xl flex-col gap-14">
          <section>
            <h1 className="font-display text-6xl font-light uppercase tracking-[0.08em]">
              {title}
            </h1>
            <div className="mt-3 font-mono text-xs uppercase tracking-[0.3em] text-dim">
              {[detail.typeName ?? detail.typeCode, detail.operator]
                .filter(Boolean)
                .join(" · ") || "no details yet"}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-10 md:grid-cols-4">
            <Tile label="Times seen" value={String(detail.timesSeen)} />
            <Tile label="First seen" value={fmtDay(detail.firstSeen)} />
            <Tile label="Last seen" value={fmtDay(detail.lastSeen)} />
            <Tile
              label="Closest"
              value={
                detail.closestKm != null
                  ? `${detail.closestKm.toFixed(1)} km`
                  : "—"
              }
            />
          </section>

          <section>
            <h2 className="mb-5 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
              Imagery
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <figure className="border border-line bg-panel p-3">
                {detail.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local cached photo
                  <img
                    src={`${detail.photoUrl}?v=${v}`}
                    alt={title}
                    className="aspect-[3/2] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/2] items-center justify-center font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
                    no photo on file
                  </div>
                )}
                <figcaption className="mt-3 flex justify-between px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                  <span>gallery photo</span>
                  <span>{detail.photoMeta?.photographer ?? ""}</span>
                </figcaption>
              </figure>

              <figure className="border border-line bg-panel p-3">
                {detail.cutoutUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated cutout
                  <img
                    src={`${detail.cutoutUrl}?v=${v}`}
                    alt=""
                    className="aspect-[3/2] w-full object-contain"
                    style={{ background: "#22405c" }}
                  />
                ) : (
                  <div className="flex aspect-[3/2] items-center justify-center text-center font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
                    {detail.cutout === "rejected"
                      ? "cutout rejected — photo only"
                      : "no cutout"}
                  </div>
                )}
                <figcaption className="mt-3 flex justify-between px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                  <span>poster cutout</span>
                  <span>{detail.cutout}</span>
                </figcaption>
              </figure>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button onClick={findPhotos} disabled={!!busy} className={BTN}>
                Find photos
              </button>
              <button
                onClick={() => setMode("regenerate")}
                disabled={!!busy || !detail.photoUrl}
                className={BTN}
              >
                Retry cutout
              </button>
              <button
                onClick={() => setMode("photo-only")}
                disabled={!!busy || !detail.photoUrl}
                className={BTN}
              >
                Photo only
              </button>
              <label className={`${BTN} cursor-pointer`}>
                Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <input
                value={url}
                placeholder="https://… paste an image address"
                onChange={(e) => setUrl(e.target.value)}
                className={`${INPUT} w-96`}
              />
              <button
                onClick={() => url.trim() && setFromUrl(url.trim())}
                disabled={!!busy || !url.trim()}
                className={BTN}
              >
                Use URL
              </button>
            </div>

            {busy && (
              <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
                {busy}
              </div>
            )}
            {note && !busy && (
              <div className="mt-4 max-w-xl font-mono text-[10px] leading-relaxed tracking-[0.15em] text-faint">
                {note}
              </div>
            )}

            {cands && (
              <div className="mt-6">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
                  {cands.length
                    ? "click a photo to use it"
                    : "no photos found in galleries — paste a url or upload"}
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {cands.map((c) => (
                    <button
                      key={c.id}
                      onClick={() =>
                        setFromUrl(c.full, {
                          photographer: c.photographer,
                          pageLink: c.link,
                          source: c.source,
                        })
                      }
                      disabled={!!busy}
                      className="border border-line bg-panel p-2 text-left transition-colors hover:border-accent/50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- gallery candidate */}
                      <img
                        src={c.thumb}
                        alt=""
                        className="h-28 w-full object-cover"
                      />
                      <div className="mt-2 truncate font-mono text-[9px] uppercase tracking-[0.15em] text-faint">
                        {c.source} · {c.photographer}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="pb-10">
            <h2 className="mb-5 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
              Sighting history
            </h2>
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="text-left uppercase tracking-[0.2em] text-faint">
                  <th className="border-b border-line pb-2 pr-4 font-normal">Time</th>
                  <th className="border-b border-line pb-2 pr-4 font-normal">Flight</th>
                  <th className="border-b border-line pb-2 pr-4 font-normal">Route</th>
                  <th className="border-b border-line pb-2 pr-4 text-right font-normal">
                    Min dist
                  </th>
                  <th className="border-b border-line pb-2 text-right font-normal">
                    Max alt
                  </th>
                </tr>
              </thead>
              <tbody className="text-dim">
                {detail.sightings.map((s) => (
                  <tr key={s.id}>
                    <td className="border-b border-line py-2 pr-4 whitespace-nowrap">
                      {new Date(s.lastSeen).toLocaleString("fi-FI", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="border-b border-line py-2 pr-4 uppercase">
                      {s.callsign ?? "—"}
                    </td>
                    <td className="border-b border-line py-2 pr-4 uppercase">
                      {s.originIata && s.destIata
                        ? `${s.originIata} → ${s.destIata}`
                        : "—"}
                    </td>
                    <td className="border-b border-line py-2 pr-4 text-right">
                      {s.minDistanceKm.toFixed(1)} km
                    </td>
                    <td className="border-b border-line py-2 text-right">
                      {s.maxAltFt != null
                        ? `${s.maxAltFt.toLocaleString("en-US").replace(/,/g, " ")} ft`
                        : "—"}
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
