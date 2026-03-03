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

export default function EverybotMap({ pins, onSelectId }: Props) {
  const mapRef = useRef<Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [19.02, 50.25],
      zoom: 6,
    });

    mapRef.current = map;

    map.on("load", () => {
      map.addSource("pins", {
        type: "geojson",
        data: buildGeoJson(pins),
      });

      // Warstwa bazowa (neutralna). Selekcję ustawiamy przez setPaintProperty w useEffect([selectedId]).
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

        const id = feature.properties?.id;
        if (!id) return;

        if (feature.geometry.type !== "Point") return;

        const coords = (feature.geometry as Point).coordinates;

        if (!Array.isArray(coords) || coords.length < 2) return;

        const center: [number, number] = [coords[0], coords[1]];

        map.flyTo({
          center,
          zoom: Math.max(map.getZoom(), 11),
          speed: 0.8,
      });

        if (onSelectId) onSelectId(id);
      });

      // 🔹 auto-fit przy pierwszym renderze
      if (pins.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        pins.forEach((p) => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 60, duration: 0 });
      }
    });

    return () => {
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
          title: pin.title,
        },
      })),
    };
  }

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}