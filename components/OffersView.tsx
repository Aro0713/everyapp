import { useEffect, useMemo, useState } from "react";
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

export default function OffersView({ lang }: { lang: LangKey }) {
  const [tab, setTab] = useState<OffersTab>("office");

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
  const [botCursor, setBotCursor] = useState<{
  updated_at: string;
  id: string;
} | null>(null);

  const [botHasMore, setBotHasMore] = useState(false);

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
}): Promise<{ rows: ExternalRow[]; nextCursor: { updated_at: string; id: string } | null }> {

  const f = opts?.filters ?? botFilters;
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

    if (q) qs.set("q", q);
    if (source && source !== "all") qs.set("source", String(source));

    // ✅ NOWE FILTRY (z panelu)
    if (f.transactionType) qs.set("transactionType", f.transactionType);
    function normalizePropertyTypeForDb(v: string) {
      const s = v.trim().toLowerCase();
      if (!s) return "";
      if (s.includes("dom")) return "house";
      if (s.includes("mieszkan")) return "apartment";
      if (s.includes("działk") || s.includes("dzialk") || s.includes("grunt")) return "plot";
      if (s.includes("lokal") || s.includes("biur") || s.includes("komerc")) return "commercial";
      return s;
    }

    const pt = normalizePropertyTypeForDb(f.propertyType);
    if (pt) qs.set("propertyType", pt);
    if (f.voivodeship.trim()) qs.set("voivodeship", f.voivodeship.trim());
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
    const qs = new URLSearchParams();
    qs.set("limit", "50");
    qs.set("includeInactive", "1");
    qs.set("includePreview", "0"); // bo wycinasz preview przy filtrach
    qs.set("onlyEnriched", "1");   // pokaż tylko enriched/active
    qs.set("sinceMinutes", "30");  // tylko świeże (dopasuj)

    // jeśli masz source/filter w stanie – dodaj je
    if (botFilters?.source && botFilters.source !== "all") qs.set("source", botFilters.source);

    // ważne: do list.ts wysyłasz filtry z panelu (tak jak robisz teraz)
    if (botFilters?.transactionType) qs.set("transactionType", botFilters.transactionType);
    if (botFilters?.propertyType) qs.set("propertyType", botFilters.propertyType);
    if (botFilters?.locationText) qs.set("locationText", botFilters.locationText);
    if (botFilters?.city) qs.set("city", botFilters.city);
    if (botFilters?.district) qs.set("district", botFilters.district);
    if (botFilters?.voivodeship) qs.set("voivodeship", botFilters.voivodeship);
    if (botFilters?.street) qs.set("street", botFilters.street);
    if (botFilters?.minPrice != null) qs.set("minPrice", String(botFilters.minPrice));
    if (botFilters?.maxPrice != null) qs.set("maxPrice", String(botFilters.maxPrice));
    if (botFilters?.minArea != null) qs.set("minArea", String(botFilters.minArea));
    if (botFilters?.maxArea != null) qs.set("maxArea", String(botFilters.maxArea));
    if (botFilters?.rooms != null) qs.set("rooms", String(botFilters.rooms));

    // q jako fallback/phrase
    if (botFilters?.q) qs.set("q", botFilters.q);

    const r = await fetch(`/api/external_listings/list?${qs.toString()}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? "List error");

    setBotRows(Array.isArray(j?.rows) ? j.rows : []);
    setBotHasMore(Boolean(j?.nextCursor)); // jeśli używasz cursor
  } catch (e: any) {
    // nie spamuj errorami podczas polling
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

  const empty = !loading && rows.length === 0 && !err;

  const botEmpty = !botLoading && botRows.length === 0 && !botErr;
function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}
async function runLiveHunter(filtersOverride?: typeof botFilters) {
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

  setBotLoading(true);
  setBotErr(null);

  try {
    const r = await fetch("/api/everybot/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `RUN HTTP ${r.status}`);

    await loadEverybot({ filters, cursor: null, append: false });
  } catch (e: any) {
    setBotErr(e?.message ?? "Live hunter failed");
  } finally {
    setBotLoading(false);
  }
}

async function searchEverybotWithFallback(filtersOverride?: typeof botFilters) {
  const filters = filtersOverride ?? botFilters;

  // 1) Najpierw cache (Neon)
  const r1 = await loadEverybot({ filters, cursor: null, append: false });

  // 2) Jeśli brak wyników w cache → odpal LiveHunter i po nim odśwież cache
  if (!r1.rows || r1.rows.length === 0) {
    await runLiveHunter(filters);
  }
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
                if (tab === "office") load();
                else runLiveHunter();

              }}
            >
              {t(lang, "offersRefresh" as any)}
            </button>

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
          searchEverybotWithFallback(botFilters);
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
              <div className="w-full overflow-x-auto">
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
              setBotCursor(null);
              setBotHasMore(false);
            }}
            onSearch={async (filters) => {
              await searchEverybotWithFallback(filters);
              await new Promise((r) => setTimeout(r, 1000));
              await refreshEverybotList();
              // ✅ auto-refresh co 5s przez 90s (18 prób)
              let ticks = 0;
              const id = window.setInterval(async () => {
                ticks += 1;
                await refreshEverybotList();
                if (ticks >= 18) window.clearInterval(id);
              }, 5000);
            }}

          />
            {/* Results */}
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

                <div className="w-full overflow-x-auto">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="text-xs text-gray-500">
                      <tr>
                      <th className="px-4 py-3 w-20">{t(lang, "everybotColPhoto" as any)}</th>

                      {/* ✅ NOWA KOLUMNA */}
                      <th className="px-4 py-3 w-28">{t(lang, "everybotColActions" as any)}</th>

                      <th className="px-4 py-3 w-64">{t(lang, "everybotColTitle" as any)}</th>
                      <th className="px-4 py-3 w-20">{t(lang, "everybotColPortal" as any)}</th>
                      <th className="px-4 py-3 w-28">{t(lang, "everybotColMatchedAt" as any)}</th>
                      <th className="px-4 py-3 w-20">{t(lang, "everybotColTransactionType" as any)}</th>
                      <th className="px-4 py-3 w-28">{t(lang, "everybotColPrice" as any)}</th>

                      <th className="px-4 py-3 w-20 hidden md:table-cell">{t(lang, "everybotColArea" as any)}</th>
                      <th className="px-4 py-3 w-24 hidden lg:table-cell">{t(lang, "everybotColPricePerM2" as any)}</th>

                      {/* ✅ zwężone */}
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
                                rel="noreferrer"
                                className="text-ew-accent underline underline-offset-2 text-xs"
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
                                "text-left text-xs font-semibold",
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
                          });
                        } else {
                          runLiveHunter();
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
