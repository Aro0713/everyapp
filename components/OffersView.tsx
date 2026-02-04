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

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function OffersView({ lang }: { lang: LangKey }) {
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

  useEffect(() => {
    load();
  }, []);

  const empty = !loading && rows.length === 0 && !err;

  return (
    <div className="space-y-6">
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
              onClick={load}
            >
              {t(lang, "offersRefresh" as any)}
            </button>

            <button
              type="button"
              className="rounded-2xl bg-ew-accent px-4 py-2 text-sm font-extrabold text-ew-primary shadow-sm transition hover:opacity-95"
              onClick={() => alert("TODO: modal tworzenia oferty")}
            >
              + {t(lang, "offersNew" as any)}
            </button>

            <button
              type="button"
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm transition hover:bg-ew-accent/10"
              onClick={() => alert("TODO: import z portali")}
            >
              {t(lang, "offersImport" as any)}
            </button>
          </div>
        </div>
      </div>

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
                    <td className="py-4 pr-4 font-semibold text-ew-primary">
                      {r.record_type}
                    </td>
                    <td className="py-4 pr-4">{r.transaction_type}</td>
                    <td className="py-4 pr-4">{r.parties_summary ?? "-"}</td>
                    <td className="py-4 pr-4">{r.case_owner_name ?? "-"}</td>
                    <td className="py-4 pr-4">
                      <span className="rounded-full bg-ew-accent/15 px-3 py-1 text-xs font-semibold text-ew-accent">
                        {r.status}
                      </span>
                    </td>
                    <td className="py-4 pr-0 text-gray-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-extrabold text-ew-primary">
          {t(lang, "offersImportTitle" as any)}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {t(lang, "offersImportDesc" as any)}
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
          <li>{t(lang, "offersImportHint1" as any)}</li>
          <li>{t(lang, "offersImportHint2" as any)}</li>
          <li>{t(lang, "offersImportHint3" as any)}</li>
        </ul>
      </div>
    </div>
  );
}
