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
  saved_mode?: "agent" | "office" | null;
};

function fmtPrice(v: Pin["price_amount"], currency?: string | null) {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString()} ${currency ?? ""}`.trim();
}

type PinKind = "external" | "office" | "agent";

/**
 * ✅ TUTAJ ustawiasz logikę:
 * - zielone = biuro
 * - żółte = agent
 * - czerwone = reszta (zewn.)
 */
function pinKind(p: Pin): PinKind {
  if (p.saved_mode === "office") return "office";
  if (p.saved_mode === "agent") return "agent";
  return "external";
}

function kindColor(kind: PinKind) {
  // nasycone, premium (bez neonów)
  if (kind === "office") return { fill: "#22c55e", ring: "rgba(34,197,94,.35)" }; // green-500
  if (kind === "agent") return { fill: "#fbbf24", ring: "rgba(251,191,36,.35)" }; // amber-400
  return { fill: "#ef4444", ring: "rgba(239,68,68,.35)" }; // red-500
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function EverybotMap({
  pins,
  onSelectId,
  onViewport,
  resizeKey,
}: {
  pins: Pin[];
  onSelectId?: (id: string) => void;
  onViewport?: (v: { minLat: number; minLng: number; maxLat: number; maxLng: number; zoom: number }) => void;
  resizeKey?: string; // ✅ NOWE
}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const onViewportRef = useRef<typeof onViewport>(onViewport);
  const onMoveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onViewportRef.current = onViewport;
  }, [onViewport]);

  const rafRef = useRef<number | null>(null); // ✅ DODANE
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null); // ✅ DODANE
  const [zoom, setZoom] = useState(6);
  const [bounds, setBounds] = useState<maplibregl.LngLatBoundsLike | null>(null);

  const points = useMemo(() => {
    return pins
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({
        type: "Feature" as const,
        properties: {
          ...p,
          __kind: pinKind(p),
        },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] as [number, number] },
      }));
  }, [pins]);

  const cluster = useMemo(() => {
    const sc = new Supercluster({
      radius: 64,
      maxZoom: 18,
    });
    sc.load(points as any);
    return sc;
  }, [points]);

  const clustered = useMemo(() => {
    if (!bounds) return [];
    const b = bounds as any;
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as [number, number, number, number];
    return cluster.getClusters(bbox, Math.round(zoom));
  }, [cluster, bounds, zoom]);

useEffect(() => {
  if (!containerRef.current) return;
  if (mapRef.current) return;

  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim();

  const styleUrl = key
    ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${encodeURIComponent(key)}`
    : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

  const m = new maplibregl.Map({
    container: containerRef.current,
    style: styleUrl,
    center: [19.0, 52.0],
    zoom: 7.1,
    attributionControl: false,
  });

  m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

  m.setMinZoom(6);
  m.setMaxZoom(18);

const onMove = () => {
  const z = m.getZoom();
  const b = m.getBounds();
  setZoom(z);
  setBounds(b);

  const cb = onViewportRef.current;
  if (cb) {
    cb({
      minLat: b.getSouth(),
      minLng: b.getWest(),
      maxLat: b.getNorth(),
      maxLng: b.getEast(),
      zoom: z,
    });
  }
};

onMoveRef.current = onMove;

  m.on("load", () => {
    onMove();
  });

  m.on("moveend", onMove);
  m.on("zoomend", onMove);

  mapRef.current = m;

  // ✅ STABILIZACJA ROZMIARU (to naprawia "skakanie")
  if (containerRef.current) {
    roRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const cr = entry.contentRect;
      const w = Math.round(cr.width);
      const h = Math.round(cr.height);

      // ✅ resize tylko jeśli realnie zmienił się rozmiar
      const last = lastSizeRef.current;
      if (last && last.w === w && last.h === h) return;
      lastSizeRef.current = { w, h };

      // ✅ throttle do 1 resize per frame (bez pętli)
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      m.resize();
      onMoveRef.current?.(); // ✅ FIX3
    });
    });

    roRef.current.observe(containerRef.current);
  }

return () => {
  roRef.current?.disconnect();
  roRef.current = null;

  if (rafRef.current) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  lastSizeRef.current = null;

  onMoveRef.current = null; // ✅ FIX3

  m.remove();
  mapRef.current = null;
};

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
useEffect(() => {
  const m = mapRef.current;
  if (!m) return;

  requestAnimationFrame(() => {
    try {
      m.resize();
      onMoveRef.current?.(); // ✅ ważne: odśwież bounds/zoom => clustered => markery
    } catch {}
  });
}, [resizeKey]);
  // render markers (DOM markers)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    // remove old markers
    (m as any).__markers?.forEach((mk: maplibregl.Marker) => mk.remove());
    (m as any).__markers = [];

    const markers: maplibregl.Marker[] = [];

    // helper: dominant kind in cluster (sample leaves)
    function dominantKind(clusterId: number): PinKind {
      try {
        const leaves = cluster.getLeaves(clusterId, 20) as any[];
        let office = 0,
          agent = 0,
          external = 0;
        for (const lf of leaves) {
          const k = (lf?.properties?.__kind ?? "external") as PinKind;
          if (k === "office") office++;
          else if (k === "agent") agent++;
          else external++;
        }
        if (office >= agent && office >= external) return "office";
        if (agent >= office && agent >= external) return "agent";
        return "external";
      } catch {
        return "external";
      }
    }

    for (const f of clustered as any[]) {
      const [lng, lat] = f.geometry.coordinates as [number, number];

      const isCluster = Boolean(f.properties.cluster);

      if (isCluster) {
        const count = Number(f.properties.point_count) || 0;
        const kind = dominantKind(f.properties.cluster_id);
        const c = kindColor(kind);

        const el = document.createElement("button");
        el.type = "button";
        el.className = "ev-pin ev-pin--cluster";
        el.setAttribute("aria-label", `Cluster: ${count}`);
        el.innerHTML = `
          <span class="ev-pin__clusterRing" style="box-shadow: 0 0 0 6px ${c.ring};"></span>
          <span class="ev-pin__clusterCount">${count}</span>
        `;

        el.onclick = () => {
          const expZoom = Math.min(cluster.getClusterExpansionZoom(f.properties.cluster_id), 18);
          m.easeTo({ center: [lng, lat], zoom: expZoom, duration: 380 });
        };

        const mk = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([lng, lat])
          .addTo(m);

        markers.push(mk);
        continue;
      }

      // single pin
      const p = f.properties as any as Pin & { __kind?: PinKind };
      const kind = (p.__kind ?? "external") as PinKind;
      const c = kindColor(kind);

      const el = document.createElement("button");
      el.type = "button";
      el.className = "ev-pin ev-pin--single";
      el.setAttribute("aria-label", "Listing marker");
      el.innerHTML = `
        <span class="ev-pin__drop" style="background:${c.fill}; box-shadow: 0 0 0 6px ${c.ring};"></span>
        <span class="ev-pin__dot"></span>
      `;

      el.onclick = (ev: any) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();

        if (onSelectId) onSelectId(p.id);

        const title = escapeHtml((p.title ?? "Ogłoszenie").slice(0, 90));
        const price = escapeHtml(fmtPrice(p.price_amount, p.currency));
        const source = escapeHtml(p.source ?? "");
        const btnId = `openListing-${p.id}`;

        const html = `
          <div class="ev-pop">
            <div class="ev-pop__title">${title}</div>
            <div class="ev-pop__meta">${source}${price ? " • " + price : ""}</div>
            <div class="ev-pop__actions">
              <button id="${btnId}" class="ev-pop__btn">Otwórz</button>
            </div>
          </div>
        `;

        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: "320px",
          offset: 16,
        })
          .setLngLat([lng, lat])
          .setHTML(html)
          .addTo(m);

        // bind
        setTimeout(() => {
          const root = popup.getElement();
          const btn = root?.querySelector(`#${CSS.escape(btnId)}`) as HTMLButtonElement | null;
          if (btn) {
            btn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(p.source_url, "_blank", "noopener,noreferrer");
            };
          }
        }, 0);
      };

      const mk = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lng, lat])
        .addTo(m);

      markers.push(mk);
    }

    (m as any).__markers = markers;
  }, [clustered, cluster, onSelectId]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Map */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Premium overlay (vignette + glass) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-950/35" />
        <div className="absolute inset-0 [box-shadow:inset_0_0_0_1px_rgba(255,255,255,.10)]" />
      </div>

      {/* Legend (optional, small, premium) */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-2 text-xs text-white/75 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
          <span>Zewnętrzne</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#22c55e" }} />
          <span>Biuro</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#fbbf24" }} />
          <span>Agent</span>
        </div>
      </div>

      {/* Marker + popup CSS */}
      <style jsx global>{`
        /* Hide default maplibre focus outlines, we handle on pins */
        .maplibregl-canvas:focus {
          outline: none;
        }

        /* Controls – more premium on dark */
        .maplibregl-ctrl-top-right {
          margin: 12px 12px 0 0;
        }
        .maplibregl-ctrl-group {
          background: rgba(2, 6, 23, 0.55) !important;
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
          overflow: hidden;
        }
        .maplibregl-ctrl button {
          filter: brightness(1.05);
        }
        .maplibregl-ctrl button:hover {
          background: rgba(255, 255, 255, 0.08) !important;
        }

        /* Popup – dark glass */
        .maplibregl-popup-content {
          background: rgba(2, 6, 23, 0.72) !important;
          color: rgba(255, 255, 255, 0.92) !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          border-radius: 16px !important;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5) !important;
          backdrop-filter: blur(16px);
          padding: 14px 14px 12px !important;
        }
        .maplibregl-popup-close-button {
          color: rgba(255, 255, 255, 0.7) !important;
          font-size: 18px !important;
          padding: 6px 10px !important;
        }
        .maplibregl-popup-tip {
          border-top-color: rgba(2, 6, 23, 0.72) !important;
          border-bottom-color: rgba(2, 6, 23, 0.72) !important;
        }

        .ev-pop__title {
          font-weight: 800;
          font-size: 13px;
          line-height: 1.2;
          margin-bottom: 6px;
        }
        .ev-pop__meta {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.65);
          margin-bottom: 10px;
        }
        .ev-pop__actions {
          display: flex;
          justify-content: flex-end;
        }
        .ev-pop__btn {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.92);
          padding: 8px 10px;
          border-radius: 12px;
          font-weight: 800;
          font-size: 12px;
          cursor: pointer;
        }
        .ev-pop__btn:hover {
          background: rgba(255, 255, 255, 0.16);
        }

        /* Pins */
        .ev-pin {
          all: unset;
          cursor: pointer;
          position: relative;
          user-select: none;
          transform: translateZ(0);
        }

        /* Single pin */
        .ev-pin--single {
          width: 22px;
          height: 30px;
          display: grid;
          place-items: center;
          filter: drop-shadow(0 10px 26px rgba(0, 0, 0, 0.45));
        }
        .ev-pin__drop {
          position: absolute;
          width: 18px;
          height: 18px;
          border-radius: 999px 999px 999px 0;
          transform: rotate(-45deg);
          border: 1px solid rgba(255, 255, 255, 0.22);
          backdrop-filter: blur(10px);
        }
        .ev-pin__dot {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.25);
          transform: translateY(-5px);
        }
        .ev-pin--single:hover {
          transform: translateY(-1px);
          transition: 130ms ease;
        }
        .ev-pin--single:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.35);
          outline-offset: 4px;
          border-radius: 14px;
        }

        /* Cluster pin */
        .ev-pin--cluster {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: rgba(2, 6, 23, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(14px);
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.45);
        }
        .ev-pin__clusterRing {
          position: absolute;
          inset: 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .ev-pin__clusterCount {
          font-weight: 900;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.92);
        }
        .ev-pin--cluster:hover {
          transform: translateY(-1px);
          transition: 130ms ease;
        }
      `}</style>
    </div>
  );
}