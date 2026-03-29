import { useEffect, useState } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

export type EventType =
  | "presentation"
  | "acquisition"
  | "broker_agreement"
  | "preliminary_agreement"
  | "final_agreement"
  | "contact"
  | "task"
  | "vacation"
  | "other"
  | "call"
  | "visit"
  | "meeting"
  | "follow_up";

export const EVENT_TYPES: Array<{ value: EventType; labelKey: string; fallback: string }> = [
  { value: "presentation", labelKey: "calendarEventTypePresentation", fallback: "Prezentacja" },
  { value: "acquisition", labelKey: "calendarEventTypeAcquisition", fallback: "Pozyskanie" },
  { value: "broker_agreement", labelKey: "calendarEventTypeBrokerAgreement", fallback: "Umowa pośrednictwa" },
  { value: "preliminary_agreement", labelKey: "calendarEventTypePreliminaryAgreement", fallback: "Umowa przedwstępna" },
  { value: "final_agreement", labelKey: "calendarEventTypeFinalAgreement", fallback: "Umowa końcowa" },
  { value: "contact", labelKey: "calendarEventTypeContact", fallback: "Kontakt" },
  { value: "task", labelKey: "calendarEventTypeTask", fallback: "Zadanie" },
  { value: "vacation", labelKey: "calendarEventTypeVacation", fallback: "Urlop" },
  { value: "other", labelKey: "calendarEventTypeOther", fallback: "Inne" },
  { value: "call", labelKey: "calendarEventTypeCall", fallback: "Telefon" },
  { value: "visit", labelKey: "calendarEventTypeVisit", fallback: "Wizyta" },
  { value: "meeting", labelKey: "calendarEventTypeMeeting", fallback: "Spotkanie" },
  { value: "follow_up", labelKey: "calendarEventTypeFollowUp", fallback: "Follow-up" },
];

export function labelForEventType(lang: LangKey, type: EventType) {
  const item = EVENT_TYPES.find((x) => x.value === type);
  if (!item) return "";
  const translated = t(lang, item.labelKey as any);
  return translated || item.fallback;
}

export type EventDraft = {
  eventType: EventType;
  title: string;
  start: string;
  end: string;
  locationText: string;
  description: string;
  clientId: string;
  listingId: string;
};

type Option = { id: string; label: string; subtitle?: string | null };

type EventModalProps = {
  isOpen: boolean;
  lang: LangKey;
  saving: boolean;
  editingEventId: string | null;
  scopeLabel: string;
  draft: EventDraft;
  setDraft: React.Dispatch<React.SetStateAction<EventDraft>>;
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
  deleteBusy?: boolean;
  activeCalendarId?: string | null;
};

export default function EventModal({
  isOpen,
  lang,
  saving,
  editingEventId,
  scopeLabel,
  draft,
  setDraft,
  onClose,
  onSubmit,
  onDelete,
  showDelete = false,
  deleteBusy = false,
  activeCalendarId,
}: EventModalProps) {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<Option[]>([]);
  const [listings, setListings] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let alive = true;

    const run = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (query) qs.set("q", query);

        const r = await fetch(`/api/calendar/link-options?${qs.toString()}`);
        const j = await r.json().catch(() => null);

        if (!alive) return;

        setClients(Array.isArray(j?.clients) ? (j.clients as Option[]) : []);
        setListings(Array.isArray(j?.listings) ? (j.listings as Option[]) : []);
      } finally {
        if (alive) setLoading(false);
      }
    };

    const tmr = setTimeout(run, 250);

    return () => {
      alive = false;
      clearTimeout(tmr);
    };
  }, [query, isOpen]);

  const selectedClient = clients.find((c) => c.id === draft.clientId) || null;
  const selectedListing = listings.find((l) => l.id === draft.listingId) || null;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/70 p-6 text-white shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              {editingEventId
                ? t(lang, "calEditEvent" as any) ?? "Edytuj termin"
                : t(lang, "calNewEvent" as any) ?? "Nowy termin"}
            </h2>
            <p className="mt-1 text-xs text-white/60">{scopeLabel}</p>
          </div>

          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-white/70">Typ</label>
            <select
              value={draft.eventType}
              onChange={(e) => {
                const nextType = e.target.value as EventType;
                setDraft((d) => {
                  const autoTitle = labelForEventType(lang, nextType);
                  const prevAuto = labelForEventType(lang, d.eventType);
                  const shouldAuto = !d.title.trim() || d.title.trim() === prevAuto;

                  return {
                    ...d,
                    eventType: nextType,
                    title: shouldAuto ? autoTitle : d.title,
                  };
                });
              }}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm"
            >
              {EVENT_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(lang, opt.labelKey as any) || opt.fallback}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70">
              {t(lang, "calFieldTitle" as any) ?? "Tytuł"}
            </label>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="datetime-local"
              value={draft.start}
              onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm"
            />
            <input
              type="datetime-local"
              value={draft.end}
              onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70">
              {t(lang, "calFieldLocation" as any) ?? "Lokalizacja"}
            </label>
            <input
              value={draft.locationText}
              onChange={(e) => setDraft((d) => ({ ...d, locationText: e.target.value }))}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70">Szukaj powiązań</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj klienta lub oferty..."
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm"
            />
            {loading ? <div className="mt-2 text-xs text-white/50">Ładowanie…</div> : null}
          </div>

          <div>
            <div className="mb-1 text-xs text-white/60">Klient</div>
            <select
              value={draft.clientId}
              onChange={(e) => setDraft((d) => ({ ...d, clientId: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm"
            >
              <option value="">— brak —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {selectedClient?.subtitle ? (
              <div className="mt-1 text-xs text-white/50">{selectedClient.subtitle}</div>
            ) : null}
          </div>

          <div>
            <div className="mb-1 text-xs text-white/60">Oferta</div>
            <select
              value={draft.listingId}
              onChange={(e) => setDraft((d) => ({ ...d, listingId: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm"
            >
              <option value="">— brak —</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            {selectedListing?.subtitle ? (
              <div className="mt-1 text-xs text-white/50">{selectedListing.subtitle}</div>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70">
              {t(lang, "calFieldDesc" as any) ?? "Opis"}
            </label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm"
              rows={4}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <div>
            {showDelete ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving || deleteBusy}
                className="rounded-2xl border border-red-500/20 bg-red-600/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
              >
                {deleteBusy
                  ? t(lang, "calDeleting" as any) ?? "Usuwanie..."
                  : t(lang, "calDelete" as any) ?? "Usuń"}
              </button>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={saving || deleteBusy}
              className="rounded-2xl bg-white/10 px-4 py-2 disabled:opacity-60"
            >
              {t(lang, "calCancel" as any) ?? "Anuluj"}
            </button>

            <button
              onClick={onSubmit}
              disabled={saving || deleteBusy || !activeCalendarId}
              className="rounded-2xl bg-white/20 px-4 py-2 disabled:opacity-60"
            >
              {saving ? "..." : t(lang, "calSave" as any) ?? "Zapisz"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}