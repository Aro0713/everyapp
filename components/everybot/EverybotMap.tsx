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

export default function EverybotMap({ pins, onSelectId }: Props) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        const id = String(props.id ?? "");
        if (!id) return;

        if (feature.geometry.type !== "Point") return;

        const coords = (feature.geometry as Point).coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;

        const center: [number, number] = [coords[0], coords[1]];

        setSelectedId(id);

        map.flyTo({
          center,
          zoom: Math.max(map.getZoom(), 11),
          speed: 0.8,
        });

        if (onSelectId) onSelectId(id);

        // === POPUP z danych feature.properties ===
        const titleRaw = String(props.title ?? "").trim();
        const title = escapeHtml(titleRaw || "Oferta");

        const sourceRaw = String(props.source ?? "").trim();
        const source = escapeHtml(sourceRaw);

        const urlRaw = String(props.url ?? "").trim();
        const url = urlRaw;

        const priceVal = String(props.price ?? "").trim();
        const currency = String(props.currency ?? "").trim();
        const priceLine = priceVal
          ? `${escapeHtml(priceVal)}${currency ? " " + escapeHtml(currency) : ""}`
          : "";

        if (popupRef.current) popupRef.current.remove();

        const html = `
          <div style="min-width:240px;max-width:340px;">
            <div style="font-weight:700;margin-bottom:6px;">${title}</div>
            ${priceLine ? `<div style="margin-bottom:6px;opacity:.85;">${priceLine}</div>` : ""}
            ${source ? `<div style="opacity:.7;font-size:12px;margin-bottom:10px;">${source}</div>` : ""}
            ${
              url
                ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
                    style="display:inline-block;padding:6px 10px;border-radius:8px;background:#111827;color:#fff;text-decoration:none;font-size:13px;">
                    Otwórz
                  </a>`
                : `<span style="opacity:.6;font-size:12px;">Brak linku</span>`
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
      "#ef4444",
      "#2563eb",
    ]);

    map.setPaintProperty("pins-layer", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedId],
      10,
      6,
    ]);
  }, [selectedId]);

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