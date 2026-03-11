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
};

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
  activeCalendarId,
}: EventModalProps) {
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
                ? (t(lang, "calEditEvent" as any) ?? "Edytuj termin")
                : (t(lang, "calNewEvent" as any) ?? "Nowy termin")}
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
            <div className="relative mt-1">
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
                    className="w-full appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 pr-10 text-sm font-medium text-white shadow-sm outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                >
                    {EVENT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-slate-900 text-white">
                        {t(lang, opt.labelKey as any) || opt.fallback}
                    </option>
                    ))}
                </select>

                {/* custom arrow */}
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-white/60">
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                    >
                    <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                    />
                    </svg>
                </div>
             </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70">
              {t(lang, "calFieldTitle" as any) ?? "Tytuł"}
            </label>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
              placeholder={t(lang, "calFieldTitlePh" as any) ?? "np. Prezentacja mieszkania"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-white/70">
                {t(lang, "calFieldStart" as any) ?? "Start"}
              </label>
              <input
                type="datetime-local"
                value={draft.start}
                onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-white/70">
                {t(lang, "calFieldEnd" as any) ?? "Koniec"}
              </label>
              <input
                type="datetime-local"
                value={draft.end}
                onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70">
              {t(lang, "calFieldLocation" as any) ?? "Lokalizacja"}
            </label>
            <input
              value={draft.locationText}
              onChange={(e) => setDraft((d) => ({ ...d, locationText: e.target.value }))}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
              placeholder={t(lang, "calFieldLocationPh" as any) ?? "np. Katowice, ul. ..."}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70">
              {t(lang, "calFieldDesc" as any) ?? "Opis"}
            </label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
              rows={4}
              placeholder={t(lang, "calFieldDescPh" as any) ?? "Dodatkowe informacje…"}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
            onClick={onClose}
            disabled={saving}
          >
            {t(lang, "calCancel" as any) ?? "Anuluj"}
          </button>

          <button
            type="button"
            className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20 disabled:opacity-60"
            onClick={onSubmit}
            disabled={saving || !activeCalendarId}
            title={!activeCalendarId ? "Brak aktywnego kalendarza (Mój / Biuro)" : undefined}
          >
            {saving ? (t(lang, "calSaving" as any) ?? "Zapisuję…") : (t(lang, "calSave" as any) ?? "Zapisz")}
          </button>
        </div>
      </div>
    </div>
  );
}