"use client";

import { useEffect } from "react";

// Registers the shell cache so the display can be installed to a home screen
// and opens without browser chrome.
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // an unavailable service worker only costs installability
    });
  }, []);
  return null;
}
