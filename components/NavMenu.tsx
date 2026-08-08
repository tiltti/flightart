"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/history", label: "log" },
  { href: "/admin", label: "admin" },
  { href: "/settings", label: "settings" },
];

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

// Inline on the wall, where there is room; a menu button on a phone, where the
// links used to collide with the lockup.
export default function NavMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="hidden items-center gap-6 font-mono text-[11px] uppercase tracking-[0.4em] text-dim md:flex">
        <Clock />
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-faint transition-colors hover:text-accent"
          >
            {l.label.slice(0, 3)}
          </Link>
        ))}
      </div>

      <div className="md:hidden">
        <button
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex h-10 w-10 flex-col items-center justify-center gap-[5px]"
        >
          <span
            className={`h-px w-5 bg-dim transition-transform duration-300 ${
              open ? "translate-y-[6px] rotate-45" : ""
            }`}
          />
          <span
            className={`h-px w-5 bg-dim transition-opacity duration-200 ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`h-px w-5 bg-dim transition-transform duration-300 ${
              open ? "-translate-y-[6px] -rotate-45" : ""
            }`}
          />
        </button>

        {open && (
          <div className="absolute right-0 top-12 z-30 min-w-44 border border-line bg-bg/95 backdrop-blur-sm animate-[fa-fade_0.25s_ease_both]">
            <div className="border-b border-line px-5 py-3 font-mono text-[11px] tracking-[0.35em] text-dim">
              <Clock />
            </div>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block border-b border-line px-5 py-3 font-mono text-[11px] uppercase tracking-[0.3em] text-faint last:border-b-0 active:text-accent"
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
