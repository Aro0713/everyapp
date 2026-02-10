import { useEffect, useMemo, useState } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

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
  external_id: string;
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
  const [botQ, setBotQ] = useState("");
  const [botSource, setBotSource] = useState("all");
  const [botLoading, setBotLoading] = useState(false);
  const [botErr, setBotErr] = useState<string | null>(null);
  const [botRows, setBotRows] = useState<ExternalRow[]>([]);
  const [botCursor, setBotCursor] = useState<string | null>(null);
  const [botHasMore, setBotHasMore] = useState(false);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

async function loadEverybot(opts?: {
  q?: string;
  source?: string;
  cursor?: string | null;
  append?: boolean;
}) {
  const q = (opts?.q ?? botQ).trim();
  const source = opts?.source ?? botSource;
  const cursor = opts?.cursor ?? null;
  const append = !!opts?.append;

  setBotLoading(true);
  setBotErr(null);

  try {
    const r = await fetch("/api/everybot/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q,
        source: source === "all" ? null : source,
        cursor,
      }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

    const newRows = (j?.rows ?? []) as ExternalRow[];
    const nextCursor = (j?.nextCursor ?? null) as string | null;

    setBotRows((prev) => (append ? [...prev, ...newRows] : newRows));
    setBotCursor(nextCursor);
    setBotHasMore(!!nextCursor);
  } catch (e: any) {
    setBotErr(e?.message ?? "Failed to load");
  } finally {
    setBotLoading(false);
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
                else loadEverybot({ source: botSource, q: botQ, cursor: null, append: false });
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
            loadEverybot({ source: botSource, q: botQ, cursor: null, append: false });
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
              <div className="overflow-x-auto">
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-ew-primary">{t(lang, "everybotTitle" as any)}</h3>
                <p className="mt-1 text-sm text-gray-500">{t(lang, "everybotSub" as any)}</p>
              </div>
            </div>

            {/* Import link */}
            <div className="mt-4 grid gap-3 md:grid-cols-12">
              <div className="md:col-span-9">
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder={t(lang, "everybotSearchPlaceholder" as any)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  type="button"
                  disabled={importing || !importUrl.trim()}
                  onClick={importLink}
                  className={clsx(
                    "w-full rounded-2xl px-4 py-3 text-sm font-extrabold shadow-sm transition",
                    importing || !importUrl.trim()
                      ? "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400"
                      : "bg-ew-accent text-ew-primary hover:opacity-95"
                  )}
                >
                  {importing ? "…" : t(lang, "everybotSaveLinkBtn" as any)}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="mt-3 grid gap-3 md:grid-cols-12">
            <div className="md:col-span-8">
                <input
                value={botQ}
                onChange={(e) => setBotQ(e.target.value)}
                placeholder={t(lang, "everybotFilterPlaceholder" as any)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                />
            </div>

            <div className="md:col-span-4">
                <select
                value={botSource}
                onChange={(e) => {
                    const v = e.target.value;
                    setBotSource(v);
                    
                }}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                >
                <option value="all">{t(lang, "everybotSourceAll" as any)}</option>
                <option value="otodom">Otodom</option>
                <option value="olx">OLX</option>
                <option value="no">Nieruchomosci-online</option>
                <option value="owner">{t(lang, "everybotSourceOwner" as any)}</option>
                <option value="other">Other</option>
                </select>
            </div>

            </div>

            <div className="mt-3 flex justify-end">
            <button
            type="button"
            disabled={botLoading}
            onClick={() =>
                loadEverybot({ source: botSource, q: botQ, cursor: null, append: false })
            }
            className={clsx(
                "rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition",
                botLoading
                ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                : "border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10"
            )}
            >
            {t(lang, "everybotSearchBtn" as any)}
            </button>
            </div>

                        {/* Results */}
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white">
            {botLoading && botRows.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">{t(lang, "everybotLoading" as any)}</div>
            ) : botErr ? (
                <div className="p-4 text-sm text-red-700">
                {t(lang, "everybotLoadError" as any)}: {botErr}
                </div>
            ) : botRows.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-2xl bg-ew-accent/5">
                <p className="text-sm text-gray-500">{t(lang, "everybotEmpty" as any)}</p>
                </div>
            ) : (
                <>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                    <thead className="text-xs text-gray-500">
                        <tr>
                        <th className="px-4 py-3">{t(lang, "everybotColActions" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColInfo" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColPhoto" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColTitle" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColOwnerPhone" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColPortal" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColMatchedAt" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColPropertyType" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColTransactionType" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColPrice" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColArea" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColPricePerM2" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColRooms" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColFloor" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColYearBuilt" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColVoivodeship" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColCity" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColDistrict" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColStreet" as any)}</th>
                        <th className="px-4 py-3">{t(lang, "everybotColLink" as any)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {botRows.map((r) => (
                            <tr key={r.external_id} className="border-t border-gray-100">
                            <td className="px-4 py-3">
                                {/* TODO: checkbox / "Zapisz" / "Dodaj do CRM" */}
                                <span className="text-xs text-gray-400">-</span>
                            </td>

                            <td className="px-4 py-3">
                                <span className="text-xs text-gray-500">{r.status}</span>
                            </td>

                            <td className="px-4 py-3">
                                {r.thumb_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={r.thumb_url}
                                    alt=""
                                    className="h-10 w-14 rounded-lg object-cover ring-1 ring-gray-200"
                                />
                                ) : (
                                <div className="h-10 w-14 rounded-lg bg-gray-100 ring-1 ring-gray-200" />
                                )}
                            </td>

                            <td className="px-4 py-3 font-semibold text-ew-primary">{r.title ?? "-"}</td>
                            <td className="px-4 py-3">{r.owner_phone ?? "-"}</td>
                            <td className="px-4 py-3">{r.source}</td>
                            <td className="px-4 py-3">
                                {r.matched_at ? new Date(r.matched_at).toLocaleDateString() : "-"}
                            </td>
                            <td className="px-4 py-3">{r.property_type ?? "-"}</td>
                            <td className="px-4 py-3">{r.transaction_type ?? "-"}</td>

                            <td className="px-4 py-3">{fmtPrice(r.price_amount, r.currency)}</td>
                            <td className="px-4 py-3">{r.area_m2 ? `${r.area_m2}` : "-"}</td>
                            <td className="px-4 py-3">
                                {r.price_per_m2
                                ? `${Math.round(r.price_per_m2).toLocaleString()} ${r.currency ?? ""}`.trim()
                                : "-"}
                            </td>
                            <td className="px-4 py-3">{r.rooms ?? "-"}</td>
                            <td className="px-4 py-3">{r.floor ?? "-"}</td>
                            <td className="px-4 py-3">{r.year_built ?? "-"}</td>
                            <td className="px-4 py-3">{r.voivodeship ?? "-"}</td>
                            <td className="px-4 py-3">{r.city ?? "-"}</td>
                            <td className="px-4 py-3">{r.district ?? "-"}</td>
                            <td className="px-4 py-3">{r.street ?? "-"}</td>

                            <td className="px-4 py-3">
                                {isHttpUrl(r.source_url) ? (
                                <a
                                    href={r.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-ew-accent underline underline-offset-2"
                                >
                                    {t(lang, "everybotOpen" as any)}
                                </a>
                                ) : (
                                <span className="text-xs text-gray-400">—</span>
                                )}
                            </td>
                            </tr>
                        ))}
                        </tbody>

                    
                    </table>
                </div>
                {/* Load more */}
                {botHasMore && (
                    <div className="flex justify-center border-t border-gray-100 p-4">
                    <button
                        type="button"
                        disabled={botLoading}
                        onClick={() =>
                        loadEverybot({
                            source: botSource,
                            q: botQ,
                            cursor: botCursor,
                            append: true,
                        })
                        }
                        className={clsx(
                        "rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition",
                        botLoading
                            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            : "border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10"
                        )}
                    >
                        {t(lang, "everybotLoadMore" as any)}
                    </button>
                    </div>
                )}

                {/* Inline loading indicator for next page */}
                {botLoading && botRows.length > 0 && (
                    <div className="border-t border-gray-100 p-4 text-center text-xs text-gray-500">
                    {t(lang, "everybotLoading" as any)}
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
