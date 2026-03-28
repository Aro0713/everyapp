import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { LangKey } from "@/utils/translations";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import EventModal, {
  type EventDraft,
  type EventType,
  labelForEventType,
} from "@/components/calendar/EventModal";

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
  extendedProps?: {
    description?: string | null;
    locationText?: string | null;
    status?: string | null;
    eventType?: EventType | null;
    source?: string | null;
    outcome?: string | null;
    externalListingId?: string | null;
    clientId?: string | null;
    listingId?: string | null;
    meta?: Record<string, unknown>;
    ownerUserId?: string | null;
  };
};

type BootstrapResponse = {
  officeId: string;
  orgCalendarId: string | null;
  userCalendarId: string | null;
};

type CalView = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";

function toLocalInput(dt: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
    dt.getHours()
  )}:${pad(dt.getMinutes())}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  const autoOpenedRef = useRef(false);

  const queryClientId =
    typeof router.query.clientId === "string" ? router.query.clientId.trim() : "";
  const queryListingId =
    typeof router.query.listingId === "string" ? router.query.listingId.trim() : "";
  const queryAction =
    typeof router.query.action === "string" ? router.query.action.trim() : "";

  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);
  const [events, setEvents] = useState<FcEvent[]>([]);

  const [userId, setUserId] = useState<string | null>(null);

  const [officeId, setOfficeId] = useState<string | null>(null);
  const [orgCalendarId, setOrgCalendarId] = useState<string | null>(null);
  const [userCalendarId, setUserCalendarId] = useState<string | null>(null);

  const [scope, setScope] = useState<"user" | "org">("user");
  const [view, setView] = useState<CalView>("dayGridMonth");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<{ start?: string; end?: string }>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  type IntegrationRow = {
    id: string;
    provider: "ics";
    name: string;
    ics_url: string;
    is_enabled: boolean;
    last_sync_at?: string | null;
    last_error?: string | null;
  };

  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);

  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [connectSaving, setConnectSaving] = useState(false);
  const [connectDraft, setConnectDraft] = useState<{ name: string; icsUrl: string }>({
    name: "",
    icsUrl: "",
  });

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>({
    eventType: "presentation",
    title: "",
    start: "",
    end: "",
    locationText: "",
    description: "",
    clientId: "",
    listingId: "",
  });

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/me");
      if (!r.ok) {
        console.error("GET /api/me failed", r.status);
        return;
      }
      const data = await r.json().catch(() => null);
      if (data?.userId) setUserId(data.userId);
      else console.error("/api/me returned no userId", data);
    })();
  }, []);

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

  useEffect(() => {
    (async () => {
      if (!userId) return;

      const r = await fetch("/api/calendar/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) return;

      const data: BootstrapResponse = await r.json();
      setOfficeId(data.officeId);
      setOrgCalendarId(data.orgCalendarId ?? null);
      setUserCalendarId(data.userCalendarId ?? null);

      if (data.userCalendarId) setScope("user");
      else setScope("org");

      await loadIntegrations();
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

    const data = await r.json().catch(() => []);
    const list: FcEvent[] = Array.isArray(data) ? data : [];

    let extList: FcEvent[] = [];
    try {
      const rExt = await fetch(`/api/calendar/external-events?${qs.toString()}`);
      if (rExt.ok) {
        const extData = await rExt.json().catch(() => []);
        extList = Array.isArray(extData) ? extData : [];
      }
    } catch {
      // ignore external failures
    }

    let merged = [...list, ...extList];

    if (queryClientId) {
      merged = merged.filter((e) => e.extendedProps?.clientId === queryClientId);
    }

    if (queryListingId) {
      merged = merged.filter((e) => e.extendedProps?.listingId === queryListingId);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      merged = merged.filter((e) => (e.title || "").toLowerCase().includes(q));
    }

    setEvents(merged);
  }

  useEffect(() => {
    if (!activeCalendarId) return;
    if (!range.start || !range.end) return;
    loadEvents(range.start, range.end);
  }, [activeCalendarId, scope, range.start, range.end, queryClientId, queryListingId]);

  useEffect(() => {
    if (!range.start || !range.end) return;
    loadEvents(range.start, range.end);
  }, [query]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(view);
  }, [view]);

  const localeObj = useMemo(() => fcLocale(lang), [lang]);

  function openNewEvent(
    prefill?: {
      start?: Date;
      end?: Date;
      clientId?: string;
      listingId?: string;
    }
  ) {
    setEditingEventId(null);

    const now = new Date();
    const start = prefill?.start ?? now;
    const end = prefill?.end ?? new Date(now.getTime() + 60 * 60 * 1000);

    setDraft({
      eventType: "presentation",
      title: labelForEventType(lang, "presentation"),
      start: toLocalInput(start),
      end: toLocalInput(end),
      locationText: "",
      description: "",
      clientId: prefill?.clientId ?? queryClientId ?? "",
      listingId: prefill?.listingId ?? queryListingId ?? "",
    });

    setIsModalOpen(true);
  }

  function openEditEvent(ev: any) {
    setEditingEventId(ev.id);

    const start = ev.start ? new Date(ev.start) : new Date();
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60 * 1000);

    setDraft({
      eventType: (ev.extendedProps?.eventType as EventType) ?? "other",
      title: ev.title ?? "",
      start: toLocalInput(start),
      end: toLocalInput(end),
      locationText: ev.extendedProps?.locationText ?? "",
      description: ev.extendedProps?.description ?? "",
      clientId: ev.extendedProps?.clientId ?? "",
      listingId: ev.extendedProps?.listingId ?? "",
    });

    setIsModalOpen(true);
  }

  useEffect(() => {
    if (!router.isReady) return;
    if (!activeCalendarId) return;
    if (queryAction !== "new") return;
    if (autoOpenedRef.current) return;

    autoOpenedRef.current = true;
    openNewEvent({
      clientId: queryClientId || "",
      listingId: queryListingId || "",
    });
  }, [router.isReady, activeCalendarId, queryAction, queryClientId, queryListingId]);

  async function patchEvent(payload: {
    id: string;
    title?: string;
    start?: string;
    end?: string;
    locationText?: string | null;
    description?: string | null;
    eventType?: EventType;
    clientId?: string | null;
    listingId?: string | null;
  }) {
    if (!officeId || !activeCalendarId) {
      alert(t(lang, "calNoActiveCalendar" as any) ?? "No active calendar.");
      return;
    }

    const qs = new URLSearchParams({
      orgId: officeId,
      calendarId: activeCalendarId,
    });

    const r = await fetch(`/api/calendar/events?${qs.toString()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => null);
      throw new Error(err?.error || "Nie udało się zapisać zmian terminu");
    }
  }

  async function submitNewEvent() {
    if (!officeId || !activeCalendarId) {
      alert(t(lang, "calNoActiveCalendar" as any) ?? "No active calendar.");
      return;
    }

    const title = draft.title.trim();
    if (!title) return alert(t(lang, "calErrorMissingTitle" as any) ?? "Enter a title.");

    if (!draft.start || !draft.end) {
      return alert(t(lang, "calErrorMissingDates" as any) ?? "Enter start and end date.");
    }

    setSaving(true);
    try {
      const qs = new URLSearchParams({
        orgId: officeId,
        calendarId: activeCalendarId,
      });

      if (editingEventId) {
        await patchEvent({
          id: editingEventId,
          title,
          start: new Date(draft.start).toISOString(),
          end: new Date(draft.end).toISOString(),
          locationText: draft.locationText || null,
          description: draft.description || null,
          eventType: draft.eventType,
          clientId: draft.clientId || null,
          listingId: draft.listingId || null,
        });
      } else {
        const r = await fetch(`/api/calendar/events?${qs.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            start: new Date(draft.start).toISOString(),
            end: new Date(draft.end).toISOString(),
            locationText: draft.locationText || null,
            description: draft.description || null,
            eventType: draft.eventType,
            clientId: draft.clientId || null,
            listingId: draft.listingId || null,
          }),
        });

        if (!r.ok) {
          const err = await r.json().catch(() => null);
          throw new Error(err?.error || "Nie udało się zapisać terminu");
        }
      }

      setEditingEventId(null);
      setIsModalOpen(false);

      if (range.start && range.end) await loadEvents(range.start, range.end);
    } catch (e: any) {
      alert(e?.message ?? (t(lang, "calSaveError" as any) ?? "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function syncCalendars() {
    if (syncing) return;
    if (scope !== "user") {
      alert(t(lang, "calSyncMineOnly" as any) ?? "Synchronization is available only in Mine.");
      return;
    }

    if (integrations.length === 0) {
      alert(
        t(lang, "calSyncNoSources" as any) ?? "No connected calendars. Add an ICS source first."
      );
      return;
    }

    setSyncing(true);
    try {
      const r = await fetch("/api/calendar/sync-ics", { method: "GET" });
      if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw new Error(err?.error || (t(lang, "calSyncError" as any) ?? "Sync failed"));
      }

      if (range.start && range.end) {
        await loadEvents(range.start, range.end);
      }

      alert(t(lang, "calSyncSuccess" as any) ?? "Synchronization completed");
    } catch (e: any) {
      alert(e?.message ?? (t(lang, "calSyncError" as any) ?? "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  async function loadIntegrations() {
    setIntegrationsLoading(true);
    try {
      const r = await fetch("/api/calendar/integrations");
      if (!r.ok) throw new Error("INTEGRATIONS_FETCH_FAILED");
      const data = await r.json().catch(() => []);
      const list: IntegrationRow[] = Array.isArray(data) ? data : [];
      setIntegrations(list);
    } catch {
      setIntegrations([]);
    } finally {
      setIntegrationsLoading(false);
    }
  }

  function isValidIcsUrl(url: string) {
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }

  async function addIntegration(
    { name, icsUrl }: { name: string; icsUrl: string },
    syncAfter: boolean
  ) {
    const n = name.trim();
    const u = icsUrl.trim();

    if (!n) {
      alert(t(lang, "calConnectErrorName" as any) ?? "Enter a name.");
      return;
    }
    if (!isValidIcsUrl(u)) {
      alert(t(lang, "calConnectErrorUrl" as any) ?? "Enter a valid ICS URL.");
      return;
    }

    setConnectSaving(true);
    try {
      const r = await fetch("/api/calendar/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, icsUrl: u }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(
          j?.error || (t(lang, "calConnectErrorSave" as any) ?? "Could not save integration.")
        );
      }

      setIsConnectOpen(false);
      setConnectDraft({ name: "", icsUrl: "" });

      await loadIntegrations();

      if (syncAfter) {
        await syncCalendars();
      } else {
        alert(t(lang, "calConnectSaved" as any) ?? "Calendar connected.");
      }
    } catch (e: any) {
      alert(
        e?.message || (t(lang, "calConnectErrorSave" as any) ?? "Could not save integration.")
      );
    } finally {
      setConnectSaving(false);
    }
  }

  async function deleteIntegration(id: string) {
    if (!confirm(t(lang, "calIntegrationDeleteConfirm" as any) ?? "Delete this integration?"))
      return;

    try {
      const r = await fetch(`/api/calendar/integrations?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("DELETE_FAILED");
      await loadIntegrations();

      if (range.start && range.end) await loadEvents(range.start, range.end);
    } catch {
      alert(t(lang, "calIntegrationDeleteError" as any) ?? "Could not delete integration.");
    }
  }

  return (
    <main className="w-full text-white">
      <style jsx global>{`
        .fc {
          color: rgba(255, 255, 255, 0.92);
          --fc-border-color: rgba(255, 255, 255, 0.1);
          --fc-today-bg-color: rgba(255, 255, 255, 0.06);
          --fc-neutral-bg-color: rgba(255, 255, 255, 0.04);
          --fc-page-bg-color: transparent;
        }

        .fc .fc-col-header-cell-cushion,
        .fc .fc-daygrid-day-number {
          color: rgba(255, 255, 255, 0.88);
          text-decoration: none;
        }

        .fc .fc-scrollgrid,
        .fc .fc-scrollgrid-section > td,
        .fc .fc-scrollgrid-section table {
          background: transparent;
        }
        .fc .fc-daygrid-day-frame,
        .fc .fc-timegrid-slot,
        .fc .fc-timegrid-axis,
        .fc .fc-timegrid-col-frame {
          background: transparent;
        }

        .fc .fc-timegrid-axis-cushion,
        .fc .fc-timegrid-slot-label-cushion {
          color: rgba(255, 255, 255, 0.55);
        }

        .fc-theme-standard td,
        .fc-theme-standard th {
          border-color: rgba(255, 255, 255, 0.1);
        }

        .fc .fc-event.fc-event--office {
          background: rgba(59, 130, 246, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #fff;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          border-radius: 12px;
          backdrop-filter: blur(10px);
        }
        .fc .fc-event.fc-event--private {
          background: rgba(16, 185, 129, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #fff;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          border-radius: 12px;
          backdrop-filter: blur(10px);
        }
        .fc .fc-event:hover {
          filter: brightness(1.05);
          transform: translateY(-1px);
          transition: 140ms ease;
        }

        .fc .fc-event-title,
        .fc .fc-event-time {
          font-weight: 700;
          font-size: 12px;
          line-height: 1.15;
          color: rgba(255, 255, 255, 0.95);
        }

        .fc .fc-timegrid-now-indicator-line {
          border-color: rgba(255, 255, 255, 0.35);
        }

        .fc .fc-list {
          border-color: rgba(255, 255, 255, 0.1);
        }
        .fc .fc-list-day-cushion {
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.85);
        }
        .fc .fc-list-event:hover td {
          background: rgba(255, 255, 255, 0.05);
        }
      `}</style>

      <div className="w-full">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {t(lang, "panelNavCalendar" as any) ?? "Kalendarz"}
            </h1>
            <p className="mt-1 text-xs text-white/60">
              {scope === "user" ? "Mój kalendarz" : "Kalendarz biura"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur-md transition hover:bg-white/15"
              onClick={() => openNewEvent()}
            >
              + Nowy termin
            </button>

            <button
              type="button"
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur-md transition hover:bg-white/15 disabled:opacity-60"
              onClick={syncCalendars}
              disabled={syncing}
              title={t(lang, "calSyncTitle" as any) ?? "Sync calendars"}
            >
              {syncing
                ? t(lang, "calSyncing" as any) ?? "Synchronizing…"
                : t(lang, "calSyncButton" as any) ?? "Synchronize"}
            </button>

            <button
              type="button"
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur-md transition hover:bg-white/15 disabled:opacity-60"
              onClick={() => {
                if (scope !== "user") {
                  alert(t(lang, "calConnectMineOnly" as any) ?? "Connect calendars in Mine.");
                  return;
                }
                setIsConnectOpen(true);
              }}
            >
              + {t(lang, "calConnectButton" as any) ?? "Connect calendar"}
            </button>

            <button
              type="button"
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur-md transition hover:bg-white/15"
              onClick={() => calendarRef.current?.getApi().today()}
            >
              {t(lang, "panelToday" as any) ?? "Dziś"}
            </button>
          </div>
        </div>

        {(queryClientId || queryListingId) && (
          <div className="mb-4 rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-white/80">
                {queryClientId ? (
                  <span className="mr-3">
                    Filtr klienta: <span className="font-semibold text-white">{queryClientId}</span>
                  </span>
                ) : null}
                {queryListingId ? (
                  <span>
                    Filtr oferty: <span className="font-semibold text-white">{queryListingId}</span>
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  const nextQuery = { ...router.query };
                  delete nextQuery.clientId;
                  delete nextQuery.listingId;
                  delete nextQuery.action;
                  router.push(
                    {
                      pathname: router.pathname,
                      query: nextQuery,
                    },
                    undefined,
                    { shallow: true }
                  );
                }}
                className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Wyczyść filtr
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    view === "dayGridMonth" ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
                  )}
                  onClick={() => setView("dayGridMonth")}
                >
                  {t(lang, "calViewMonth" as any) ?? "Miesiąc"}
                </button>

                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    view === "timeGridWeek" ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
                  )}
                  onClick={() => setView("timeGridWeek")}
                >
                  {t(lang, "calViewWeek" as any) ?? "Tydzień"}
                </button>

                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    view === "timeGridDay" ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
                  )}
                  onClick={() => setView("timeGridDay")}
                >
                  {t(lang, "calViewDay" as any) ?? "Dzień"}
                </button>

                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    view === "listWeek" ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
                  )}
                  onClick={() => setView("listWeek")}
                >
                  {t(lang, "calViewList" as any) ?? "Lista"}
                </button>
              </div>

              <div className="inline-flex overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    scope === "user" ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10",
                    !userCalendarId && "cursor-not-allowed opacity-60"
                  )}
                  disabled={!userCalendarId}
                  title={!userCalendarId ? "Brak kalendarza użytkownika (Mój)" : undefined}
                  onClick={() => {
                    if (!userCalendarId) return;
                    setEvents([]);
                    setScope("user");
                  }}
                >
                  {t(lang, "calScopeMine" as any) ?? "Mój"}
                </button>

                <button
                  type="button"
                  className={clsx(
                    "px-3 py-2 text-sm font-semibold transition",
                    scope === "org" ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10",
                    !orgCalendarId && "cursor-not-allowed opacity-60"
                  )}
                  disabled={!orgCalendarId}
                  title={!orgCalendarId ? "Brak kalendarza biura (Biuro)" : undefined}
                  onClick={() => {
                    if (!orgCalendarId) return;
                    setEvents([]);
                    setScope("org");
                  }}
                >
                  {t(lang, "calScopeOffice" as any) ?? "Biuro"}
                </button>
              </div>

              <div className="inline-flex overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <button
                  type="button"
                  className="px-3 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10"
                  onClick={() => calendarRef.current?.getApi().prev()}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10"
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
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20 sm:w-72"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40">
                  ⌘K
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 mt-2 flex gap-4 text-xs text-white/70">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded" style={{ background: "rgba(59,130,246,0.78)" }} />
            {t(lang, "calLegendOffice" as any) ?? "Firmowe"}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded" style={{ background: "rgba(16,185,129,0.72)" }} />
            {t(lang, "calLegendPrivate" as any) ?? "Prywatne"}
          </span>
        </div>

        {scope === "user" ? (
          <div className="mb-4 rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-white">
                  {t(lang, "calIntegrationsTitle" as any) ?? "Connected calendars"}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {t(lang, "calIntegrationsSub" as any) ??
                    "ICS sources are read-only. External events cannot be edited."}
                </div>
              </div>

              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur-md transition hover:bg-white/15 disabled:opacity-60"
                onClick={() => setIsConnectOpen(true)}
                disabled={connectSaving}
              >
                + {t(lang, "calConnectButton" as any) ?? "Connect calendar"}
              </button>
            </div>

            {integrationsLoading ? (
              <div className="mt-3 text-sm text-white/70">
                {t(lang, "calIntegrationsLoading" as any) ?? "Loading…"}
              </div>
            ) : integrations.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-white/70">
                {t(lang, "calIntegrationsEmpty" as any) ??
                  "No connected calendars. Add an ICS source (Google/Outlook/Apple) to synchronize."}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {integrations.map((it) => {
                  const ok = !it.last_error;
                  return (
                    <div
                      key={it.id}
                      className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{it.name}</div>
                        <div className="mt-1 truncate text-xs text-white/60">
                          {it.last_sync_at
                            ? `${t(lang, "calIntegrationLastSync" as any) ?? "Last sync"}: ${new Date(
                                it.last_sync_at
                              ).toLocaleString()}`
                            : `${t(lang, "calIntegrationLastSync" as any) ?? "Last sync"}: —`}
                        </div>
                        {it.last_error ? (
                          <div className="mt-1 text-xs text-red-300">
                            {t(lang, "calIntegrationError" as any) ?? "Error"}: {it.last_error}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            "rounded-full px-3 py-1 text-xs font-semibold",
                            ok ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-200"
                          )}
                        >
                          {ok
                            ? t(lang, "calIntegrationStatusOk" as any) ?? "OK"
                            : t(lang, "calIntegrationStatusError" as any) ?? "Error"}
                        </span>

                        <button
                          type="button"
                          className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition hover:bg-white/15 disabled:opacity-60"
                          onClick={syncCalendars}
                          disabled={syncing}
                          title={t(lang, "calSyncTitle" as any) ?? "Calendar sync (ICS)"}
                        >
                          {t(lang, "calIntegrationRefresh" as any) ?? "Refresh"}
                        </button>

                        <button
                          type="button"
                          className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition hover:bg-white/15"
                          onClick={() => deleteIntegration(it.id)}
                        >
                          {t(lang, "calIntegrationDelete" as any) ?? "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
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
            editable
            eventStartEditable
            eventDurationEditable
            dayMaxEvents={true}
            dateClick={(info) => {
              const api = calendarRef.current?.getApi();
              if (!api) return;

              if (api.view.type === "dayGridMonth") {
                api.changeView("timeGridWeek", info.date);
                setView("timeGridWeek");
              }
            }}
            eventClassNames={(arg) => {
              const src = arg.event.extendedProps?.source;
              if (src === "ics") return ["fc-event--private"];
              return ["fc-event--office"];
            }}
            eventClick={(info) => {
              if (info.event.extendedProps?.source === "ics") {
                alert(t(lang, "calExternalReadOnly" as any) ?? "External events are read-only.");
                return;
              }
              openEditEvent(info.event);
            }}
            eventDrop={async (info) => {
              if (info.event.extendedProps?.source === "ics") {
                info.revert();
                alert(t(lang, "calExternalReadOnly" as any) ?? "External events are read-only.");
                return;
              }
              try {
                await patchEvent({
                  id: info.event.id,
                  start: info.event.start?.toISOString(),
                  end: info.event.end?.toISOString(),
                });
                if (range.start && range.end) await loadEvents(range.start, range.end);
              } catch (e: any) {
                info.revert();
                alert(
                  e?.message ?? (t(lang, "calUpdateError" as any) ?? "Could not save changes.")
                );
              }
            }}
            eventResize={async (info) => {
              if (info.event.extendedProps?.source === "ics") {
                info.revert();
                alert(t(lang, "calExternalReadOnly" as any) ?? "External events are read-only.");
                return;
              }
              try {
                await patchEvent({
                  id: info.event.id,
                  start: info.event.start?.toISOString(),
                  end: info.event.end?.toISOString(),
                });
                if (range.start && range.end) await loadEvents(range.start, range.end);
              } catch (e: any) {
                info.revert();
                alert(e?.message ?? "Błąd zapisu zmian");
              }
            }}
            events={events}
            datesSet={(arg) => {
              setRange({ start: arg.startStr, end: arg.endStr });
              loadEvents(arg.startStr, arg.endStr);
            }}
            select={(info) => {
              openNewEvent({
                start: info.start,
                end: info.end,
                clientId: queryClientId || "",
                listingId: queryListingId || "",
              });
            }}
          />
        </div>
      </div>

      <EventModal
        isOpen={isModalOpen}
        lang={lang}
        saving={saving}
        editingEventId={editingEventId}
        scopeLabel={scope === "user" ? "Zapis do mojego kalendarza" : "Zapis do kalendarza biura"}
        draft={draft}
        setDraft={setDraft}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEventId(null);
        }}
        onSubmit={submitNewEvent}
        activeCalendarId={activeCalendarId}
      />

      {isConnectOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsConnectOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/70 p-6 text-white shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-white">
                  {t(lang, "calConnectTitle" as any) ?? "Connect calendar (ICS)"}
                </h2>
                <p className="mt-1 text-xs text-white/60">
                  {t(lang, "calConnectHint" as any) ??
                    "Paste a private ICS link (Google/Outlook/Apple). Imported events are read-only."}
                </p>
              </div>

              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                onClick={() => setIsConnectOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-white/70">
                  {t(lang, "calConnectNameLabel" as any) ?? "Name"}
                </label>
                <input
                  value={connectDraft.name}
                  onChange={(e) => setConnectDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                  placeholder={t(lang, "calConnectNamePh" as any) ?? "e.g. Google private"}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-white/70">
                  {t(lang, "calConnectUrlLabel" as any) ?? "ICS URL"}
                </label>
                <input
                  value={connectDraft.icsUrl}
                  onChange={(e) => setConnectDraft((d) => ({ ...d, icsUrl: e.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                  placeholder="https://..."
                />
                <p className="mt-2 text-xs text-white/60">
                  {t(lang, "calConnectUrlHelp" as any) ??
                    "Tip: in Google Calendar, use the private address in iCal format."}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
                onClick={() => setIsConnectOpen(false)}
                disabled={connectSaving}
              >
                {t(lang, "calCancel" as any) ?? "Cancel"}
              </button>

              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15 disabled:opacity-60"
                onClick={() => addIntegration(connectDraft, false)}
                disabled={connectSaving}
              >
                {connectSaving
                  ? t(lang, "calConnectSaving" as any) ?? "Saving…"
                  : t(lang, "calConnectSave" as any) ?? "Save"}
              </button>

              <button
                type="button"
                className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20 disabled:opacity-60"
                onClick={() => addIntegration(connectDraft, true)}
                disabled={connectSaving}
              >
                {t(lang, "calConnectSaveAndSync" as any) ?? "Save & sync"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}