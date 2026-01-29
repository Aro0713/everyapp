import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { LangKey } from "@/utils/translations";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";

// FullCalendar locales
import plLocale from "@fullcalendar/core/locales/pl";
import enGbLocale from "@fullcalendar/core/locales/en-gb";
import deLocale from "@fullcalendar/core/locales/de";
import csLocale from "@fullcalendar/core/locales/cs";
import skLocale from "@fullcalendar/core/locales/sk";
import ukLocale from "@fullcalendar/core/locales/uk";
import ltLocale from "@fullcalendar/core/locales/lt";
import viLocale from "@fullcalendar/core/locales/vi";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// Map Two-letter UI langs -> FullCalendar locale objects
function fcLocale(lang: LangKey) {
  switch (lang) {
    case "pl":
      return plLocale;
    case "en":
      return enGbLocale;
    case "de":
      return deLocale;
    case "cs":
      return csLocale;
    case "sk":
      return skLocale;
    case "ua":
      return ukLocale;
    case "lt":
      return ltLocale;
    case "vi":
      return viLocale;
    default:
      return enGbLocale;
  }
}

type FcEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  extendedProps?: any;
};

type BootstrapResponse = {
  officeId: string;
  orgCalendarId: string | null;
  userCalendarId: string | null;
};

type CalView = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";

function toLocalInput(dt: Date) {
  // YYYY-MM-DDTHH:mm for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
    dt.getHours()
  )}:${pad(dt.getMinutes())}`;
}

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar | null>(null);

  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);
  const [events, setEvents] = useState<FcEvent[]>([]);

  // MVP: docelowo z auth/sesji (na razie hardcode)
  const [userId] = useState("TU_WKLEJ_USER_ID_NA_MVP");

  // bootstrap output
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [orgCalendarId, setOrgCalendarId] = useState<string | null>(null);
  const [userCalendarId, setUserCalendarId] = useState<string | null>(null);

  // UI state
  const [scope, setScope] = useState<"user" | "org">("user"); // Mój / Biuro
  const [view, setView] = useState<CalView>("timeGridWeek");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<{ start?: string; end?: string }>({});

  // Modal state (KROK 2)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{
    title: string;
    start: string;
    end: string;
    locationText: string;
    description: string;
  }>({
    title: "",
    start: "",
    end: "",
    locationText: "",
    description: "",
  });

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

  // Bootstrap: znajdź biuro usera i zapewnij kalendarze
  useEffect(() => {
    (async () => {
      if (!userId) return;

      const r = await fetch("/api/calendar/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!r.ok) return;

      const data: BootstrapResponse = await r.json();
      setOfficeId(data.officeId);
      setOrgCalendarId(data.orgCalendarId ?? null);
      setUserCalendarId(data.userCalendarId ?? null);

      if (data.userCalendarId) setScope("user");
      else setScope("org");
    })();
  }, [userId]);

  const activeCalendarId = scope === "user" ? userCalendarId : orgCalendarId;

  async function loadEvents(rangeStart?: string, rangeEnd?: string) {
    if (!officeId || !activeCalendarId) return;

    const qs = new URLSearchParams({
      orgId: officeId,
      calendarId: activeCalendarId,
    });

    if (rangeStart) qs.set("start", rangeStart);
    if (rangeEnd) qs.set("end", rangeEnd);

    const r = await fetch(`/api/calendar/events?${qs.toString()}`);
    if (!r.ok) return;

    const data = await r.json();
    const list: FcEvent[] = Array.isArray(data) ? data : [];
    const q = query.trim().toLowerCase();
    setEvents(q ? list.filter((e) => (e.title || "").toLowerCase().includes(q)) : list);
  }

  // zmiana scope -> odśwież eventy w aktualnym zakresie
  useEffect(() => {
    if (!range.start || !range.end) return;
    loadEvents(range.start, range.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCalendarId]);

  // search -> odśwież (MVP)
  useEffect(() => {
    if (!range.start || !range.end) return;
    loadEvents(range.start, range.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // sterowanie widokiem
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(view);
  }, [view]);

  const localeObj = useMemo(() => fcLocale(lang), [lang]);

  function openNewEvent(prefill?: { start?: Date; end?: Date }) {
    const now = new Date();
    const start = prefill?.start ?? now;
    const end = prefill?.end ?? new Date(now.getTime() + 60 * 60 * 1000);

    setDraft({
      title: "",
      start: toLocalInput(start),
      end: toLocalInput(end),
      locationText: "",
      description: "",
    });
    setIsModalOpen(true);
  }

  async function submitNewEvent() {
    if (!officeId || !activeCalendarId) return;

    const title = draft.title.trim();
    if (!title) return alert("Podaj tytuł");
    if (!draft.start || !draft.end) return alert("Podaj datę start i koniec");

    setSaving(true);
    try {
      const qs = new URLSearchParams({
        orgId: officeId,
        calendarId: activeCalendarId,
      });

      const r = await fetch(`/api/calendar/events?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          start: new Date(draft.start).toISOString(),
          end: new Date(draft.end).toISOString(),
          locationText: draft.locationText || null,
          description: draft.description || null,
          createdBy: userId,
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw new Error(err?.error || "Nie udało się zapisać terminu");
      }

      setIsModalOpen(false);

      // odśwież eventy w bieżącym zakresie
      if (range.start && range.end) await loadEvents(range.start, range.end);
    } catch (e: any) {
      alert(e?.message ?? "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ew-bg p-6 text-ew-primary">
      <div className="mx-auto max-w-7xl">
        {/* TITLE */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {t(lang, "panelNavCalendar" as any) ?? "Kalendarz"}
            </h1>
            <p className="mt-1 text-xs text-gray-500">
              {scope === "user" ? "Mój kalendarz" : "Kalendarz biura"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-2xl bg-ew-accent px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm transition hover:opacity-95"
              onClick={() => openNewEvent()}
            >
              + Nowy termin
            </button>

            <button
              type="button"
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-ew-accent/10"
              onClick={() => calendarRef.current?.getApi().today()}
            >
              {t(lang, "panelToday" as any) ?? "Dziś"}
            </button>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="mb-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    view === "dayGridMonth"
                      ? "bg-ew-accent text-ew-primary"
                      : "text-ew-primary hover:bg-ew-accent/10"
                  )}
                  onClick={() => setView("dayGridMonth")}
                >
                  {t(lang, "calViewMonth" as any) ?? "Miesiąc"}
                </button>
                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    view === "timeGridWeek"
                      ? "bg-ew-accent text-ew-primary"
                      : "text-ew-primary hover:bg-ew-accent/10"
                  )}
                  onClick={() => setView("timeGridWeek")}
                >
                  {t(lang, "calViewWeek" as any) ?? "Tydzień"}
                </button>
                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    view === "timeGridDay"
                      ? "bg-ew-accent text-ew-primary"
                      : "text-ew-primary hover:bg-ew-accent/10"
                  )}
                  onClick={() => setView("timeGridDay")}
                >
                  {t(lang, "calViewDay" as any) ?? "Dzień"}
                </button>
                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    view === "listWeek"
                      ? "bg-ew-accent text-ew-primary"
                      : "text-ew-primary hover:bg-ew-accent/10"
                  )}
                  onClick={() => setView("listWeek")}
                >
                  {t(lang, "calViewList" as any) ?? "Lista"}
                </button>
              </div>

              {/* Scope switch */}
              <div className="inline-flex overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    scope === "user"
                      ? "bg-ew-primary text-white"
                      : "text-ew-primary hover:bg-ew-accent/10"
                  )}
                  disabled={!userCalendarId}
                  onClick={() => setScope("user")}
                >
                  {t(lang, "calScopeMine" as any) ?? "Mój"}
                </button>
                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    scope === "org"
                      ? "bg-ew-primary text-white"
                      : "text-ew-primary hover:bg-ew-accent/10"
                  )}
                  disabled={!orgCalendarId}
                  onClick={() => setScope("org")}
                >
                  {t(lang, "calScopeOffice" as any) ?? "Biuro"}
                </button>
              </div>

              {/* Prev/Next */}
              <div className="inline-flex overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <button
                  type="button"
                  className="px-3 py-2 text-sm font-semibold text-ew-primary transition hover:bg-ew-accent/10"
                  onClick={() => calendarRef.current?.getApi().prev()}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-sm font-semibold text-ew-primary transition hover:bg-ew-accent/10"
                  onClick={() => calendarRef.current?.getApi().next()}
                >
                  ›
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t(lang, "calSearch" as any) ?? "Szukaj…"}
                  className="w-full sm:w-72 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  ⌘K
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CALENDAR GRID */}
        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={view}
            headerToolbar={false}
            locale={localeObj}
            height="auto"
            nowIndicator
            selectable
            selectMirror
            events={events}
            datesSet={(arg) => {
              setRange({ start: arg.startStr, end: arg.endStr });
              loadEvents(arg.startStr, arg.endStr);
            }}
            select={(info) => {
              // bonus: zaznaczenie slotu otwiera modal z prefill
              openNewEvent({ start: info.start, end: info.end });
            }}
          />
        </div>
      </div>

      {/* MODAL */}
      {isModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            // klik na tło zamyka
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-ew-primary">
                  {t(lang, "calNewEvent" as any) ?? "Nowy termin"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {scope === "user" ? "Zapis do mojego kalendarza" : "Zapis do kalendarza biura"}
                </p>
              </div>

              <button
                type="button"
                className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-ew-primary transition hover:bg-ew-accent/10"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  {t(lang, "calFieldTitle" as any) ?? "Tytuł"}
                </label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                  placeholder={t(lang, "calFieldTitlePh" as any) ?? "np. Prezentacja mieszkania"}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-600">
                    {t(lang, "calFieldStart" as any) ?? "Start"}
                  </label>
                  <input
                    type="datetime-local"
                    value={draft.start}
                    onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">
                    {t(lang, "calFieldEnd" as any) ?? "Koniec"}
                  </label>
                  <input
                    type="datetime-local"
                    value={draft.end}
                    onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">
                  {t(lang, "calFieldLocation" as any) ?? "Lokalizacja"}
                </label>
                <input
                  value={draft.locationText}
                  onChange={(e) => setDraft((d) => ({ ...d, locationText: e.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                  placeholder={t(lang, "calFieldLocationPh" as any) ?? "np. Katowice, ul. ..."}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">
                  {t(lang, "calFieldDesc" as any) ?? "Opis"}
                </label>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                  rows={4}
                  placeholder={t(lang, "calFieldDescPh" as any) ?? "Dodatkowe informacje…"}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary transition hover:bg-ew-accent/10"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
              >
                {t(lang, "calCancel" as any) ?? "Anuluj"}
              </button>

              <button
                type="button"
                className="rounded-2xl bg-ew-accent px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm transition hover:opacity-95 disabled:opacity-60"
                onClick={submitNewEvent}
                disabled={saving}
              >
                {saving ? (t(lang, "calSaving" as any) ?? "Zapisuję…") : (t(lang, "calSave" as any) ?? "Zapisz")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
