import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import {
  ContactModal,
  type ContactFormState,
  type ContactRow,
  buildInitialForm,
  buildPayloadFromForm,
  mapRowToForm,
} from "@/components/ContactsView";
import { DEFAULT_LANG, isLangKey } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString();
}

function fmtShortDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

type ClientEventRow = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  locationText: string | null;
  description: string | null;
  eventType: string | null;
  status: string | null;
  outcome: string | null;
  source: string | null;
  listingId: string | null;
};

function getEventTypeLabel(type?: string | null) {
  switch (type) {
    case "presentation":
      return "Prezentacja";
    case "acquisition":
      return "Pozyskanie";
    case "broker_agreement":
      return "Umowa pośrednictwa";
    case "preliminary_agreement":
      return "Umowa przedwstępna";
    case "final_agreement":
      return "Umowa końcowa";
    case "contact":
      return "Kontakt";
    case "task":
      return "Zadanie";
    case "vacation":
      return "Urlop";
    case "other":
      return "Inne";
    case "call":
      return "Telefon";
    case "visit":
      return "Wizyta";
    case "meeting":
      return "Spotkanie";
    case "follow_up":
      return "Follow-up";
    default:
      return type || "-";
  }
}

function getEventOutcomeLabel(outcome?: string | null) {
  switch (outcome) {
    case "none":
      return "Brak";
    case "answered":
      return "Odebrano";
    case "no_answer":
      return "Brak odpowiedzi";
    case "rescheduled":
      return "Przełożono";
    case "completed":
      return "Zrealizowano";
    case "cancelled":
      return "Anulowano";
    case "offer_rejected":
      return "Oferta odrzucona";
    case "interested":
      return "Zainteresowany";
    default:
      return outcome || "-";
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

function NextStepTile({
  title,
  href,
  disabled = false,
}: {
  title: string;
  href?: string;
  disabled?: boolean;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={disabled || !href}
      onClick={() => {
        if (!href) return;
        router.push(href);
      }}
      className={clsx(
        "rounded-2xl border px-4 py-5 text-left text-sm transition",
        disabled || !href
          ? "border-dashed border-white/15 bg-white/5 text-white/40 cursor-not-allowed"
          : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/20"
      )}
    >
      {title}
    </button>
  );
}

export default function ContactDetailsPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const activeTab = typeof router.query.tab === "string" ? router.query.tab : "";
  const mode = typeof router.query.mode === "string" ? router.query.mode : "";

  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);

  const [row, setRow] = useState<ContactRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyDelete, setBusyDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientEvents, setClientEvents] = useState<ClientEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(buildInitialForm());

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

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

  async function loadClientEvents() {
    if (!id) return;

    setEventsLoading(true);
    setEventsError(null);

    try {
      const r = await fetch(`/api/calendar/by-client?clientId=${encodeURIComponent(id)}&limit=20`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setClientEvents(Array.isArray(j?.rows) ? j.rows : []);
    } catch (e: any) {
      setEventsError(e?.message ?? "Nie udało się pobrać terminarza klienta.");
      setClientEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }

  async function openEditModal() {
    if (!id || !row) return;

    setEditError(null);

    try {
      const r = await fetch(`/api/contacts/details?id=${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      const base = mapRowToForm(j.row);

      const next: ContactFormState = {
        ...base,
        visibilityScope: j.visibilityRule?.visibility_scope ?? "office",
        marketingConsent: Boolean(j.consent?.granted),
        marketingConsentNotes: j.consent?.notes ?? "",

        propertyKind: j.orderDetails?.property_kind ?? "",
        marketType: j.orderDetails?.market_type ?? "",
        contractType: j.orderDetails?.contract_type ?? "",
        caretakerUserId: j.orderDetails?.caretaker_user_id ?? "",

        expectedPropertyKind: j.orderDetails?.expected_property_kind ?? "",
        searchLocationText: j.orderDetails?.search_location_text ?? "",

        budgetMin: j.orderDetails?.budget_min?.toString?.() ?? "",
        budgetMax: j.orderDetails?.budget_max?.toString?.() ?? "",
        roomsMin: j.orderDetails?.rooms_min?.toString?.() ?? "",
        roomsMax: j.orderDetails?.rooms_max?.toString?.() ?? "",
        areaMin: j.orderDetails?.area_min?.toString?.() ?? "",
        areaMax: j.orderDetails?.area_max?.toString?.() ?? "",

        country: j.propertyDetails?.country ?? "",
        city: j.propertyDetails?.city ?? "",
        street: j.propertyDetails?.street ?? "",
        buildingNumber: j.propertyDetails?.building_number ?? "",
        unitNumber: j.propertyDetails?.unit_number ?? "",
        priceAmount: j.propertyDetails?.price_amount?.toString?.() ?? "",
        priceCurrency: j.propertyDetails?.price_currency ?? "PLN",
        pricePeriod: j.propertyDetails?.price_period ?? "",
        areaM2: j.propertyDetails?.area_m2?.toString?.() ?? "",
        roomsCount: j.propertyDetails?.rooms_count?.toString?.() ?? "",
        floorNumber: j.propertyDetails?.floor_number?.toString?.() ?? "",
        floorTotal: j.propertyDetails?.floor_total?.toString?.() ?? "",

        offerId: j.offerInquiry?.offer_id ?? "",
        inquiryText: j.offerInquiry?.inquiry_text ?? "",
        autofillFromOffer: Boolean(j.offerInquiry?.autofill_from_offer),
        autofillMarginPercent: j.offerInquiry?.autofill_margin_percent?.toString?.() ?? "10",

        creditedPropertyPrice: j.creditDetails?.credited_property_price?.toString?.() ?? "",
        plannedOwnContribution: j.creditDetails?.planned_own_contribution?.toString?.() ?? "",
        loanPeriodMonths: j.creditDetails?.loan_period_months?.toString?.() ?? "",
        concernsExistingProperty: Boolean(j.creditDetails?.concerns_existing_property),
        relatedOfferId: j.creditDetails?.related_offer_id ?? "",
        existingPropertyNotes: j.creditDetails?.existing_property_notes ?? "",

        insuranceSubject: j.insuranceDetails?.insurance_subject ?? "",
        insuranceNotes: j.insuranceDetails?.insurance_notes ?? "",
      };

      setForm(next);
      setEditOpen(true);

      await router.replace(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            mode: "edit",
          },
        },
        undefined,
        { shallow: true }
      );
    } catch (e: any) {
      setEditError(e?.message ?? "Nie udało się pobrać szczegółów.");
      setForm(mapRowToForm(row));
      setEditOpen(true);
    }
  }

  async function closeEditModal() {
    if (editSaving) return;

    setEditOpen(false);
    setEditError(null);

    const nextQuery: Record<string, string> = {};
    if (typeof router.query.id === "string") nextQuery.id = router.query.id;
    if (typeof router.query.tab === "string") nextQuery.tab = router.query.tab;

    await router.replace(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true }
    );
  }

  async function handleSave() {
    if (!row?.id) return;

    setEditSaving(true);
    setEditError(null);

    try {
      const payload = buildPayloadFromForm(form);

      const r = await fetch("/api/contacts/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          ...payload,
        }),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        const code = j?.error ?? `HTTP ${r.status}`;
        if (code === "MISSING_FULL_NAME") throw new Error("Brak nazwy lub imienia i nazwiska.");
        if (code === "MISSING_CONTACT_CHANNEL") throw new Error("Podaj telefon lub email.");
        if (code === "MISSING_PERSON_NAME_PARTS") throw new Error("Podaj imię i nazwisko.");
        if (code === "MISSING_COMPANY_NAME") throw new Error("Podaj nazwę firmy.");
        if (code === "MISSING_ID") throw new Error("Brak identyfikatora.");
        if (code === "NOT_FOUND") throw new Error("Nie znaleziono kontaktu.");
        throw new Error(code);
      }

      setEditOpen(false);
      setEditError(null);

      const nextQuery: Record<string, string> = {};
      if (typeof router.query.id === "string") nextQuery.id = router.query.id;
      if (typeof router.query.tab === "string") nextQuery.tab = router.query.tab;

      await router.replace(
        {
          pathname: router.pathname,
          query: nextQuery,
        },
        undefined,
        { shallow: true }
      );

      await load();
    } catch (e: any) {
      setEditError(e?.message ?? "Nie udało się zapisać zmian.");
    } finally {
      setEditSaving(false);
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

      await router.replace("/panel?view=contacts");
    } catch (e: any) {
      alert(e?.message ?? "Nie udało się usunąć klienta.");
    } finally {
      setBusyDelete(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    loadClientEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!loading && row && mode === "edit" && !editOpen) {
      openEditModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, row, mode]);

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

  if (!id) return null;

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
                  onClick={openEditModal}
                  className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Edytuj
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/panel?view=calendar&clientId=${encodeURIComponent(id)}&action=new`)}
                  className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  + Nowy termin
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/panel?view=calendar&clientId=${encodeURIComponent(id)}`)}
                  className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Otwórz kalendarz
                </button>

                <button
                  type="button"
                  onClick={!busyDelete ? handleDelete : undefined}
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
                  title="Terminarz klienta"
                  subtitle="Ostatnie zdarzenia przypięte do tego klienta."
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/panel?view=calendar&clientId=${encodeURIComponent(id)}&action=new`)
                        }
                        className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                      >
                        + Nowy termin dla klienta
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/panel?view=calendar&clientId=${encodeURIComponent(id)}`)
                        }
                        className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                      >
                        Pełny kalendarz klienta
                      </button>

                      <button
                        type="button"
                        onClick={loadClientEvents}
                        className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                      >
                        Odśwież
                      </button>
                    </>
                  }
                >
                  {eventsLoading ? (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
                      Ładowanie terminarza klienta...
                    </div>
                  ) : eventsError ? (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                      {eventsError}
                    </div>
                  ) : clientEvents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
                      Brak terminów przypiętych do klienta.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {clientEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold text-white">{ev.title || "-"}</div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge tone="accent">{getEventTypeLabel(ev.eventType)}</Badge>
                                <Badge tone="sky">{ev.status || "-"}</Badge>
                                <Badge tone="amber">{getEventOutcomeLabel(ev.outcome)}</Badge>
                                {ev.source ? <Badge>{ev.source}</Badge> : null}
                                {ev.listingId ? <Badge tone="indigo">Oferta powiązana</Badge> : null}
                              </div>

                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                <Field label="Start" value={fmtShortDate(ev.startAt)} />
                                <Field label="Koniec" value={fmtShortDate(ev.endAt)} />
                                <Field label="Lokalizacja" value={ev.locationText || "-"} />
                                <Field label="Listing ID" value={ev.listingId || "-"} />
                              </div>

                              {ev.description ? (
                                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                                  <div className="text-xs text-white/45">Opis</div>
                                  <div className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                                    {ev.description}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(`/panel?view=calendar&clientId=${encodeURIComponent(id)}`)
                                }
                                className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                              >
                                Otwórz w kalendarzu
                              </button>
                              {ev.listingId ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    router.push(`/panel/offers/${encodeURIComponent(ev.listingId!)}`)
                                  }
                                  className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                                >
                                  Otwórz ofertę
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {activeTab ? (
                  <Card
                    title={
                      activeTab === "history"
                        ? "Historia kontaktu"
                        : activeTab === "notes"
                          ? "Notatki i follow-up"
                          : activeTab === "documents"
                            ? "Dokumenty klienta"
                            : "Sekcja klienta"
                    }
                    subtitle="Widok roboczy pod dalszą rozbudowę."
                  >
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/65">
                      {activeTab === "history" &&
                        "Tutaj podepniemy timeline interakcji, zdarzeń i aktywności klienta."}
                      {activeTab === "notes" &&
                        "Tutaj podepniemy notatki, follow-upy, zadania i przypomnienia."}
                      {activeTab === "documents" &&
                        "Tutaj podepniemy dokumenty klienta i załączniki."}
                      {!["history", "notes", "documents"].includes(activeTab) &&
                        "Ta sekcja jest przygotowana pod dalszą rozbudowę CRM."}
                    </div>
                  </Card>
                ) : null}

                <Card
                  title="Inne czynności klienta"
                  subtitle="Szybki dostęp do powiązanych działań i sekcji CRM."
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <NextStepTile
                      title="Powiązane oferty"
                      href={`/panel?view=offers&clientId=${encodeURIComponent(row.id)}`}
                    />

                    <NextStepTile
                      title="Zlecenia popytowe"
                      href={`/panel/demand-orders?clientId=${encodeURIComponent(row.id)}`}
                    />

                    <NextStepTile
                      title="Zlecenia kredytowe"
                      href={`/panel/credit-orders?clientId=${encodeURIComponent(row.id)}`}
                    />

                    <NextStepTile
                      title="Zlecenia ubezpieczeniowe"
                      href={`/panel/insurance-orders?clientId=${encodeURIComponent(row.id)}`}
                    />

                    <NextStepTile
                      title="Historia kontaktu"
                      href={`/panel/contacts/${encodeURIComponent(row.id)}?tab=history`}
                    />

                    <NextStepTile
                      title="Terminarz klienta"
                      href={`/panel?view=calendar&clientId=${encodeURIComponent(row.id)}`}
                    />

                    <NextStepTile
                      title="Dokumenty klienta"
                      href={`/panel/contacts/${encodeURIComponent(row.id)}?tab=documents`}
                    />

                    <NextStepTile
                      title="Notatki i follow-up"
                      href={`/panel/contacts/${encodeURIComponent(row.id)}?tab=notes`}
                    />
                  </div>
                </Card>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ContactModal
        lang={lang}
        open={editOpen}
        mode="edit"
        saving={editSaving}
        error={editError}
        form={form}
        setForm={setForm}
        onClose={closeEditModal}
        onSubmit={handleSave}
      />
    </div>
  );
}