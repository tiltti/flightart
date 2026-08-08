"use client";

import { useEffect, useState } from "react";

// The wall layout puts the spotlight and the radar side by side. Below this
// width there is no room for both, and the display shows one at a time.
const NARROW = "(max-width: 900px)";

export function useIsNarrow(): boolean {
  // starts false so the server-rendered markup matches, then corrects on mount
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return narrow;
}
