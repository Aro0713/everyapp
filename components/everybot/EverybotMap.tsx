import { useEffect, useMemo, useRef } from "react";
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

  // GeoJSON points
  const points = useMemo(() => {
    return (pins ?? [])
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({
        type: "Feature" as const,
        properties: { ...p, __kind: pinKind(p) },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] as [number, number] },
      }));
  }, [pins]);

  // Supercluster index
  const cluster = useMemo(() => {
    const sc = new Supercluster({ radius: 64, maxZoom: 18 });
    sc.load(points as any);
    return sc;
  }, [points]);

  // Create map once
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
      renderWorldCopies: false, 
    });

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

    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.setMinZoom(4);
    m.setMaxZoom(18);

    mapRef.current = m;

    return () => {
      // odłącz hardResize
      try {
        m.off("load", hardResize);
      } catch {}

      // usuń markery (pewnie)
      try {
        markersRef.current.forEach((mk) => mk.remove());
      } catch {}
      markersRef.current = [];

      m.remove();
      mapRef.current = null;
    };
  }, []);

  // Render markers whenever pins change OR after move/zoom ends
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const render = () => {
      // remove old markers (pewnie)
      try {
        markersRef.current.forEach((mk) => mk.remove());
      } catch {}
      markersRef.current = [];

      const markers: maplibregl.Marker[] = [];

      const z = Math.round(m.getZoom());
      const b = m.getBounds();
      const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as [number, number, number, number];
      const clustered = cluster.getClusters(bbox, z) as any[];

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

      for (const f of clustered) {
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

          markers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(m));
          continue;
        }

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
            .setLngLat([lng, lat])
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

        markers.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(m));
      }

      markersRef.current = markers;
    };

    // KROK 5: render dopiero po load
    if (!m.loaded()) {
      const onLoad = () => render();
      m.once("load", onLoad);
      return () => {
        try {
          m.off("load", onLoad);
        } catch {}
      };
    }

    // render now (when pins change)
    render();

    // render after user moves/zooms
    m.off("moveend", render);
    m.off("zoomend", render);
    m.on("moveend", render);
    m.on("zoomend", render);

    return () => {
      m.off("moveend", render);
      m.off("zoomend", render);
    };
  }, [cluster, onSelectId]);

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
        .maplibregl-canvas:focus { outline: none; }

        .maplibregl-ctrl-top-right { margin: 12px 12px 0 0; }
        .maplibregl-ctrl-group {
          background: rgba(2, 6, 23, 0.55) !important;
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
          overflow: hidden;
        }
        .maplibregl-ctrl button { filter: brightness(1.05); }
        .maplibregl-ctrl button:hover { background: rgba(255, 255, 255, 0.08) !important; }

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

        .ev-pop__title { font-weight: 800; font-size: 13px; line-height: 1.2; margin-bottom: 6px; }
        .ev-pop__meta { font-size: 12px; color: rgba(255, 255, 255, 0.65); margin-bottom: 10px; }
        .ev-pop__actions { display: flex; justify-content: flex-end; }
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
        .ev-pop__btn:hover { background: rgba(255, 255, 255, 0.16); }

        .ev-pin { all: unset; cursor: pointer; position: relative; user-select: none; transform: translateZ(0); }

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
        .ev-pin__clusterCount { font-weight: 900; font-size: 12px; color: rgba(255, 255, 255, 0.92); }
      `}</style>
    </div>
  );
}