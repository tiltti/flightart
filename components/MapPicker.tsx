"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  lat: number;
  lon: number;
  onPick: (lat: number, lon: number) => void;
}

export default function MapPicker({ lat, lon, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !ref.current || mapRef.current) return;
      const map = L.map(ref.current).setView([lat, lon], 9);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 17,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "",
          html: '<div style="width:14px;height:14px;border-radius:50%;background:#d9a05b;border:2px solid #05080c;box-shadow:0 0 0 2px #d9a05b55;"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(map);
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        onPickRef.current(
          Number(e.latlng.lat.toFixed(4)),
          Number(e.latlng.lng.toFixed(4)),
        );
      });
      mapRef.current = map;
      markerRef.current = marker;
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; prop updates handled below
  }, []);

  // reflect external changes (e.g. "use browser location")
  useEffect(() => {
    markerRef.current?.setLatLng([lat, lon]);
    mapRef.current?.setView([lat, lon], mapRef.current.getZoom());
  }, [lat, lon]);

  return (
    <div
      ref={ref}
      className="fa-map h-72 w-full border border-line"
      style={{ background: "#0a0f14" }}
    />
  );
}
