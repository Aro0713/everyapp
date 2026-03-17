import { useEffect, useMemo, useState } from "react";
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

type ContactFormState = {
  partyType: "person" | "company";
  clientRoles: ClientRole[];
  status: ClientStatus;
  pipelineStage: ClientPipelineStage;
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

function buildInitialForm(): ContactFormState {
  return {
    partyType: "person",
    clientRoles: [],
    status: "new",
    pipelineStage: "lead",
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
  };
}

function getClientRoleLabel(lang: LangKey, role: ClientRole | string) {
  switch (role) {
    case "buyer":
      return t(lang, "contactsRoleBuyer" as any) ?? "Kupujący";
    case "seller":
      return t(lang, "contactsRoleSeller" as any) ?? "Sprzedający";
    case "tenant":
      return t(lang, "contactsRoleTenant" as any) ?? "Najemca";
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

function mapRowToForm(row: ContactRow): ContactFormState {
  const fullName = (row.full_name ?? "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const isCompany = (row.party_type ?? "").toLowerCase() === "company";

  return {
    partyType: isCompany ? "company" : "person",
    clientRoles: Array.isArray(row.client_roles)
      ? (row.client_roles.filter(Boolean) as ClientRole[])
      : [],
    status: (row.status ?? "new") as ClientStatus,
    pipelineStage: (row.pipeline_stage ?? "lead") as ClientPipelineStage,
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
  };
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

function ContactModal({
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

      <div className="relative z-[121] w-full max-w-4xl rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold tracking-tight text-white">
              {mode === "edit"
                ? t(lang, "contactsEditTitle" as any) ?? "Edytuj kontakt"
                : t(lang, "contactsNew" as any) ?? "Nowy kontakt"}
            </h3>
            <p className="mt-1 text-sm text-white/55">
              {mode === "edit"
                ? t(lang, "contactsEditSub" as any) ?? "Zmień dane kontaktu"
                : t(lang, "contactsModalSub" as any) ?? "Dodaj osobę lub firmę do bazy kontaktów"}
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

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                {t(lang, "contactsFieldType" as any) ?? "Typ kontaktu"}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={clsx(
                    "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                    form.partyType === "person"
                      ? "border-ew-accent bg-ew-accent/10 text-white"
                      : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15"
                  )}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      partyType: "person",
                    }))
                  }
                >
                  {t(lang, "contactsTypePerson" as any) ?? "Osoba"}
                </button>

                <button
                  type="button"
                  className={clsx(
                    "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                    form.partyType === "company"
                      ? "border-ew-accent bg-ew-accent/10 text-white"
                      : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15"
                  )}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      partyType: "company",
                    }))
                  }
                >
                  {t(lang, "contactsTypeCompany" as any) ?? "Firma"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                {t(lang, "contactsFieldRole" as any) ?? "Rola klienta"}
              </div>

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
                        setForm((prev) => ({
                          ...prev,
                          clientRoles: active
                            ? prev.clientRoles.filter((x) => x !== role)
                            : [...prev.clientRoles, role],
                        }))
                      }
                    >
                      {getClientRoleLabel(lang, role)}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-xs text-white/45">
                {t(lang, "contactsRoleHint" as any) ??
                  "Kontakt może mieć więcej niż jedną rolę, np. sprzedający i inwestor."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                {t(lang, "contactsSectionWorkflow" as any) ?? "Status i pipeline"}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-white/60">
                    {t(lang, "contactsFieldStatus" as any) ?? "Status klienta"}
                  </span>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        status: e.target.value as ClientStatus,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                  >
                    <option value="new">{t(lang, "contactsStatusNew" as any) ?? "Nowy"}</option>
                    <option value="active">{t(lang, "contactsStatusActive" as any) ?? "Aktywny"}</option>
                    <option value="in_progress">
                      {t(lang, "contactsStatusInProgress" as any) ?? "W trakcie"}
                    </option>
                    <option value="won">{t(lang, "contactsStatusWon" as any) ?? "Wygrany"}</option>
                    <option value="lost">{t(lang, "contactsStatusLost" as any) ?? "Przegrany"}</option>
                    <option value="inactive">
                      {t(lang, "contactsStatusInactive" as any) ?? "Nieaktywny"}
                    </option>
                    <option value="archived">
                      {t(lang, "contactsStatusArchived" as any) ?? "Zarchiwizowany"}
                    </option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-white/60">
                    {t(lang, "contactsFieldPipelineStage" as any) ?? "Etap pipeline"}
                  </span>
                  <select
                    value={form.pipelineStage}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        pipelineStage: e.target.value as ClientPipelineStage,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                  >
                    <option value="lead">{t(lang, "contactsPipelineLead" as any) ?? "Lead"}</option>
                    <option value="qualified">
                      {t(lang, "contactsPipelineQualified" as any) ?? "Zakwalifikowany"}
                    </option>
                    <option value="contacted">
                      {t(lang, "contactsPipelineContacted" as any) ?? "Skontaktowano"}
                    </option>
                    <option value="meeting_scheduled">
                      {t(lang, "contactsPipelineMeetingScheduled" as any) ?? "Umówione spotkanie"}
                    </option>
                    <option value="needs_analysis">
                      {t(lang, "contactsPipelineNeedsAnalysis" as any) ?? "Analiza potrzeb"}
                    </option>
                    <option value="property_match">
                      {t(lang, "contactsPipelinePropertyMatch" as any) ?? "Dobór oferty"}
                    </option>
                    <option value="offer_preparation">
                      {t(lang, "contactsPipelineOfferPreparation" as any) ?? "Przygotowanie oferty"}
                    </option>
                    <option value="offer_sent">
                      {t(lang, "contactsPipelineOfferSent" as any) ?? "Oferta wysłana"}
                    </option>
                    <option value="negotiation">
                      {t(lang, "contactsPipelineNegotiation" as any) ?? "Negocjacje"}
                    </option>
                    <option value="contract_preparation">
                      {t(lang, "contactsPipelineContractPreparation" as any) ?? "Przygotowanie umowy"}
                    </option>
                    <option value="closed_won">
                      {t(lang, "contactsPipelineClosedWon" as any) ?? "Wygrana transakcja"}
                    </option>
                    <option value="closed_lost">
                      {t(lang, "contactsPipelineClosedLost" as any) ?? "Utracona transakcja"}
                    </option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                {t(lang, "contactsSectionBasic" as any) ?? "Dane podstawowe"}
              </div>

              {isCompany ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-white/60">
                      {t(lang, "contactsFieldCompanyName" as any) ?? "Nazwa firmy"}
                    </span>
                    <input
                      value={form.companyName}
                      onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                      placeholder={t(lang, "contactsFieldCompanyName" as any) ?? "Nazwa firmy"}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-white/60">
                      {t(lang, "contactsFieldNip" as any) ?? "NIP"}
                    </span>
                    <input
                      value={form.nip}
                      onChange={(e) => setForm((prev) => ({ ...prev, nip: e.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                      placeholder="NIP"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-white/60">
                      {t(lang, "contactsFieldRegon" as any) ?? "REGON"}
                    </span>
                    <input
                      value={form.regon}
                      onChange={(e) => setForm((prev) => ({ ...prev, regon: e.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                      placeholder="REGON"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-white/60">
                      {t(lang, "contactsFieldKrs" as any) ?? "KRS"}
                    </span>
                    <input
                      value={form.krs}
                      onChange={(e) => setForm((prev) => ({ ...prev, krs: e.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                      placeholder="KRS"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-white/60">
                      {t(lang, "contactsFieldFirstName" as any) ?? "Imię"}
                    </span>
                    <input
                      value={form.firstName}
                      onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                      placeholder={t(lang, "contactsFieldFirstName" as any) ?? "Imię"}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-white/60">
                      {t(lang, "contactsFieldLastName" as any) ?? "Nazwisko"}
                    </span>
                    <input
                      value={form.lastName}
                      onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                      placeholder={t(lang, "contactsFieldLastName" as any) ?? "Nazwisko"}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-white/60">
                      {t(lang, "contactsFieldPesel" as any) ?? "PESEL"}
                    </span>
                    <input
                      value={form.pesel}
                      onChange={(e) => setForm((prev) => ({ ...prev, pesel: e.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                      placeholder="PESEL"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                {t(lang, "contactsSectionContact" as any) ?? "Dane kontaktowe"}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-white/60">
                    {t(lang, "contactsFieldPhone" as any) ?? "Telefon"}
                  </span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                    placeholder={t(lang, "contactsFieldPhone" as any) ?? "Telefon"}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-white/60">
                    {t(lang, "contactsFieldEmail" as any) ?? "Email"}
                  </span>
                  <input
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                    placeholder="email@example.com"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                {t(lang, "contactsSectionExtra" as any) ?? "Dodatkowe informacje"}
              </div>

              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-white/60">
                    {t(lang, "contactsFieldSource" as any) ?? "Źródło"}
                  </span>
                  <input
                    value={form.source}
                    onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                    placeholder={t(lang, "contactsFieldSource" as any) ?? "Źródło"}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-white/60">
                    {t(lang, "contactsFieldNotes" as any) ?? "Notatki"}
                  </span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                    placeholder={t(lang, "contactsFieldNotes" as any) ?? "Notatki"}
                  />
                </label>
              </div>
            </div>
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

function ContactDetailsModal({
  lang,
  open,
  row,
  onClose,
  onEdit,
}: {
  lang: LangKey;
  open: boolean;
  row: ContactRow | null;
  onClose: () => void;
  onEdit: (row: ContactRow) => void;
}) {
  if (!open || !row) return null;

  const phone = getDisplayPhone(row);
  const email = getDisplayEmail(row);
  const withInteractions = hasRowInteractions(row);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal overlay"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-[121] w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold tracking-tight text-white">
              {t(lang, "listingOpen" as any) ?? "Otwórz"}
            </h3>
            <p className="mt-1 text-sm text-white/55">
              {t(lang, "contactsDetailsSub" as any) ?? "Podgląd danych kontaktu"}
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

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-lg font-bold text-white">{row.full_name ?? "-"}</div>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-white/10">
                {normalizePartyTypeLabel(lang, row.party_type)}
              </span>

              {row.status ? (
                <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-100 ring-1 ring-sky-500/20">
                  {getClientStatusLabel(lang, row.status)}
                </span>
              ) : null}

              {row.pipeline_stage ? (
                <span className="rounded bg-fuchsia-500/15 px-2 py-0.5 text-[10px] text-fuchsia-100 ring-1 ring-fuchsia-500/20">
                  {getPipelineStageLabel(lang, row.pipeline_stage)}
                </span>
              ) : null}

              {Array.isArray(row.client_roles) && row.client_roles.length
                ? row.client_roles.map((role) => (
                    <span
                      key={role}
                      className="rounded bg-ew-accent/15 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-ew-accent/20"
                    >
                      {getClientRoleLabel(lang, role)}
                    </span>
                  ))
                : null}

              {withInteractions ? (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200 ring-1 ring-amber-500/20">
                  {(t(lang, "contactsInteractionsBadge" as any) ?? "Interakcje") +
                    `: ${row.interactions_count ?? 1}`}
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 text-sm font-semibold text-white">
              {t(lang, "contactsSectionWorkflow" as any) ?? "Status i pipeline"}
            </div>

            <div className="grid gap-3 md:grid-cols-2 text-sm text-white/80">
              <div>
                <div className="text-xs text-white/45">
                  {t(lang, "contactsFieldStatus" as any) ?? "Status klienta"}
                </div>
                <div className="mt-1">{row.status ? getClientStatusLabel(lang, row.status) : "-"}</div>
              </div>

              <div>
                <div className="text-xs text-white/45">
                  {t(lang, "contactsFieldPipelineStage" as any) ?? "Etap pipeline"}
                </div>
                <div className="mt-1">
                  {row.pipeline_stage ? getPipelineStageLabel(lang, row.pipeline_stage) : "-"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                {t(lang, "contactsSectionContact" as any) ?? "Dane kontaktowe"}
              </div>

              <div className="space-y-3 text-sm text-white/80">
                <div>
                  <div className="text-xs text-white/45">{t(lang, "contactsColumnPhone" as any) ?? "Telefon"}</div>
                  <div className="mt-1">
                    {phone ? (
                      <a href={`tel:${phone}`} className="text-ew-accent underline">
                        {phone}
                      </a>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-white/45">{t(lang, "contactsColumnEmail" as any) ?? "Email"}</div>
                  <div className="mt-1">
                    {email ? (
                      <a href={`mailto:${email}`} className="text-ew-accent underline">
                        {email}
                      </a>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-white/45">{t(lang, "contactsFieldSource" as any) ?? "Źródło"}</div>
                  <div className="mt-1">{row.source ?? "-"}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                {t(lang, "contactsSectionBasic" as any) ?? "Dane podstawowe"}
              </div>

              <div className="space-y-3 text-sm text-white/80">
                <div>
                  <div className="text-xs text-white/45">{t(lang, "contactsFieldPesel" as any) ?? "PESEL"}</div>
                  <div className="mt-1">{row.pesel ?? "-"}</div>
                </div>

                <div>
                  <div className="text-xs text-white/45">{t(lang, "contactsFieldNip" as any) ?? "NIP"}</div>
                  <div className="mt-1">{row.nip ?? "-"}</div>
                </div>

                <div>
                  <div className="text-xs text-white/45">{t(lang, "contactsFieldRegon" as any) ?? "REGON"}</div>
                  <div className="mt-1">{row.regon ?? "-"}</div>
                </div>

                <div>
                  <div className="text-xs text-white/45">{t(lang, "contactsFieldKrs" as any) ?? "KRS"}</div>
                  <div className="mt-1">{row.krs ?? "-"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 text-sm font-semibold text-white">
              {t(lang, "contactsSectionExtra" as any) ?? "Dodatkowe informacje"}
            </div>

            <div className="space-y-3 text-sm text-white/80">
              <div>
                <div className="text-xs text-white/45">{t(lang, "contactsFieldNotes" as any) ?? "Notatki"}</div>
                <div className="mt-1 whitespace-pre-wrap">{row.notes ?? "-"}</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-white/45">{t(lang, "contactsColumnCreatedAt" as any) ?? "Dodano"}</div>
                  <div className="mt-1">{fmtDate(row.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-white/45">{t(lang, "contactsUpdatedAt" as any) ?? "Zmieniono"}</div>
                  <div className="mt-1">{fmtDate(row.updated_at)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
          >
            {t(lang, "teamCancel" as any) ?? "Zamknij"}
          </button>

          <button
            type="button"
            onClick={() => onEdit(row)}
            className="rounded-2xl bg-ew-accent px-5 py-2 text-sm font-extrabold text-white shadow-sm transition hover:opacity-95"
          >
            {t(lang, "listingEdit" as any) ?? "Edytuj"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ContactsView({ lang }: { lang: LangKey }) {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [partyType, setPartyType] = useState("");
  const [clientRole, setClientRole] = useState("");
  const [status, setStatus] = useState("");
  const [pipelineStage, setPipelineStage] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ContactRow | null>(null);

  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(buildInitialForm());

  async function load(next?: {
    q?: string;
    partyType?: string;
    clientRole?: string;
    status?: string;
    pipelineStage?: string;
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

      setRows(Array.isArray(j?.rows) ? j.rows : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrUpdate() {
    setCreateSaving(true);
    setCreateError(null);

    try {
      const isEdit = modalMode === "edit" && selectedRow?.id;

      const endpoint = isEdit ? "/api/contacts/update" : "/api/contacts/create";
      const method = isEdit ? "PUT" : "POST";

      const payload = isEdit
        ? {
            id: selectedRow?.id,
            ...form,
          }
        : form;

      const r = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        const code = j?.error ?? `HTTP ${r.status}`;

        if (code === "MISSING_FULL_NAME") {
          throw new Error(
            t(lang, "contactsErrorMissingFullName" as any) ?? "Brak nazwy lub imienia i nazwiska."
          );
        }

        if (code === "MISSING_CONTACT_CHANNEL") {
          throw new Error(t(lang, "contactsErrorMissingContactChannel" as any) ?? "Podaj telefon lub email.");
        }

        if (code === "MISSING_PERSON_NAME_PARTS") {
          throw new Error(
            t(lang, "contactsErrorMissingPersonNameParts" as any) ?? "Podaj imię i nazwisko."
          );
        }

        if (code === "MISSING_COMPANY_NAME") {
          throw new Error(
            t(lang, "contactsErrorMissingCompanyName" as any) ?? "Podaj nazwę firmy."
          );
        }

        if (code === "MISSING_ID") {
          throw new Error(t(lang, "contactsErrorMissingId" as any) ?? "Brak identyfikatora.");
        }

        if (code === "NOT_FOUND") {
          throw new Error(t(lang, "contactsErrorNotFound" as any) ?? "Nie znaleziono kontaktu.");
        }

        throw new Error(code);
      }

      setModalOpen(false);
      setForm(buildInitialForm());
      setSelectedRow(null);
      setModalMode("create");
      await load();
    } catch (e: any) {
      setCreateError(
        e?.message ??
          (modalMode === "edit"
            ? t(lang, "contactsUpdateError" as any) ?? "Nie udało się zapisać zmian."
            : t(lang, "contactsCreateError" as any) ?? "Nie udało się zapisać kontaktu.")
      );
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleDelete(row: ContactRow) {
    if (!row?.id) return;

    const withInteractions = hasRowInteractions(row);

    if (withInteractions) {
      const confirmed = window.confirm(
        t(lang, "contactsConfirmDeleteWithRelations" as any) ??
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

        if (code === "MISSING_ID") {
          throw new Error(t(lang, "contactsErrorMissingId" as any) ?? "Brak identyfikatora.");
        }

        if (code === "NOT_FOUND") {
          throw new Error(t(lang, "contactsErrorNotFound" as any) ?? "Nie znaleziono kontaktu.");
        }

        throw new Error(code);
      }

      if (selectedRow?.id === row.id) {
        setSelectedRow(null);
        setDetailsOpen(false);
        setModalOpen(false);
        setModalMode("create");
      }

      await load();
    } catch (e: any) {
      alert(e?.message ?? (t(lang, "contactsDeleteError" as any) ?? "Nie udało się usunąć kontaktu."));
    }
  }

  function openCreateModal() {
    setCreateError(null);
    setForm(buildInitialForm());
    setSelectedRow(null);
    setModalMode("create");
    setModalOpen(true);
  }

  function openEditModal(row: ContactRow) {
    setCreateError(null);
    setSelectedRow(row);
    setForm(mapRowToForm(row));
    setModalMode("edit");
    setModalOpen(true);
    setDetailsOpen(false);
  }

  function openDetailsModal(row: ContactRow) {
    setSelectedRow(row);
    setDetailsOpen(true);
  }

  function closeCreateModal() {
    if (createSaving) return;
    setModalOpen(false);
    setCreateError(null);
    if (modalMode === "create") {
      setForm(buildInitialForm());
    }
  }

  function closeDetailsModal() {
    setDetailsOpen(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empty = !loading && !error && rows.length === 0;

  const summary = useMemo(() => {
    const persons = rows.filter((r) => (r.party_type ?? "").toLowerCase() === "person").length;
    const companies = rows.filter((r) => (r.party_type ?? "").toLowerCase() === "company").length;
    const withRoles = rows.filter((r) => Array.isArray(r.client_roles) && r.client_roles.length > 0).length;
    const active = rows.filter((r) => r.status === "active").length;

    return {
      total: rows.length,
      persons,
      companies,
      withRoles,
      active,
    };
  }, [rows]);

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-white">
                {t(lang, "panelNavClients" as any)}
              </h2>
              <p className="mt-0.5 text-xs text-white/50">
                {t(lang, "panelContactsSub" as any)}
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                onClick={() => load()}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15"
              >
                {t(lang, "offersRefresh" as any)}
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-xl bg-ew-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:opacity-95"
              >
                + {t(lang, "contactsNew" as any) ?? "Nowy kontakt"}
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_240px_220px_240px_auto]">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                t(lang, "contactsSearchPlaceholder" as any) ??
                "Szukaj po nazwie, telefonie, emailu, PESEL, NIP, KRS"
              }
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
            />

            <select
              value={partyType}
              onChange={(e) => setPartyType(e.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none transition appearance-none focus:border-white/40 focus:ring-2 focus:ring-white/20"
            >
              <option value="">{t(lang, "contactsFilterAllTypes" as any) ?? "Wszystkie typy"}</option>
              <option value="person">{t(lang, "contactsTypePerson" as any) ?? "Osoba"}</option>
              <option value="company">{t(lang, "contactsTypeCompany" as any) ?? "Firma"}</option>
            </select>

            <select
              value={clientRole}
              onChange={(e) => setClientRole(e.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none transition appearance-none focus:border-white/40 focus:ring-2 focus:ring-white/20"
            >
              <option value="">{t(lang, "contactsFilterAllRoles" as any) ?? "Wszystkie role"}</option>
              <option value="buyer">{t(lang, "contactsRoleBuyer" as any) ?? "Kupujący"}</option>
              <option value="seller">{t(lang, "contactsRoleSeller" as any) ?? "Sprzedający"}</option>
              <option value="tenant">{t(lang, "contactsRoleTenant" as any) ?? "Najemca"}</option>
              <option value="landlord">{t(lang, "contactsRoleLandlord" as any) ?? "Wynajmujący"}</option>
              <option value="investor">{t(lang, "contactsRoleInvestor" as any) ?? "Inwestor"}</option>
              <option value="flipper">{t(lang, "contactsRoleFlipper" as any) ?? "Fliper"}</option>
              <option value="developer">{t(lang, "contactsRoleDeveloper" as any) ?? "Deweloper"}</option>
              <option value="external_agent">
                {t(lang, "contactsRoleExternalAgent" as any) ?? "Pośrednik zewnętrzny"}
              </option>
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none transition appearance-none focus:border-white/40 focus:ring-2 focus:ring-white/20"
            >
              <option value="">{t(lang, "contactsFilterAllStatuses" as any) ?? "Wszystkie statusy"}</option>
              <option value="new">{t(lang, "contactsStatusNew" as any) ?? "Nowy"}</option>
              <option value="active">{t(lang, "contactsStatusActive" as any) ?? "Aktywny"}</option>
              <option value="in_progress">{t(lang, "contactsStatusInProgress" as any) ?? "W trakcie"}</option>
              <option value="won">{t(lang, "contactsStatusWon" as any) ?? "Wygrany"}</option>
              <option value="lost">{t(lang, "contactsStatusLost" as any) ?? "Przegrany"}</option>
              <option value="inactive">{t(lang, "contactsStatusInactive" as any) ?? "Nieaktywny"}</option>
              <option value="archived">{t(lang, "contactsStatusArchived" as any) ?? "Zarchiwizowany"}</option>
            </select>

            <select
              value={pipelineStage}
              onChange={(e) => setPipelineStage(e.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none transition appearance-none focus:border-white/40 focus:ring-2 focus:ring-white/20"
            >
              <option value="">
                {t(lang, "contactsFilterAllPipelineStages" as any) ?? "Wszystkie etapy"}
              </option>
              <option value="lead">{t(lang, "contactsPipelineLead" as any) ?? "Lead"}</option>
              <option value="qualified">
                {t(lang, "contactsPipelineQualified" as any) ?? "Zakwalifikowany"}
              </option>
              <option value="contacted">
                {t(lang, "contactsPipelineContacted" as any) ?? "Skontaktowano"}
              </option>
              <option value="meeting_scheduled">
                {t(lang, "contactsPipelineMeetingScheduled" as any) ?? "Umówione spotkanie"}
              </option>
              <option value="needs_analysis">
                {t(lang, "contactsPipelineNeedsAnalysis" as any) ?? "Analiza potrzeb"}
              </option>
              <option value="property_match">
                {t(lang, "contactsPipelinePropertyMatch" as any) ?? "Dobór oferty"}
              </option>
              <option value="offer_preparation">
                {t(lang, "contactsPipelineOfferPreparation" as any) ?? "Przygotowanie oferty"}
              </option>
              <option value="offer_sent">
                {t(lang, "contactsPipelineOfferSent" as any) ?? "Oferta wysłana"}
              </option>
              <option value="negotiation">
                {t(lang, "contactsPipelineNegotiation" as any) ?? "Negocjacje"}
              </option>
              <option value="contract_preparation">
                {t(lang, "contactsPipelineContractPreparation" as any) ?? "Przygotowanie umowy"}
              </option>
              <option value="closed_won">
                {t(lang, "contactsPipelineClosedWon" as any) ?? "Wygrana transakcja"}
              </option>
              <option value="closed_lost">
                {t(lang, "contactsPipelineClosedLost" as any) ?? "Utracona transakcja"}
              </option>
            </select>

            <button
              type="button"
              onClick={() => load({ q, partyType, clientRole, status, pipelineStage })}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
            >
              {t(lang, "contactsSearch" as any) ?? "Szukaj"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              {(t(lang, "contactsSummaryTotal" as any) ?? "Łącznie") + `: ${summary.total}`}
            </span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              {(t(lang, "contactsSummaryPersons" as any) ?? "Osoby") + `: ${summary.persons}`}
            </span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              {(t(lang, "contactsSummaryCompanies" as any) ?? "Firmy") + `: ${summary.companies}`}
            </span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              {(t(lang, "contactsSummaryWithRoles" as any) ?? "Z rolami") + `: ${summary.withRoles}`}
            </span>
            <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              {(t(lang, "contactsStatusActive" as any) ?? "Aktywny") + `: ${summary.active}`}
            </span>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
          {loading ? (
            <div className="text-xs text-white/50">
              {t(lang, "contactsLoading" as any) ?? "Ładowanie kontaktów..."}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
              {(t(lang, "contactsLoadError" as any) ?? "Nie udało się pobrać kontaktów") + `: ${error}`}
            </div>
          ) : empty ? (
            <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
              <p className="text-xs text-white/60">
                {t(lang, "contactsEmpty" as any) ?? "Brak kontaktów."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {rows.map((r) => {
                const phone = getDisplayPhone(r);
                const email = getDisplayEmail(r);
                const withInteractions = hasRowInteractions(r);

                return (
                  <div key={r.id} className="p-3 transition hover:bg-white/5">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.4fr)_minmax(180px,0.9fr)_minmax(220px,1fr)_minmax(220px,1fr)_auto]">
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
                          <div className="truncate text-sm font-semibold text-white">
                            {r.full_name ?? "-"}
                          </div>
                        </div>

                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-white/10">
                            {normalizePartyTypeLabel(lang, r.party_type)}
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

                          {r.krs ? (
                            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                              KRS: {r.krs}
                            </span>
                          ) : null}

                          {withInteractions ? (
                            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200 ring-1 ring-amber-500/20">
                              {(t(lang, "contactsInteractionsBadge" as any) ?? "Interakcje") +
                                `: ${r.interactions_count ?? 1}`}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-[11px] text-white/70">
                        <div className="text-white/45">{t(lang, "contactsColumnType" as any) ?? "Typ"}</div>
                        <div className="mt-1 font-semibold text-white/85">
                          {normalizePartyTypeLabel(lang, r.party_type)}
                        </div>
                      </div>

                      <div className="min-w-0 text-[11px] text-white/70">
                        <div className="text-white/45">{t(lang, "contactsColumnPhone" as any) ?? "Telefon"}</div>
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
                        <div className="text-white/45">{t(lang, "contactsColumnEmail" as any) ?? "Email"}</div>
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
                        <div className="text-[11px] text-white/45">
                          {(t(lang, "contactsColumnCreatedAt" as any) ?? "Dodano") + `: ${fmtDate(r.created_at)}`}
                        </div>

                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDetailsModal(r)}
                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-white/15"
                          >
                            {t(lang, "listingOpen" as any) ?? "Otwórz"}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-white/15"
                          >
                            {t(lang, "listingEdit" as any) ?? "Edytuj"}
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
        onSubmit={handleCreateOrUpdate}
      />

      <ContactDetailsModal
        lang={lang}
        open={detailsOpen}
        row={selectedRow}
        onClose={closeDetailsModal}
        onEdit={openEditModal}
      />
    </>
  );
}