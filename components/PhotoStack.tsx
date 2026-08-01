"use client";

import type { PhotoInfo } from "@/lib/types";

// Photographs of the airframe laid out like dropped prints: the primary one
// square on top, the others tilted behind it. Each card carries its own
// photographer credit along the bottom of its frame — the back cards are
// fanned downward so those credits stay visible rather than hiding under
// the primary card.
const TILTS = [
  { rotate: -4, x: -11, y: 7 },
  { rotate: 5, x: 10, y: 13 },
];

function Card({
  photo,
  primary,
  tilt,
}: {
  photo: PhotoInfo;
  primary: boolean;
  tilt?: { rotate: number; x: number; y: number };
}) {
  return (
    <figure
      className="border border-line bg-panel/80 p-2 backdrop-blur-sm [grid-area:1/1]"
      style={{
        width: primary ? "100%" : "88%",
        justifySelf: "center",
        zIndex: primary ? 3 : 1,
        transform: `translate(${tilt?.x ?? 0}%, ${tilt?.y ?? 0}%) rotate(${tilt?.rotate ?? 0}deg)`,
        boxShadow: primary
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
          filter: primary
            ? "grayscale(0.15) saturate(0.85) contrast(1.05) brightness(0.96)"
            : "grayscale(0.4) saturate(0.65) contrast(1.02) brightness(0.62)",
        }}
      />
      {photo.photographer && (
        <figcaption
          className="truncate px-[2px] pt-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-faint"
          style={{
            opacity: primary ? 1 : 0.8,
            // a back card is only visible on the side it is offset towards,
            // so its credit is aligned into that strip rather than hidden
            textAlign: primary ? "left" : (tilt?.x ?? 0) < 0 ? "left" : "right",
          }}
        >
          {photo.photographer}
        </figcaption>
      )}
    </figure>
  );
}

export default function PhotoStack({ photos }: { photos: PhotoInfo[] }) {
  const [primary, ...rest] = photos;
  if (!primary) return null;
  const back = rest.slice(0, 2);

  return (
    <div
      // the grid stacks every card in one cell; the padding leaves room for the
      // tilt and the downward fan so nothing is clipped by the spotlight edge
      className="grid animate-[fa-rise_1.6s_ease_both]"
      style={{
        width: back.length ? "min(40vw, 560px)" : "min(46vw, 640px)",
        padding: back.length ? "2% 6% 12% 6%" : "0",
      }}
    >
      {back.map((p, i) => (
        <Card key={p.url} photo={p} primary={false} tilt={TILTS[i]} />
      ))}
      <Card photo={primary} primary />
    </div>
  );
}
