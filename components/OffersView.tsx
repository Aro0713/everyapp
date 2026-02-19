import { useEffect, useMemo, useState, useRef } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import EverybotSearchPanel, {
  type EverybotFilters,
  type EverybotSource,
} from "@/components/EverybotSearchPanel";


type ListingRow = {
  listing_id: string;
  office_id: string;
  record_type: "offer" | "search";
  transaction_type: "sale" | "rent";
  status: "draft" | "active" | "closed" | "archived";
  created_at: string;
  case_owner_name: string | null;
  parties_summary: string | null;
};

type OffersTab = "office" | "everybot";

type ExternalRow = {
  id: string;
  external_id?: string; // zostaw opcjonalnie na przyszłość
  office_id: string | null;
  source: string;
  source_url: string;
  title: string | null;
  price_amount: string | number | null;
  currency: string | null;
  location_text: string | null;
  status: string;
  imported_at: string;
  updated_at: string;
  thumb_url: string | null;
  lat?: number | null;
  lng?: number | null;
  rcn_last_price?: number | null;
  rcn_last_date?: string | null;
  rcn_link?: string | null;


  // NOWE kolumny (Esti-like)
  owner_phone?: string | null;
  matched_at?: string | null;
  property_type?: string | null;
  transaction_type?: "sale" | "rent" | null;
  area_m2?: number | null;
  price_per_m2?: number | null;
  rooms?: number | null;
  floor?: string | null;
  year_built?: number | null;
  voivodeship?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
};


function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtPrice(v: ExternalRow["price_amount"], currency?: string | null) {
  if (v === null || v === undefined || v === "") return "-";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString()} ${currency ?? ""}`.trim();
}
function normalizeVoivodeshipInput(v?: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  return s
    .replace(/^wojew[oó]dztwo\s+/i, "")
    .replace(/^woj\.?\s+/i, "")
    .trim() || null;
}

export default function OffersView({ lang }: { lang: LangKey }) {
 const searchIntervalRef = useRef<number | null>(null);
  const searchingRef = useRef(false);

  const officeTableRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<OffersTab>("office");
  const everybotTableRef = useRef<HTMLDivElement | null>(null);

  // --- Office listings ---
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/offers/list");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { rows: ListingRow[] };
      setRows(data.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // --- EveryBOT external ---
const [botFilters, setBotFilters] = useState<EverybotFilters>({
  q: "",
  source: "all" as EverybotSource,
  transactionType: "",
  propertyType: "",
  locationText: "",
  city: "",
  voivodeship: "",
  district: "",
  minPrice: "",
  maxPrice: "",
  minArea: "",
  maxArea: "",
  rooms: "",
});

  const [botLoading, setBotLoading] = useState(false);
  const [botErr, setBotErr] = useState<string | null>(null);
  const [botRows, setBotRows] = useState<ExternalRow[]>([]);
  const [botMatchedSince, setBotMatchedSince] = useState<string | null>(null);
  const [botCursor, setBotCursor] = useState<{
  updated_at: string;
  id: string;
} | null>(null);

  const [botHasMore, setBotHasMore] = useState(false);
  const [botSearching, setBotSearching] = useState(false);
  const [botSearchSeconds, setBotSearchSeconds] = useState(0);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
    // --- Save external listing (agent/office) ---
  const [saveMode, setSaveMode] = useState<"agent" | "office">("agent");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());

  async function saveExternalListing(
  externalListingId: string,
  action: "save" | "reject" | "call" | "visit"
  ) {

    if (!externalListingId) return;
    setSavingId(externalListingId);
    try {
      const r = await fetch("/api/external_listings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        external_listing_id: externalListingId,
        mode: saveMode,
        action,
      }),

      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setSavedIds((prev) => {
        const next = new Set(prev);
        next.add(externalListingId);
        return next;
      });
    } catch (e: any) {
      alert(`Nie udało się dodać ogłoszenia: ${e?.message ?? "Unknown error"}`);
    } finally {
      setSavingId(null);
    }
  }

async function loadEverybot(opts?: {
  filters?: typeof botFilters;
  cursor?: { updated_at: string; id: string } | null;
  append?: boolean;
  matchedSince?: string | null;
}): Promise<{ rows: ExternalRow[]; nextCursor: { updated_at: string; id: string } | null }> {

  const f = opts?.filters ?? botFilters;
  const matchedSince = opts?.matchedSince ?? null;
  const q = (f.q ?? "").trim();
  const source = f.source ?? "all";
  const cursor = opts?.cursor ?? null;
  const append = !!opts?.append;

  setBotLoading(true);
  setBotErr(null);

  try {
    const qs = new URLSearchParams();
    qs.set("limit", "50");
    qs.set("includeInactive", "1");
    qs.set("includePreview", "1");
    qs.set("onlyEnriched", "0");

    const hasStructuredFilters =
      f.propertyType?.trim() ||
      f.city?.trim() ||
      f.district?.trim();

    if (q && !hasStructuredFilters) {
      qs.set("q", q);
    }

    if (source && source !== "all") qs.set("source", String(source));
      if (matchedSince) qs.set("matchedSince", matchedSince);

    // ✅ NOWE FILTRY (z panelu)
    if (f.transactionType) qs.set("transactionType", f.transactionType);

    const rawPt = (f.propertyType ?? "").trim().toLowerCase();
    if (rawPt) {
      // wysyłamy to co user wpisał (dom/mieszkanie/działka/lokal)
      qs.set("propertyType", rawPt);
    }
    const vNorm = normalizeVoivodeshipInput(f.voivodeship);
    if (vNorm) qs.set("voivodeship", vNorm);
    if (f.city.trim()) qs.set("city", f.city.trim());
    if (f.district.trim()) qs.set("district", f.district.trim());

    // locationText tylko gdy user nie podał city/district (żeby nie zabijać wyników)
    const hasCityOrDistrict = !!(f.city.trim() || f.district.trim());
    if (!hasCityOrDistrict && f.locationText.trim()) {
      qs.set("locationText", f.locationText.trim());
    }

    if (f.minPrice.trim()) qs.set("minPrice", f.minPrice.trim());
    if (f.maxPrice.trim()) qs.set("maxPrice", f.maxPrice.trim());
    if (f.minArea.trim()) qs.set("minArea", f.minArea.trim());
    if (f.maxArea.trim()) qs.set("maxArea", f.maxArea.trim());
    if (f.rooms.trim()) qs.set("rooms", f.rooms.trim());

    // cursor
    if (cursor) {
      qs.set("cursorUpdatedAt", cursor.updated_at);
      qs.set("cursorId", cursor.id);
    }

    const r = await fetch(`/api/external_listings/list?${qs.toString()}`);
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

    const newRows = (j?.rows ?? []) as ExternalRow[];
    const nextCursor =
      (j?.nextCursor ?? null) as { updated_at: string; id: string } | null;

    setBotRows((prev) => (append ? [...prev, ...newRows] : newRows));
    setBotCursor(nextCursor);
    setBotHasMore(Boolean(nextCursor) && newRows.length > 0);
        return { rows: newRows, nextCursor };
  } 
  catch (e: any) {
    setBotErr(e?.message ?? "Failed to load");
    return { rows: [], nextCursor: null };
  } finally {
    setBotLoading(false);
  }
}
 async function refreshEverybotList() {
  try {
    const f = botFilters;

    const qs = new URLSearchParams();
    qs.set("limit", "50");
    qs.set("includeInactive", "1");
    qs.set("includePreview", "1");
    qs.set("onlyEnriched", "0");

    // source
    if (f.source && f.source !== "all") qs.set("source", String(f.source));

    // q tylko bez structured
    const hasStructuredFilters =
      !!f.propertyType?.trim() ||
      !!f.city?.trim() ||
      !!f.district?.trim();

    const q = (f.q ?? "").trim();
    if (q && !hasStructuredFilters) qs.set("q", q);

    // transaction
    if (f.transactionType?.trim()) qs.set("transactionType", f.transactionType.trim());

    // propertyType lowercase
    const rawPt = (f.propertyType ?? "").trim().toLowerCase();
    if (rawPt) qs.set("propertyType", rawPt);

    // region/city/district
    const vNorm = normalizeVoivodeshipInput(f.voivodeship);
    if (vNorm) qs.set("voivodeship", vNorm);
    if (f.city?.trim()) qs.set("city", f.city.trim());
    if (f.district?.trim()) qs.set("district", f.district.trim());

    // locationText tylko gdy brak city/district
    const hasCityOrDistrict = !!(f.city?.trim() || f.district?.trim());
    if (!hasCityOrDistrict && f.locationText?.trim()) {
      qs.set("locationText", f.locationText.trim());
    }

    // numeric – tylko gdy niepuste
    if (f.minPrice?.trim()) qs.set("minPrice", f.minPrice.trim());
    if (f.maxPrice?.trim()) qs.set("maxPrice", f.maxPrice.trim());
    if (f.minArea?.trim()) qs.set("minArea", f.minArea.trim());
    if (f.maxArea?.trim()) qs.set("maxArea", f.maxArea.trim());
    if (f.rooms?.trim()) qs.set("rooms", f.rooms.trim());

    const r = await fetch(`/api/external_listings/list?${qs.toString()}`);
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? "List error");

    const scrollLeft = everybotTableRef.current?.scrollLeft ?? 0;

    setBotRows(Array.isArray(j?.rows) ? j.rows : []);
    setBotHasMore(Boolean(j?.nextCursor));
    setBotCursor(j?.nextCursor ?? null);

    requestAnimationFrame(() => {
      if (everybotTableRef.current) everybotTableRef.current.scrollLeft = scrollLeft;
    });
  } catch (e: any) {
    console.warn("everybot refresh failed:", e?.message ?? e);
  }
}


  async function importLink() {
    const url = importUrl.trim();
    if (!url) return;

    setImporting(true);
    try {
      const r = await fetch("/api/everybot/import-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }

      setImportUrl("");
      // odśwież EveryBOT listę
      await loadEverybot();
    } catch (e: any) {
      alert(`Nie udało się zapisać linku: ${e?.message ?? "Unknown error"}`);
    } finally {
      setImporting(false);
    }
  }

    useEffect(() => {
      load();
    }, []);
    useEffect(() => {
    return () => {
      if (searchIntervalRef.current) {
        window.clearInterval(searchIntervalRef.current);
        searchIntervalRef.current = null;
      }
    };
  }, []);
  
  useEffect(() => {
  const el = everybotTableRef.current;
  if (!el) return;

  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;

  const onMouseDown = (e: MouseEvent) => {
    // ignoruj klik w linki / przyciski
    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;

    isDown = true;
    startX = e.pageX;
    startScrollLeft = el.scrollLeft;
    el.style.cursor = "grabbing";
  };

  const onMouseUp = () => {
    isDown = false;
    el.style.cursor = "grab";
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDown) return;
    e.preventDefault();
    const walk = (e.pageX - startX) * 1.2;
    el.scrollLeft = startScrollLeft - walk;
  };

  el.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMouseMove);

  return () => {
    el.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("mousemove", onMouseMove);
  };
}, []);
useEffect(() => {
  if (tab !== "everybot") return;

  const tick = async () => {
    if (botSearching) return;
    if (botMatchedSince) return; // 🔥 nie dotykaj Neon listy, gdy aktywny LIVE run
    if (document.visibilityState !== "visible") return;

    await refreshEverybotList();
  };

  const timer = window.setInterval(tick, 20000);

  const onVis = () => {
    if (document.visibilityState === "visible") tick();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVis);
  };
}, [tab, botSearching, botMatchedSince]);

  const empty = !loading && rows.length === 0 && !err;

  const botEmpty = !botLoading && botRows.length === 0 && !botErr;
function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}
async function runLiveHunter(
  filtersOverride?: typeof botFilters,
  runTs?: string
) {
  const raw = filtersOverride ?? botFilters;

  const filters = {
    ...raw,
    q: (raw.q ?? "").trim(),
    voivodeship: (raw.voivodeship ?? "").trim(),
    propertyType: (raw.propertyType ?? "").trim(),
    city: (raw.city ?? "").trim(),
    district: (raw.district ?? "").trim(),
    locationText: (raw.locationText ?? "").trim(),
    minPrice: (raw.minPrice ?? "").trim(),
    maxPrice: (raw.maxPrice ?? "").trim(),
    minArea: (raw.minArea ?? "").trim(),
    maxArea: (raw.maxArea ?? "").trim(),
    rooms: (raw.rooms ?? "").trim(),
  };

  function inferPropertyTypeFromQ(
    q: string
  ): "" | "house" | "apartment" | "plot" | "commercial" {
    const s = q.toLowerCase();
    if (s.includes("dom")) return "house";
    if (s.includes("mieszkan")) return "apartment";
    if (s.includes("działk") || s.includes("dzialk") || s.includes("grunt")) return "plot";
    if (s.includes("lokal") || s.includes("biur") || s.includes("komerc")) return "commercial";
    return "";
  }

  if (!filters.propertyType && filters.q) {
    const inferred = inferPropertyTypeFromQ(filters.q);
    if (inferred) filters.propertyType = inferred;
  }

  const effectiveRunTs = (runTs ?? new Date().toISOString()).trim();
  setBotMatchedSince(effectiveRunTs);

  setBotLoading(true);
  setBotErr(null);

  try {
    const r = await fetch("/api/everybot/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, runTs: effectiveRunTs }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `RUN HTTP ${r.status}`);

    await loadEverybot({
      filters,
      cursor: null,
      append: false,
      matchedSince: effectiveRunTs,
    });
  } catch (e: any) {
    setBotErr(e?.message ?? "Live hunter failed");
  } finally {
    setBotLoading(false);
  }
}

async function searchEverybotWithFallback(filtersOverride?: typeof botFilters) {
  const filters = filtersOverride ?? botFilters;

  // 🔴 zatrzymaj ewentualny live timer
  if (searchIntervalRef.current) {
    window.clearInterval(searchIntervalRef.current);
    searchIntervalRef.current = null;
  }
  searchingRef.current = false;

  setBotSearching(false);
  setBotSearchSeconds(0);

  // ✅ wracamy do czystego Neon (bez matchedSince)
  setBotMatchedSince(null);
  setBotCursor(null);
  setBotHasMore(false);

  await loadEverybot({
    filters,
    cursor: null,
    append: false,
    matchedSince: null,
  });
}
async function runGeocodeBatch() {
  const r = await fetch("/api/everybot/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 50 }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  await refreshEverybotList();
  return j;
}

async function runRcnBatch() {
  const r = await fetch("/api/everybot/rcn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 50, radiusMeters: 250 }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  await refreshEverybotList();
  return j;
}


  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-ew-primary">
              {t(lang, "offersTitle" as any)}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {t(lang, "offersSub" as any)}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm transition hover:bg-ew-accent/10"
              onClick={() => {
              if (tab === "office") {
                load();
              } else {
                // ✅ EveryBOT refresh = tylko Neon
                setBotSearching(false);
                setBotSearchSeconds(0);
                if (searchIntervalRef.current) {
                  window.clearInterval(searchIntervalRef.current);
                  searchIntervalRef.current = null;
                }
                searchingRef.current = false;

                setBotMatchedSince(null);
                loadEverybot({ filters: botFilters, cursor: null, append: false, matchedSince: null });
              }
            }}
            >
              {t(lang, "offersRefresh" as any)}
            </button>
            {tab === "everybot" && (
              <>
                <button
                  type="button"
                  disabled={botLoading}
                  className={clsx(
                    "rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition",
                    botLoading
                      ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                      : "border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10"
                  )}
                  onClick={async () => {
                    try { await runGeocodeBatch(); }
                    catch (e: any) { alert(`Geocode failed: ${e?.message ?? e}`); }
                  }}
                >
                  🌍 Geocode 50
                </button>

                <button
                  type="button"
                  disabled={botLoading}
                  className={clsx(
                    "rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition",
                    botLoading
                      ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                      : "border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10"
                  )}
                  onClick={async () => {
                    try { await runRcnBatch(); }
                    catch (e: any) { alert(`RCN failed: ${e?.message ?? e}`); }
                  }}
                >
                  🧾 RCN 50
                </button>
              </>
            )}

            <button
              type="button"
              className="rounded-2xl bg-ew-accent px-4 py-2 text-sm font-extrabold text-ew-primary shadow-sm transition hover:opacity-95"
              onClick={async () => {
                try {
                  const r = await fetch("/api/offers/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      recordType: "offer",
                      transactionType: "sale",
                      status: "draft",
                    }),
                  });

                  if (!r.ok) {
                    const j = await r.json().catch(() => null);
                    throw new Error(j?.error ?? `HTTP ${r.status}`);
                  }

                  await load();
                  setTab("office");
                } catch (e: any) {
                  alert(`Nie udało się utworzyć oferty: ${e?.message ?? "Unknown error"}`);
                }
              }}
            >
              + {t(lang, "offersNew" as any)}
            </button>

            <button
              type="button"
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm transition hover:bg-ew-accent/10"
              onClick={() => alert("TODO: import z portali (biuro → portale)")}
            >
              {t(lang, "offersImport" as any)}
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={clsx(
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
              tab === "office"
                ? "border-ew-accent bg-ew-accent/10 text-ew-primary"
                : "border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10"
            )}
            onClick={() => setTab("office")}
          >
            {t(lang, "offersTabOffice" as any)}
          </button>

          <button
            type="button"
            className={clsx(
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
              tab === "everybot"
                ? "border-ew-accent bg-ew-accent/10 text-ew-primary"
                : "border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10"
            )}
              onClick={() => {
                setTab("everybot");
                setBotCursor(null);
                setBotHasMore(false);

                // 🔴 zatrzymaj pasek wyszukiwania
                setBotSearching(false);
                setBotSearchSeconds(0);

                if (searchIntervalRef.current) {
                  window.clearInterval(searchIntervalRef.current);
                  searchIntervalRef.current = null;
                }
                searchingRef.current = false;

                // 🟢 tylko Neon (bez live)
                setBotMatchedSince(null);
                loadEverybot({
                  filters: botFilters,
                  cursor: null,
                  append: false,
                  matchedSince: null,
                });
              }}
                >
            🤖 {t(lang, "offersTabEverybot" as any)}
          </button>
        </div>
      </div>

      {/* CONTENT */}
      {tab === "office" ? (
        <>
          {/* LISTA OFERT */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            {loading ? (
              <div className="text-sm text-gray-500">{t(lang, "offersLoading" as any)}</div>
            ) : err ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {t(lang, "offersLoadError" as any)}: {err}
              </div>
            ) : empty ? (
              <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-ew-accent/5">
                <p className="text-sm text-gray-500">{t(lang, "offersEmpty" as any)}</p>
              </div>
            ) : (
              <div
                  ref={officeTableRef}
                  className="w-full overflow-x-auto max-h-[70vh] overflow-y-auto"
                >
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-gray-500">
                    <tr>
                      <th className="py-3 pr-4">{t(lang, "offersColType" as any)}</th>
                      <th className="py-3 pr-4">{t(lang, "offersColTxn" as any)}</th>
                      <th className="py-3 pr-4">{t(lang, "offersColParties" as any)}</th>
                      <th className="py-3 pr-4">{t(lang, "offersColOwner" as any)}</th>
                      <th className="py-3 pr-4">{t(lang, "offersColStatus" as any)}</th>
                      <th className="py-3 pr-0">{t(lang, "offersColCreated" as any)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.listing_id} className="border-t border-gray-100">
                        <td className="py-4 pr-4 font-semibold text-ew-primary">{r.record_type}</td>
                        <td className="py-4 pr-4">{r.transaction_type}</td>
                        <td className="py-4 pr-4">{r.parties_summary ?? "-"}</td>
                        <td className="py-4 pr-4">{r.case_owner_name ?? "-"}</td>
                        <td className="py-4 pr-4">
                          <span className="rounded-full bg-ew-accent/15 px-3 py-1 text-xs font-semibold text-ew-accent">
                            {r.status}
                          </span>
                        </td>
                        <td className="py-4 pr-0 text-gray-500">{new Date(r.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* IMPORT INFO */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-extrabold text-ew-primary">{t(lang, "offersImportTitle" as any)}</h3>
            <p className="mt-1 text-sm text-gray-500">{t(lang, "offersImportDesc" as any)}</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>{t(lang, "offersImportHint1" as any)}</li>
              <li>{t(lang, "offersImportHint2" as any)}</li>
              <li>{t(lang, "offersImportHint3" as any)}</li>
            </ul>
          </div>
        </>
      ) : (
        <>
          {/* EVERYBOT PANEL */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <EverybotSearchPanel
            lang={lang}
            loading={botLoading}
            importUrl={importUrl}
            setImportUrl={setImportUrl}
            importing={importing}
            onImportLink={importLink}
            saveMode={saveMode}
            setSaveMode={setSaveMode}
            filters={botFilters}
            setFilters={(next) => {
            setBotFilters(next);
            }}
            onSearch={async (filters) => {
              const hasRealFilters =
                !!filters.q?.trim() ||
                !!filters.transactionType?.trim() ||
                !!filters.propertyType?.trim() ||
                !!filters.voivodeship?.trim() ||
                !!filters.city?.trim() ||
                !!filters.district?.trim() ||
                !!filters.locationText?.trim() ||
                !!filters.minPrice?.trim() ||
                !!filters.maxPrice?.trim() ||
                !!filters.minArea?.trim() ||
                !!filters.maxArea?.trim() ||
                !!filters.rooms?.trim();

              // brak filtrów => tylko Neon
              if (!hasRealFilters) {
                setBotSearching(false);
                setBotSearchSeconds(0);
                setBotMatchedSince(null);

                await loadEverybot({
                  filters,
                  cursor: null,
                  append: false,
                  matchedSince: null,
                });
                return;
              }

              // są filtry => LIVE
              const runTs = new Date().toISOString();
              setBotMatchedSince(runTs);

              // ubij poprzedni interval (na wszelki)
              if (searchIntervalRef.current) {
                window.clearInterval(searchIntervalRef.current);
                searchIntervalRef.current = null;
              }
              searchingRef.current = true;

              setBotSearching(true);
              setBotSearchSeconds(0);

              // 1) run
              await runLiveHunter(filters, runTs);

              // 2) jeden deterministyczny odczyt (TEN run)
              await loadEverybot({
                filters,
                cursor: null,
                append: false,
                matchedSince: runTs,
              });

              // 3) stop paska natychmiast (run zakończony)
              searchingRef.current = false;
              setBotSearching(false);
            }}

          />
                {/* Results */}
              {botSearching && (
              <div className="mb-4">
                <div className="mb-2 text-sm font-semibold text-ew-primary">
                  🔄 {t(lang, "everybotSearching" as any)}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ew-accent/20">
                  <div className="h-full w-full animate-pulse bg-ew-accent transition-all duration-300" />
                </div>
              </div>
            )}
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white">
              {botLoading && botRows.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  {t(lang, "everybotLoading" as any)}
                </div>
              ) : botErr ? (
                <div className="p-4 text-sm text-red-700">
                  {t(lang, "everybotLoadError" as any)}: {botErr}
                </div>
              ) : botRows.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-2xl bg-ew-accent/5">
                  <p className="text-sm text-gray-500">
                    {t(lang, "everybotEmpty" as any)}
                  </p>
                </div>
              ) : (
                <>

                  <div
                    ref={everybotTableRef}
                    className="w-full overflow-x-auto touch-pan-x cursor-grab active:cursor-grabbing"
                  >
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="text-xs text-gray-500">
                        <tr>
                          <th className="px-4 py-3 w-20">{t(lang, "everybotColPhoto" as any)}</th>
                          <th className="px-4 py-3 w-28">{t(lang, "everybotColActions" as any)}</th>
                          <th className="px-4 py-3 w-64">{t(lang, "everybotColTitle" as any)}</th>
                          <th className="px-4 py-3 w-20">{t(lang, "everybotColPortal" as any)}</th>
                          <th className="px-4 py-3 w-28">{t(lang, "everybotColMatchedAt" as any)}</th>
                          <th className="px-4 py-3 w-20">{t(lang, "everybotColTransactionType" as any)}</th>
                          <th className="px-4 py-3 w-28">{t(lang, "everybotColPrice" as any)}</th>
                          <th className="px-4 py-3 w-32 hidden lg:table-cell">RCN</th>
                          <th className="px-4 py-3 w-24 hidden lg:table-cell">Geoportal</th>

                          <th className="px-4 py-3 w-20 hidden md:table-cell">{t(lang, "everybotColArea" as any)}</th>
                          <th className="px-4 py-3 w-24 hidden lg:table-cell">{t(lang, "everybotColPricePerM2" as any)}</th>

                          <th className="px-4 py-3 w-14 hidden md:table-cell">{t(lang, "everybotColRooms" as any)}</th>
                          <th className="px-4 py-3 w-14 hidden lg:table-cell">{t(lang, "everybotColFloor" as any)}</th>
                          <th className="px-4 py-3 w-16 hidden xl:table-cell">{t(lang, "everybotColYearBuilt" as any)}</th>

                          <th className="px-4 py-3 w-32 hidden xl:table-cell">{t(lang, "everybotColVoivodeship" as any)}</th>
                          <th className="px-4 py-3 w-28 hidden lg:table-cell">{t(lang, "everybotColCity" as any)}</th>
                          <th className="px-4 py-3 w-28 hidden xl:table-cell">{t(lang, "everybotColDistrict" as any)}</th>
                          <th className="px-4 py-3 w-40 hidden xl:table-cell">{t(lang, "everybotColStreet" as any)}</th>
                        </tr>
                      </thead>

                      <tbody>
                        {botRows.map((r) => (
                          <tr key={r.id} className="border-t border-gray-100">
                  
                       {/* Zdjęcie */}
                        <td className="px-4 py-3 w-20">
                          {r.thumb_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.thumb_url}
                              alt=""
                              className="h-10 w-14 rounded-lg object-cover ring-1 ring-gray-200"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-10 w-14 rounded-lg bg-gray-100 ring-1 ring-gray-200" />
                          )}
                        </td>

                        {/* Akcje */}
                        <td className="px-4 py-3 w-28">
                          <div className="flex flex-col gap-1">
                            {isHttpUrl(r.source_url) ? (
                              <a
                                href={r.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-ew-accent underline underline-offset-2 text-xs whitespace-nowrap"
                              >
                                {t(lang, "everybotOpen" as any)}
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}

                            <button
                              type="button"
                              disabled={savingId === r.id || savedIds.has(r.id)}
                              onClick={() => saveExternalListing(r.id, "save")}
                              className={clsx(
                              "text-left text-xs font-semibold whitespace-nowrap",
                                savedIds.has(r.id)
                                  ? "text-gray-400 cursor-not-allowed"
                                  : savingId === r.id
                                  ? "text-gray-400 cursor-wait"
                                  : "text-ew-primary hover:underline"
                              )}
                              title={
                                saveMode === "agent"
                                  ? t(lang, "everybotAddToAgent" as any)
                                  : t(lang, "everybotAddToOffice" as any)
                              }
                            >
                              {savedIds.has(r.id)
                                ? t(lang, "everybotActionSaved" as any)
                                : savingId === r.id
                                ? t(lang, "everybotActionSaving" as any)
                                : t(lang, "everybotActionSave" as any)}
                            </button>
                          </div>
                        </td>

                          {/* Tytuł */}
                          <td className="px-4 py-3 font-semibold text-ew-primary">
                            <div className="truncate">{r.title ?? "-"}</div>
                            <div className="mt-1">
                              {r.status === "preview" && (
                                <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                                  {t(lang, "everybotStatusPreview" as any)}
                                </span>
                              )}

                              {(r.status === "enriched" || r.status === "active") && (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                                  {t(lang, "everybotStatusOk" as any)}
                                </span>
                              )}

                              {r.status === "error" && (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                                  {t(lang, "everybotStatusError" as any)}
                                </span>
                              )}

                              {!["preview", "enriched", "active", "error"].includes(String(r.status)) && (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                                  {String(r.status)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Portal */}
                          <td className="px-4 py-3">{r.source}</td>

                          {/* Data */}
                          <td className="px-4 py-3">
                            {r.matched_at ? new Date(r.matched_at).toLocaleDateString() : "-"}
                          </td>

                          {/* Transakcja */}
                          <td className="px-4 py-3">{r.transaction_type ?? "-"}</td>

                          {/* Cena */}
                          <td className="px-4 py-3">{fmtPrice(r.price_amount, r.currency)}</td>
                          {/* RCN */}
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {r.rcn_last_price != null
                                ? `${Number(r.rcn_last_price).toLocaleString()} PLN${r.rcn_last_date ? ` (${r.rcn_last_date})` : ""}`
                                : "-"}
                            </td>

                            {/* Geoportal link */}
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {r.rcn_link ? (
                                <a
                                  href={r.rcn_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-ew-accent underline underline-offset-2 text-xs"
                                >
                                  Geoportal
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                          {/* Powierzchnia */}
                          <td className="px-4 py-3 hidden md:table-cell">
                            {r.area_m2 ? `${r.area_m2}` : "-"}
                          </td>

                          {/* Cena / m² */}
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {r.price_per_m2
                              ? `${Math.round(r.price_per_m2).toLocaleString()} ${r.currency ?? ""}`.trim()
                              : "-"}
                          </td>

                          {/* Pokoje */}
                          <td className="px-4 py-3 hidden md:table-cell">{r.rooms ?? "-"}</td>

                          {/* Piętro */}
                          <td className="px-4 py-3 hidden lg:table-cell">{r.floor ?? "-"}</td>

                          {/* Rok */}
                          <td className="px-4 py-3 hidden xl:table-cell">{r.year_built ?? "-"}</td>

                          {/* Województwo */}
                          <td className="px-4 py-3 hidden xl:table-cell">{r.voivodeship ?? "-"}</td>

                          {/* Miasto */}
                          <td className="px-4 py-3 hidden lg:table-cell">{r.city ?? "-"}</td>

                          {/* Dzielnica */}
                          <td className="px-4 py-3 hidden xl:table-cell">{r.district ?? "-"}</td>

                          {/* Ulica */}
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <div className="truncate">{r.street ?? "-"}</div>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Load more */}
                {(botCursor || botRows.length > 0) && (
                  <div className="flex justify-center border-t border-gray-100 p-4">
                    <button
                      type="button"
                      disabled={botLoading}
                      onClick={() => {
                      if (botCursor) {
                        loadEverybot({
                          filters: botFilters,
                          cursor: botCursor,
                          append: true,
                          matchedSince: botMatchedSince,
                        });
                      } else {
                        // ✅ bez cursor = po prostu nie ma więcej z DB
                        // (albo możesz zrobić page-based, ale NIE live)
                        return;
                      }
                      }}

                      className={clsx(
                        "rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition",
                        botLoading
                          ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                          : botCursor
                          ? "border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10"
                          : "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
                      )}
                    >
                      {botCursor
                        ? t(lang, "everybotLoadMore" as any)
                        : t(lang, "everybotFetchMoreFromPortals" as any)}
                    </button>
                  </div>
                )}

                {/* Inline loading indicator for next page */}
                {botLoading && botRows.length > 0 && (
                <div className="border-t border-gray-100 p-4 flex justify-center">
                  <span className="animate-pulse rounded-xl bg-pink-100 px-4 py-2 text-sm font-semibold text-pink-600">
                    {t(lang, "everybotLoading" as any)}
                  </span>
                </div>
              )}
                </>
            )}
            </div>

            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold text-ew-primary">{t(lang, "everybotMvpNoteTitle" as any)}</p>
              <p className="mt-1 text-xs text-gray-500">{t(lang, "everybotMvpNoteDesc" as any)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
