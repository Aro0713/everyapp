// components/everybot/EverybotMap.tsx
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Pin = {
  id: string;
  lat: number | string | null;
  lng: number | string | null;
  source: string;
  source_url: string;
  title: string | null;
  price_amount: string | number | null;
  currency: string | null;
  saved_mode?: "agent" | "office" | null;
};

type PinKind = "external" | "office" | "agent";

function pinKind(p: Pin): PinKind {
  if (p.saved_mode === "office") return "office";
  if (p.saved_mode === "agent") return "agent";
  return "external";
}

function kindColor(kind: PinKind) {
  if (kind === "office") return { fill: "#22c55e", ring: "rgba(34,197,94,.35)" };
  if (kind === "agent") return { fill: "#fbbf24", ring: "rgba(251,191,36,.35)" };
  return { fill: "#ef4444", ring: "rgba(239,68,68,.35)" };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtPrice(v: Pin["price_amount"], currency?: string | null) {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString()} ${currency ?? ""}`.trim();
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeLng(lng: number): number {
  // normalizacja do [-180..180]
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function isValidLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export default function EverybotMap({
  pins,
  onSelectId,
}: {
  pins: Pin[];
  onSelectId?: (id: string) => void;
}) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const roRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
  console.warn("🔥 EverybotMap.tsx ACTIVE (components/everybot/EverybotMap.tsx)");
}, []);

  // 🔎 DEBUG: raw input pins (before any coercion)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const sample = (pins ?? []).slice(0, 300) as any[];
    const lats = sample.map(p => Number(p.lat)).filter(Number.isFinite);
    const lngs = sample.map(p => Number(p.lng)).filter(Number.isFinite);

    const latMin = lats.length ? Math.min(...lats) : null;
    const latMax = lats.length ? Math.max(...lats) : null;
    const lngMin = lngs.length ? Math.min(...lngs) : null;
    const lngMax = lngs.length ? Math.max(...lngs) : null;

    console.info("[EveryBOT][MAP_RENDER_RAW]", {
      count: (pins ?? []).length,
      sampleN: sample.length,
      types: sample.length ? { lat: typeof sample[0].lat, lng: typeof sample[0].lng } : null,
      latMin,
      latMax,
      lngMin,
      lngMax,
      lngSpan: lngMin !== null && lngMax !== null ? lngMax - lngMin : null,
      latSpan: latMin !== null && latMax !== null ? latMax - latMin : null,
      uniqLng: new Set(sample.map(p => String(p.lng))).size,
      uniqLat: new Set(sample.map(p => String(p.lat))).size,
      hasComma: sample.some(p => typeof p.lng === "string" && String(p.lng).includes(",")),
    });
  }, [pins]);

  // 1) ZERO przesuwania: tylko normalizacja typów i lng
  const cleanPins = useMemo(() => {
    const arr = (pins ?? [])
      .map((p) => {
        const lat = toNum(p.lat);
        const lng = toNum(p.lng);
        if (lat === null || lng === null) return null;
        const lngNorm = normalizeLng(lng);
        if (!isValidLatLng(lat, lngNorm)) return null;
        return { ...p, lat, lng: lngNorm };
      })
      .filter(Boolean) as Array<Omit<Pin, "lat" | "lng"> & { lat: number; lng: number }>;

    // DEBUG: normalized pins that will be rendered
      if (process.env.NODE_ENV !== "production") {
        const s = arr.slice(0, 300);
        if (s.length) {
          const lats = s.map((x) => x.lat);
          const lngs = s.map((x) => x.lng);

          const latMin = Math.min(...lats);
          const latMax = Math.max(...lats);
          const lngMin = Math.min(...lngs);
          const lngMax = Math.max(...lngs);

          console.info("[EveryBOT][MAP_RENDER_NORM]", {
            count: arr.length,
            sampleN: s.length,
            latMin,
            latMax,
            lngMin,
            lngMax,
            lngSpan: lngMax - lngMin,
            latSpan: latMax - latMin,
            uniqLng6: new Set(s.map((p) => p.lng.toFixed(6))).size,
            uniqLat6: new Set(s.map((p) => p.lat.toFixed(6))).size,
          });
        } else {
          console.info("[EveryBOT][MAP_RENDER_NORM]", { count: arr.length, sampleN: 0 });
        }
      }

    return arr;
  }, [pins]);

  // 2) Create map once
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
      zoom: 6.8,
      attributionControl: false,
      renderWorldCopies: false,
    });

    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    m.setMinZoom(4);
    m.setMaxZoom(18);

    const hardResize = () => {
      const delays = [0, 50, 150, 400];
      for (const d of delays) {
        window.setTimeout(() => {
          try {
            m.resize();
          } catch {}
        }, d);
      }
    };

    m.on("load", hardResize);

    mapRef.current = m;

    roRef.current = new ResizeObserver(() => {
      try {
        m.resize();
      } catch {}
    });
    roRef.current.observe(containerRef.current);

    return () => {
      try {
        m.off("load", hardResize);
      } catch {}

      try {
        markersRef.current.forEach((mk) => mk.remove());
      } catch {}
      markersRef.current = [];

      try {
        roRef.current?.disconnect();
      } catch {}
      roRef.current = null;

      try {
        m.remove();
      } catch {}
      mapRef.current = null;
    };
  }, []);
  
  // 3) Render markers ONLY when data changes (no move/zoom rerender)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const render = () => {
      // remove old markers
      try {
        markersRef.current.forEach((mk) => mk.remove());
      } catch {}
      markersRef.current = [];

      const markers: maplibregl.Marker[] = [];

      for (const p of cleanPins) {
        const kind = pinKind(p);
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

          onSelectId?.(p.id);

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
            .setLngLat([p.lng, p.lat])
            .setHTML(html)
            .addTo(m);

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
          .setLngLat([p.lng, p.lat])
          .addTo(m);

        markers.push(mk);
      }

      markersRef.current = markers;
    };

    if (!m.loaded()) {
      const onLoad = () => render();
      m.once("load", onLoad);
      return () => {
        try {
          m.off("load", onLoad);
        } catch {}
      };
    }

    render();
  }, [cleanPins, onSelectId]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-950/35" />
        <div className="absolute inset-0 [box-shadow:inset_0_0_0_1px_rgba(255,255,255,.10)]" />
      </div>

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

      <style jsx global>{`
        .maplibregl-canvas:focus {
          outline: none;
        }

        .ev-pin {
          all: unset;
          cursor: pointer;
          position: relative;
          user-select: none;
          transform: translateZ(0);
          pointer-events: auto !important;
          z-index: 10 !important;
        }

        .maplibregl-marker {
          pointer-events: auto !important;
          z-index: 10 !important;
        }

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
      `}</style>
    </div>
  );
}