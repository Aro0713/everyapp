import { useEffect, useMemo, useState } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

type DealParty = {
  party_id: string;
  full_name: string | null;
  role: string | null;
  is_primary: boolean | null;
};

type DealRow = {
  id: string;
  title: string | null;
  location_text: string | null;
  transaction_type: string | null;
  price_amount: number | null;
  currency: string | null;
  archived_at: string | null;
  created_at: string | null;
  parties: DealParty[];
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtPrice(v: number | null, currency?: string | null) {
  if (v === null || v === undefined) return "-";
  return `${Number(v).toLocaleString()} ${currency ?? ""}`.trim();
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleDateString();
}

export default function OfficeDealsView({ lang }: { lang: LangKey }) {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [transactionType, setTransactionType] = useState("");

  async function load(next?: { q?: string; transactionType?: string }) {
    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams();

      const qValue = (next?.q ?? q).trim();
      const typeValue = (next?.transactionType ?? transactionType).trim();

      if (qValue.length >= 2) qs.set("q", qValue);
      if (typeValue) qs.set("transactionType", typeValue);

      qs.set("limit", "100");

      const r = await fetch(`/api/deals/list?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setRows(Array.isArray(j?.rows) ? j.rows : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empty = !loading && rows.length === 0 && !error;

  const summary = useMemo(() => {
    const sale = rows.filter((r) => r.transaction_type === "sale").length;
    const rent = rows.filter((r) => r.transaction_type === "rent").length;

    return {
      total: rows.length,
      sale,
      rent,
    };
  }, [rows]);

  return (
    <div className="space-y-4">

      {/* HEADER */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">

          <div>
            <h2 className="text-base font-extrabold tracking-tight text-white">
              {t(lang, "panelNavOfficeDeals" as any)}
            </h2>

            <p className="mt-0.5 text-xs text-white/50">
              {t(lang, "panelOfficeDealsSub" as any)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => load()}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
            >
              {t(lang, "offersRefresh" as any)}
            </button>
          </div>

        </div>

        {/* FILTERS */}
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_200px_auto]">

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t(lang, "dealsSearchPlaceholder" as any) ?? "Szukaj po tytule, lokalizacji lub kliencie"}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40"
          />

          <select
            value={transactionType}
            onChange={(e) => setTransactionType(e.target.value)}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white"
          >
            <option value="">
              {t(lang, "dealsAllTypes" as any) ?? "Wszystkie"}
            </option>

            <option value="sale">
              {t(lang, "dealsSale" as any) ?? "Sprzedaż"}
            </option>

            <option value="rent">
              {t(lang, "dealsRent" as any) ?? "Najem"}
            </option>

          </select>

          <button
            onClick={() => load({ q, transactionType })}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
          >
            {t(lang, "contactsSearch" as any) ?? "Szukaj"}
          </button>

        </div>

        {/* SUMMARY */}
        <div className="mt-3 flex flex-wrap gap-2">

          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs text-white">
            {(t(lang, "dealsTotal" as any) ?? "Łącznie") + `: ${summary.total}`}
          </span>

          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs text-white">
            {(t(lang, "dealsSale" as any) ?? "Sprzedaż") + `: ${summary.sale}`}
          </span>

          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs text-white">
            {(t(lang, "dealsRent" as any) ?? "Najem") + `: ${summary.rent}`}
          </span>

        </div>

      </div>

      {/* LISTA TRANSAKCJI */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">

        {loading ? (
          <div className="text-xs text-white/50">
            {t(lang, "dealsLoading" as any) ?? "Ładowanie transakcji..."}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
            {error}
          </div>
        ) : empty ? (
          <div className="flex h-40 items-center justify-center text-white/60 text-sm">
            {t(lang, "dealsEmpty" as any) ?? "Brak transakcji"}
          </div>
        ) : (
          <div className="divide-y divide-white/10">

            {rows.map((r) => {

              const price = fmtPrice(r.price_amount, r.currency);

              return (
                <div key={r.id} className="p-3 hover:bg-white/5 transition">

                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_200px_200px_1fr_auto]">

                    {/* TYTUŁ */}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {r.title ?? "-"}
                      </div>

                      <div className="text-xs text-white/60 truncate">
                        {r.location_text ?? "-"}
                      </div>
                    </div>

                    {/* TYP */}
                    <div className="text-xs text-white/70">
                      <div className="text-white/45">
                        {t(lang, "dealsType" as any) ?? "Typ"}
                      </div>

                      <div className="font-semibold text-white/85">
                        {r.transaction_type ?? "-"}
                      </div>
                    </div>

                    {/* CENA */}
                    <div className="text-xs text-white/70">
                      <div className="text-white/45">
                        {t(lang, "dealsPrice" as any) ?? "Cena"}
                      </div>

                      <div className="font-semibold text-white">
                        {price}
                      </div>
                    </div>

                    {/* STRONY TRANSAKCJI */}
                    <div className="text-xs text-white/70">

                      <div className="text-white/45 mb-1">
                        {t(lang, "dealsParties" as any) ?? "Strony"}
                      </div>

                      <div className="flex flex-wrap gap-1">

                        {r.parties?.map((p) => (
                          <span
                            key={p.party_id}
                            className="rounded bg-white/10 px-2 py-0.5 text-[10px]"
                          >
                            {p.full_name}
                          </span>
                        ))}

                      </div>

                    </div>

                    {/* DATA */}
                    <div className="text-right text-xs text-white/60">

                      <div>
                        {fmtDate(r.archived_at ?? r.created_at)}
                      </div>

                    </div>

                  </div>

                </div>
              );
            })}

          </div>
        )}

      </div>

    </div>
  );
}