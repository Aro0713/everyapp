import { useEffect, useMemo, useRef, useState } from "react";
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

type ClientSearchRow = {
  id: string;
  full_name: string | null;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  party_type?: string | null;
};

type ListingSearchRow = {
  id: string;
  item_source?: "crm" | "portal";
  title: string | null;
  location_text?: string | null;
  price_amount?: string | number | null;
  currency?: string | null;
  transaction_type?: string | null;
  status?: string | null;
  source?: string | null;
  source_url?: string | null;
};

type EventSearchRow = {
  id: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  location_text: string | null;
  event_type: string | null;
  source: string | null;
  calendar_id: string | null;
  owner_user_id: string | null;
};

type ExternalListingSearchRow = {
  id: string;
  title: string | null;
  location_text?: string | null;
  price_amount?: string | number | null;
  currency?: string | null;
  source?: string | null;
  source_url?: string | null;
};

type SearchState<T> = {
  query: string;
  results: T[];
  loading: boolean;
  open: boolean;
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

function fmtShortEvent(v?: string | null) {
  if (!v) return "—";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(v?: string | number | null, currency?: string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString()} ${currency ?? ""}`.trim();
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

function clientOptionLabel(row: ClientSearchRow) {
  const name =
    row.full_name?.trim() ||
    row.company_name?.trim() ||
    "—";
  const extras = [row.phone, row.email].filter(Boolean).join(" • ");
  return extras ? `${name} • ${extras}` : name;
}

function listingOptionLabel(row: ListingSearchRow) {
  const title = row.title?.trim() || "—";
  const price = fmtMoney(row.price_amount, row.currency);
  const location = row.location_text?.trim() || "";
  const meta = [price !== "—" ? price : "", location].filter(Boolean).join(" • ");
  return meta ? `${title} • ${meta}` : title;
}

function eventOptionLabel(row: EventSearchRow) {
  const datePart = row.start_at ? fmtShortEvent(row.start_at) : "—";
  const locationPart = row.location_text?.trim() ? ` • ${row.location_text.trim()}` : "";
  return `${row.title || "—"} • ${datePart}${locationPart}`;
}

function externalOptionLabel(row: ExternalListingSearchRow) {
  const title = row.title?.trim() || row.source_url?.trim() || "—";
  const price = fmtMoney(row.price_amount, row.currency);
  const location = row.location_text?.trim() || "";
  const source = row.source?.trim() || "";
  const meta = [source, price !== "—" ? price : "", location].filter(Boolean).join(" • ");
  return meta ? `${title} • ${meta}` : title;
}

function SearchBox<T>({
  label,
  placeholder,
  state,
  setState,
  selectedId,
  selectedLabel,
  onPick,
  onClear,
  renderOption,
}: {
  label: string;
  placeholder: string;
  state: SearchState<T>;
  setState: React.Dispatch<React.SetStateAction<SearchState<T>>>;
  selectedId: string;
  selectedLabel: string;
  onPick: (item: T) => void;
  onClear: () => void;
  renderOption: (item: T, index: number) => React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const el = boxRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        setState((prev) => ({ ...prev, open: false }));
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setState]);

  return (
    <div ref={boxRef} className="relative">
      <div className="mb-1 block text-xs text-white/60">{label}</div>

      <input
        value={state.query}
        onChange={(e) =>
          setState((prev) => ({
            ...prev,
            query: e.target.value,
            open: true,
          }))
        }
        onFocus={() =>
          setState((prev) => ({
            ...prev,
            open: true,
          }))
        }
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
      />

      {selectedId ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-emerald-200">
              Wybrane
            </div>
            <div className="truncate text-[11px] text-emerald-100/80">
              {selectedLabel}
            </div>
          </div>

          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
          >
            Wyczyść
          </button>
        </div>
      ) : null}

      {state.open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl">
          {state.loading ? (
            <div className="px-3 py-2 text-xs text-white/55">Wyszukiwanie...</div>
          ) : state.query.trim().length < 2 ? (
            <div className="px-3 py-2 text-xs text-white/45">Wpisz minimum 2 znaki.</div>
          ) : state.results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-white/45">Brak wyników.</div>
          ) : (
            <div className="space-y-1">
              {state.results.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onPick(item)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
                >
                  {renderOption(item, index)}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setState((prev) => ({ ...prev, open: false }))}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/85 transition hover:bg-white/15"
            >
              Zamknij
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
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

  const [clientLabel, setClientLabel] = useState("");
  const [listingLabel, setListingLabel] = useState("");
  const [eventLabel, setEventLabel] = useState("");
  const [externalListingLabel, setExternalListingLabel] = useState("");

  const [note, setNote] = useState("");

  const [clientSearch, setClientSearch] = useState<SearchState<ClientSearchRow>>({
    query: "",
    results: [],
    loading: false,
    open: false,
  });

  const [listingSearch, setListingSearch] = useState<SearchState<ListingSearchRow>>({
    query: "",
    results: [],
    loading: false,
    open: false,
  });

  const [eventSearch, setEventSearch] = useState<SearchState<EventSearchRow>>({
    query: "",
    results: [],
    loading: false,
    open: false,
  });

  const [externalSearch, setExternalSearch] = useState<SearchState<ExternalListingSearchRow>>({
    query: "",
    results: [],
    loading: false,
    open: false,
  });

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

  async function searchClients(term: string) {
    const trimmed = term.trim();

    if (trimmed.length < 2) {
      setClientSearch((prev) => ({ ...prev, results: [], loading: false }));
      return;
    }

    setClientSearch((prev) => ({ ...prev, loading: true }));

    try {
      const qs = new URLSearchParams();
      qs.set("q", trimmed);
      qs.set("limit", "12");

      const r = await fetch(`/api/contacts/list?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setClientSearch((prev) => ({
        ...prev,
        results: Array.isArray(j?.rows) ? j.rows : [],
        loading: false,
      }));
    } catch (e: any) {
      setClientSearch((prev) => ({ ...prev, results: [], loading: false }));
      setError(e?.message ?? "CLIENT_SEARCH_ERROR");
    }
  }

  async function searchListings(term: string) {
    const trimmed = term.trim();

    if (trimmed.length < 2) {
      setListingSearch((prev) => ({ ...prev, results: [], loading: false }));
      return;
    }

    setListingSearch((prev) => ({ ...prev, loading: true }));

    try {
      const qs = new URLSearchParams();
      qs.set("q", trimmed);

      const r = await fetch(`/api/offers/list?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      const rows = Array.isArray(j?.rows) ? j.rows.slice(0, 12) : [];

      setListingSearch((prev) => ({
        ...prev,
        results: rows,
        loading: false,
      }));
    } catch (e: any) {
      setListingSearch((prev) => ({ ...prev, results: [], loading: false }));
      setError(e?.message ?? "LISTING_SEARCH_ERROR");
    }
  }

  async function searchEvents(term: string) {
    const trimmed = term.trim();

    if (trimmed.length < 2) {
      setEventSearch((prev) => ({ ...prev, results: [], loading: false }));
      return;
    }

    setEventSearch((prev) => ({ ...prev, loading: true }));

    try {
      const qs = new URLSearchParams();
      qs.set("q", trimmed);
      qs.set("limit", "12");

      const r = await fetch(`/api/notes/search-events?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setEventSearch((prev) => ({
        ...prev,
        results: Array.isArray(j?.rows) ? j.rows : [],
        loading: false,
      }));
    } catch (e: any) {
      setEventSearch((prev) => ({ ...prev, results: [], loading: false }));
      setError(e?.message ?? "EVENT_SEARCH_ERROR");
    }
  }

  async function searchExternalListings(term: string) {
    const trimmed = term.trim();

    if (trimmed.length < 2) {
      setExternalSearch((prev) => ({ ...prev, results: [], loading: false }));
      return;
    }

    setExternalSearch((prev) => ({ ...prev, loading: true }));

    try {
      const qs = new URLSearchParams();
      qs.set("q", trimmed);
      qs.set("limit", "12");
      qs.set("includeInactive", "1");
      qs.set("includePreview", "1");
      qs.set("onlyEnriched", "0");

      const r = await fetch(`/api/external_listings/list?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setExternalSearch((prev) => ({
        ...prev,
        results: Array.isArray(j?.rows) ? j.rows : [],
        loading: false,
      }));
    } catch (e: any) {
      setExternalSearch((prev) => ({ ...prev, results: [], loading: false }));
      setError(e?.message ?? "EXTERNAL_LISTING_SEARCH_ERROR");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (clientSearch.open) searchClients(clientSearch.query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [clientSearch.query, clientSearch.open]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (listingSearch.open) searchListings(listingSearch.query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [listingSearch.query, listingSearch.open]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (eventSearch.open) searchEvents(eventSearch.query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [eventSearch.query, eventSearch.open]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (externalSearch.open) searchExternalListings(externalSearch.query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [externalSearch.query, externalSearch.open]);

  function clearAllTargetsExcept(kind: NoteSource) {
    if (kind !== "client") {
      setClientId("");
      setClientLabel("");
      setClientSearch((prev) => ({ ...prev, query: "", results: [], open: false }));
    }

    if (kind !== "listing") {
      setListingId("");
      setListingLabel("");
      setListingSearch((prev) => ({ ...prev, query: "", results: [], open: false }));
    }

    if (kind !== "event") {
      setEventId("");
      setEventLabel("");
      setEventSearch((prev) => ({ ...prev, query: "", results: [], open: false }));
    }

    if (kind !== "external_listing") {
      setExternalListingId("");
      setExternalListingLabel("");
      setExternalSearch((prev) => ({ ...prev, query: "", results: [], open: false }));
    }
  }

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
      alert("Wybierz dokładnie jedno powiązanie: klient albo oferta CRM albo event albo oferta EveryBOT.");
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
      setClientLabel("");
      setListingLabel("");
      setEventLabel("");
      setExternalListingLabel("");

      setClientSearch({ query: "", results: [], loading: false, open: false });
      setListingSearch({ query: "", results: [], loading: false, open: false });
      setEventSearch({ query: "", results: [], loading: false, open: false });
      setExternalSearch({ query: "", results: [], loading: false, open: false });

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
          <SearchBox<ClientSearchRow>
            label="Klient"
            placeholder="Wyszukaj klienta po nazwie, telefonie lub emailu"
            state={clientSearch}
            setState={setClientSearch}
            selectedId={clientId}
            selectedLabel={clientLabel}
            onPick={(item) => {
              clearAllTargetsExcept("client");
              setClientId(item.id);
              setClientLabel(clientOptionLabel(item));
              setClientSearch((prev) => ({
                ...prev,
                query: clientOptionLabel(item),
                open: false,
              }));
            }}
            onClear={() => {
              setClientId("");
              setClientLabel("");
              setClientSearch({ query: "", results: [], loading: false, open: false });
            }}
            renderOption={(item) => (
              <>
                <div className="truncate text-sm font-semibold text-white">
                  {item.full_name || item.company_name || "—"}
                </div>
                <div className="mt-1 text-[11px] text-white/55">
                  {[item.phone, item.email].filter(Boolean).join(" • ") || "—"}
                </div>
              </>
            )}
          />

          <SearchBox<ListingSearchRow>
            label="Oferta CRM"
            placeholder="Wyszukaj ofertę CRM po tytule lub lokalizacji"
            state={listingSearch}
            setState={setListingSearch}
            selectedId={listingId}
            selectedLabel={listingLabel}
            onPick={(item) => {
              clearAllTargetsExcept("listing");
              setListingId(item.id);
              setListingLabel(listingOptionLabel(item));
              setListingSearch((prev) => ({
                ...prev,
                query: listingOptionLabel(item),
                open: false,
              }));
            }}
            onClear={() => {
              setListingId("");
              setListingLabel("");
              setListingSearch({ query: "", results: [], loading: false, open: false });
            }}
            renderOption={(item) => (
              <>
                <div className="truncate text-sm font-semibold text-white">
                  {item.title || "—"}
                </div>
                <div className="mt-1 text-[11px] text-white/55">
                  {[fmtMoney(item.price_amount, item.currency), item.location_text]
                    .filter((x) => x && x !== "—")
                    .join(" • ") || "—"}
                </div>
              </>
            )}
          />

          <SearchBox<EventSearchRow>
            label="Event"
            placeholder="Wyszukaj event po tytule, dacie lub lokalizacji"
            state={eventSearch}
            setState={setEventSearch}
            selectedId={eventId}
            selectedLabel={eventLabel}
            onPick={(item) => {
              clearAllTargetsExcept("event");
              setEventId(item.id);
              setEventLabel(eventOptionLabel(item));
              setEventSearch((prev) => ({
                ...prev,
                query: eventOptionLabel(item),
                open: false,
              }));
            }}
            onClear={() => {
              setEventId("");
              setEventLabel("");
              setEventSearch({ query: "", results: [], loading: false, open: false });
            }}
            renderOption={(item) => (
              <>
                <div className="truncate text-sm font-semibold text-white">
                  {item.title || "—"}
                </div>
                <div className="mt-1 text-[11px] text-white/55">
                  {fmtShortEvent(item.start_at)}
                  {item.location_text ? ` • ${item.location_text}` : ""}
                </div>
              </>
            )}
          />

          <SearchBox<ExternalListingSearchRow>
            label="Oferta EveryBOT"
            placeholder="Wyszukaj ofertę EveryBOT po tytule lub lokalizacji"
            state={externalSearch}
            setState={setExternalSearch}
            selectedId={externalListingId}
            selectedLabel={externalListingLabel}
            onPick={(item) => {
              clearAllTargetsExcept("external_listing");
              setExternalListingId(item.id);
              setExternalListingLabel(externalOptionLabel(item));
              setExternalSearch((prev) => ({
                ...prev,
                query: externalOptionLabel(item),
                open: false,
              }));
            }}
            onClear={() => {
              setExternalListingId("");
              setExternalListingLabel("");
              setExternalSearch({ query: "", results: [], loading: false, open: false });
            }}
            renderOption={(item) => (
              <>
                <div className="truncate text-sm font-semibold text-white">
                  {item.title || item.source_url || "—"}
                </div>
                <div className="mt-1 text-[11px] text-white/55">
                  {[item.source, fmtMoney(item.price_amount, item.currency), item.location_text]
                    .filter((x) => x && x !== "—")
                    .join(" • ") || "—"}
                </div>
              </>
            )}
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
          Wybierz dokładnie jedno powiązanie: klient albo oferta CRM albo event albo oferta EveryBOT.
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