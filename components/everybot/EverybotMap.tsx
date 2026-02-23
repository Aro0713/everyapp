import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster from "supercluster";

type Pin = {
  id: string;
  lat: number;
  lng: number;
  source: string;
  source_url: string;
  title: string | null;
  price_amount: string | number | null;
  currency: string | null;
};

function fmtPrice(v: Pin["price_amount"], currency?: string | null) {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString()} ${currency ?? ""}`.trim();
}

export default function EverybotMap({
  pins,
  onSelectId,
  onViewport,
}: {
  pins: Pin[];
  onSelectId?: (id: string) => void;
  onViewport?: (v: { minLat: number; minLng: number; maxLat: number; maxLng: number; zoom: number }) => void;
}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(6);
  const [bounds, setBounds] = useState<maplibregl.LngLatBoundsLike | null>(null);

  const points = useMemo(() => {
    return pins
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({
        type: "Feature" as const,
        properties: { ...p },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] as [number, number] },
      }));
  }, [pins]);

  const cluster = useMemo(() => {
    const sc = new Supercluster({
      radius: 60,
      maxZoom: 18,
    });
    sc.load(points as any);
    return sc;
  }, [points]);

  const clustered = useMemo(() => {
    if (!bounds) return [];
    const b = bounds as any; // maplibre type
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as [number, number, number, number];
    return cluster.getClusters(bbox, Math.round(zoom));
  }, [cluster, bounds, zoom]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/basic-v2/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
      center: [19.0, 52.0],
      zoom: 6.3,
    });

    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
 
    const onMove = () => {
    const z = m.getZoom();
    const b = m.getBounds();
    setZoom(z);
    setBounds(b);

    if (onViewport) {
        onViewport({
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
        zoom: z,
        });
    }
    };

    m.on("load", onMove);
    m.on("moveend", onMove);
    m.on("zoomend", onMove);

    mapRef.current = m;

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, []);

  // render markers (simple DOM markers)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    // remove old markers
    (m as any).__markers?.forEach((mk: maplibregl.Marker) => mk.remove());
    (m as any).__markers = [];

    const markers: maplibregl.Marker[] = [];

    for (const f of clustered as any[]) {
      const [lng, lat] = f.geometry.coordinates as [number, number];

      const isCluster = Boolean(f.properties.cluster);
      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "rounded-full shadow-sm border border-gray-200 bg-white text-ew-primary text-xs font-bold px-2 py-1";

      if (isCluster) {
        el.textContent = String(f.properties.point_count);
        el.onclick = () => {
          const expZoom = Math.min(cluster.getClusterExpansionZoom(f.properties.cluster_id), 18);
          m.easeTo({ center: [lng, lat], zoom: expZoom, duration: 350 });
        };
      } else {
        const p = f.properties as any as Pin;
        el.textContent = "●";
        el.onclick = () => {
        if (onSelectId) onSelectId(p.id);
          const title = (p.title ?? "Ogłoszenie").slice(0, 80);
          const price = fmtPrice(p.price_amount, p.currency);
          const html =
            `<div style="font-size:12px; line-height:1.2;">
              <div style="font-weight:700; margin-bottom:6px;">${title}</div>
              <div style="margin-bottom:8px; color:#333;">${p.source}${price ? " • " + price : ""}</div>
              <button id="openListing" style="padding:6px 10px; border-radius:10px; border:1px solid #e5e7eb; font-weight:700; cursor:pointer;">
                Otwórz
              </button>
            </div>`;

          const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat([lng, lat])
            .setHTML(html)
            .addTo(m);

          // delegate click
          setTimeout(() => {
            const btn = document.getElementById("openListing");
            if (btn) {
              btn.onclick = () => window.open(p.source_url, "_blank", "noopener,noreferrer");
            }
          }, 0);
        };
      }

      const mk = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(m);

      markers.push(mk);
    }

    (m as any).__markers = markers;
  }, [clustered, cluster]);

  return (
    <div className="h-[70vh] w-full rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}