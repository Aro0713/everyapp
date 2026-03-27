import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

type OfferInquiryRow = {
  id: string;
  case_type: string;
  status: string;
  client_bucket: string;
  created_at: string | null;
  offer_id: string | null;
  inquiry_text: string | null;
  autofill_from_offer: boolean | null;
  autofill_margin_percent: number | null;
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

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-white/85">{value ?? "-"}</div>
    </div>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "sky" | "green" | "amber" | "indigo";
}) {
  const toneMap: Record<string, string> = {
    default: "bg-white/10 text-white/85 ring-white/10",
    sky: "bg-sky-500/15 text-sky-100 ring-sky-500/20",
    green: "bg-emerald-500/15 text-emerald-100 ring-emerald-500/20",
    amber: "bg-amber-500/15 text-amber-100 ring-amber-500/20",
    indigo: "bg-indigo-500/15 text-indigo-100 ring-indigo-500/20",
  };

  return (
    <span className={clsx("rounded px-2 py-0.5 text-[10px] ring-1", toneMap[tone])}>
      {children}
    </span>
  );
}

function getStatusLabel(status?: string | null) {
  switch (status) {
    case "active":
      return "Aktywna";
    case "won":
      return "Wygrana";
    case "lost":
      return "Przegrana";
    case "archived":
      return "Zarchiwizowana";
    default:
      return status || "-";
  }
}

function getBucketLabel(bucket?: string | null) {
  switch (bucket) {
    case "client":
      return "Klient";
    case "archive":
      return "Archiwum";
    default:
      return bucket || "-";
  }
}

export default function OfferInquiryDetailsPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";

  const [row, setRow] = useState<OfferInquiryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const r = await fetch(`/api/offer-inquiries/list?clientId=${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      const rows = Array.isArray(j?.rows) ? (j.rows as OfferInquiryRow[]) : [];
      setRow(rows[0] ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się pobrać zapytania ofertowego.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const readiness = useMemo(() => {
    if (!row) return "Brak danych";
    if (row.offer_id || row.inquiry_text) return "Uzupełnione";
    return "Wymaga uzupełnienia";
  }, [row]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 lg:px-6">
        <div className="grid gap-4">
          <Card
            title="Zapytanie ofertowe"
            subtitle="Szczegóły zapytania ofertowego klienta."
            actions={
              <>
                <button
                  type="button"
                  onClick={() => router.push("/panel?view=contacts")}
                  className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  ← Baza klientów
                </button>

                <button
                  type="button"
                  onClick={() => router.back()}
                  className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Wróć
                </button>
              </>
            }
          >
            {loading ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
                Ładowanie zapytania ofertowego...
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                {error}
              </div>
            ) : !row ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
                Nie znaleziono zapytania ofertowego.
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-2xl font-extrabold tracking-tight text-white">
                        Zapytanie #{row.id}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="indigo">Typ: {row.case_type ?? "-"}</Badge>
                        <Badge tone="sky">Status: {getStatusLabel(row.status)}</Badge>
                        <Badge tone="green">Rekord: {getBucketLabel(row.client_bucket)}</Badge>
                        <Badge tone="amber">{readiness}</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <Card title="Powiązanie z ofertą">
                    <div className="grid gap-3">
                      <Field label="ID oferty" value={row.offer_id ?? "-"} />
                      <Field
                        label="Auto-uzupełnianie z oferty"
                        value={row.autofill_from_offer ? "Tak" : "Nie"}
                      />
                      <Field
                        label="Margines auto-uzupełniania (%)"
                        value={
                          row.autofill_margin_percent !== null &&
                          row.autofill_margin_percent !== undefined
                            ? row.autofill_margin_percent
                            : "-"
                        }
                      />
                    </div>
                  </Card>

                  <Card title="Treść zapytania">
                    <div className="grid gap-3">
                      <Field label="Treść" value={row.inquiry_text ?? "-"} />
                    </div>
                  </Card>

                  <Card title="Metadane">
                    <div className="grid gap-3">
                      <Field label="ID sprawy" value={row.id} />
                      <Field label="Typ sprawy" value={row.case_type ?? "-"} />
                      <Field label="Status" value={getStatusLabel(row.status)} />
                      <Field label="Dodano" value={fmtDate(row.created_at)} />
                    </div>
                  </Card>
                </div>

                <Card
                  title="Dalsze kroki"
                  subtitle="Kontener roboczy pod kolejną rozbudowę zapytania ofertowego."
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => router.push(`/panel/contacts/${encodeURIComponent(id)}`)}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-left text-sm text-white/80 transition hover:bg-white/10 hover:border-white/20"
                    >
                      Powrót do klienta
                    </button>

                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-5 text-left text-sm text-white/40"
                    >
                      Dopasowanie ofert
                    </button>

                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-5 text-left text-sm text-white/40"
                    >
                      Historia zapytania
                    </button>

                    <button
                      type="button"
                      disabled
                      className="cursor-not-allowed rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-5 text-left text-sm text-white/40"
                    >
                      Notatki handlowe
                    </button>
                  </div>
                </Card>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}