import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useOfferDetails } from "@/hooks/useOfferDetails";

type OfferTabKey =
  | "summary"
  | "calendar"
  | "matches"
  | "presentations"
  | "property"
  | "location"
  | "gallery"
  | "client"
  | "terms"
  | "documents"
  | "notes"
  | "history"
  | "stats";

type OfferTab = {
  key: OfferTabKey;
  label: string;
  number: string;
  description: string;
};

type ScheduledEventRow = {
  id: string;
  org_id: string;
  calendar_id: string;
  listing_id: string | null;
  client_id: string | null;
  title: string;
  description: string | null;
  location_text: string | null;
  start_at: string;
  end_at: string;
  status: string;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  type: string | null;
  source: string;
  outcome: string;
  meta: Record<string, unknown> | null;
  calendar_name: string | null;
  created_by_name: string | null;
};

const OFFER_TABS: OfferTab[] = [
  { key: "summary", number: "1.1", label: "Podsumowanie", description: "Główne informacje o ofercie, statusie, właścicielu i przebiegu procesu." },
  { key: "calendar", number: "1.2", label: "Terminarz", description: "Wszystkie wykonane i przyszłe działania powiązane z ofertą oraz kalendarzem." },
  { key: "matches", number: "1.3", label: "Dopasowania", description: "Klienci kupujący i najmujący pasujący kryteriami do tej oferty." },
  { key: "presentations", number: "1.4", label: "Prezentacje", description: "Zaplanowane i odbyte prezentacje nieruchomości." },
  { key: "property", number: "1.5", label: "Nieruchomość", description: "Wszystkie dane nieruchomości potrzebne do obsługi, eksportu i transakcji." },
  { key: "location", number: "1.6", label: "Lokalizacja", description: "Adres, położenie, mapa oraz dane lokalizacyjne nieruchomości." },
  { key: "gallery", number: "1.7", label: "Galeria", description: "Zdjęcia, filmy oraz linki do filmów eksportowanych na portale." },
  { key: "client", number: "1.8", label: "Klient", description: "Szczegółowe dane klienta i właściciela powiązanego z ofertą." },
  { key: "terms", number: "1.9", label: "Warunki", description: "Warunki współpracy, umowa, wynagrodzenie, terminy i zasady." },
  { key: "documents", number: "1.10", label: "Dokumenty", description: "Skany dokumentów, umowy, protokoły i załączniki." },
  { key: "notes", number: "1.11", label: "Notatki", description: "Notatki agenta, notatki z działań oraz notatki ogólne do oferty." },
  { key: "history", number: "1.12", label: "Historia", description: "Pełny rejestr zmian, działań, maili, kontaktów i zdarzeń na ofercie." },
  { key: "stats", number: "1.12+", label: "Statystyki oferty", description: "Odsłony, aktywność użytkowników, wysyłki i zachowanie oferty w systemie." },
];

const QUICK_EVENT_TYPES = [
  { key: "contact", label: "Kontakt" },
  { key: "call", label: "Telefon" },
  { key: "meeting", label: "Spotkanie" },
  { key: "visit", label: "Wizyta" },
  { key: "presentation", label: "Prezentacja" },
  { key: "follow_up", label: "Follow-up" },
] as const;

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function getActiveTab(tab: string | string[] | undefined): OfferTabKey {
  const raw = Array.isArray(tab) ? tab[0] : tab;
  const found = OFFER_TABS.find((x) => x.key === raw);
  return found?.key ?? "summary";
}

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString();
}

function fmtMoney(value?: number | string | null, currency?: string | null) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value} ${currency ?? "PLN"}`;
  return `${numeric.toLocaleString("pl-PL")} ${currency ?? "PLN"}`;
}

function toLocalInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function fromLocalInputValue(value: string) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function defaultStartValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  d.setSeconds(0, 0);
  return toLocalInputValue(d);
}

function defaultEndValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 120);
  d.setSeconds(0, 0);
  return toLocalInputValue(d);
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
      <div className="mt-1 text-sm font-semibold text-white/85">{value ?? "-"}</div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "datetime-local";
}) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs text-white/45">{label}</div>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/15"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  rows = 5,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs text-white/45">{label}</div>
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/15"
      />
    </label>
  );
}

function PlaceholderCard({ title }: { title: string }) {
  return (
    <Card title={title} subtitle="Sekcja założona i gotowa do dalszej rozbudowy.">
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
        Ta część workspace jest przygotowana, ale nie została jeszcze spięta z pełną logiką biznesową.
      </div>
    </Card>
  );
}

export default function OfferWorkspace() {
  const router = useRouter();
  const rawId = router.query.id;
  const listingId = typeof rawId === "string" ? rawId : "";
  const activeTab = getActiveTab(router.query.tab);
  const activeMeta = OFFER_TABS.find((x) => x.key === activeTab) ?? OFFER_TABS[0];
  const basePath = `/panel/effers/${listingId}`;

  const { data, history, reload, loading } = useOfferDetails(listingId || null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [scheduledEvents, setScheduledEvents] = useState<ScheduledEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [conflictRows, setConflictRows] = useState<ScheduledEventRow[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ start: string; end: string }>>([]);
  const [overwriteEventId, setOverwriteEventId] = useState<string>("");

  const [scheduleForm, setScheduleForm] = useState({
    eventType: "presentation",
    title: "",
    description: "",
    locationText: "",
    start: defaultStartValue(),
    end: defaultEndValue(),
    note: "",
  });

  const [edit, setEdit] = useState({
    title: "",
    description: "",
    locationText: "",
    propertyType: "",
    market: "",
    contractType: "",
    currency: "PLN",
    priceAmount: "",
    areaM2: "",
    rooms: "",
    floor: "",
    yearBuilt: "",
    voivodeship: "",
    city: "",
    district: "",
    street: "",
    postalCode: "",
    internalNotes: "",
  });

  async function loadScheduledEvents() {
    if (!listingId) return;
    setEventsLoading(true);
    try {
      const r = await fetch(`/api/offers/list-scheduled-events?id=${encodeURIComponent(listingId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setScheduledEvents(Array.isArray(j?.rows) ? j.rows : []);
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się pobrać wydarzeń oferty.");
    } finally {
      setEventsLoading(false);
    }
  }

  useEffect(() => {
    if (!listingId) return;
    loadScheduledEvents();
  }, [listingId]);

  useEffect(() => {
    if (!data?.listing) return;

    setEdit({
      title: data.listing.title ?? "",
      description: data.listing.description ?? "",
      locationText: data.listing.location_text ?? "",
      propertyType: data.listing.property_type ?? "",
      market: data.listing.market ?? "",
      contractType: data.listing.contract_type ?? "",
      currency: data.listing.currency ?? "PLN",
      priceAmount:
        data.listing.price_amount === null || data.listing.price_amount === undefined
          ? ""
          : String(data.listing.price_amount),
      areaM2:
        data.listing.area_m2 === null || data.listing.area_m2 === undefined
          ? ""
          : String(data.listing.area_m2),
      rooms:
        data.listing.rooms === null || data.listing.rooms === undefined
          ? ""
          : String(data.listing.rooms),
      floor: data.listing.floor ?? "",
      yearBuilt:
        data.listing.year_built === null || data.listing.year_built === undefined
          ? ""
          : String(data.listing.year_built),
      voivodeship: data.listing.voivodeship ?? "",
      city: data.listing.city ?? "",
      district: data.listing.district ?? "",
      street: data.listing.street ?? "",
      postalCode: data.listing.postal_code ?? "",
      internalNotes: data.listing.internal_notes ?? "",
    });

    setScheduleForm((prev) => ({
      ...prev,
      title: prev.title || data.listing.title || "",
      description: prev.description || data.listing.description || "",
      locationText: prev.locationText || data.listing.location_text || "",
    }));
  }, [data]);

  async function saveOffer() {
    if (!listingId) return;

    setSaving(true);
    setError(null);

    try {
      const r = await fetch("/api/offers/update-core", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: listingId,
          ...edit,
          priceAmount: edit.priceAmount === "" ? null : Number(edit.priceAmount),
          areaM2: edit.areaM2 === "" ? null : Number(edit.areaM2),
          rooms: edit.rooms === "" ? null : Number(edit.rooms),
          yearBuilt: edit.yearBuilt === "" ? null : Number(edit.yearBuilt),
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Nie udało się zapisać oferty.");
    } finally {
      setSaving(false);
    }
  }

  async function scheduleEvent(opts?: { overwriteExistingEventId?: string | null; useSuggestion?: { start: string; end: string } | null }) {
    if (!listingId) return;

    setScheduleBusy(true);
    setConflictError(null);
    setConflictRows([]);
    setSuggestions([]);

    try {
      const startValue = opts?.useSuggestion?.start ?? (
        fromLocalInputValue(scheduleForm.start)?.toISOString() ?? ""
      );
      const endValue = opts?.useSuggestion?.end ?? (
        fromLocalInputValue(scheduleForm.end)?.toISOString() ?? ""
      );

      if (!startValue || !endValue) {
        throw new Error("INVALID_EVENT_DATETIME");
      }

      const r = await fetch("/api/offers/schedule-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          eventType: scheduleForm.eventType,
          title: scheduleForm.title,
          description: scheduleForm.description,
          locationText: scheduleForm.locationText,
          start: startValue,
          end: endValue,
          note: scheduleForm.note || null,
          overwriteExistingEventId: opts?.overwriteExistingEventId ?? null,
        }),
      });

      const j = await r.json().catch(() => null);

      if (r.status === 409 && j?.conflict) {
        setConflictError("Wykryto konflikt terminu.");
        setConflictRows(Array.isArray(j?.conflicts) ? j.conflicts : []);
        setSuggestions(Array.isArray(j?.suggestions) ? j.suggestions : []);
        return;
      }

      if (!r.ok) {
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }

      setOverwriteEventId("");
      setScheduleForm((prev) => ({
        ...prev,
        note: "",
      }));

      await Promise.all([reload(), loadScheduledEvents()]);
    } catch (e: any) {
      setConflictError(e?.message ?? "Nie udało się zaplanować wydarzenia.");
    } finally {
      setScheduleBusy(false);
    }
  }

  const listing = data?.listing ?? null;
  const party = data?.party ?? null;
  const ownerUser = data?.ownerUser ?? null;

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case "summary":
        return (
          <Card
            title="1.1 Podsumowanie"
            subtitle="Najważniejsze dane operacyjne oferty."
            actions={
              <button
                type="button"
                onClick={saveOffer}
                disabled={saving}
                className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <InputField label="Tytuł" value={edit.title} onChange={(value) => setEdit((p) => ({ ...p, title: value }))} />
              <InputField label="Cena" type="number" value={edit.priceAmount} onChange={(value) => setEdit((p) => ({ ...p, priceAmount: value }))} />
              <InputField label="Waluta" value={edit.currency} onChange={(value) => setEdit((p) => ({ ...p, currency: value }))} />
              <InputField label="Lokalizacja" value={edit.locationText} onChange={(value) => setEdit((p) => ({ ...p, locationText: value }))} />
              <Field label="Status" value={listing?.status ?? "-"} />
              <Field label="Numer oferty" value={listing?.offer_number ?? "-"} />
              <Field label="Typ transakcji" value={listing?.transaction_type ?? "-"} />
              <Field label="Klient / właściciel" value={party?.full_name ?? "-"} />
              <Field label="Opiekun oferty" value={ownerUser?.full_name ?? "-"} />
              <Field label="Data utworzenia" value={fmtDateTime(listing?.created_at)} />
              <Field label="Ostatnia zmiana" value={fmtDateTime(listing?.updated_at)} />
            </div>

            <div className="mt-4">
              <TextareaField label="Opis oferty" value={edit.description} onChange={(value) => setEdit((p) => ({ ...p, description: value }))} rows={6} />
            </div>
          </Card>
        );

      case "calendar":
        return (
          <div className="grid gap-4">
            <Card
              title="1.2 Terminarz"
              subtitle="Planowanie działań oferty z kontrolą konfliktów terminów."
              actions={
                <button
                  type="button"
                  onClick={() => scheduleEvent()}
                  disabled={scheduleBusy || !listingId}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
                >
                  {scheduleBusy ? "Planowanie..." : "Zaplanuj wydarzenie"}
                </button>
              }
            >
              <div className="mb-4 flex flex-wrap gap-2">
                {QUICK_EVENT_TYPES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setScheduleForm((prev) => ({ ...prev, eventType: item.key }))}
                    className={clsx(
                      "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                      scheduleForm.eventType === item.key
                        ? "border-ew-accent bg-ew-accent/10 text-white"
                        : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <InputField
                  label="Tytuł wydarzenia"
                  value={scheduleForm.title}
                  onChange={(value) => setScheduleForm((p) => ({ ...p, title: value }))}
                />
                <InputField
                  label="Lokalizacja"
                  value={scheduleForm.locationText}
                  onChange={(value) => setScheduleForm((p) => ({ ...p, locationText: value }))}
                />
                <InputField
                  label="Nadpisz event ID"
                  value={overwriteEventId}
                  onChange={setOverwriteEventId}
                  placeholder="Opcjonalnie ID konfliktującego eventu"
                />
                <InputField
                  label="Start"
                  type="datetime-local"
                  value={scheduleForm.start}
                  onChange={(value) => setScheduleForm((p) => ({ ...p, start: value }))}
                />
                <InputField
                  label="Koniec"
                  type="datetime-local"
                  value={scheduleForm.end}
                  onChange={(value) => setScheduleForm((p) => ({ ...p, end: value }))}
                />
              </div>

              <div className="mt-3 grid gap-3">
                <TextareaField
                  label="Opis wydarzenia"
                  value={scheduleForm.description}
                  onChange={(value) => setScheduleForm((p) => ({ ...p, description: value }))}
                  rows={4}
                />
                <TextareaField
                  label="Notatka do historii"
                  value={scheduleForm.note}
                  onChange={(value) => setScheduleForm((p) => ({ ...p, note: value }))}
                  rows={3}
                />
              </div>

              {conflictError ? (
                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                  {conflictError}
                </div>
              ) : null}

              {conflictRows.length ? (
                <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <div className="text-sm font-bold text-amber-100">Konfliktujące wydarzenia</div>
                  <div className="mt-3 grid gap-3">
                    {conflictRows.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-bold text-white">{row.title}</div>
                        <div className="mt-1 text-xs text-white/65">
                          {fmtDateTime(row.start_at)} — {fmtDateTime(row.end_at)}
                        </div>
                        <div className="mt-1 text-xs text-white/50">
                          Typ: {row.type ?? "-"} | Status: {row.status ?? "-"} | Autor: {row.created_by_name ?? "-"}
                        </div>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => scheduleEvent({ overwriteExistingEventId: row.id })}
                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                          >
                            Nadpisz ten termin
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {suggestions.length ? (
                <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
                  <div className="text-sm font-bold text-sky-100">Sugestie najbliższych wolnych terminów</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {suggestions.map((slot, idx) => (
                      <button
                        key={`${slot.start}-${idx}`}
                        type="button"
                        onClick={() => scheduleEvent({ useSuggestion: slot })}
                        className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                      >
                        {fmtDateTime(slot.start)} → {fmtDateTime(slot.end)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>

            <Card title="Lista wydarzeń oferty" subtitle="Wszystkie wydarzenia zapisane w kalendarzu i powiązane z tą ofertą.">
              {eventsLoading ? (
                <div className="text-sm text-white/60">Ładowanie wydarzeń...</div>
              ) : scheduledEvents.length ? (
                <div className="grid gap-3">
                  {scheduledEvents.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-white">{row.title}</div>
                          <div className="mt-1 text-xs text-white/65">
                            {fmtDateTime(row.start_at)} — {fmtDateTime(row.end_at)}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            Typ: {row.type ?? "-"} | Status: {row.status ?? "-"} | Kalendarz: {row.calendar_name ?? "-"}
                          </div>
                        </div>
                        <div className="text-right text-xs text-white/50">
                          <div>Autor: {row.created_by_name ?? "-"}</div>
                          <div>Źródło: {row.source ?? "-"}</div>
                        </div>
                      </div>

                      {row.location_text ? (
                        <div className="mt-3 text-sm text-white/75">
                          Lokalizacja: {row.location_text}
                        </div>
                      ) : null}

                      {row.description ? (
                        <div className="mt-2 whitespace-pre-wrap text-sm text-white/75">
                          {row.description}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-white/60">
                  Brak wydarzeń powiązanych z tą ofertą.
                </div>
              )}
            </Card>
          </div>
        );

      case "property":
        return (
          <Card
            title="1.5 Nieruchomość"
            subtitle="Szczegóły nieruchomości używane dalej w ofercie i eksporcie."
            actions={
              <button
                type="button"
                onClick={saveOffer}
                disabled={saving}
                className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <InputField label="Typ nieruchomości" value={edit.propertyType} onChange={(value) => setEdit((p) => ({ ...p, propertyType: value }))} />
              <InputField label="Rynek" value={edit.market} onChange={(value) => setEdit((p) => ({ ...p, market: value }))} />
              <InputField label="Rodzaj umowy" value={edit.contractType} onChange={(value) => setEdit((p) => ({ ...p, contractType: value }))} />
              <InputField label="Powierzchnia" type="number" value={edit.areaM2} onChange={(value) => setEdit((p) => ({ ...p, areaM2: value }))} />
              <InputField label="Liczba pokoi" type="number" value={edit.rooms} onChange={(value) => setEdit((p) => ({ ...p, rooms: value }))} />
              <InputField label="Piętro" value={edit.floor} onChange={(value) => setEdit((p) => ({ ...p, floor: value }))} />
              <InputField label="Rok budowy" type="number" value={edit.yearBuilt} onChange={(value) => setEdit((p) => ({ ...p, yearBuilt: value }))} />
              <InputField label="Województwo" value={edit.voivodeship} onChange={(value) => setEdit((p) => ({ ...p, voivodeship: value }))} />
              <InputField label="Miasto" value={edit.city} onChange={(value) => setEdit((p) => ({ ...p, city: value }))} />
              <InputField label="Dzielnica" value={edit.district} onChange={(value) => setEdit((p) => ({ ...p, district: value }))} />
              <InputField label="Ulica" value={edit.street} onChange={(value) => setEdit((p) => ({ ...p, street: value }))} />
              <InputField label="Kod pocztowy" value={edit.postalCode} onChange={(value) => setEdit((p) => ({ ...p, postalCode: value }))} />
            </div>
          </Card>
        );

      case "client":
        return (
          <Card title="1.8 Klient" subtitle="Dane klienta powiązanego z ofertą.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Imię i nazwisko / firma" value={party?.full_name ?? "-"} />
              <Field label="Typ klienta" value={party?.party_type ?? "-"} />
              <Field label="Rola przy ofercie" value={party?.listing_party_role ?? "-"} />
              <Field label="Telefon" value={party?.phone ?? "-"} />
              <Field label="Email" value={party?.email ?? "-"} />
              <Field label="PESEL" value={party?.pesel ?? "-"} />
              <Field label="NIP" value={party?.nip ?? "-"} />
              <Field label="REGON" value={party?.regon ?? "-"} />
              <Field label="KRS" value={party?.krs ?? "-"} />
              <Field label="Status klienta" value={party?.status ?? "-"} />
              <Field label="Etap pipeline" value={party?.pipeline_stage ?? "-"} />
              <Field label="Źródło" value={party?.source ?? "-"} />
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/45">Notatki klienta</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-white/80">{party?.notes ?? "-"}</div>
            </div>
          </Card>
        );

      case "terms":
        return (
          <Card
            title="1.9 Warunki"
            subtitle="Warunki współpracy i formalna rama oferty."
            actions={
              <button
                type="button"
                onClick={saveOffer}
                disabled={saving}
                className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Numer oferty" value={listing?.offer_number ?? "-"} />
              <Field label="Status oferty" value={listing?.status ?? "-"} />
              <InputField label="Rodzaj umowy" value={edit.contractType} onChange={(value) => setEdit((p) => ({ ...p, contractType: value }))} />
              <InputField label="Waluta" value={edit.currency} onChange={(value) => setEdit((p) => ({ ...p, currency: value }))} />
              <InputField label="Cena" type="number" value={edit.priceAmount} onChange={(value) => setEdit((p) => ({ ...p, priceAmount: value }))} />
              <Field label="Opiekun oferty" value={ownerUser?.full_name ?? "-"} />
            </div>

            <div className="mt-4">
              <TextareaField label="Warunki / notatki współpracy" value={edit.internalNotes} onChange={(value) => setEdit((p) => ({ ...p, internalNotes: value }))} rows={6} />
            </div>
          </Card>
        );

      case "notes":
        return (
          <Card
            title="1.11 Notatki"
            subtitle="Notatki ogólne do oferty i klienta."
            actions={
              <button
                type="button"
                onClick={saveOffer}
                disabled={saving}
                className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Zapisywanie..." : "Zapisz"}
              </button>
            }
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <TextareaField label="Notatki oferty" value={edit.internalNotes} onChange={(value) => setEdit((p) => ({ ...p, internalNotes: value }))} rows={10} />

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/45">Notatki klienta</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-white/80">{party?.notes ?? "-"}</div>
              </div>
            </div>
          </Card>
        );

      case "history":
        return (
          <Card title="1.12 Historia" subtitle="Rejestr zmian wykrytych przy zapisie oferty i planowaniu wydarzeń.">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/55">Zdarzenie</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/55">Zmiana</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/55">Użytkownik</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white/55">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {history.length ? (
                    history.map((h: any) => (
                      <tr key={h.id}>
                        <td className="px-4 py-3 text-white">{h.event_label ?? "-"}</td>
                        <td className="px-4 py-3 text-white/80">
                          <div className="whitespace-pre-wrap">{(h.old_value ?? "-") + " → " + (h.new_value ?? "-")}</div>
                        </td>
                        <td className="px-4 py-3 text-white/75">{h.created_by_name ?? "-"}</td>
                        <td className="px-4 py-3 text-white/75">{fmtDateTime(h.created_at)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-white/55">Brak historii.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        );

      case "matches":
        return <PlaceholderCard title="1.3 Dopasowania" />;
      case "presentations":
        return <PlaceholderCard title="1.4 Prezentacje" />;
      case "location":
        return <PlaceholderCard title="1.6 Lokalizacja" />;
      case "gallery":
        return <PlaceholderCard title="1.7 Galeria" />;
      case "documents":
        return <PlaceholderCard title="1.10 Dokumenty" />;
      case "stats":
        return <PlaceholderCard title="Statystyki oferty" />;
      default:
        return null;
    }
  }, [
    activeTab,
    edit,
    history,
    listing,
    ownerUser,
    party,
    saving,
    scheduleBusy,
    scheduleForm,
    conflictError,
    conflictRows,
    suggestions,
    overwriteEventId,
    scheduledEvents,
    eventsLoading,
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 lg:px-6">
        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">EveryApp</div>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white">OFERTA</h1>
              <p className="mt-1 text-sm text-white/60">
                Workspace oferty zgodny z dokumentem szefa: 1.1–1.12.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
                  ID: {listingId || "-"}
                </span>
                <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
                  Numer: {listing?.offer_number ?? "-"}
                </span>
                <span className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-100">
                  Status: {listing?.status ?? "-"}
                </span>
                <span className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  Aktywna zakładka: {activeMeta.number} {activeMeta.label}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveOffer}
                disabled={saving || !listingId}
                className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Zapisywanie..." : "Zapisz ofertę"}
              </button>

              <Link
                href="/panel"
                className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                ← Powrót do panelu
              </Link>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-5 grid gap-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-7">
            {OFFER_TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <Link
                  key={tab.key}
                  href={{ pathname: basePath, query: { tab: tab.key } }}
                  className={clsx(
                    "rounded-2xl border px-3 py-3 transition",
                    isActive
                      ? "border-ew-accent bg-ew-accent/10 text-white"
                      : "border-white/10 bg-white/5 text-white/85 hover:bg-white/10"
                  )}
                >
                  <div className="text-[11px] font-bold tracking-wide text-white/45">{tab.number}</div>
                  <div className="mt-1 text-sm font-bold">{tab.label}</div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 text-sm text-white/65 shadow-2xl backdrop-blur-xl">
              Ładowanie oferty...
            </div>
          ) : (
            tabContent
          )}
        </div>
      </div>
    </div>
  );
}