import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

type ClientRole =
  | "buyer"
  | "seller"
  | "tenant"
  | "landlord"
  | "investor"
  | "flipper"
  | "developer"
  | "external_agent";

type ClientStatus =
  | "new"
  | "active"
  | "in_progress"
  | "won"
  | "lost"
  | "inactive"
  | "archived";

type ClientPipelineStage =
  | "lead"
  | "qualified"
  | "contacted"
  | "meeting_scheduled"
  | "needs_analysis"
  | "property_match"
  | "offer_preparation"
  | "offer_sent"
  | "negotiation"
  | "contract_preparation"
  | "closed_won"
  | "closed_lost";

type ClientCaseType =
  | "seller"
  | "buyer"
  | "landlord"
  | "tenant"
  | "credit"
  | "insurance"
  | "offer_inquiry"
  | "unspecified"
  | "other";

type VisibilityScope =
  | "everywhere"
  | "network"
  | "office"
  | "group"
  | "mine";

type PropertyKind =
  | "apartment"
  | "house"
  | "plot"
  | "commercial_unit"
  | "tenement"
  | "warehouse"
  | "other_commercial"
  | "other";

type PropertyMarketType = "primary" | "secondary";

type PropertyContractType =
  | "none"
  | "exclusive_bilateral"
  | "exclusive_unilateral"
  | "open";

type InsuranceSubject = "house" | "car" | "vacation" | "children" | "other";

export type ContactRow = {
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
  status?: ClientStatus | null;
  pipeline_stage?: ClientPipelineStage | null;
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

export type ContactFormState = {
  partyType: "person" | "company";
  clientRoles: ClientRole[];
  status: ClientStatus;
  pipelineStage: ClientPipelineStage;

  caseType: ClientCaseType;
  createCase: boolean;
  visibilityScope: VisibilityScope;
  clientBucket: "client" | "archive";

  firstName: string;
  lastName: string;
  companyName: string;
  phone: string;
  email: string;
  notes: string;
  source: string;
  pesel: string;
  nip: string;
  regon: string;
  krs: string;

  assignedUserId: string;
  marketingConsent: boolean;
  marketingConsentNotes: string;

  propertyKind: PropertyKind | "";
  marketType: PropertyMarketType | "";
  contractType: PropertyContractType | "";
  caretakerUserId: string;

  expectedPropertyKind: PropertyKind | "";
  searchLocationText: string;
  budgetMin: string;
  budgetMax: string;
  roomsMin: string;
  roomsMax: string;
  areaMin: string;
  areaMax: string;

  country: string;
  city: string;
  street: string;
  buildingNumber: string;
  unitNumber: string;
  priceAmount: string;
  priceCurrency: string;
  pricePeriod: string;
  areaM2: string;
  roomsCount: string;
  floorNumber: string;
  floorTotal: string;

  offerId: string;
  inquiryText: string;
  autofillFromOffer: boolean;
  autofillMarginPercent: string;

  creditedPropertyPrice: string;
  plannedOwnContribution: string;
  loanPeriodMonths: string;
  concernsExistingProperty: boolean;
  relatedOfferId: string;
  existingPropertyNotes: string;

  insuranceSubject: InsuranceSubject | "";
  insuranceNotes: string;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleDateString();
}

function normalizePartyTypeLabel(lang: LangKey, partyType?: string | null) {
  const v = (partyType ?? "").toLowerCase();
  if (v === "person") return t(lang, "contactsTypePerson" as any) ?? "Osoba";
  if (v === "company") return t(lang, "contactsTypeCompany" as any) ?? "Firma";
  return partyType || "-";
}

function getDisplayPhone(row?: ContactRow | null) {
  return row?.phone ?? row?.phone_primary ?? row?.phone_fallback ?? null;
}

function getDisplayEmail(row?: ContactRow | null) {
  return row?.email ?? row?.email_primary ?? row?.email_fallback ?? null;
}

function hasRowInteractions(row?: ContactRow | null) {
  if (!row) return false;
  if (typeof row.has_interactions === "boolean") return row.has_interactions;
  if (typeof row.interactions_count === "number") return row.interactions_count > 0;
  return false;
}

function getClientRoleLabel(lang: LangKey, role: ClientRole | string) {
  switch (role) {
    case "buyer":
      return t(lang, "contactsRoleBuyer" as any) ?? "Kupujący";
    case "seller":
      return t(lang, "contactsRoleSeller" as any) ?? "Sprzedający";
    case "tenant":
      return t(lang, "contactsRoleTenant" as any) ?? "Najmujący";
    case "landlord":
      return t(lang, "contactsRoleLandlord" as any) ?? "Wynajmujący";
    case "investor":
      return t(lang, "contactsRoleInvestor" as any) ?? "Inwestor";
    case "flipper":
      return t(lang, "contactsRoleFlipper" as any) ?? "Fliper";
    case "developer":
      return t(lang, "contactsRoleDeveloper" as any) ?? "Deweloper";
    case "external_agent":
      return t(lang, "contactsRoleExternalAgent" as any) ?? "Pośrednik zewnętrzny";
    default:
      return role || "-";
  }
}

function getClientStatusLabel(lang: LangKey, status: ClientStatus | string) {
  switch (status) {
    case "new":
      return t(lang, "contactsStatusNew" as any) ?? "Nowy";
    case "active":
      return t(lang, "contactsStatusActive" as any) ?? "Aktywny";
    case "in_progress":
      return t(lang, "contactsStatusInProgress" as any) ?? "W trakcie";
    case "won":
      return t(lang, "contactsStatusWon" as any) ?? "Wygrany";
    case "lost":
      return t(lang, "contactsStatusLost" as any) ?? "Przegrany";
    case "inactive":
      return t(lang, "contactsStatusInactive" as any) ?? "Nieaktywny";
    case "archived":
      return t(lang, "contactsStatusArchived" as any) ?? "Zarchiwizowany";
    default:
      return status || "-";
  }
}

function getPipelineStageLabel(lang: LangKey, stage: ClientPipelineStage | string) {
  switch (stage) {
    case "lead":
      return t(lang, "contactsPipelineLead" as any) ?? "Lead";
    case "qualified":
      return t(lang, "contactsPipelineQualified" as any) ?? "Zakwalifikowany";
    case "contacted":
      return t(lang, "contactsPipelineContacted" as any) ?? "Skontaktowano";
    case "meeting_scheduled":
      return t(lang, "contactsPipelineMeetingScheduled" as any) ?? "Umówione spotkanie";
    case "needs_analysis":
      return t(lang, "contactsPipelineNeedsAnalysis" as any) ?? "Analiza potrzeb";
    case "property_match":
      return t(lang, "contactsPipelinePropertyMatch" as any) ?? "Dobór oferty";
    case "offer_preparation":
      return t(lang, "contactsPipelineOfferPreparation" as any) ?? "Przygotowanie oferty";
    case "offer_sent":
      return t(lang, "contactsPipelineOfferSent" as any) ?? "Oferta wysłana";
    case "negotiation":
      return t(lang, "contactsPipelineNegotiation" as any) ?? "Negocjacje";
    case "contract_preparation":
      return t(lang, "contactsPipelineContractPreparation" as any) ?? "Przygotowanie umowy";
    case "closed_won":
      return t(lang, "contactsPipelineClosedWon" as any) ?? "Wygrana transakcja";
    case "closed_lost":
      return t(lang, "contactsPipelineClosedLost" as any) ?? "Utracona transakcja";
    default:
      return stage || "-";
  }
}

function getCaseTypeLabel(_lang: LangKey, caseType: ClientCaseType | string) {
  switch (caseType) {
    case "seller":
      return "Sprzedający";
    case "buyer":
      return "Kupujący";
    case "landlord":
      return "Wynajmujący";
    case "tenant":
      return "Najmujący";
    case "credit":
      return "Kredytowy";
    case "insurance":
      return "Ubezpieczeniowy";
    case "offer_inquiry":
      return "Zapytanie na ofertę";
    case "unspecified":
      return "Nieokreślony";
    case "other":
      return "Inne";
    default:
      return caseType || "-";
  }
}

function deriveCaseTypeFromRoles(roles: ClientRole[]): ClientCaseType {
  if (roles.includes("seller")) return "seller";
  if (roles.includes("buyer")) return "buyer";
  if (roles.includes("landlord")) return "landlord";
  if (roles.includes("tenant")) return "tenant";
  if (roles.includes("investor")) return "buyer";
  if (roles.includes("flipper")) return "buyer";
  if (roles.includes("developer")) return "seller";
  if (roles.includes("external_agent")) return "other";
  return "unspecified";
}

export function buildInitialForm(): ContactFormState {
  return {
    partyType: "person",
    clientRoles: [],
    status: "new",
    pipelineStage: "lead",

    caseType: "unspecified",
    createCase: false,
    visibilityScope: "office",
    clientBucket: "client",

    firstName: "",
    lastName: "",
    companyName: "",
    phone: "",
    email: "",
    notes: "",
    source: "manual",
    pesel: "",
    nip: "",
    regon: "",
    krs: "",

    assignedUserId: "",
    marketingConsent: false,
    marketingConsentNotes: "",

    propertyKind: "",
    marketType: "",
    contractType: "",
    caretakerUserId: "",

    expectedPropertyKind: "",
    searchLocationText: "",
    budgetMin: "",
    budgetMax: "",
    roomsMin: "",
    roomsMax: "",
    areaMin: "",
    areaMax: "",

    country: "Polska",
    city: "",
    street: "",
    buildingNumber: "",
    unitNumber: "",
    priceAmount: "",
    priceCurrency: "PLN",
    pricePeriod: "",
    areaM2: "",
    roomsCount: "",
    floorNumber: "",
    floorTotal: "",

    offerId: "",
    inquiryText: "",
    autofillFromOffer: false,
    autofillMarginPercent: "10",

    creditedPropertyPrice: "",
    plannedOwnContribution: "",
    loanPeriodMonths: "",
    concernsExistingProperty: false,
    relatedOfferId: "",
    existingPropertyNotes: "",

    insuranceSubject: "",
    insuranceNotes: "",
  };
}

export function mapRowToForm(row: ContactRow): ContactFormState {
  const fullName = (row.full_name ?? "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const isCompany = (row.party_type ?? "").toLowerCase() === "company";
  const roles = Array.isArray(row.client_roles)
    ? (row.client_roles.filter(Boolean) as ClientRole[])
    : [];
  const caseType = deriveCaseTypeFromRoles(roles);

  return {
    ...buildInitialForm(),
    partyType: isCompany ? "company" : "person",
    clientRoles: roles,
    status: (row.status ?? "new") as ClientStatus,
    pipelineStage: (row.pipeline_stage ?? "lead") as ClientPipelineStage,
    caseType,
    createCase: !["other", "unspecified"].includes(caseType),
    clientBucket: row.status === "archived" ? "archive" : "client",

    firstName: !isCompany ? parts[0] ?? row.first_name ?? "" : "",
    lastName: !isCompany ? parts.slice(1).join(" ") || row.last_name || "" : "",
    companyName: isCompany ? row.company_name ?? fullName : "",

    phone: row.phone ?? row.phone_primary ?? row.phone_fallback ?? "",
    email: row.email ?? row.email_primary ?? row.email_fallback ?? "",
    notes: row.notes ?? "",
    source: row.source ?? "manual",

    pesel: row.pesel ?? "",
    nip: row.nip ?? "",
    regon: row.regon ?? "",
    krs: row.krs ?? "",

    assignedUserId: row.assigned_user_id ?? "",
  };
}

function toNullableNumberString(v: string) {
  const x = v.trim();
  return x ? Number(x) : null;
}

function toNullableIntString(v: string) {
  const x = v.trim();
  return x ? parseInt(x, 10) : null;
}

function shouldShowOrderSection(caseType: ClientCaseType) {
  return ["seller", "buyer", "landlord", "tenant", "offer_inquiry"].includes(caseType);
}

function shouldShowPropertySection(caseType: ClientCaseType) {
  return ["seller", "landlord"].includes(caseType);
}

function shouldShowOfferInquirySection(caseType: ClientCaseType) {
  return caseType === "offer_inquiry";
}

function shouldShowCreditSection(caseType: ClientCaseType) {
  return caseType === "credit";
}

function shouldShowInsuranceSection(caseType: ClientCaseType) {
  return caseType === "insurance";
}

export function buildPayloadFromForm(form: ContactFormState) {
  return {
    partyType: form.partyType,
    clientRoles: form.clientRoles,
    status: form.status,
    pipelineStage: form.pipelineStage,

    caseType: form.caseType,
    createCase: form.createCase,
    visibilityScope: form.visibilityScope,
    clientBucket: form.clientBucket,

    firstName: form.firstName,
    lastName: form.lastName,
    companyName: form.companyName,
    phone: form.phone,
    email: form.email,
    notes: form.notes,
    source: form.source,
    pesel: form.pesel,
    nip: form.nip,
    regon: form.regon,
    krs: form.krs,

    assignedUserId: form.assignedUserId || null,
    marketingConsent: form.marketingConsent,
    marketingConsentNotes: form.marketingConsentNotes || null,

    orderDetails: {
      propertyKind: form.propertyKind || null,
      marketType: form.marketType || null,
      contractType: form.contractType || null,
      caretakerUserId: form.caretakerUserId || null,
      expectedPropertyKind: form.expectedPropertyKind || null,
      searchLocationText: form.searchLocationText || null,
      budgetMin: toNullableNumberString(form.budgetMin),
      budgetMax: toNullableNumberString(form.budgetMax),
      roomsMin: toNullableIntString(form.roomsMin),
      roomsMax: toNullableIntString(form.roomsMax),
      areaMin: toNullableNumberString(form.areaMin),
      areaMax: toNullableNumberString(form.areaMax),
    },

    propertyDetails: {
      country: form.country || null,
      city: form.city || null,
      street: form.street || null,
      buildingNumber: form.buildingNumber || null,
      unitNumber: form.unitNumber || null,
      priceAmount: toNullableNumberString(form.priceAmount),
      priceCurrency: form.priceCurrency || "PLN",
      pricePeriod: form.pricePeriod || null,
      areaM2: toNullableNumberString(form.areaM2),
      roomsCount: toNullableIntString(form.roomsCount),
      floorNumber: toNullableIntString(form.floorNumber),
      floorTotal: toNullableIntString(form.floorTotal),
    },

    offerInquiry: {
      offerId: form.offerId || null,
      inquiryText: form.inquiryText || null,
      autofillFromOffer: form.autofillFromOffer,
      autofillMarginPercent: toNullableNumberString(form.autofillMarginPercent) ?? 10,
    },

    creditDetails: {
      creditedPropertyPrice: toNullableNumberString(form.creditedPropertyPrice),
      plannedOwnContribution: toNullableNumberString(form.plannedOwnContribution),
      loanPeriodMonths: toNullableIntString(form.loanPeriodMonths),
      concernsExistingProperty: form.concernsExistingProperty,
      relatedOfferId: form.relatedOfferId || null,
      existingPropertyNotes: form.existingPropertyNotes || null,
    },

    insuranceDetails: {
      insuranceSubject: form.insuranceSubject || null,
      insuranceNotes: form.insuranceNotes || null,
    },
  };
}

function SectionCard({
  title,
  children,
  muted = false,
}: {
  title: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border p-4",
        muted ? "border-white/8 bg-white/[0.03]" : "border-white/10 bg-white/5"
      )}
    >
      <div className="mb-3 text-sm font-semibold text-white">{title}</div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs text-white/60">{children}</span>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20",
        props.className
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20",
        props.className
      )}
    />
  );
}

function SelectBox(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none transition appearance-none focus:border-white/40 focus:ring-2 focus:ring-white/20",
        props.className
      )}
    />
  );
}

export function ContactModal({
  lang,
  open,
  mode,
  saving,
  error,
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  lang: LangKey;
  open: boolean;
  mode: "create" | "edit";
  saving: boolean;
  error: string | null;
  form: ContactFormState;
  setForm: React.Dispatch<React.SetStateAction<ContactFormState>>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  const isCompany = form.partyType === "company";

  const availableRoles: ClientRole[] = [
    "buyer",
    "seller",
    "tenant",
    "landlord",
    "investor",
    "flipper",
    "developer",
    "external_agent",
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal overlay"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-[121] flex max-h-[92vh] w-full max-w-6xl flex-col rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold tracking-tight text-white">
              {mode === "edit"
                ? t(lang, "contactsEditTitle" as any) ?? "Edytuj kontakt"
                : t(lang, "contactsNew" as any) ?? "Nowy kontakt"}
            </h3>
            <p className="mt-1 text-sm text-white/55">
              {mode === "edit"
                ? "Edycja danych kontaktu i ustawień CRM."
                : "Dodaj klienta wraz z typem sprawy, danymi zlecenia i nieruchomości."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4">
            <SectionCard title="Rodzaj klienta i sprawy">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="block">
                  <FieldLabel>{t(lang, "contactsFieldType" as any) ?? "Typ kontaktu"}</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={clsx(
                        "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                        form.partyType === "person"
                          ? "border-ew-accent bg-ew-accent/10 text-white"
                          : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15"
                      )}
                      onClick={() => setForm((prev) => ({ ...prev, partyType: "person" }))}
                    >
                      Osoba
                    </button>

                    <button
                      type="button"
                      className={clsx(
                        "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                        form.partyType === "company"
                          ? "border-ew-accent bg-ew-accent/10 text-white"
                          : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15"
                      )}
                      onClick={() => setForm((prev) => ({ ...prev, partyType: "company" }))}
                    >
                      Firma
                    </button>
                  </div>
                </label>

                <label className="block">
                  <FieldLabel>Rodzaj sprawy</FieldLabel>
                  <SelectBox
                    value={form.caseType}
                    onChange={(e) =>
                      setForm((prev) => {
                        const nextCaseType = e.target.value as ClientCaseType;
                        return {
                          ...prev,
                          caseType: nextCaseType,
                          createCase: !["other", "unspecified"].includes(nextCaseType),
                        };
                      })
                    }
                  >
                    <option value="seller">Sprzedający</option>
                    <option value="buyer">Kupujący</option>
                    <option value="landlord">Wynajmujący</option>
                    <option value="tenant">Najmujący</option>
                    <option value="credit">Kredytowy</option>
                    <option value="insurance">Ubezpieczeniowy</option>
                    <option value="offer_inquiry">Zapytanie na ofertę</option>
                    <option value="unspecified">Nieokreślony</option>
                    <option value="other">Inne kontakty</option>
                  </SelectBox>
                </label>

                <label className="block">
                  <FieldLabel>Zakres widoczności</FieldLabel>
                  <SelectBox
                    value={form.visibilityScope}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        visibilityScope: e.target.value as VisibilityScope,
                      }))
                    }
                  >
                    <option value="everywhere">Everywhere</option>
                    <option value="network">Moja sieć</option>
                    <option value="office">Moje biuro</option>
                    <option value="group">Moja grupa</option>
                    <option value="mine">Tylko moje</option>
                  </SelectBox>
                </label>

                <label className="block">
                  <FieldLabel>Status rekordu</FieldLabel>
                  <SelectBox
                    value={form.clientBucket}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        clientBucket: e.target.value as "client" | "archive",
                      }))
                    }
                  >
                    <option value="client">Klient</option>
                    <option value="archive">Archiwum</option>
                  </SelectBox>
                </label>
              </div>

              <div className="mt-4">
                <FieldLabel>Role klienta</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((role) => {
                    const active = form.clientRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        className={clsx(
                          "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                          active
                            ? "border-ew-accent bg-ew-accent/10 text-white"
                            : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15"
                        )}
                        onClick={() =>
                          setForm((prev) => {
                            const clientRoles = active
                              ? prev.clientRoles.filter((x) => x !== role)
                              : [...prev.clientRoles, role];
                            return {
                              ...prev,
                              clientRoles,
                              ...(mode === "create"
                                ? {
                                    caseType: deriveCaseTypeFromRoles(clientRoles),
                                    createCase: !["other", "unspecified"].includes(
                                      deriveCaseTypeFromRoles(clientRoles)
                                    ),
                                  }
                                : {}),
                            };
                          })
                        }
                      >
                        {getClientRoleLabel(lang, role)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Status i pipeline">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <FieldLabel>{t(lang, "contactsFieldStatus" as any) ?? "Status klienta"}</FieldLabel>
                  <SelectBox
                    value={form.status}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        status: e.target.value as ClientStatus,
                      }))
                    }
                  >
                    <option value="new">Nowy</option>
                    <option value="active">Aktywny</option>
                    <option value="in_progress">W trakcie</option>
                    <option value="won">Wygrany</option>
                    <option value="lost">Przegrany</option>
                    <option value="inactive">Nieaktywny</option>
                    <option value="archived">Zarchiwizowany</option>
                  </SelectBox>
                </label>

                <label className="block">
                  <FieldLabel>{t(lang, "contactsFieldPipelineStage" as any) ?? "Etap pipeline"}</FieldLabel>
                  <SelectBox
                    value={form.pipelineStage}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        pipelineStage: e.target.value as ClientPipelineStage,
                      }))
                    }
                  >
                    <option value="lead">Lead</option>
                    <option value="qualified">Zakwalifikowany</option>
                    <option value="contacted">Skontaktowano</option>
                    <option value="meeting_scheduled">Umówione spotkanie</option>
                    <option value="needs_analysis">Analiza potrzeb</option>
                    <option value="property_match">Dobór oferty</option>
                    <option value="offer_preparation">Przygotowanie oferty</option>
                    <option value="offer_sent">Oferta wysłana</option>
                    <option value="negotiation">Negocjacje</option>
                    <option value="contract_preparation">Przygotowanie umowy</option>
                    <option value="closed_won">Wygrana transakcja</option>
                    <option value="closed_lost">Utracona transakcja</option>
                  </SelectBox>
                </label>

                <label className="block">
                  <FieldLabel>Opiekun (user id)</FieldLabel>
                  <TextInput
                    value={form.assignedUserId}
                    onChange={(e) => setForm((prev) => ({ ...prev, assignedUserId: e.target.value }))}
                    placeholder="uuid użytkownika"
                  />
                </label>
              </div>
            </SectionCard>

            <SectionCard title="Dane podstawowe">
              {isCompany ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <FieldLabel>Nazwa firmy</FieldLabel>
                    <TextInput
                      value={form.companyName}
                      onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                      placeholder="Nazwa firmy"
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>NIP</FieldLabel>
                    <TextInput
                      value={form.nip}
                      onChange={(e) => setForm((prev) => ({ ...prev, nip: e.target.value }))}
                      placeholder="NIP"
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>REGON</FieldLabel>
                    <TextInput
                      value={form.regon}
                      onChange={(e) => setForm((prev) => ({ ...prev, regon: e.target.value }))}
                      placeholder="REGON"
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>KRS</FieldLabel>
                    <TextInput
                      value={form.krs}
                      onChange={(e) => setForm((prev) => ({ ...prev, krs: e.target.value }))}
                      placeholder="KRS"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block">
                    <FieldLabel>Imię</FieldLabel>
                    <TextInput
                      value={form.firstName}
                      onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      placeholder="Imię"
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Nazwisko</FieldLabel>
                    <TextInput
                      value={form.lastName}
                      onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Nazwisko"
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>PESEL</FieldLabel>
                    <TextInput
                      value={form.pesel}
                      onChange={(e) => setForm((prev) => ({ ...prev, pesel: e.target.value }))}
                      placeholder="PESEL"
                    />
                  </label>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Dane kontaktowe">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <FieldLabel>Telefon</FieldLabel>
                  <TextInput
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Telefon"
                  />
                </label>

                <label className="block">
                  <FieldLabel>Email</FieldLabel>
                  <TextInput
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="email@example.com"
                  />
                </label>
              </div>
            </SectionCard>

            <SectionCard title="Źródło, notatki i zgody">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <FieldLabel>Źródło</FieldLabel>
                  <TextInput
                    value={form.source}
                    onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                    placeholder="np. baner, otodom, facebook, google"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={form.marketingConsent}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        marketingConsent: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-transparent"
                  />
                  <span className="text-sm text-white">Zgoda marketingowa</span>
                </label>
              </div>

              <div className="mt-4 grid gap-4">
                <label className="block">
                  <FieldLabel>Notatki</FieldLabel>
                  <TextArea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                    placeholder="Notatki"
                  />
                </label>

                <label className="block">
                  <FieldLabel>Notatki do zgody marketingowej</FieldLabel>
                  <TextArea
                    value={form.marketingConsentNotes}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, marketingConsentNotes: e.target.value }))
                    }
                    rows={2}
                    placeholder="Opcjonalne informacje o zgodzie"
                  />
                </label>
              </div>
            </SectionCard>

            <SectionCard title="Dane zlecenia">
              {shouldShowOrderSection(form.caseType) ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="block">
                    <FieldLabel>Rodzaj nieruchomości</FieldLabel>
                    <SelectBox
                      value={form.propertyKind}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          propertyKind: e.target.value as PropertyKind | "",
                        }))
                      }
                    >
                      <option value="">—</option>
                      <option value="apartment">Mieszkanie</option>
                      <option value="house">Dom</option>
                      <option value="plot">Działka</option>
                      <option value="commercial_unit">Lokal użytkowy</option>
                      <option value="tenement">Kamienica</option>
                      <option value="warehouse">Hala / magazyn</option>
                      <option value="other_commercial">Inny komercyjny</option>
                      <option value="other">Inny</option>
                    </SelectBox>
                  </label>

                  <label className="block">
                    <FieldLabel>Rynek</FieldLabel>
                    <SelectBox
                      value={form.marketType}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          marketType: e.target.value as PropertyMarketType | "",
                        }))
                      }
                    >
                      <option value="">—</option>
                      <option value="primary">Pierwotny</option>
                      <option value="secondary">Wtórny</option>
                    </SelectBox>
                  </label>

                  <label className="block">
                    <FieldLabel>Rodzaj umowy</FieldLabel>
                    <SelectBox
                      value={form.contractType}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          contractType: e.target.value as PropertyContractType | "",
                        }))
                      }
                    >
                      <option value="">—</option>
                      <option value="none">Brak</option>
                      <option value="exclusive_bilateral">Wyłączność obustronna</option>
                      <option value="exclusive_unilateral">Wyłączność jednostronna</option>
                      <option value="open">Otwarta</option>
                    </SelectBox>
                  </label>

                  <label className="block">
                    <FieldLabel>Opiekun zlecenia (user id)</FieldLabel>
                    <TextInput
                      value={form.caretakerUserId}
                      onChange={(e) => setForm((prev) => ({ ...prev, caretakerUserId: e.target.value }))}
                      placeholder="uuid"
                    />
                  </label>

                  {["buyer", "tenant", "offer_inquiry"].includes(form.caseType) ? (
                    <>
                      <label className="block">
                        <FieldLabel>Typ poszukiwanej nieruchomości</FieldLabel>
                        <SelectBox
                          value={form.expectedPropertyKind}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              expectedPropertyKind: e.target.value as PropertyKind | "",
                            }))
                          }
                        >
                          <option value="">—</option>
                          <option value="apartment">Mieszkanie</option>
                          <option value="house">Dom</option>
                          <option value="plot">Działka</option>
                          <option value="commercial_unit">Lokal użytkowy</option>
                          <option value="tenement">Kamienica</option>
                          <option value="warehouse">Hala / magazyn</option>
                          <option value="other_commercial">Inny komercyjny</option>
                          <option value="other">Inny</option>
                        </SelectBox>
                      </label>

                      <label className="block md:col-span-2">
                        <FieldLabel>Lokalizacja poszukiwana</FieldLabel>
                        <TextInput
                          value={form.searchLocationText}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, searchLocationText: e.target.value }))
                          }
                          placeholder="Miasto / dzielnica / obszar"
                        />
                      </label>

                      <label className="block">
                        <FieldLabel>Budżet od</FieldLabel>
                        <TextInput
                          value={form.budgetMin}
                          onChange={(e) => setForm((prev) => ({ ...prev, budgetMin: e.target.value }))}
                          placeholder="0"
                        />
                      </label>

                      <label className="block">
                        <FieldLabel>Budżet do</FieldLabel>
                        <TextInput
                          value={form.budgetMax}
                          onChange={(e) => setForm((prev) => ({ ...prev, budgetMax: e.target.value }))}
                          placeholder="0"
                        />
                      </label>

                      <label className="block">
                        <FieldLabel>Pokoje od</FieldLabel>
                        <TextInput
                          value={form.roomsMin}
                          onChange={(e) => setForm((prev) => ({ ...prev, roomsMin: e.target.value }))}
                          placeholder="0"
                        />
                      </label>

                      <label className="block">
                        <FieldLabel>Pokoje do</FieldLabel>
                        <TextInput
                          value={form.roomsMax}
                          onChange={(e) => setForm((prev) => ({ ...prev, roomsMax: e.target.value }))}
                          placeholder="0"
                        />
                      </label>

                      <label className="block">
                        <FieldLabel>Powierzchnia od (m²)</FieldLabel>
                        <TextInput
                          value={form.areaMin}
                          onChange={(e) => setForm((prev) => ({ ...prev, areaMin: e.target.value }))}
                          placeholder="0"
                        />
                      </label>

                      <label className="block">
                        <FieldLabel>Powierzchnia do (m²)</FieldLabel>
                        <TextInput
                          value={form.areaMax}
                          onChange={(e) => setForm((prev) => ({ ...prev, areaMax: e.target.value }))}
                          placeholder="0"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="text-xs text-white/55">Ten rodzaj sprawy nie wymaga sekcji zlecenia.</div>
              )}
            </SectionCard>

            <SectionCard title="Dane nieruchomości">
              {shouldShowPropertySection(form.caseType) ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="block">
                    <FieldLabel>Państwo</FieldLabel>
                    <TextInput
                      value={form.country}
                      onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Miasto</FieldLabel>
                    <TextInput
                      value={form.city}
                      onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <FieldLabel>Ulica</FieldLabel>
                    <TextInput
                      value={form.street}
                      onChange={(e) => setForm((prev) => ({ ...prev, street: e.target.value }))}
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Nr budynku</FieldLabel>
                    <TextInput
                      value={form.buildingNumber}
                      onChange={(e) => setForm((prev) => ({ ...prev, buildingNumber: e.target.value }))}
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Nr lokalu</FieldLabel>
                    <TextInput
                      value={form.unitNumber}
                      onChange={(e) => setForm((prev) => ({ ...prev, unitNumber: e.target.value }))}
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Cena</FieldLabel>
                    <TextInput
                      value={form.priceAmount}
                      onChange={(e) => setForm((prev) => ({ ...prev, priceAmount: e.target.value }))}
                      placeholder="0"
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Waluta</FieldLabel>
                    <TextInput
                      value={form.priceCurrency}
                      onChange={(e) => setForm((prev) => ({ ...prev, priceCurrency: e.target.value }))}
                      placeholder="PLN"
                    />
                  </label>

                  {form.caseType === "landlord" ? (
                    <label className="block">
                      <FieldLabel>Okres ceny</FieldLabel>
                      <TextInput
                        value={form.pricePeriod}
                        onChange={(e) => setForm((prev) => ({ ...prev, pricePeriod: e.target.value }))}
                        placeholder="month"
                      />
                    </label>
                  ) : null}

                  <label className="block">
                    <FieldLabel>Powierzchnia (m²)</FieldLabel>
                    <TextInput
                      value={form.areaM2}
                      onChange={(e) => setForm((prev) => ({ ...prev, areaM2: e.target.value }))}
                      placeholder="0"
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Ilość pokoi / pomieszczeń</FieldLabel>
                    <TextInput
                      value={form.roomsCount}
                      onChange={(e) => setForm((prev) => ({ ...prev, roomsCount: e.target.value }))}
                      placeholder="0"
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Piętro</FieldLabel>
                    <TextInput
                      value={form.floorNumber}
                      onChange={(e) => setForm((prev) => ({ ...prev, floorNumber: e.target.value }))}
                      placeholder="0"
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Z ilu pięter</FieldLabel>
                    <TextInput
                      value={form.floorTotal}
                      onChange={(e) => setForm((prev) => ({ ...prev, floorTotal: e.target.value }))}
                      placeholder="0"
                    />
                  </label>
                </div>
              ) : (
                <div className="text-xs text-white/55">Ten rodzaj sprawy nie wymaga danych nieruchomości.</div>
              )}
            </SectionCard>

            <SectionCard title="Zapytanie na ofertę">
              {shouldShowOfferInquirySection(form.caseType) ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <FieldLabel>ID oferty</FieldLabel>
                    <TextInput
                      value={form.offerId}
                      onChange={(e) => setForm((prev) => ({ ...prev, offerId: e.target.value }))}
                      placeholder="uuid oferty"
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={form.autofillFromOffer}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          autofillFromOffer: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-white/20 bg-transparent"
                    />
                    <span className="text-sm text-white">Uzupełnij kryteria na podstawie oferty</span>
                  </label>

                  <label className="block">
                    <FieldLabel>Margines auto-uzupełniania (%)</FieldLabel>
                    <TextInput
                      value={form.autofillMarginPercent}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, autofillMarginPercent: e.target.value }))
                      }
                      placeholder="10"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <FieldLabel>Treść zapytania</FieldLabel>
                    <TextArea
                      value={form.inquiryText}
                      onChange={(e) => setForm((prev) => ({ ...prev, inquiryText: e.target.value }))}
                      rows={4}
                    />
                  </label>
                </div>
              ) : (
                <div className="text-xs text-white/55">Ta sekcja dotyczy wyłącznie zapytania na ofertę.</div>
              )}
            </SectionCard>

            <SectionCard title="Dane kredytowe">
              {shouldShowCreditSection(form.caseType) ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label className="block">
                    <FieldLabel>Cena kredytowanej nieruchomości</FieldLabel>
                    <TextInput
                      value={form.creditedPropertyPrice}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, creditedPropertyPrice: e.target.value }))
                      }
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Planowany wkład własny</FieldLabel>
                    <TextInput
                      value={form.plannedOwnContribution}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, plannedOwnContribution: e.target.value }))
                      }
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>Okres kredytowania (mies.)</FieldLabel>
                    <TextInput
                      value={form.loanPeriodMonths}
                      onChange={(e) => setForm((prev) => ({ ...prev, loanPeriodMonths: e.target.value }))}
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 md:col-span-2 xl:col-span-3">
                    <input
                      type="checkbox"
                      checked={form.concernsExistingProperty}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          concernsExistingProperty: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-white/20 bg-transparent"
                    />
                    <span className="text-sm text-white">Dotyczy posiadanej nieruchomości</span>
                  </label>

                  <label className="block">
                    <FieldLabel>Powiązana oferta (ID)</FieldLabel>
                    <TextInput
                      value={form.relatedOfferId}
                      onChange={(e) => setForm((prev) => ({ ...prev, relatedOfferId: e.target.value }))}
                      placeholder="uuid oferty"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <FieldLabel>Opis nieruchomości / notatki</FieldLabel>
                    <TextArea
                      value={form.existingPropertyNotes}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, existingPropertyNotes: e.target.value }))
                      }
                      rows={3}
                    />
                  </label>
                </div>
              ) : (
                <div className="text-xs text-white/55">Ta sekcja dotyczy wyłącznie spraw kredytowych.</div>
              )}
            </SectionCard>

            <SectionCard title="Dane ubezpieczeniowe">
              {shouldShowInsuranceSection(form.caseType) ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <FieldLabel>Co chcesz ubezpieczyć</FieldLabel>
                    <SelectBox
                      value={form.insuranceSubject}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          insuranceSubject: e.target.value as InsuranceSubject | "",
                        }))
                      }
                    >
                      <option value="">—</option>
                      <option value="house">Dom</option>
                      <option value="car">Auto</option>
                      <option value="vacation">Wakacje</option>
                      <option value="children">Dzieci</option>
                      <option value="other">Inne</option>
                    </SelectBox>
                  </label>

                  <label className="block md:col-span-2">
                    <FieldLabel>Notatki ubezpieczeniowe</FieldLabel>
                    <TextArea
                      value={form.insuranceNotes}
                      onChange={(e) => setForm((prev) => ({ ...prev, insuranceNotes: e.target.value }))}
                      rows={3}
                    />
                  </label>
                </div>
              ) : (
                <div className="text-xs text-white/55">Ta sekcja dotyczy wyłącznie spraw ubezpieczeniowych.</div>
              )}
            </SectionCard>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15 disabled:opacity-60"
          >
            {t(lang, "teamCancel" as any) ?? "Anuluj"}
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="rounded-2xl bg-ew-accent px-5 py-2 text-sm font-extrabold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
          >
            {saving
              ? t(lang, "contactsSaving" as any) ?? "Zapisywanie..."
              : mode === "edit"
                ? t(lang, "contactsSaveChanges" as any) ?? "Zapisz zmiany"
                : t(lang, "contactsSave" as any) ?? "Zapisz kontakt"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ContactsView({ lang }: { lang: LangKey }) {
  const router = useRouter();

  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [partyType, setPartyType] = useState("");
  const [clientRole, setClientRole] = useState("");
  const [status, setStatus] = useState("");
  const [pipelineStage, setPipelineStage] = useState("");
  const [caseTypeFilter, setCaseTypeFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");

  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(buildInitialForm());

  async function load(next?: {
    q?: string;
    partyType?: string;
    clientRole?: string;
    status?: string;
    pipelineStage?: string;
    caseTypeFilter?: string;
  }) {
    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams();

      const qValue = (next?.q ?? q).trim();
      const typeValue = (next?.partyType ?? partyType).trim();
      const roleValue = (next?.clientRole ?? clientRole).trim();
      const statusValue = (next?.status ?? status).trim();
      const pipelineValue = (next?.pipelineStage ?? pipelineStage).trim();

      if (qValue.length >= 2) qs.set("q", qValue);
      if (typeValue) qs.set("partyType", typeValue);
      if (roleValue) qs.set("clientRole", roleValue);
      if (statusValue) qs.set("status", statusValue);
      if (pipelineValue) qs.set("pipelineStage", pipelineValue);
      qs.set("limit", "100");

      const r = await fetch(`/api/contacts/list?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      const rawRows = Array.isArray(j?.rows) ? (j.rows as ContactRow[]) : [];
      const caseTypeWanted = (next?.caseTypeFilter ?? caseTypeFilter).trim();

      const filtered =
        caseTypeWanted.length > 0
          ? rawRows.filter(
              (row) =>
                deriveCaseTypeFromRoles((row.client_roles ?? []) as ClientRole[]) === caseTypeWanted
            )
          : rawRows;

      setRows(filtered);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreateSaving(true);
    setCreateError(null);

    try {
      const payload = buildPayloadFromForm(form);

      const r = await fetch("/api/contacts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        const code = j?.error ?? `HTTP ${r.status}`;
        if (code === "MISSING_FULL_NAME") throw new Error("Brak nazwy lub imienia i nazwiska.");
        if (code === "MISSING_CONTACT_CHANNEL") throw new Error("Podaj telefon lub email.");
        if (code === "MISSING_PERSON_NAME_PARTS") throw new Error("Podaj imię i nazwisko.");
        if (code === "MISSING_COMPANY_NAME") throw new Error("Podaj nazwę firmy.");
        throw new Error(code);
      }

      setModalOpen(false);
      setForm(buildInitialForm());
      await load();
    } catch (e: any) {
      setCreateError(e?.message ?? "Nie udało się zapisać kontaktu.");
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleDelete(row: ContactRow) {
    if (!row?.id) return;

    const withInteractions = hasRowInteractions(row);

    if (withInteractions) {
      const confirmed = window.confirm(
        "Ten kontakt ma powiązania. Czy na pewno chcesz go usunąć?"
      );
      if (!confirmed) return;
    }

    try {
      const r = await fetch(`/api/contacts/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        const code = j?.error ?? `HTTP ${r.status}`;
        if (code === "MISSING_ID") throw new Error("Brak identyfikatora.");
        if (code === "NOT_FOUND") throw new Error("Nie znaleziono kontaktu.");
        throw new Error(code);
      }

      await load();
    } catch (e: any) {
      alert(e?.message ?? "Nie udało się usunąć kontaktu.");
    }
  }

  function openCreateModal(caseType?: ClientCaseType) {
    setCreateError(null);
    const next = buildInitialForm();

    if (caseType) {
      next.caseType = caseType;
      next.createCase = !["other", "unspecified"].includes(caseType);
      if (caseType === "seller") next.clientRoles = ["seller"];
      if (caseType === "buyer") next.clientRoles = ["buyer"];
      if (caseType === "landlord") next.clientRoles = ["landlord"];
      if (caseType === "tenant") next.clientRoles = ["tenant"];
      if (caseType === "offer_inquiry") next.clientRoles = ["buyer"];
    }

    setForm(next);
    setModalMode("create");
    setModalOpen(true);
  }

  function closeCreateModal() {
    if (createSaving) return;
    setModalOpen(false);
    setCreateError(null);
    setForm(buildInitialForm());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empty = !loading && !error && rows.length === 0;

  const summary = useMemo(() => {
    const persons = rows.filter((r) => (r.party_type ?? "").toLowerCase() === "person").length;
    const companies = rows.filter((r) => (r.party_type ?? "").toLowerCase() === "company").length;
    const active = rows.filter((r) => r.status === "active").length;
    const sellers = rows.filter(
      (r) => deriveCaseTypeFromRoles((r.client_roles ?? []) as ClientRole[]) === "seller"
    ).length;
    const buyers = rows.filter(
      (r) => deriveCaseTypeFromRoles((r.client_roles ?? []) as ClientRole[]) === "buyer"
    ).length;

    return {
      total: rows.length,
      persons,
      companies,
      active,
      sellers,
      buyers,
    };
  }, [rows]);

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-white">
                {t(lang, "panelNavClients" as any) ?? "Baza klientów"}
              </h2>
              <p className="mt-0.5 text-xs text-white/50">
                Baza klientów, spraw i relacji z klientami
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                onClick={() => load()}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15"
              >
                {t(lang, "offersRefresh" as any) ?? "Odśwież"}
              </button>

              <button
                type="button"
                onClick={() => openCreateModal()}
                className="rounded-xl bg-ew-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:opacity-95"
              >
                + Nowy klient
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { key: "", label: "Wszyscy" },
              { key: "seller", label: "Sprzedający" },
              { key: "buyer", label: "Kupujący" },
              { key: "landlord", label: "Wynajmujący" },
              { key: "tenant", label: "Najmujący" },
              { key: "credit", label: "Kredytowi" },
              { key: "insurance", label: "Ubezpieczeniowi" },
              { key: "offer_inquiry", label: "Zapytania ofertowe" },
              { key: "other", label: "Inne kontakty" },
            ].map((item) => (
              <button
                key={item.key || "all"}
                type="button"
                onClick={() => {
                  setCaseTypeFilter(item.key);
                  load({
                    q,
                    partyType,
                    clientRole,
                    status,
                    pipelineStage,
                    caseTypeFilter: item.key,
                  });
                }}
                className={clsx(
                  "rounded-xl border px-3 py-1 text-xs font-semibold transition",
                  caseTypeFilter === item.key
                    ? "border-ew-accent bg-ew-accent/10 text-white"
                    : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_210px_210px_230px_auto]">
            <TextInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Szukaj po nazwie, telefonie, emailu, PESEL, NIP, KRS"
            />

            <SelectBox value={partyType} onChange={(e) => setPartyType(e.target.value)}>
              <option value="">Wszystkie typy</option>
              <option value="person">Osoba</option>
              <option value="company">Firma</option>
            </SelectBox>

            <SelectBox value={clientRole} onChange={(e) => setClientRole(e.target.value)}>
              <option value="">Wszystkie role</option>
              <option value="buyer">Kupujący</option>
              <option value="seller">Sprzedający</option>
              <option value="tenant">Najmujący</option>
              <option value="landlord">Wynajmujący</option>
              <option value="investor">Inwestor</option>
              <option value="flipper">Fliper</option>
              <option value="developer">Deweloper</option>
              <option value="external_agent">Pośrednik zewnętrzny</option>
            </SelectBox>

            <SelectBox value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Wszystkie statusy</option>
              <option value="new">Nowy</option>
              <option value="active">Aktywny</option>
              <option value="in_progress">W trakcie</option>
              <option value="won">Wygrany</option>
              <option value="lost">Przegrany</option>
              <option value="inactive">Nieaktywny</option>
              <option value="archived">Zarchiwizowany</option>
            </SelectBox>

            <SelectBox value={pipelineStage} onChange={(e) => setPipelineStage(e.target.value)}>
              <option value="">Wszystkie etapy</option>
              <option value="lead">Lead</option>
              <option value="qualified">Zakwalifikowany</option>
              <option value="contacted">Skontaktowano</option>
              <option value="meeting_scheduled">Umówione spotkanie</option>
              <option value="needs_analysis">Analiza potrzeb</option>
              <option value="property_match">Dobór oferty</option>
              <option value="offer_preparation">Przygotowanie oferty</option>
              <option value="offer_sent">Oferta wysłana</option>
              <option value="negotiation">Negocjacje</option>
              <option value="contract_preparation">Przygotowanie umowy</option>
              <option value="closed_won">Wygrana transakcja</option>
              <option value="closed_lost">Utracona transakcja</option>
            </SelectBox>

            <button
              type="button"
              onClick={() => load({ q, partyType, clientRole, status, pipelineStage, caseTypeFilter })}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
            >
              Szukaj
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              Łącznie: {summary.total}
            </span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              Osoby: {summary.persons}
            </span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              Firmy: {summary.companies}
            </span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              Sprzedający: {summary.sellers}
            </span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              Kupujący: {summary.buyers}
            </span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              Aktywni: {summary.active}
            </span>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
          {loading ? (
            <div className="text-xs text-white/50">Ładowanie klientów...</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
              Nie udało się pobrać klientów: {error}
            </div>
          ) : empty ? (
            <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
              <p className="text-xs text-white/60">Brak klientów.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {rows.map((r) => {
                const phone = getDisplayPhone(r);
                const email = getDisplayEmail(r);
                const withInteractions = hasRowInteractions(r);
                const derivedCaseType = deriveCaseTypeFromRoles((r.client_roles ?? []) as ClientRole[]);

                return (
                  <div key={r.id} className="p-3 transition hover:bg-white/5">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.3fr)_minmax(170px,0.9fr)_minmax(200px,1fr)_minmax(220px,1fr)_auto]">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className={clsx(
                              "h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/15",
                              (r.party_type ?? "").toLowerCase() === "company"
                                ? "bg-sky-400"
                                : "bg-emerald-400"
                            )}
                          />
                          <div className="truncate text-sm font-semibold text-white">{r.full_name ?? "-"}</div>
                        </div>

                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-white/10">
                            {normalizePartyTypeLabel(lang, r.party_type)}
                          </span>

                          <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-100 ring-1 ring-indigo-500/20">
                            {getCaseTypeLabel(lang, derivedCaseType)}
                          </span>

                          {r.status ? (
                            <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-100 ring-1 ring-sky-500/20">
                              {getClientStatusLabel(lang, r.status)}
                            </span>
                          ) : null}

                          {r.pipeline_stage ? (
                            <span className="rounded bg-fuchsia-500/15 px-2 py-0.5 text-[10px] text-fuchsia-100 ring-1 ring-fuchsia-500/20">
                              {getPipelineStageLabel(lang, r.pipeline_stage)}
                            </span>
                          ) : null}

                          {Array.isArray(r.client_roles) && r.client_roles.length
                            ? r.client_roles.map((role) => (
                                <span
                                  key={role}
                                  className="rounded bg-ew-accent/15 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-ew-accent/20"
                                >
                                  {getClientRoleLabel(lang, role)}
                                </span>
                              ))
                            : null}

                          {r.pesel ? (
                            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                              PESEL: {r.pesel}
                            </span>
                          ) : null}

                          {r.nip ? (
                            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                              NIP: {r.nip}
                            </span>
                          ) : null}

                          {withInteractions ? (
                            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200 ring-1 ring-amber-500/20">
                              Interakcje: {r.interactions_count ?? 1}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-[11px] text-white/70">
                        <div className="text-white/45">Rodzaj</div>
                        <div className="mt-1 font-semibold text-white/85">
                          {getCaseTypeLabel(lang, derivedCaseType)}
                        </div>
                      </div>

                      <div className="min-w-0 text-[11px] text-white/70">
                        <div className="text-white/45">Telefon</div>
                        <div className="mt-1 truncate font-semibold text-white/85">
                          {phone ? (
                            <a href={`tel:${phone}`} className="text-ew-accent underline">
                              {phone}
                            </a>
                          ) : (
                            "-"
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 text-[11px] text-white/70">
                        <div className="text-white/45">Email</div>
                        <div className="mt-1 truncate font-semibold text-white/85">
                          {email ? (
                            <a href={`mailto:${email}`} className="text-ew-accent underline">
                              {email}
                            </a>
                          ) : (
                            "-"
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <div className="text-[11px] text-white/45">Dodano: {fmtDate(r.created_at)}</div>

                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/panel/contacts/${encodeURIComponent(r.id)}`)
                            }
                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-white/15"
                          >
                            Otwórz
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/panel/contacts/${encodeURIComponent(r.id)}?mode=edit`)
                            }
                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-white/15"
                          >
                            Edytuj
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            className={clsx(
                              "rounded-xl px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition",
                              withInteractions
                                ? "border border-red-500/30 bg-red-500/20 hover:bg-red-500/30"
                                : "border border-red-500/20 bg-red-600/70 hover:bg-red-600"
                            )}
                          >
                            {t(lang, "delete" as any) ?? "Kasuj"}
                          </button>
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

      <ContactModal
        lang={lang}
        open={modalOpen}
        mode={modalMode}
        saving={createSaving}
        error={createError}
        form={form}
        setForm={setForm}
        onClose={closeCreateModal}
        onSubmit={handleCreate}
      />
    </>
  );
}