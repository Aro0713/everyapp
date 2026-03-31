import { useEffect, useMemo, useState } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

type NoteSource = "client" | "listing" | "event" | "external_listing";

type NoteRow = {
  id: string;
  note_source: NoteSource;
  office_id: string;
  user_id: string;
  note: string;
  created_at: string | null;
  updated_at: string | null;
  client_id: string | null;
  listing_id: string | null;
  event_id: string | null;
  external_listing_id: string | null;
  subject_title: string | null;
  author_name: string | null;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString();
}

function getSourceLabel(lang: LangKey, source: NoteSource) {
  switch (source) {
    case "client":
      return t(lang, "panelNavClients" as any) ?? "Klienci";
    case "listing":
      return t(lang, "panelNavListings" as any) ?? "Oferty";
    case "event":
      return t(lang, "panelNavCalendar" as any) ?? "Kalendarz";
    case "external_listing":
      return "EveryBOT";
    default:
      return source;
  }
}

export default function NotesView({ lang }: { lang: LangKey }) {
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<"" | NoteSource>("");
  const [q, setQ] = useState("");

  const [clientId, setClientId] = useState("");
  const [listingId, setListingId] = useState("");
  const [eventId, setEventId] = useState("");
  const [externalListingId, setExternalListingId] = useState("");
  const [note, setNote] = useState("");

  async function load(next?: {
    source?: "" | NoteSource;
    q?: string;
  }) {
    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams();
      const sourceValue = next?.source ?? source;
      const qValue = (next?.q ?? q).trim();

      if (sourceValue) qs.set("source", sourceValue);
      if (qValue) qs.set("q", qValue);
      qs.set("limit", "150");

      const r = await fetch(`/api/notes/list?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setRows(Array.isArray(j?.rows) ? j.rows : []);
    } catch (e: any) {
      setError(e?.message ?? "NOTES_LOAD_ERROR");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createNote() {
    const trimmed = note.trim();
    if (!trimmed) {
      alert("Wpisz notatkę.");
      return;
    }

    const targets = [
      clientId.trim(),
      listingId.trim(),
      eventId.trim(),
      externalListingId.trim(),
    ].filter(Boolean);

    if (targets.length !== 1) {
      alert("Podaj dokładnie jedno powiązanie: klient albo oferta CRM albo event albo oferta EveryBOT.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const r = await fetch("/api/notes/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: trimmed,
          clientId: clientId.trim() || null,
          listingId: listingId.trim() || null,
          eventId: eventId.trim() || null,
          externalListingId: externalListingId.trim() || null,
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setNote("");
      setClientId("");
      setListingId("");
      setEventId("");
      setExternalListingId("");

      await load();
    } catch (e: any) {
      setError(e?.message ?? "NOTES_CREATE_ERROR");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(row: NoteRow) {
    const confirmed = window.confirm("Usunąć tę notatkę?");
    if (!confirmed) return;

    setDeletingId(row.id);
    setError(null);

    try {
      const r = await fetch("/api/notes/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: row.id,
          source: row.note_source,
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      await load();
    } catch (e: any) {
      setError(e?.message ?? "NOTES_DELETE_ERROR");
    } finally {
      setDeletingId(null);
    }
  }

  const stats = useMemo(() => {
    return {
      total: rows.length,
      client: rows.filter((x) => x.note_source === "client").length,
      listing: rows.filter((x) => x.note_source === "listing").length,
      event: rows.filter((x) => x.note_source === "event").length,
      external: rows.filter((x) => x.note_source === "external_listing").length,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-white">
              {t(lang, "panelNavNotes" as any) ?? "Notatki"}
            </h2>
            <p className="mt-0.5 text-xs text-white/50">
              Jedna lista notatek dla klientów, ofert, kalendarza i EveryBOT.
            </p>
          </div>

          <button
            type="button"
            onClick={() => load()}
            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15"
          >
            {t(lang, "offersRefresh" as any) ?? "Odśwież"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { key: "", label: "Wszystkie" },
            { key: "client", label: "Klienci" },
            { key: "listing", label: "Oferty CRM" },
            { key: "event", label: "Kalendarz" },
            { key: "external_listing", label: "EveryBOT" },
          ].map((item) => (
            <button
              key={item.key || "all"}
              type="button"
              onClick={() => {
                const nextSource = item.key as "" | NoteSource;
                setSource(nextSource);
                load({ source: nextSource, q });
              }}
              className={clsx(
                "rounded-xl border px-3 py-1 text-xs font-semibold transition",
                source === item.key
                  ? "border-ew-accent bg-ew-accent/10 text-white"
                  : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj po treści, tytule, autorze"
            className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
          />

          <button
            type="button"
            onClick={() => load({ source, q })}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
          >
            Szukaj
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
            Łącznie: {stats.total}
          </span>
          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
            Klienci: {stats.client}
          </span>
          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
            Oferty CRM: {stats.listing}
          </span>
          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
            Kalendarz: {stats.event}
          </span>
          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
            EveryBOT: {stats.external}
          </span>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
        <h3 className="text-sm font-extrabold text-white">Dodaj notatkę</h3>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="clientId"
            className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none"
          />
          <input
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            placeholder="listingId"
            className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none"
          />
          <input
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="eventId"
            className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none"
          />
          <input
            value={externalListingId}
            onChange={(e) => setExternalListingId(e.target.value)}
            placeholder="externalListingId"
            className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none"
          />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Treść notatki"
            className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
          />

          <button
            type="button"
            onClick={createNote}
            disabled={saving}
            className={clsx(
              "rounded-2xl bg-ew-accent px-5 py-2 text-sm font-extrabold text-white shadow-sm transition hover:opacity-95",
              saving && "cursor-not-allowed opacity-60"
            )}
          >
            {saving ? "Zapisywanie..." : "Dodaj notatkę"}
          </button>
        </div>

        <p className="mt-2 text-xs text-white/45">
          Wpisz dokładnie jedno powiązanie: klient albo oferta CRM albo event albo oferta EveryBOT.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
        {loading ? (
          <div className="text-xs text-white/50">Ładowanie notatek...</div>
        ) : rows.length === 0 ? (
          <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
            <p className="text-xs text-white/60">Brak notatek.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {rows.map((row) => (
              <div key={row.id} className="p-3 transition hover:bg-white/5">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(180px,0.8fr)_minmax(220px,0.9fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-white/10">
                        {getSourceLabel(lang, row.note_source)}
                      </span>

                      {row.subject_title ? (
                        <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-100 ring-1 ring-indigo-500/20">
                          {row.subject_title}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 whitespace-pre-wrap text-sm text-white/90">
                      {row.note}
                    </div>
                  </div>

                  <div className="text-[11px] text-white/70">
                    <div className="text-white/45">Autor</div>
                    <div className="mt-1 font-semibold text-white/85">
                      {row.author_name || "—"}
                    </div>
                  </div>

                  <div className="text-[11px] text-white/70">
                    <div className="text-white/45">Aktualizacja</div>
                    <div className="mt-1 font-semibold text-white/85">
                      {fmtDate(row.updated_at || row.created_at)}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => deleteNote(row)}
                      disabled={deletingId === row.id}
                      className={clsx(
                        "rounded-xl border px-3 py-1 text-[11px] font-semibold shadow-sm transition",
                        deletingId === row.id
                          ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                          : "border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                      )}
                    >
                      {deletingId === row.id ? "Usuwanie..." : "Usuń"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}