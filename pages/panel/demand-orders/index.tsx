import { useRouter } from "next/router";
import { useEffect, useState } from "react";

type DemandOrderRow = {
  id: string;
  office_id: string;
  party_id: string;
  case_type: string;
  status: string;
  client_bucket: string;
  assigned_user_id: string | null;
  created_by_user_id: string | null;
  source: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  full_name: string | null;

  property_kind: string | null;
  market_type: string | null;
  contract_type: string | null;
  expected_property_kind: string | null;
  search_location_text: string | null;
  budget_min: number | null;
  budget_max: number | null;
  rooms_min: number | null;
  rooms_max: number | null;
  area_min: number | null;
  area_max: number | null;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString();
}

function fmtMoney(v?: number | null) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "-";
  return `${Number(v).toLocaleString()} zł`;
}

function getCaseTypeLabel(caseType?: string | null) {
  switch (caseType) {
    case "buyer":
      return "Kupujący";
    case "tenant":
      return "Najemca";
    default:
      return caseType || "-";
  }
}

function getCaseStatusLabel(status?: string | null) {
  switch (status) {
    case "active":
      return "Aktywne";
    case "archived":
      return "Archiwalne";
    case "closed":
      return "Zamknięte";
    default:
      return status || "-";
  }
}

function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function DemandOrdersIndexPage() {
  const router = useRouter();
  const clientId = typeof router.query.clientId === "string" ? router.query.clientId : "";

  const [rows, setRows] = useState<DemandOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams();
      if (clientId) qs.set("clientId", clientId);
      qs.set("limit", "100");

      const r = await fetch(`/api/demand-orders/list?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      const rawRows = Array.isArray(j?.rows) ? (j.rows as DemandOrderRow[]) : [];
      setRows(rawRows);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się pobrać zleceń popytowych.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!router.isReady) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, clientId]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 lg:px-6">
        <Card
          title="Zlecenia popytowe"
          subtitle={
            clientId
              ? "Lista zapytań kupna / najmu powiązanych z klientem."
              : "Lista wszystkich zleceń popytowych w biurze."
          }
          actions={
            <button
              type="button"
              onClick={() =>
                clientId
                  ? router.push(`/panel/contacts/${encodeURIComponent(clientId)}`)
                  : router.push("/panel?view=contacts")
              }
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              {clientId ? "← Powrót do klienta" : "← Baza klientów"}
            </button>
          }
        >
          {loading ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
              Ładowanie zleceń popytowych...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
              {clientId
                ? "Brak zleceń popytowych dla tego klienta."
                : "Brak zleceń popytowych w biurze."}
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-100 ring-1 ring-indigo-500/20">
                          {getCaseTypeLabel(row.case_type)}
                        </span>

                        <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-100 ring-1 ring-sky-500/20">
                          {getCaseStatusLabel(row.status)}
                        </span>

                        <span
                          className={clsx(
                            "rounded px-2 py-0.5 text-[10px] ring-1",
                            row.client_bucket === "archive"
                              ? "bg-amber-500/15 text-amber-100 ring-amber-500/20"
                              : "bg-emerald-500/15 text-emerald-100 ring-emerald-500/20"
                          )}
                        >
                          {row.client_bucket === "archive" ? "Archiwum" : "Klient"}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-white/70 md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          Klient:{" "}
                          <span className="font-semibold text-white/85">
                            {row.full_name ?? "-"}
                          </span>
                        </div>

                        <div>
                          Lokalizacja:{" "}
                          <span className="font-semibold text-white/85">
                            {row.search_location_text ?? "-"}
                          </span>
                        </div>

                        <div>
                          Budżet:{" "}
                          <span className="font-semibold text-white/85">
                            {fmtMoney(row.budget_min)} - {fmtMoney(row.budget_max)}
                          </span>
                        </div>

                        <div>
                          Pokoje:{" "}
                          <span className="font-semibold text-white/85">
                            {row.rooms_min ?? "-"} - {row.rooms_max ?? "-"}
                          </span>
                        </div>

                        <div>
                          Powierzchnia:{" "}
                          <span className="font-semibold text-white/85">
                            {row.area_min ?? "-"} - {row.area_max ?? "-"} m²
                          </span>
                        </div>

                        <div>
                          Typ nieruchomości:{" "}
                          <span className="font-semibold text-white/85">
                            {row.expected_property_kind ?? "-"}
                          </span>
                        </div>

                        <div>
                          Dodano:{" "}
                          <span className="font-semibold text-white/85">
                            {fmtDate(row.created_at)}
                          </span>
                        </div>

                        <div>
                          Zmieniono:{" "}
                          <span className="font-semibold text-white/85">
                            {fmtDate(row.updated_at)}
                          </span>
                        </div>

                        <div>
                          ID sprawy:{" "}
                          <span className="font-semibold text-white/85">{row.id}</span>
                        </div>
                      </div>

                      {row.notes ? (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/75">
                          <div className="mb-1 text-xs text-white/45">Notatki</div>
                          <div className="whitespace-pre-wrap">{row.notes}</div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/panel/demand-orders/${encodeURIComponent(row.id)}`)
                        }
                        className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                      >
                        Otwórz
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}