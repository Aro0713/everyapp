import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [19.02, 50.25],
      zoom: 8,
    });

    mapRef.current = map;

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

      map.on("click", "pins-layer", (e) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id;
        if (id && onSelectId) {
          onSelectId(id);
        }
      });
    });

    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource("pins") as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(buildGeoJson(pins));
    }
  }, [pins]);

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