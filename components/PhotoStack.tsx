"use client";

import { useEffect, useState } from "react";
import { useIsNarrow } from "@/lib/useIsNarrow";
import type { PhotoInfo } from "@/lib/types";

// Photographs of the airframe laid out like a hand of cards: one square in the
// centre on top, the others fanned out either side so every photo is visible.
// The photos take turns in the centre, shuffling to the next seat every few
// seconds. Each card carries its own photographer credit along the bottom of
// its frame, aligned into the strip that card actually shows.

const SHUFFLE_MS = 5000;
const OPEN_MS = 900;

// seat 0 is the centre; the rest fan outwards, alternating side
const SEATS = [
  { x: 0, y: 0, rotate: 0, scale: 1, z: 3, align: "left" as const },
  { x: -30, y: 5, rotate: -7, scale: 0.86, z: 2, align: "left" as const },
  { x: 30, y: 9, rotate: 7, scale: 0.86, z: 1, align: "right" as const },
];

function Card({
  photo,
  seat,
  opened,
}: {
  photo: PhotoInfo;
  seat: (typeof SEATS)[number];
  opened: boolean;
}) {
  const centre = seat.z === 3;
  // before the fan opens, every card sits squarely under the centre one
  const t = opened
    ? `translate(${seat.x}%, ${seat.y}%) rotate(${seat.rotate}deg) scale(${seat.scale})`
    : "translate(0%, 0%) rotate(0deg) scale(0.9)";
  return (
    <figure
      className="border border-line bg-panel/80 p-2 backdrop-blur-sm [grid-area:1/1]"
      style={{
        justifySelf: "center",
        zIndex: seat.z,
        transform: t,
        transition: `transform ${OPEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow ${OPEN_MS}ms ease`,
        boxShadow: centre
          ? "0 26px 60px rgba(0,0,0,0.65)"
          : "0 14px 36px rgba(0,0,0,0.55)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- cached airframe photo */}
      <img
        src={photo.url}
        alt=""
        className="block w-full"
        style={{
          filter: centre
            ? "grayscale(0.15) saturate(0.85) contrast(1.05) brightness(0.96)"
            : "grayscale(0.4) saturate(0.65) contrast(1.02) brightness(0.66)",
          transition: "filter 600ms ease",
        }}
      />
      {photo.photographer && (
        <figcaption
          className="truncate px-[2px] pt-1.5 font-mono text-[8px] uppercase tracking-[0.2em] text-faint"
          style={{ opacity: centre ? 1 : 0.8, textAlign: seat.align }}
        >
          Photo by {photo.photographer}
        </figcaption>
      )}
    </figure>
  );
}

export default function PhotoStack({ photos }: { photos: PhotoInfo[] }) {
  const deck = photos.slice(0, SEATS.length);
  const [opened, setOpened] = useState(false);
  const [turn, setTurn] = useState(0);
  const narrow = useIsNarrow();

  useEffect(() => {
    setOpened(false);
    setTurn(0);
    const open = setTimeout(() => setOpened(true), 700);
    return () => clearTimeout(open);
  }, [photos.map((p) => p.url).join("|")]);

  useEffect(() => {
    if (deck.length < 2) return;
    const id = setInterval(() => setTurn((n) => n + 1), SHUFFLE_MS);
    return () => clearInterval(id);
  }, [deck.length]);

  if (deck.length === 0) return null;

  // A fan needs width the phone does not have, so there the photographs take
  // the same turns one at a time, each at full size.
  if (narrow && deck.length > 1) {
    const current = deck[turn % deck.length];
    return (
      <div className="grid w-[88vw]">
        <div key={current.url} className="animate-[fa-fade_0.7s_ease_both]">
          <Card photo={current} seat={SEATS[0]} opened />
        </div>
        <div className="mt-3 flex justify-center gap-2">
          {deck.map((p, i) => (
            <span
              key={p.url}
              className={`h-px w-6 transition-colors duration-500 ${
                i === turn % deck.length ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  // a lone photo keeps the plain framed look
  if (deck.length === 1) {
    return (
      <div
        className="grid w-[86vw] animate-[fa-rise_1.6s_ease_both] md:w-[min(46vw,640px)]"
      >
        <Card photo={deck[0]} seat={SEATS[0]} opened />
      </div>
    );
  }

  return (
    <div
      // the grid stacks every card in one cell; the padding leaves room for the
      // fan so nothing is clipped by the edge of the spotlight
      className="grid w-[92vw] animate-[fa-rise_1.6s_ease_both] md:w-[min(56vw,780px)]"
      style={{ padding: "1% 17% 9% 17%" }}
    >
      {deck.map((p, i) => (
        <Card
          key={p.url}
          photo={p}
          seat={SEATS[(i + turn) % deck.length]}
          opened={opened}
        />
      ))}
    </div>
  );
}
