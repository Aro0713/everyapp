// components/EverybotSearchPanel.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import type { SourceKey } from "@/lib/everybot/enrichers/types";

export type EverybotSource = "all" | SourceKey;

export type EverybotFilters = {
  q: string;
  source: EverybotSource;
  transactionType: "" | "sale" | "rent";
  propertyType: string;
  locationText: string;
  voivodeship: string; // ✅ NOWE
  city: string;
  district: string;
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
  rooms: string;
};



function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

async function reverseGeocodeOSM(lat: number, lon: number) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("zoom", "16");
  url.searchParams.set("addressdetails", "1");

  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Reverse geocode HTTP ${r.status}`);
  const j = await r.json();

  const addr = j?.address ?? {};
  const city = addr.city || addr.town || addr.village || addr.municipality || "";
  const district = addr.suburb || addr.neighbourhood || addr.city_district || "";
  const road = addr.road || addr.pedestrian || "";
  const house = addr.house_number || "";
  const postcode = addr.postcode || "";
  const state = addr.state || "";
  const country = addr.country || "";

  const locationText = [
    road && house ? `${road} ${house}` : road,
    district,
    city,
    state,
    postcode,
    country,
  ]
    .filter(Boolean)
    .join(", ");

  return { locationText, city, district, voivodeship: state };
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function buildEverybotQueryFromFilters(f: EverybotFilters): string {
  // Budujemy „komendę wyszukiwania” pod EveryBOT (fraza tekstowa),
  // ale tylko jeśli user nie podał własnej q.
  const parts: string[] = [];

  // Transakcja
  if (f.transactionType === "sale") parts.push("sprzedaż");
  if (f.transactionType === "rent") parts.push("wynajem");

  // Typ nieruchomości
  if (isNonEmpty(f.propertyType)) parts.push(f.propertyType.trim());

  // Lokalizacja
  if (isNonEmpty(f.city)) parts.push(f.city.trim());
  if (isNonEmpty(f.district)) parts.push(f.district.trim());

  // Pokoje
  if (isNonEmpty(f.rooms)) parts.push(`${f.rooms.trim()} pokoje`);

  // Powierzchnia
  if (isNonEmpty(f.minArea) || isNonEmpty(f.maxArea)) {
    const aMin = isNonEmpty(f.minArea) ? f.minArea.trim() : "";
    const aMax = isNonEmpty(f.maxArea) ? f.maxArea.trim() : "";
    if (aMin && aMax) parts.push(`${aMin}-${aMax} m2`);
    else if (aMin) parts.push(`min ${aMin} m2`);
    else if (aMax) parts.push(`max ${aMax} m2`);
  }

  // Cena
  if (isNonEmpty(f.minPrice) || isNonEmpty(f.maxPrice)) {
    const pMin = isNonEmpty(f.minPrice) ? f.minPrice.trim() : "";
    const pMax = isNonEmpty(f.maxPrice) ? f.maxPrice.trim() : "";
    if (pMin && pMax) parts.push(`${pMin}-${pMax} PLN`);
    else if (pMin) parts.push(`min ${pMin} PLN`);
    else if (pMax) parts.push(`max ${pMax} PLN`);
  }

  return parts.join(", ");
}

export default function EverybotSearchPanel(props: {
  lang: LangKey;
  loading: boolean;

  importUrl: string;
  setImportUrl: (v: string) => void;
  importing: boolean;
  onImportLink: () => void;

  saveMode: "agent" | "office";
  setSaveMode: (v: "agent" | "office") => void;

  filters: EverybotFilters;
  setFilters: (next: EverybotFilters) => void;

  onSearch: (filters: EverybotFilters) => void;

}) {
  const { lang, loading } = props;
  const f = props.filters;

  // ✅ latest filters (żeby async geo nie nadpisywało source itp.)
  const latestFiltersRef = useRef<EverybotFilters>(props.filters);
  useEffect(() => {
    latestFiltersRef.current = props.filters;
  }, [props.filters]);

  function patch(next: Partial<EverybotFilters>) {
    props.setFilters({ ...latestFiltersRef.current, ...next });
  }

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const canGeo = useMemo(
    () => typeof window !== "undefined" && "geolocation" in navigator,
    []
  );

  async function useMyLocation() {
    setGeoErr(null);

    if (!canGeo) {
      setGeoErr(t(lang, "everybotGeoUnsupported" as any));
      return;
    }

    setGeoBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 60_000,
        });
      });

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      const { locationText, city, district, voivodeship } = await reverseGeocodeOSM(lat, lon);

      // ✅ patch na najnowszych filtrach (bez ...f)
     patch({
        locationText: locationText || latestFiltersRef.current.locationText,
        voivodeship: (voivodeship || latestFiltersRef.current.voivodeship),
        city: city || latestFiltersRef.current.city,
        district: district || latestFiltersRef.current.district,
        });
    } catch (e: any) {
      setGeoErr(e?.message ?? t(lang, "everybotGeoError" as any));
    } finally {
      setGeoBusy(false);
    }
  }

function onClickSearch() {
  const current = latestFiltersRef.current;

  // jeśli user nie podał q, budujemy frazę z pól
  if (!isNonEmpty(current.q)) {
    const built = buildEverybotQueryFromFilters(current);
    const next = { ...current, q: built || "" };

    // zapisujemy w state (żeby UI pokazało q)
    props.setFilters(next);

    // i od razu odpalamy run na NEXT (bez czekania aż state się odświeży)
    props.onSearch(next);
    return;
  }

  // jeśli q jest, odpalamy run na current
  props.onSearch(current);
}


  const inputCls =
    "w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20";

  // ✅ backend realnie obsługuje tylko te źródła w harvest
const supportedSources = useMemo(
  () => [
    { v: "all" as const, label: t(lang, "everybotSourceAll" as any) },
    { v: "otodom" as const, label: "Otodom" },
    { v: "olx" as const, label: "OLX" },
    // dopisuj dopiero jak backend realnie obsługuje:
    // { v: "gratka" as const, label: "Gratka" },
    // { v: "morizon" as const, label: "Morizon" },
    // { v: "odwlasciciela" as const, label: "OdWlasciciela" },
    // { v: "nieruchomosci_online" as const, label: "Nieruchomosci-Online" },
  ],
  [lang]
);

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-ew-primary">
            {t(lang, "everybotContainerTitle" as any)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {t(lang, "everybotContainerSub" as any)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {t(lang, "everybotSaveModeLabel" as any)}
          </span>
          <select
            value={props.saveMode}
            onChange={(e) => props.setSaveMode(e.target.value as "agent" | "office")}
            className={clsx(inputCls, "py-2")}
            title={t(lang, "everybotSaveModeLabel" as any)}
          >
            <option value="agent">{t(lang, "everybotSaveModeAgent" as any)}</option>
            <option value="office">{t(lang, "everybotSaveModeOffice" as any)}</option>
          </select>
        </div>
      </div>

      {/* 1) Import link */}
      <div className="mt-4 grid gap-3 md:grid-cols-12">
        <div className="md:col-span-9">
          <input
            value={props.importUrl}
            onChange={(e) => props.setImportUrl(e.target.value)}
            placeholder={t(lang, "everybotImportPlaceholder" as any)}
            className={inputCls}
          />
        </div>
        <div className="md:col-span-3">
          <button
            type="button"
            disabled={props.importing || !props.importUrl.trim()}
            onClick={props.onImportLink}
            className={clsx(
              "w-full rounded-2xl px-4 py-3 text-sm font-extrabold shadow-sm transition",
              props.importing || !props.importUrl.trim()
                ? "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400"
                : "bg-ew-accent text-ew-primary hover:opacity-95"
            )}
          >
            {props.importing ? "…" : t(lang, "everybotImportBtn" as any)}
          </button>
        </div>
      </div>

      {/* 2) Search panel */}
      <div className="md:col-span-3">
        <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotVoivodeshipLabel" as any)}
        </label>
        <input
            value={f.voivodeship}
            onChange={(e) => patch({ voivodeship: e.target.value })}
            placeholder={t(lang, "everybotVoivodeshipPlaceholder" as any)}
            className={inputCls}
        />
        </div>

      <div className="mt-4 grid gap-3 md:grid-cols-12">
        <div className="md:col-span-6">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotSearchQueryLabel" as any)}
          </label>
          <input
            value={f.q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder={t(lang, "everybotSearchQueryPlaceholder" as any)}
            className={inputCls}
          />
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotSourceLabel" as any)}
          </label>
          <select
            value={f.source}
            onChange={(e) => patch({ source: e.target.value as EverybotSource })}
            className={inputCls}
          >
            {supportedSources.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotTransactionLabel" as any)}
          </label>
          <select
            value={f.transactionType}
            onChange={(e) => patch({ transactionType: e.target.value as any })}
            className={inputCls}
          >
            <option value="">{t(lang, "everybotAny" as any)}</option>
            <option value="sale">{t(lang, "everybotTxnSale" as any)}</option>
            <option value="rent">{t(lang, "everybotTxnRent" as any)}</option>
          </select>
        </div>

        <div className="md:col-span-4">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotPropertyTypeLabel" as any)}
          </label>
          <input
            value={f.propertyType}
            onChange={(e) => patch({ propertyType: e.target.value })}
            placeholder={t(lang, "everybotPropertyTypePlaceholder" as any)}
            className={inputCls}
          />
        </div>

        <div className="md:col-span-5">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotLocationLabel" as any)}
          </label>
          <div className="flex gap-2">
            <input
              value={f.locationText}
              onChange={(e) => patch({ locationText: e.target.value })}
              placeholder={t(lang, "everybotLocationPlaceholder" as any)}
              className={inputCls}
            />
            <button
              type="button"
              onClick={useMyLocation}
              disabled={geoBusy}
              className={clsx(
                "shrink-0 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
                geoBusy
                  ? "cursor-wait border-gray-200 bg-gray-100 text-gray-400"
                  : "border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10"
              )}
              title={t(lang, "everybotUseMyLocation" as any)}
            >
              {geoBusy ? "…" : t(lang, "everybotUseMyLocation" as any)}
            </button>
          </div>
          {geoErr ? <div className="mt-1 text-xs text-red-700">{geoErr}</div> : null}
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotCityLabel" as any)}
          </label>
          <input
            value={f.city}
            onChange={(e) => patch({ city: e.target.value })}
            placeholder={t(lang, "everybotCityPlaceholder" as any)}
            className={inputCls}
          />
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotDistrictLabel" as any)}
          </label>
          <input
            value={f.district}
            onChange={(e) => patch({ district: e.target.value })}
            placeholder={t(lang, "everybotDistrictPlaceholder" as any)}
            className={inputCls}
          />
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotPriceMinLabel" as any)}
          </label>
          <input
            inputMode="numeric"
            value={f.minPrice}
            onChange={(e) => patch({ minPrice: e.target.value })}
            placeholder={t(lang, "everybotPriceMinPlaceholder" as any)}
            className={inputCls}
          />
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotPriceMaxLabel" as any)}
          </label>
          <input
            inputMode="numeric"
            value={f.maxPrice}
            onChange={(e) => patch({ maxPrice: e.target.value })}
            placeholder={t(lang, "everybotPriceMaxPlaceholder" as any)}
            className={inputCls}
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotAreaMinLabel" as any)}
          </label>
          <input
            inputMode="numeric"
            value={f.minArea}
            onChange={(e) => patch({ minArea: e.target.value })}
            placeholder={t(lang, "everybotAreaMinPlaceholder" as any)}
            className={inputCls}
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotAreaMaxLabel" as any)}
          </label>
          <input
            inputMode="numeric"
            value={f.maxArea}
            onChange={(e) => patch({ maxArea: e.target.value })}
            placeholder={t(lang, "everybotAreaMaxPlaceholder" as any)}
            className={inputCls}
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotRoomsLabel" as any)}
          </label>
          <input
            inputMode="numeric"
            value={f.rooms}
            onChange={(e) => patch({ rooms: e.target.value })}
            placeholder={t(lang, "everybotRoomsPlaceholder" as any)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={loading}
          onClick={onClickSearch}
          className={clsx(
            "rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition",
            loading
              ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
              : "border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10"
          )}
        >
          {t(lang, "everybotSearchBtn" as any)}
        </button>
      </div>
    </div>
  );
}
