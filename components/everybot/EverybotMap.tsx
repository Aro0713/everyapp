import { useEffect, useRef, useState } from "react";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Feature, Point } from "geojson";

export type Pin = {
  id: string;
  lat: number;
  lng: number;
  source: string;
  source_url: string;
  title: string | null;
  price_amount: string | number | null;
  currency: string | null;
  updated_at: string | null;
};

type Props = {
  pins: Pin[];
  onSelectId?: (id: string) => void;
};

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function fmtPrice(v: unknown, currency?: unknown) {
  const cur = String(currency ?? "").trim();
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return String(v) + (cur ? ` ${cur}` : "");
  const formatted = n.toLocaleString("pl-PL", { maximumFractionDigits: 0 });
  return (formatted + (cur ? ` ${cur}` : "")).trim();
}

function clampZoom(z: number, min: number, max: number) {
  return Math.max(min, Math.min(max, z));
}

export default function EverybotMap({ pins, onSelectId }: Props) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
      center: [19.02, 50.25],
      zoom: 6,
    });

    mapRef.current = map;

    // DIAG: jeśli styl/tiles są blokowane (np. CSP), zobaczysz to w konsoli
    map.on("error", (ev) => {
      // eslint-disable-next-line no-console
      console.error("[EveryBOT][MAP_ERROR]", (ev as any)?.error ?? ev);
    });

    map.on("load", () => {
      map.addSource("pins", {
        type: "geojson",
        data: buildGeoJson(pins),
      });

      map.addLayer({
        id: "pins-layer",
        type: "circle",
        source: "pins",
        paint: {
          "circle-radius": 6,
          "circle-color": "#2563eb",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });
      
      map.on("mousemove", "pins-layer", (e) => {
        const f = e.features?.[0];
        const pid = String((f as any)?.properties?.id ?? "");
        setHoverId(pid || null);
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "pins-layer", () => {
        setHoverId(null);
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "pins-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "pins-layer", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "pins-layer", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        const props: any = feature.properties ?? {};
        console.log("[EveryBOT][POPUP] props keys:", Object.keys(props));
        console.log("[EveryBOT][POPUP] props:", props);
        const id = String(props.id ?? "");
        if (!id) return;

        if (feature.geometry.type !== "Point") return;

        const coords = (feature.geometry as Point).coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;

        const center: [number, number] = [coords[0], coords[1]];

        setSelectedId(id);

        map.flyTo({
          center,
          zoom: clampZoom(Math.max(map.getZoom(), 12), 6, 16),
          speed: 1.1,
          curve: 1.42,
          essential: true,
        });

        if (onSelectId) onSelectId(id);

        // === POPUP z danych feature.properties ===
        const titleRaw = String(props.title ?? "").trim();
        const title = escapeHtml(titleRaw || String(props.id ?? "Oferta"));

        const sourceRaw = String(props.source ?? "").trim();
        const source = escapeHtml(sourceRaw);

        const urlRaw = String(props.url ?? "").trim();
        const url = urlRaw;

        const priceLine = fmtPrice(props.price, props.currency);

        if (popupRef.current) popupRef.current.remove();

        const html = `
        <div style="min-width:240px;max-width:340px;background:#ffffff;color:#111111;padding:4px;">
          <div style="font-weight:700;margin-bottom:6px;color:#111111;">
            ${title}
          </div>

          ${priceLine ? `<div style="margin-bottom:6px;opacity:.85;color:#111111;">${escapeHtml(priceLine)}</div>` : ""}

          ${source
            ? `<div style="opacity:.7;font-size:12px;margin-bottom:10px;color:#111111;">
                ${escapeHtml(source)}
              </div>`
            : ""
          }

          ${
            url
              ? `<a href="${escapeHtml(url)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="display:inline-block;padding:6px 10px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-size:13px;">
                  Otwórz
                </a>`
              : `<span style="opacity:.6;font-size:12px;color:#111111;">
                  Brak linku
                </span>`
          }
        </div>
      `;

        popupRef.current = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: false,
          offset: 12,
        })
          .setLngLat(center)
          .setHTML(html)
          .addTo(map);
      });

      // auto-fit przy starcie
      if (pins.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        pins.forEach((p) => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 60, duration: 0 });
      }
    });

    return () => {
      if (popupRef.current) popupRef.current.remove();
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource("pins") as maplibregl.GeoJSONSource;
    if (!source) return;
    source.setData(buildGeoJson(pins));
  }, [pins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getLayer("pins-layer")) return;

    map.setPaintProperty("pins-layer", "circle-color", [
      "case",
      ["==", ["get", "id"], selectedId],
      "#ef4444", // selected
      ["==", ["get", "id"], hoverId],
      "#f59e0b", // hover
      "#2563eb", // normal
    ]);

    map.setPaintProperty("pins-layer", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedId],
      11, // selected
      ["==", ["get", "id"], hoverId],
      9, // hover
      6, // normal
    ]);
  }, [selectedId, hoverId]);

  function buildGeoJson(pins: Pin[]): FeatureCollection<Point> {
    return {
      type: "FeatureCollection",
      features: pins.map<Feature<Point>>((pin) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [pin.lng, pin.lat],
        },
        properties: {
          id: pin.id,
          title: pin.title ?? "",
          source: pin.source ?? "",
          url: pin.source_url ?? "",
          price: pin.price_amount ?? "",
          currency: pin.currency ?? "",
        },
      })),
    };
  }

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}