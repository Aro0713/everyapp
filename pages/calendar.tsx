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

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar | null>(null);

  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);
  const [events, setEvents] = useState<FcEvent[]>([]);

  // MVP: docelowo z auth/sesji (na razie hardcode)
  const [userId] = useState("TU_WKLEJ_USER_ID_NA_MVP");
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [calendarId, setCalendarId] = useState<string | null>(null);

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

      const data = await r.json();
      setOfficeId(data.officeId);
      setCalendarId(data.userCalendarId); // MVP: pokazujemy kalendarz usera
    })();
  }, [userId]);

  async function loadEvents(rangeStart?: string, rangeEnd?: string) {
    if (!officeId || !calendarId) return;

    const qs = new URLSearchParams({
      orgId: officeId,      // u Ciebie org_id = office_id
      calendarId: calendarId,
    });

    if (rangeStart) qs.set("start", rangeStart);
    if (rangeEnd) qs.set("end", rangeEnd);

    const r = await fetch(`/api/calendar/events?${qs.toString()}`);
    if (!r.ok) return;

    const data = await r.json();
    setEvents(Array.isArray(data) ? data : []);
  }

  const localeObj = useMemo(() => fcLocale(lang), [lang]);

  return (
    <main className="min-h-screen bg-ew-bg p-6 text-ew-primary">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {t(lang, "panelNavCalendar" as any)}
          </h1>

          <button
            className="rounded-xl bg-ew-accent px-4 py-2 text-sm font-semibold text-ew-primary shadow hover:opacity-90"
            type="button"
            onClick={() => {
              calendarRef.current?.getApi().today();
            }}
          >
            {t(lang, "panelToday" as any) ?? "Dziś"}
          </button>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
            }}
            locale={localeObj}
            height="auto"
            nowIndicator
            selectable
            selectMirror
            events={events}
            datesSet={(arg) => {
              loadEvents(arg.startStr, arg.endStr);
            }}
          />
        </div>
      </div>
    </main>
  );
}
