import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

type ContactRow = {
  id: string;
  office_id: string;
  party_type: string | null;
  client_roles?: string[] | null;
  full_name: string | null;
  pesel: string | null;
  nip: string | null;
  regon?: string | null;
  krs: string | null;
  notes?: string | null;
  source?: string | null;
  created_by_user_id?: string | null;
  assigned_user_id?: string | null;
  status?: string | null;
  pipeline_stage?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  phone_primary?: string | null;
  email_primary?: string | null;
  phone_fallback?: string | null;
  email_fallback?: string | null;
  phone?: string | null;
  email?: string | null;
  contacts_count?: number | null;
  has_interactions?: boolean | null;
  interactions_count?: number | null;
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

function getDisplayPhone(row?: ContactRow | null) {
  return row?.phone ?? row?.phone_primary ?? row?.phone_fallback ?? null;
}

function getDisplayEmail(row?: ContactRow | null) {
  return row?.email ?? row?.email_primary ?? row?.email_fallback ?? null;
}

function normalizePartyTypeLabel(partyType?: string | null) {
  const v = (partyType ?? "").toLowerCase();
  if (v === "person") return "Osoba";
  if (v === "company") return "Firma";
  return partyType || "-";
}

function getClientRoleLabel(role: string) {
  switch (role) {
    case "buyer":
      return "Kupujący";
    case "seller":
      return "Sprzedający";
    case "tenant":
      return "Najmujący";
    case "landlord":
      return "Wynajmujący";
    case "investor":
      return "Inwestor";
    case "flipper":
      return "Flipper";
    case "developer":
      return "Deweloper";
    case "external_agent":
      return "Pośrednik zewnętrzny";
    default:
      return role || "-";
  }
}

function getClientStatusLabel(status?: string | null) {
  switch (status) {
    case "new":
      return "Nowy";
    case "active":
      return "Aktywny";
    case "in_progress":
      return "W trakcie";
    case "won":
      return "Wygrany";
    case "lost":
      return "Przegrany";
    case "inactive":
      return "Nieaktywny";
    case "archived":
      return "Zarchiwizowany";
    default:
      return status || "-";
  }
}

function getPipelineStageLabel(stage?: string | null) {
  switch (stage) {
    case "lead":
      return "Lead";
    case "qualified":
      return "Zakwalifikowany";
    case "contacted":
      return "Skontaktowano";
    case "meeting_scheduled":
      return "Umówione spotkanie";
    case "needs_analysis":
      return "Analiza potrzeb";
    case "property_match":
      return "Dobór oferty";
    case "offer_preparation":
      return "Przygotowanie oferty";
    case "offer_sent":
      return "Oferta wysłana";
    case "negotiation":
      return "Negocjacje";
    case "contract_preparation":
      return "Przygotowanie umowy";
    case "closed_won":
      return "Wygrana transakcja";
    case "closed_lost":
      return "Utracona transakcja";
    default:
      return stage || "-";
  }
}

function deriveCaseTypeFromRoles(roles: string[]) {
  if (roles.includes("seller")) return "Sprzedający";
  if (roles.includes("buyer")) return "Kupujący";
  if (roles.includes("landlord")) return "Wynajmujący";
  if (roles.includes("tenant")) return "Najmujący";
  if (roles.includes("investor")) return "Kupujący / inwestor";
  if (roles.includes("flipper")) return "Kupujący / flipper";
  if (roles.includes("developer")) return "Sprzedający / deweloper";
  if (roles.includes("external_agent")) return "Pośrednik zewnętrzny";
  return "Nieokreślony";
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
  tone?: "default" | "accent" | "sky" | "green" | "amber" | "fuchsia" | "indigo";
}) {
  const toneMap: Record<string, string> = {
    default: "bg-white/10 text-white/85 ring-white/10",
    accent: "bg-ew-accent/15 text-white/85 ring-ew-accent/20",
    sky: "bg-sky-500/15 text-sky-100 ring-sky-500/20",
    green: "bg-emerald-500/15 text-emerald-100 ring-emerald-500/20",
    amber: "bg-amber-500/15 text-amber-100 ring-amber-500/20",
    fuchsia: "bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-500/20",
    indigo: "bg-indigo-500/15 text-indigo-100 ring-indigo-500/20",
  };

  return (
    <span className={clsx("rounded px-2 py-0.5 text-[10px] ring-1", toneMap[tone])}>
      {children}
    </span>
  );
}

export default function ContactDetailsPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";

  const [row, setRow] = useState<ContactRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyDelete, setBusyDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const r = await fetch(`/api/contacts/${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setRow(j?.row ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się pobrać klienta.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!row?.id) return;

    const confirmText =
      row.has_interactions || (row.interactions_count ?? 0) > 0
        ? "Ten klient ma powiązania i interakcje. Na pewno usunąć?"
        : "Na pewno usunąć klienta?";

    const ok = window.confirm(confirmText);
    if (!ok) return;

    setBusyDelete(true);
    try {
      const r = await fetch(`/api/contacts/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      await router.push("/panel?view=contacts");
    } catch (e: any) {
      alert(e?.message ?? "Nie udało się usunąć klienta.");
    } finally {
      setBusyDelete(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const phone = getDisplayPhone(row);
  const email = getDisplayEmail(row);
  const roles = Array.isArray(row?.client_roles) ? row!.client_roles : [];
  const caseType = deriveCaseTypeFromRoles(roles);

  const initials = useMemo(() => {
    const name = (row?.full_name ?? "").trim();
    if (!name) return "K";
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }, [row?.full_name]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 lg:px-6">
        <div className="grid gap-4">
          <Card
            title="Klient"
            subtitle="Widok CRM klienta, statusu, pipeline i danych kontaktowych."
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
                  onClick={() =>
                    router.push(
                      `/panel?view=contacts&editId=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(
                        router.asPath
                      )}`
                    )
                  }
                  className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Edytuj
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busyDelete}
                  className="rounded-2xl border border-red-500/20 bg-red-600/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
                >
                  {busyDelete ? "Usuwanie..." : "Usuń"}
                </button>
              </>
            }
          >
            {loading ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
                Ładowanie klienta...
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                {error}
              </div>
            ) : !row ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
                Nie znaleziono klienta.
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/10 text-xl font-extrabold text-white">
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-2xl font-extrabold tracking-tight text-white">
                        {row.full_name ?? "-"}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge>{normalizePartyTypeLabel(row.party_type)}</Badge>
                        <Badge tone="indigo">{caseType}</Badge>
                        <Badge tone="sky">{getClientStatusLabel(row.status)}</Badge>
                        <Badge tone="fuchsia">{getPipelineStageLabel(row.pipeline_stage)}</Badge>

                        {roles.map((role) => (
                          <Badge key={role} tone="accent">
                            {getClientRoleLabel(role)}
                          </Badge>
                        ))}

                        {(row.has_interactions || (row.interactions_count ?? 0) > 0) && (
                          <Badge tone="amber">Interakcje: {row.interactions_count ?? 1}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <Card title="Dane kontaktowe">
                    <div className="grid gap-3">
                      <Field
                        label="Telefon"
                        value={
                          phone ? (
                            <a href={`tel:${phone}`} className="text-ew-accent underline">
                              {phone}
                            </a>
                          ) : (
                            "-"
                          )
                        }
                      />
                      <Field
                        label="Email"
                        value={
                          email ? (
                            <a href={`mailto:${email}`} className="text-ew-accent underline">
                              {email}
                            </a>
                          ) : (
                            "-"
                          )
                        }
                      />
                      <Field label="Źródło" value={row.source ?? "-"} />
                      <Field label="Przypisany user_id" value={row.assigned_user_id ?? "-"} />
                    </div>
                  </Card>

                  <Card title="Dane podstawowe">
                    <div className="grid gap-3">
                      <Field label="Imię" value={row.first_name ?? "-"} />
                      <Field label="Nazwisko" value={row.last_name ?? "-"} />
                      <Field label="Firma" value={row.company_name ?? "-"} />
                      <Field label="PESEL" value={row.pesel ?? "-"} />
                      <Field label="NIP" value={row.nip ?? "-"} />
                      <Field label="REGON" value={row.regon ?? "-"} />
                      <Field label="KRS" value={row.krs ?? "-"} />
                    </div>
                  </Card>

                  <Card title="Workflow i metadane">
                    <div className="grid gap-3">
                      <Field label="Status klienta" value={getClientStatusLabel(row.status)} />
                      <Field
                        label="Etap pipeline"
                        value={getPipelineStageLabel(row.pipeline_stage)}
                      />
                      <Field label="Dodano" value={fmtDate(row.created_at)} />
                      <Field label="Zmieniono" value={fmtDate(row.updated_at)} />
                      <Field label="created_by_user_id" value={row.created_by_user_id ?? "-"} />
                      <Field label="ID klienta" value={row.id} />
                    </div>
                  </Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card title="Notatki">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="whitespace-pre-wrap text-sm text-white/80">
                        {row.notes ?? "-"}
                      </div>
                    </div>
                  </Card>

                  <Card title="Szybki obraz CRM">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Typ sprawy" value={caseType} />
                      <Field
                        label="Łączna liczba kanałów kontaktu"
                        value={row.contacts_count ?? "-"}
                      />
                      <Field
                        label="Czy są interakcje"
                        value={row.has_interactions ? "Tak" : "Nie"}
                      />
                      <Field label="Liczba interakcji" value={row.interactions_count ?? 0} />
                    </div>
                  </Card>
                </div>

                <Card
                  title="Zalecane następne kroki"
                  subtitle="Sekcje docelowe do dalszej rozbudowy CRM dla klienta."
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      "Powiązane oferty",
                      "Zlecenia popytowe",
                      "Zlecenia kredytowe",
                      "Zlecenia ubezpieczeniowe",
                      "Historia kontaktu",
                      "Terminarz klienta",
                      "Dokumenty klienta",
                      "Notatki i follow-up",
                    ].map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-5 text-sm text-white/70"
                      >
                        {item}
                      </div>
                    ))}
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