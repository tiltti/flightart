"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import DecoFrame from "@/components/DecoFrame";
import Radar from "@/components/Radar";
import Spotlight from "@/components/Spotlight";
import { useSettings } from "@/lib/settings";
import type {
  Aircraft,
  Enrichment,
  RadarPayload,
  Stats,
  Summary,
} from "@/lib/types";

const GONE_GRACE_MS = 15_000; // keep spotlight through a brief signal dropout

function Clock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const update = () =>
      setNow(
        new Date().toLocaleTimeString("fi-FI", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, []);
  return <span>{now}</span>;
}

function Idle({ stats, error }: { stats: Stats | null; error?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 animate-[fa-fade_1.5s_ease_both]">
      <div className="font-display text-5xl font-light uppercase tracking-[0.35em] text-ink/25">
        {error ? "No signal" : "Clear skies"}
      </div>
      {stats && stats.totalSightings > 0 && (
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          {stats.totalSightings} flights logged · {stats.uniqueAircraft} aircraft
          {stats.topTypes[0] && ` · most seen ${stats.topTypes[0].code}`}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [settings] = useSettings();
  const [data, setData] = useState<RadarPayload | null>(null);
  const [selected, setSelected] = useState<Aircraft | null>(null);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [idleStats, setIdleStats] = useState<Stats | null>(null);
  const [queue, setQueue] = useState<string[]>([]);

  const featuredAt = useRef(new Map<string, number>());
  const selectedHexRef = useRef<string | null>(null);
  const selectedSince = useRef(0);
  const selectedLastSeen = useRef(0);
  const manualActive = useRef(false);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/aircraft?nm=${settings.radarNm}`);
        const payload = (await res.json()) as RadarPayload;
        if (live) setData(payload);
      } catch {
        // keep the last frame on transient failures
      }
    };
    tick();
    const id = setInterval(tick, settings.pollSec * 1000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [settings.pollSec, settings.radarNm]);

  const feature = useCallback(async (a: Aircraft) => {
    setSelected(a);
    setEnrichment(null);
    selectedHexRef.current = a.hex;
    selectedSince.current = Date.now();
    selectedLastSeen.current = Date.now();
    featuredAt.current.set(a.hex, Date.now());
    try {
      const q = new URLSearchParams({ hex: a.hex });
      if (a.callsign) q.set("callsign", a.callsign);
      if (a.registration) q.set("reg", a.registration);
      const res = await fetch(`/api/enrich?${q}`);
      const e = (await res.json()) as Enrichment;
      if (selectedHexRef.current !== a.hex) return;
      setEnrichment(e);
      fetch("/api/sightings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e),
      }).catch(() => {});

      // cutout generation runs in the background — re-check a few times
      if (e.photo && !e.cutoutUrl) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((r) => setTimeout(r, 12_000));
          if (selectedHexRef.current !== a.hex) return;
          const again = (await fetch(`/api/enrich?${q}`)
            .then((r) => r.json())
            .catch(() => null)) as Enrichment | null;
          if (again?.cutoutUrl) {
            if (selectedHexRef.current === a.hex) setEnrichment(again);
            return;
          }
        }
      }
    } catch {
      // text-only spotlight when enrichment is unavailable
    }
  }, []);

  useEffect(() => {
    if (!data) return;
    const now = Date.now();
    const list = data.aircraft;
    const current = selected
      ? list.find((a) => a.hex === selected.hex)
      : undefined;
    if (current) {
      selectedLastSeen.current = now;
      if (current !== selected) setSelected(current); // refresh live numbers
    }

    const cooldownOver = (a: Aircraft) =>
      now - (featuredAt.current.get(a.hex) ?? 0) >
      settings.cooldownMin * 60_000;
    const candidates = list.filter((a) => a.hex !== selected?.hex);
    const pick = candidates.find(cooldownOver) ?? null; // list is distance-sorted
    const fallback =
      [...candidates].sort(
        (a, b) =>
          (featuredAt.current.get(a.hex) ?? 0) -
          (featuredAt.current.get(b.hex) ?? 0),
      )[0] ?? null;

    const validQueue = queue.filter(
      (h) => h !== selected?.hex && list.some((a) => a.hex === h),
    );
    if (validQueue.length !== queue.length) setQueue(validQueue);

    const currentGone =
      !!selected && !current && now - selectedLastSeen.current > GONE_GRACE_MS;
    const currentStale =
      !!selected &&
      now - selectedSince.current > settings.spotlightSec * 1000 &&
      (validQueue.length > 0 || !!pick);

    if (!selected || currentGone || currentStale) {
      // clicked queue runs first, each for the normal spotlight duration
      const queuedNext = validQueue[0]
        ? list.find((a) => a.hex === validQueue[0])
        : undefined;
      if (queuedNext) {
        setQueue((q) => q.filter((h) => h !== queuedNext.hex));
        manualActive.current = true;
        feature(queuedNext);
        return;
      }
      manualActive.current = false; // queue drained — back to auto rotation
      const next = pick ?? (!selected || currentGone ? fallback : null);
      if (next) {
        feature(next);
      } else if (currentGone || list.length === 0) {
        setSelected(null);
        setEnrichment(null);
        selectedHexRef.current = null;
      }
    }
  }, [data, selected, queue, feature, settings.cooldownMin, settings.spotlightSec]);

  useEffect(() => {
    if (selected) return;
    let live = true;
    const load = async () => {
      try {
        const summary = (await fetch("/api/sightings").then((r) =>
          r.json(),
        )) as Summary;
        if (live) setIdleStats(summary.stats);
      } catch {
        // idle stats are decorative
      }
    };
    load();
    const id = setInterval(load, 120_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [selected]);

  // page rotation: flip to the logbook every N minutes
  useEffect(() => {
    if (!settings.rotatePages) return;
    const id = setInterval(
      () => router.push("/history"),
      settings.rotateIntervalMin * 60_000,
    );
    return () => clearInterval(id);
  }, [settings.rotatePages, settings.rotateIntervalMin, router]);

  return (
    <main className="relative flex h-dvh w-full overflow-hidden bg-bg text-ink">
      <section className="relative min-w-0 flex-[1.25]">
        {selected ? (
          <Spotlight
            aircraft={selected}
            enrichment={enrichment}
            settings={settings}
          />
        ) : (
          <Idle stats={idleStats} error={data?.error} />
        )}
      </section>

      <aside className="relative flex flex-1 items-center justify-center p-10">
        <Radar
          aircraft={data?.aircraft ?? []}
          airfields={data?.airfields ?? []}
          radiusKm={data?.radiusKm ?? settings.radarNm * 1.852}
          selectedHex={selected?.hex ?? null}
          queuedHexes={queue}
          onSelect={(hex) => {
            const a = data?.aircraft.find((x) => x.hex === hex);
            if (!a || a.hex === selected?.hex || queue.includes(hex)) return;
            if (!selected || !manualActive.current) {
              // first click interrupts auto rotation right away
              manualActive.current = true;
              feature(a);
            } else {
              setQueue((q) => (q.includes(hex) ? q : [...q, hex]));
            }
          }}
        />

        {/* all chrome lives on the radar side — the spotlight keeps its half clean */}
        <div className="pointer-events-none absolute inset-x-0 top-7 z-20 flex flex-col items-center gap-3">
          <div className="flex items-center gap-5">
            <span className="h-px w-16 bg-line" />
            <span className="font-deco text-[13px] tracking-[0.6em] text-dim">
              ✦ FLIGHTART ✦
            </span>
            <span className="h-px w-16 bg-line" />
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-faint">
            {data?.home ?? ""} ·{" "}
            {Math.round(data?.radiusKm ?? settings.radarNm * 1.852)} km
          </div>
        </div>

        <div className="absolute right-7 top-7 z-20 flex items-center gap-6 font-mono text-[11px] uppercase tracking-[0.4em] text-dim">
          <Clock />
          <Link
            href="/history"
            className="text-faint transition-colors hover:text-accent"
          >
            log
          </Link>
          <Link
            href="/settings"
            className="text-faint transition-colors hover:text-accent"
          >
            set
          </Link>
        </div>

        <div className="absolute bottom-6 right-7 z-20 font-mono text-[10px] uppercase tracking-[0.35em] text-faint">
          {data ? `${data.aircraft.length} aircraft in range` : "connecting"}
        </div>
      </aside>

      <DecoFrame />
    </main>
  );
}
