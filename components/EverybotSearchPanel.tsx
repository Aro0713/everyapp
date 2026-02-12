// components/EverybotSearchPanel.tsx
import { useMemo, useState } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

type EverybotFilters = {
  q: string;
  source: string;
  transactionType: "" | "sale" | "rent";
  propertyType: string;
  locationText: string;
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
  // Public endpoint. Bez kluczy. Zwykle działa w przeglądarce.
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
  const city =
    addr.city || addr.town || addr.village || addr.municipality || "";
  const district =
    addr.suburb || addr.neighbourhood || addr.city_district || "";
  const road = addr.road || addr.pedestrian || "";
  const house = addr.house_number || "";
  const postcode = addr.postcode || "";
  const state = addr.state || "";
  const country = addr.country || "";

  const locationText = [road && house ? `${road} ${house}` : road, district, city, state, postcode, country]
    .filter(Boolean)
    .join(", ");

  return { locationText, city, district };
}

export default function EverybotSearchPanel(props: {
  lang: LangKey;
  loading: boolean;

  // import link (zostaje, ale w panelu)
  importUrl: string;
  setImportUrl: (v: string) => void;
  importing: boolean;
  onImportLink: () => void;

  // saveMode
  saveMode: "agent" | "office";
  setSaveMode: (v: "agent" | "office") => void;

  // filtry (zwracamy gotowy obiekt)
  filters: EverybotFilters;
  setFilters: (next: EverybotFilters) => void;

  onSearch: () => void;
}) {
  const { lang, loading } = props;
  const f = props.filters;

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const canGeo = useMemo(() => typeof window !== "undefined" && "geolocation" in navigator, []);

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

      // reverse geocode -> human-readable
      const { locationText, city, district } = await reverseGeocodeOSM(lat, lon);

      props.setFilters({
        ...f,
        locationText: locationText || f.locationText,
        city: city || f.city,
        district: district || f.district,
      });
    } catch (e: any) {
      setGeoErr(e?.message ?? t(lang, "everybotGeoError" as any));
    } finally {
      setGeoBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20";

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

        {/* saveMode */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t(lang, "everybotSaveModeLabel" as any)}</span>
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

      {/* 2) Search panel (ma wejść nad przyciskiem Szukaj) */}
      <div className="mt-4 grid gap-3 md:grid-cols-12">
        <div className="md:col-span-6">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotSearchQueryLabel" as any)}
          </label>
          <input
            value={f.q}
            onChange={(e) => props.setFilters({ ...f, q: e.target.value })}
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
            onChange={(e) => props.setFilters({ ...f, source: e.target.value })}
            className={inputCls}
          >
            <option value="all">{t(lang, "everybotSourceAll" as any)}</option>
            <option value="otodom">Otodom</option>
            <option value="olx">OLX</option>
            <option value="no">Nieruchomosci-online</option>
            <option value="owner">{t(lang, "everybotSourceOwner" as any)}</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-semibold text-ew-primary">
            {t(lang, "everybotTransactionLabel" as any)}
          </label>
          <select
            value={f.transactionType}
            onChange={(e) =>
              props.setFilters({ ...f, transactionType: e.target.value as any })
            }
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
            onChange={(e) => props.setFilters({ ...f, propertyType: e.target.value })}
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
              onChange={(e) => props.setFilters({ ...f, locationText: e.target.value })}
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
            onChange={(e) => props.setFilters({ ...f, city: e.target.value })}
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
            onChange={(e) => props.setFilters({ ...f, district: e.target.value })}
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
            onChange={(e) => props.setFilters({ ...f, minPrice: e.target.value })}
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
            onChange={(e) => props.setFilters({ ...f, maxPrice: e.target.value })}
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
            onChange={(e) => props.setFilters({ ...f, minArea: e.target.value })}
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
            onChange={(e) => props.setFilters({ ...f, maxArea: e.target.value })}
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
            onChange={(e) => props.setFilters({ ...f, rooms: e.target.value })}
            placeholder={t(lang, "everybotRoomsPlaceholder" as any)}
            className={inputCls}
          />
        </div>
      </div>

      {/* Search button under the search panel */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={loading}
          onClick={props.onSearch}
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
