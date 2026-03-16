import { useEffect, useMemo, useState, useRef } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import EverybotSearchPanel, {
  type EverybotFilters,
  type EverybotSource,
} from "@/components/EverybotSearchPanel";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import EverybotAgentPanel from "@/components/everybot/EverybotAgentPanel";
import EventModal, {
  type EventDraft,
} from "@/components/calendar/EventModal";

const EverybotMap = dynamic(
  () => import("@/components/everybot/EverybotMap"),
  { ssr: false }
);

type ListingRow = {
  id: string;
  item_source: "crm" | "portal";
  office_id: string;

  record_type: string;
  transaction_type: string;
  status: string;
  created_at: string;

  case_owner_name: string | null;
  parties_summary: string | null;

  title: string | null;
  description: string | null;
  price_amount: string | number | null;
  currency: string | null;
  location_text: string | null;
  thumb_url: string | null;
  source_url: string | null;

  action: "save" | "call" | "visit" | null;
  source: string | null;
  external_listing_id: string | null;
};

type OffersTab = "office" | "everybot";

type ExternalRow = {
  id: string;
  office_id: string | null;

  source: string;
  source_listing_id?: string | null;
  source_url: string;

  title: string | null;
  description?: string | null;

  price_amount: string | number | null;
  currency: string | null;

  location_text: string | null;
  status: string;
  shortlisted?: boolean;

  imported_at?: string | null;
  updated_at: string;

  thumb_url: string | null;

  matched_at?: string | null;

  transaction_type?: "sale" | "rent" | null;
  property_type?: string | null;

  area_m2?: number | null;
  price_per_m2?: number | null;
  rooms?: number | null;
  floor?: string | null;
  year_built?: number | null;

  voivodeship?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;

  owner_phone?: string | null;

  source_status?: string | null;
  same_phone_offers_count?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  last_checked_at?: string | null;
  enriched_at?: string | null;

  lat?: number | null;
  lng?: number | null;
  geocoded_at?: string | null;
  geocode_source?: string | null;
  geocode_confidence?: number | null;

  rcn_last_price?: number | null;
  rcn_last_date?: string | null;
  rcn_link?: string | null;
  rcn_enriched_at?: string | null;

  handled_by_office_id?: string | null;
  handled_since?: string | null;
  last_interaction_at?: string | null;
  last_action?: string | null;
  my_office_saved?: boolean | null;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtPrice(v: ExternalRow["price_amount"], currency?: string | null) {
  if (v === null || v === undefined || v === "") return "-";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString()} ${currency ?? ""}`.trim();
}
function fmtDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString();
}

function fmtShortDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleDateString();
}
function fmtActivityDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";

  const d = new Date(ms);
  const date = d.toLocaleDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return `${date}, ${time}`;
}
function toLocalInput(dt: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
    dt.getHours()
  )}:${pad(dt.getMinutes())}`;
}

function normalizeVoivodeshipInput(v?: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  return s
    .replace(/^wojew[oó]dztwo\s+/i, "")
    .replace(/^woj\.?\s+/i, "")
    .trim() || null;
}

export default function OffersView({ lang }: { lang: LangKey }) {
  const router = useRouter();
  const searchIntervalRef = useRef<number | null>(null);
  const searchingRef = useRef(false);

  const officeTableRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<OffersTab>("everybot");
  const everybotTableRef = useRef<HTMLDivElement | null>(null);

  // --- Office listings ---
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/offers/list");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { rows: ListingRow[] };
      setRows(data.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // --- EveryBOT external ---
const [botFilters, setBotFilters] = useState<EverybotFilters>({
  q: "",
  source: "all" as EverybotSource,
  transactionType: "",
  propertyType: "",
  locationText: "",
  city: "",
  voivodeship: "",
  district: "",
  minPrice: "",
  maxPrice: "",
  minArea: "",
  maxArea: "",
  rooms: "",
});
  const botFiltersRef = useRef(botFilters);

  useEffect(() => {
    botFiltersRef.current = botFilters;
  }, [botFilters]);

  const [botLoading, setBotLoading] = useState(false);
  const [botErr, setBotErr] = useState<string | null>(null);
  const [botRows, setBotRows] = useState<ExternalRow[]>([]);
  const botReqSeqRef = useRef(0);
  const botAbortRef = useRef<AbortController | null>(null);
  const refreshReqSeqRef = useRef(0);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const [mapPins, setMapPins] = useState<any[]>([]);
  const [botMatchedSince, setBotMatchedSince] = useState<string | null>(null);
  const [selectedExternalId, setSelectedExternalId] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [botCursor, setBotCursor] = useState<{
  updated_at: string;
  id: string;
} | null>(null);
  const [listingActivity, setListingActivity] = useState<Record<string, any>>({});
  const [botHasMore, setBotHasMore] = useState(false);
  const [botSearching, setBotSearching] = useState(false);
  const [botSearchSeconds, setBotSearchSeconds] = useState(0);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  // --- Event modal from offers ---
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventExternalListingId, setEventExternalListingId] = useState<string | null>(null);

  const [eventDraft, setEventDraft] = useState<EventDraft>({
    eventType: "call",
    title: "",
    start: "",
    end: "",
    locationText: "",
    description: "",
  });
  const [calendarId, setCalendarId] = useState<string | null>(null);
    // --- Save external listing (agent/office) ---
  const [saveMode, setSaveMode] = useState<"agent" | "office">("agent");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [revealingPhoneIds, setRevealingPhoneIds] = useState<Set<string>>(() => new Set());
  const [expandedSamePhoneId, setExpandedSamePhoneId] = useState<string | null>(null);
  const [samePhoneLoadingId, setSamePhoneLoadingId] = useState<string | null>(null);
  const [samePhoneRowsById, setSamePhoneRowsById] = useState<Record<string, ExternalRow[]>>({});

  function openEventFromListing(row: ExternalRow, type: "call" | "visit") {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 60 * 1000);

  const location =
    [row.street, row.district, row.city].filter(Boolean).join(", ") ||
    row.location_text ||
    "";

  const titlePrefix = type === "call" ? "Telefon" : "Wizyta";

  const description = [
    row.source ? `Źródło: ${row.source}` : "",
    row.source_url ? `Link: ${row.source_url}` : "",
    row.owner_phone ? `Telefon: ${row.owner_phone}` : "",
    row.price_amount ? `Cena: ${row.price_amount} ${row.currency ?? ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  setEventExternalListingId(row.id);

  setEventDraft({
    eventType: type,
    title: `${titlePrefix} – ${row.title ?? ""}`,
    start: toLocalInput(now),
    end: toLocalInput(end),
    locationText: type === "visit" ? location : "",
    description,
  });

  setEventModalOpen(true);
}

  async function saveExternalListing(
    externalListingId: string,
    action: "save" | "reject" | "call" | "visit"
  ) {
    if (!externalListingId) return;

    setSavingId(externalListingId);
    try {
      const r = await fetch("/api/external_listings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_listing_id: externalListingId,
          mode: saveMode,
          action,
        }),
      });

       const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

        await refreshEverybotList();

       if (action === "save") {
        await load();
        setTab("office");
      }
    } catch (e: any) {
      alert(`Nie udało się zapisać akcji: ${e?.message ?? "Unknown error"}`);
    } finally {
      setSavingId(null);
    }
  }
  async function removePortalListingFromMyList(externalListingId: string) {
  if (!externalListingId) return;

  const confirmed = window.confirm(t(lang, "listingRemoveFromMyListConfirm" as any));
  if (!confirmed) return;

  try {
    const r = await fetch("/api/external_listings/remove-from-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        external_listing_id: externalListingId,
      }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

    await load();
    await refreshEverybotList();
  } catch (e: any) {
    alert(e?.message ?? t(lang, "listingRemoveFromMyListError" as any));
  }
}

async function handleCrmListingAction(
  listingId: string,
  mode: "delete" | "archive"
) {
  if (!listingId) return;

  const confirmed = window.confirm(
    mode === "delete"
      ? "Czy na pewno chcesz trwale usunąć tę ofertę CRM?"
      : "Czy na pewno chcesz przenieść tę ofertę CRM do archiwum?"
  );

  if (!confirmed) return;

  try {
    const r = await fetch("/api/offers/delete-or-archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId,
        mode,
      }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

    await load();
  } catch (e: any) {
    alert(
      mode === "delete"
        ? `Nie udało się usunąć oferty CRM: ${e?.message ?? "Unknown error"}`
        : `Nie udało się przenieść oferty CRM do archiwum: ${e?.message ?? "Unknown error"}`
    );
  }
}

async function toggleSamePhoneOffers(row: ExternalRow) {
  if (!row?.id) return;

  if (expandedSamePhoneId === row.id) {
    setExpandedSamePhoneId(null);
    return;
  }

  if (samePhoneRowsById[row.id]) {
    setExpandedSamePhoneId(row.id);
    return;
  }

  setSamePhoneLoadingId(row.id);
  try {
    const r = await fetch(
      `/api/external_listings/by-phone?externalListingId=${encodeURIComponent(row.id)}`
    );

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

    const rows = Array.isArray(j?.rows) ? (j.rows as ExternalRow[]) : [];

    setSamePhoneRowsById((prev) => ({
      ...prev,
      [row.id]: rows,
    }));
    setExpandedSamePhoneId(row.id);
  } catch (e: any) {
    alert(`Nie udało się pobrać innych ofert tej osoby: ${e?.message ?? "Unknown error"}`);
  } finally {
    setSamePhoneLoadingId(null);
  }
}
async function revealPhone(externalListingId: string) {
  if (!externalListingId) return;

  setRevealingPhoneIds((prev) => {
    const next = new Set(prev);
    next.add(externalListingId);
    return next;
  });

  try {
    const r = await fetch("/api/external_listings/reveal-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        external_listing_id: externalListingId,
      }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

    const phone =
      typeof j?.phone === "string" && j.phone.trim()
        ? j.phone.trim()
        : null;

    setBotRows((prev) =>
      prev.map((row) =>
        row.id === externalListingId
          ? {
              ...row,
              owner_phone: phone,
            }
          : row
      )
    );
  } catch (e: any) {
    alert(`Nie udało się pobrać numeru: ${e?.message ?? "Unknown error"}`);
  } finally {
    setRevealingPhoneIds((prev) => {
      const next = new Set(prev);
      next.delete(externalListingId);
      return next;
    });
  }
}
function setHighlightFromRows(rows: ExternalRow[], limit: number) {
  const n = Math.min(Math.max(Number(limit) || 0, 0), 10);
  setHighlightIds(n ? rows.slice(0, n).map((r) => r.id) : []);
}
async function loadEverybot(opts?: {
  filters?: typeof botFilters;
  cursor?: { updated_at: string; id: string } | null;
  append?: boolean;
  matchedSince?: string | null;
}): Promise<{ rows: ExternalRow[]; nextCursor: { updated_at: string; id: string } | null }> {

  const reqId = ++botReqSeqRef.current;

  // ✅ abort poprzedniego requestu listy
  botAbortRef.current?.abort();
  const ac = new AbortController();
  botAbortRef.current = ac;

  const f = opts?.filters ?? botFilters;
  const matchedSince = opts?.matchedSince ?? null;
  const q = (f.q ?? "").trim();
  const source = f.source ?? "all";
  const cursor = opts?.cursor ?? null;
  const append = !!opts?.append;

  setBotLoading(true);
  setBotErr(null);

  try {
    const qs = new URLSearchParams();
    qs.set("limit", "25000");
    qs.set("includeInactive", "1");
    qs.set("includePreview", "1");
    qs.set("onlyEnriched", "0");

    if (botMatchedSince) qs.set("matchedSince", botMatchedSince);

    const hasStructuredFilters =
      f.propertyType?.trim() ||
      f.city?.trim() ||
      f.district?.trim();

    if (q && !hasStructuredFilters) {
      qs.set("q", q);
    }

    if (source && source !== "all") qs.set("source", String(source));
    if (matchedSince) qs.set("matchedSince", matchedSince);

    if (f.transactionType) qs.set("transactionType", f.transactionType);

    const rawPt = (f.propertyType ?? "").trim().toLowerCase();
    if (rawPt) qs.set("propertyType", rawPt);

    const vNorm = normalizeVoivodeshipInput(f.voivodeship);
    if (vNorm) qs.set("voivodeship", vNorm);
    if (f.city.trim()) qs.set("city", f.city.trim());
    if (f.district.trim()) qs.set("district", f.district.trim());

    const hasCityOrDistrict = !!(f.city.trim() || f.district.trim());
    if (!hasCityOrDistrict && f.locationText.trim()) {
      qs.set("locationText", f.locationText.trim());
    }

    if (f.minPrice.trim()) qs.set("minPrice", f.minPrice.trim());
    if (f.maxPrice.trim()) qs.set("maxPrice", f.maxPrice.trim());
    if (f.minArea.trim()) qs.set("minArea", f.minArea.trim());
    if (f.maxArea.trim()) qs.set("maxArea", f.maxArea.trim());
    if (f.rooms.trim()) qs.set("rooms", f.rooms.trim());

    if (cursor) {
      qs.set("cursorUpdatedAt", cursor.updated_at);
      qs.set("cursorId", cursor.id);
    }

    const r = await fetch(`/api/external_listings/list?${qs.toString()}`, {
      signal: ac.signal,
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

    const newRows = (j?.rows ?? []) as ExternalRow[];
    const nextCursor =
      (j?.nextCursor ?? null) as { updated_at: string; id: string } | null;

    // ✅ jeśli to nie jest najnowszy request – IGNORUJ odpowiedź
    if (reqId !== botReqSeqRef.current) return { rows: [], nextCursor: null };

    setBotRows((prev) => (append ? [...prev, ...newRows] : newRows));
    if (!append) setSelectedExternalId(null);
    setBotCursor(nextCursor);
    setBotHasMore(Boolean(nextCursor) && newRows.length > 0);

    return { rows: newRows, nextCursor };
  } catch (e: any) {
    if (e?.name === "AbortError") return { rows: [], nextCursor: null };

    // ✅ tylko najnowszy request może ustawić błąd
    if (reqId === botReqSeqRef.current) setBotErr(e?.message ?? "Failed to load");

    return { rows: [], nextCursor: null };
  } finally {
    // ✅ tylko najnowszy request zdejmuje loading
    if (reqId === botReqSeqRef.current) setBotLoading(false);
  }
}
async function refreshEverybotList() {
  const reqId = ++refreshReqSeqRef.current;

  refreshAbortRef.current?.abort();
  const ac = new AbortController();
  refreshAbortRef.current = ac;

  try {
    const f = botFiltersRef.current ?? botFilters;

    const qs = new URLSearchParams();
    qs.set("limit", "50");
    qs.set("includeInactive", "1");
    qs.set("includePreview", "1");
    qs.set("onlyEnriched", "0");

    if (f.source && f.source !== "all") qs.set("source", String(f.source));

    const hasStructuredFilters =
      !!f.propertyType?.trim() ||
      !!f.city?.trim() ||
      !!f.district?.trim();

    const q = (f.q ?? "").trim();
    if (q && !hasStructuredFilters) qs.set("q", q);

    if (f.transactionType?.trim()) qs.set("transactionType", f.transactionType.trim());

    const rawPt = (f.propertyType ?? "").trim().toLowerCase();
    if (rawPt) qs.set("propertyType", rawPt);

    const vNorm = normalizeVoivodeshipInput(f.voivodeship);
    if (vNorm) qs.set("voivodeship", vNorm);
    if (f.city?.trim()) qs.set("city", f.city.trim());
    if (f.district?.trim()) qs.set("district", f.district.trim());

    const hasCityOrDistrict = !!(f.city?.trim() || f.district?.trim());
    if (!hasCityOrDistrict && f.locationText?.trim()) qs.set("locationText", f.locationText.trim());

    if (f.minPrice?.trim()) qs.set("minPrice", f.minPrice.trim());
    if (f.maxPrice?.trim()) qs.set("maxPrice", f.maxPrice.trim());
    if (f.minArea?.trim()) qs.set("minArea", f.minArea.trim());
    if (f.maxArea?.trim()) qs.set("maxArea", f.maxArea.trim());
    if (f.rooms?.trim()) qs.set("rooms", f.rooms.trim());

    const r = await fetch(`/api/external_listings/list?${qs.toString()}`, { signal: ac.signal });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? "List error");

    // ✅ ignoruj jeśli to nie jest najnowszy refresh
    if (reqId !== refreshReqSeqRef.current) return;

    const scrollLeft = everybotTableRef.current?.scrollLeft ?? 0;
    const nextRows = Array.isArray(j?.rows) ? j.rows : [];

    setBotRows(nextRows);
    setBotHasMore(Boolean(j?.nextCursor));
    setBotCursor(j?.nextCursor ?? null);

    const ids = nextRows.map((row: ExternalRow) => row.id).filter(Boolean);

    if (ids.length > 0) {
      try {
        const act = await fetch(
          `/api/external_listings/activity?ids=${encodeURIComponent(ids.join(","))}`,
          { signal: ac.signal }
        );

        const actJson = await act.json().catch(() => null);

        if (act.ok && Array.isArray(actJson)) {
          const map: Record<string, any> = {};

          for (const row of actJson) {
            const externalListingId =
              typeof row?.external_listing_id === "string" ? row.external_listing_id : null;

            if (!externalListingId) continue;
            if (map[externalListingId]) continue;

            map[externalListingId] = row;
          }

          if (reqId === refreshReqSeqRef.current) {
            setListingActivity(map);
          }
        } else if (reqId === refreshReqSeqRef.current) {
          setListingActivity({});
        }
      } catch (e: any) {
        if (e?.name !== "AbortError" && reqId === refreshReqSeqRef.current) {
          console.warn("listing activity refresh failed:", e?.message ?? e);
          setListingActivity({});
        }
      }
    } else {
      setListingActivity({});
    }

    requestAnimationFrame(() => {
      if (everybotTableRef.current) everybotTableRef.current.scrollLeft = scrollLeft;
    });
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    console.warn("everybot refresh failed:", e?.message ?? e);
  }
}
async function loadMapPins() {
  try {
    const qs = new URLSearchParams();
    qs.set("limit", "500");

    const r = await fetch(`/api/external_listings/map?${qs.toString()}`);
    const j = await r.json().catch(() => null);

    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

    setMapPins(Array.isArray(j?.pins) ? j.pins : []);
  } catch (e) {
    console.warn("map load failed", e);
  }
}

  useEffect(() => {
    return () => {
      // ✅ abort list
      try {
        botAbortRef.current?.abort();
      } catch {}
      botAbortRef.current = null;

      // ✅ abort refresh
      try {
        refreshAbortRef.current?.abort();
      } catch {}
      refreshAbortRef.current = null;

      // ✅ stop live/search timer
      if (searchIntervalRef.current) {
        window.clearInterval(searchIntervalRef.current);
        searchIntervalRef.current = null;
      }

    };
  }, []);

  async function importLink() {
    const url = importUrl.trim();
    if (!url) return;

    setImporting(true);
    try {
      const r = await fetch("/api/everybot/import-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }

      setImportUrl("");
      // odśwież EveryBOT listę
      await loadEverybot();
    } catch (e: any) {
      alert(`Nie udało się zapisać linku: ${e?.message ?? "Unknown error"}`);
    } finally {
      setImporting(false);
    }
  }
  async function saveEventFromOffer() {
  if (!calendarId) {
    alert("Brak aktywnego kalendarza.");
    return;
  }
  if (!eventExternalListingId) return;

  setEventSaving(true);

  try {
    const r = await fetch(`/api/calendar/events?calendarId=${calendarId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: eventDraft.title,
        start: new Date(eventDraft.start).toISOString(),
        end: new Date(eventDraft.end).toISOString(),
        locationText: eventDraft.locationText,
        description: eventDraft.description,
        eventType: eventDraft.eventType,
        source: "offers_view",
        externalListingId: eventExternalListingId,
      }),
    });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Event save failed");

      const action =
        eventDraft.eventType === "call"
          ? "call"
          : eventDraft.eventType === "visit"
          ? "visit"
          : null;

      if (action && eventExternalListingId) {
        await fetch("/api/external_listings/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            external_listing_id: eventExternalListingId,
            mode: saveMode,
            action,
            note: `calendar_event_created:${j?.id ?? ""}`,
          }),
        }).catch(() => null);
      }

      setEventModalOpen(false);
      setEventExternalListingId(null);
      await refreshEverybotList();
  } catch (e: any) {
    alert(e?.message ?? "Nie udało się zapisać terminu");
  } finally {
    setEventSaving(false);
  }
}

    useEffect(() => {
      load();
    }, []);
    useEffect(() => {
      (async () => {
        try {
          const r = await fetch("/api/me");
          if (!r.ok) return;

          const me = await r.json().catch(() => null);
          const userId = me?.userId;
          if (!userId) return;

          const boot = await fetch("/api/calendar/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });

          if (!boot.ok) return;

          const data = await boot.json();
          const id = data?.userCalendarId ?? data?.orgCalendarId ?? null;
          if (id) setCalendarId(id);
        } catch {
          // silent
        }
      })();
    }, []);
    useEffect(() => {
      if (tab !== "everybot") return;

      // 🔥 pierwsze ładowanie po wejściu na ekran (bo default tab = everybot)
      (async () => {
        setBotMatchedSince(null);
        setBotCursor(null);
        setBotHasMore(false);

        await loadEverybot({
          filters: botFiltersRef.current ?? botFilters,
          cursor: null,
          append: false,
          matchedSince: null,
        });

        await loadMapPins().catch(() => null);
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);
  
  useEffect(() => {
  const el = everybotTableRef.current;
  if (!el) return;

  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;

const onMouseDown = (e: MouseEvent) => {
  // tylko lewy przycisk
  if (e.button !== 0) return;

  // ignoruj klik w linki / przyciski
  if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;

  isDown = true;
  startX = e.pageX;
  startScrollLeft = el.scrollLeft;
  el.style.cursor = "grabbing";
};

const onMouseUp = () => {
  if (!isDown) return;
  isDown = false;
  el.style.cursor = "grab";
};

  const onMouseMove = (e: MouseEvent) => {
    if (!isDown) return;
    e.preventDefault();
    const walk = (e.pageX - startX) * 1.2;
    el.scrollLeft = startScrollLeft - walk;
  };

  el.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMouseMove);

  return () => {
    el.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("mousemove", onMouseMove);
  };
}, []);
  useEffect(() => {
    if (tab !== "everybot") return;

    const tick = async () => {
    if (botSearching) return;
    if (botLoading) return;
    if (botMatchedSince) return; // nie dotykaj listy podczas LIVE
    if (document.visibilityState !== "visible") return;

    const fNow = botFiltersRef.current ?? botFilters;
    if (hasAnyFilters(fNow)) return; // nie refreshuj gdy user ma aktywne filtry

    await refreshEverybotList();
  };

  const timer = window.setInterval(tick, 20000);

  const onVis = () => {
    if (document.visibilityState === "visible") tick();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVis);
  };
}, [tab, botSearching, botMatchedSince, botLoading]);

  const empty = !loading && rows.length === 0 && !err;

  const botEmpty = !botLoading && botRows.length === 0 && !botErr;
function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}
function hasAnyFilters(f: EverybotFilters) {
  return !!(
    f.q?.trim() ||
    f.transactionType?.trim() ||
    f.propertyType?.trim() ||
    f.voivodeship?.trim() ||
    f.city?.trim() ||
    f.district?.trim() ||
    f.locationText?.trim() ||
    f.minPrice?.trim() ||
    f.maxPrice?.trim() ||
    f.minArea?.trim() ||
    f.maxArea?.trim() ||
    f.rooms?.trim()
  );
}
async function runLiveHunter(
  filtersOverride?: typeof botFilters,
  runTs?: string
) {
  const raw = filtersOverride ?? botFilters;

  const filters = {
    ...raw,
    q: (raw.q ?? "").trim(),
    voivodeship: (raw.voivodeship ?? "").trim(),
    propertyType: (raw.propertyType ?? "").trim(),
    city: (raw.city ?? "").trim(),
    district: (raw.district ?? "").trim(),
    locationText: (raw.locationText ?? "").trim(),
    minPrice: (raw.minPrice ?? "").trim(),
    maxPrice: (raw.maxPrice ?? "").trim(),
    minArea: (raw.minArea ?? "").trim(),
    maxArea: (raw.maxArea ?? "").trim(),
    rooms: (raw.rooms ?? "").trim(),
  };

  function inferPropertyTypeFromQ(
    q: string
  ): "" | "house" | "apartment" | "plot" | "commercial" {
    const s = q.toLowerCase();
    if (s.includes("dom")) return "house";
    if (s.includes("mieszkan")) return "apartment";
    if (s.includes("działk") || s.includes("dzialk") || s.includes("grunt")) return "plot";
    if (s.includes("lokal") || s.includes("biur") || s.includes("komerc")) return "commercial";
    return "";
  }

  if (!filters.propertyType && filters.q) {
    const inferred = inferPropertyTypeFromQ(filters.q);
    if (inferred) filters.propertyType = inferred;
  }

  const effectiveRunTs = (runTs ?? new Date().toISOString()).trim();
  setBotMatchedSince(effectiveRunTs);

  setBotLoading(true);
  setBotErr(null);

  try {
    const r = await fetch("/api/everybot/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, runTs: effectiveRunTs }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? `RUN HTTP ${r.status}`);

    await loadEverybot({
      filters,
      cursor: null,
      append: false,
      matchedSince: effectiveRunTs,
    });
  } catch (e: any) {
    setBotErr(e?.message ?? "Live hunter failed");
  } finally {
    setBotLoading(false);
  }
}

async function searchEverybotWithFallback(filtersOverride?: typeof botFilters) {
  const filters = filtersOverride ?? botFilters;

  // 🔴 zatrzymaj ewentualny live timer
  if (searchIntervalRef.current) {
    window.clearInterval(searchIntervalRef.current);
    searchIntervalRef.current = null;
  }
  searchingRef.current = false;

  setBotSearching(false);
  setBotSearchSeconds(0);

  // ✅ wracamy do czystego Neon (bez matchedSince)
  setBotMatchedSince(null);
  setBotCursor(null);
  setBotHasMore(false);

  await loadEverybot({
    filters,
    cursor: null,
    append: false,
    matchedSince: null,
  });
}
async function runGeocodeBatch() {
  const r = await fetch("/api/everybot/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 50 }),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

  await refreshEverybotList();
  await loadMapPins().catch(() => null);   // 🔥 DODANE

  return j;
}

async function runRcnBatch() {
  const r = await fetch("/api/everybot/rcn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 50, radiusMeters: 250 }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  await refreshEverybotList();
  await loadMapPins().catch(() => null);   // 🔥 DODANE
  return j;
  }
function EverybotLoadingGlass({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 p-6 shadow-2xl backdrop-blur-xl">
      {/* shimmer */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-1/2 top-0 h-full w-[200%] animate-[shimmer_1.6s_linear_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      </div>

      <div className="relative flex items-center gap-4">
        {/* rotating logo */}
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border border-white/10 bg-white/10 shadow-inner" />
          <img
            src="/everyapp-logo.svg"
            alt="EveryAPP"
            className="absolute inset-[8px] h-[calc(100%-16px)] w-[calc(100%-16px)] animate-[spinSlow_1.8s_linear_infinite]"
            draggable={false}
          />
        </div>

        <div className="min-w-0">
          <div className="text-sm font-extrabold text-white">{title}</div>
          <div className="mt-1 text-xs text-white/60">{subtitle}</div>

          <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-ew-accent/15">
            <div className="h-full w-1/2 animate-[bar_1.1s_ease-in-out_infinite] rounded-full bg-ew-accent" />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-30%); }
          100% { transform: translateX(30%); }
        }
        @keyframes bar {
          0% { transform: translateX(-20%); opacity: .55; }
          50% { transform: translateX(110%); opacity: 1; }
          100% { transform: translateX(-20%); opacity: .55; }
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

return (
  <div className="space-y-4">
    {/* HEADER */}
    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-white">
            {t(lang, "offersTitle" as any)}
          </h2>
          <p className="mt-0.5 text-xs text-white/50">
            {t(lang, "offersSub" as any)}
          </p>
        </div>

        <div className="relative z-30 flex flex-wrap justify-end gap-1.5">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15"
            onClick={async () => {
              if (tab === "office") {
                await load();
              } else {
                // ✅ EveryBOT refresh = tylko Neon
                setBotSearching(false);
                setBotSearchSeconds(0);

                if (searchIntervalRef.current) {
                  window.clearInterval(searchIntervalRef.current);
                  searchIntervalRef.current = null;
                }

                searchingRef.current = false;
                setBotMatchedSince(null);

                await loadEverybot({
                  filters: botFilters,
                  cursor: null,
                  append: false,
                  matchedSince: null,
                });

                await loadMapPins().catch(() => null); // 🔥 odśwież mapę
              }
            }}
          >
            {t(lang, "offersRefresh" as any)}
          </button>

          {tab === "everybot" && (
            <>
              <button
                type="button"
                disabled={botLoading}
                className={clsx(
                  "pointer-events-auto rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition",
                  botLoading
                  ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                  : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                )}
                onClick={async () => {
                  try {
                    await runGeocodeBatch();
                  } catch (e: any) {
                    alert(`Geocode failed: ${e?.message ?? e}`);
                  }
                }}
              >
                🌍 Geocode 50
              </button>

              <button
                type="button"
                disabled={botLoading}
                className={clsx(
                  "pointer-events-auto rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition",
                  botLoading
                    ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                    : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15 hover:text-white"
                )}
                onClick={async () => {
                  try {
                    await runRcnBatch();
                  } catch (e: any) {
                    alert(`RCN failed: ${e?.message ?? e}`);
                  }
                }}
              >
                🧾 RCN 50
              </button>
            </>
          )}

          <button
            type="button"
            className="rounded-xl bg-ew-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:opacity-95"
            onClick={async () => {
              try {
                const r = await fetch("/api/offers/create", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    recordType: "offer",
                    transactionType: "sale",
                    status: "draft",
                  }),
                });

                const j = await r.json().catch(() => null);

                if (!r.ok) {
                  throw new Error(j?.error ?? `HTTP ${r.status}`);
                }

                const newId = typeof j?.id === "string" ? j.id : null;
                if (!newId) throw new Error("Brak id nowej oferty");

                router.push(`/panel/offers/${newId}`);
              } catch (e: any) {
                alert(`Nie udało się utworzyć oferty: ${e?.message ?? "Unknown error"}`);
              }
            }}
          >
            + {t(lang, "offersNew" as any)}
          </button>

          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15"
            onClick={() => alert("TODO: import z portali (biuro → portale)")}
          >
            {t(lang, "offersImport" as any)}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          className={clsx(
            "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
            tab === "office"
              ? "border-ew-accent bg-ew-accent/10 text-white"
              : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15 hover:text-white"
          )}
          onClick={() => setTab("office")}
        >
          {t(lang, "offersTabOffice" as any)}
        </button>

        <button
          type="button"
          className={clsx(
            "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
            tab === "everybot"
              ? "border-ew-accent bg-ew-accent/10 text-white"
              : "border-white/10 bg-white/10 text-white/85 hover:bg-white/15 hover:text-white"
          )}
          onClick={() => {
            setTab("everybot");
            setBotCursor(null);
            setBotHasMore(false);

            // 🔴 zatrzymaj pasek wyszukiwania
            setBotSearching(false);
            setBotSearchSeconds(0);

            if (searchIntervalRef.current) {
              window.clearInterval(searchIntervalRef.current);
              searchIntervalRef.current = null;
            }
            searchingRef.current = false;

            // 🟢 tylko Neon (bez live)
            setBotMatchedSince(null);
            loadEverybot({
              filters: botFilters,
              cursor: null,
              append: false,
              matchedSince: null,
            });
            loadMapPins().catch(() => null);
          }}
        >
          🤖 {t(lang, "offersTabEverybot" as any)}
        </button>
      </div>
    </div>

    {/* CONTENT */}
      {tab === "office" ? (
        <>
          {/* LISTA OFERT */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
            {loading ? (
              <div className="text-xs text-white/50">{t(lang, "offersLoading" as any)}</div>
            ) : err ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
                {t(lang, "offersLoadError" as any)}: {err}
              </div>
            ) : empty ? (
              <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
                <p className="text-xs text-white/60">{t(lang, "offersEmpty" as any)}</p>
              </div>
            ) : (
              <div ref={officeTableRef} className="w-full">
                <div className="divide-y divide-white/10">
                  {rows.map((r) => {
                    const isPortal = r.item_source === "portal";
                    const created = r.created_at ? new Date(r.created_at).toLocaleDateString() : null;
                    const price =
                      r.price_amount !== null && r.price_amount !== undefined && r.price_amount !== ""
                        ? `${Number(r.price_amount).toLocaleString()} ${r.currency ?? ""}`.trim()
                        : null;

                    const sourceBadge = isPortal
                      ? t(lang, "listingSourcePortal" as any)
                      : t(lang, "listingSourceCRM" as any);

                    const actionBadge =
                      r.action === "save"
                        ? t(lang, "listingActionSaved" as any)
                        : r.action === "call"
                        ? t(lang, "listingActionCall" as any)
                        : r.action === "visit"
                        ? t(lang, "listingActionVisit" as any)
                        : null;

                                        return (
                      <div key={r.id} className={clsx("p-2.5 md:p-3", "transition")}>
                        <div className="flex gap-3">
                          {/* thumb */}
                          <div className="shrink-0">
                            {r.thumb_url ? (
                              <img
                                src={r.thumb_url}
                                alt=""
                                className="h-14 w-20 rounded-lg object-cover ring-1 ring-white/10"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-14 w-20 rounded-lg bg-white/10 ring-1 ring-white/10" />
                            )}

                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/50">
                              <span
                                className={clsx(
                                  "rounded px-2 py-0.5 ring-1 text-white/90",
                                  isPortal
                                    ? "bg-indigo-500/15 ring-indigo-500/20 text-indigo-200"
                                    : "bg-white/10 ring-white/10"
                                )}
                              >
                                {sourceBadge}
                              </span>
                              {created ? <span>{created}</span> : null}
                            </div>
                          </div>

                          {/* content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-white">
                                  {r.title ??
                                    (isPortal
                                      ? t(lang, "listingPortalFallbackTitle" as any)
                                      : t(lang, "listingCrmFallbackTitle" as any))}
                                </div>

                                {r.location_text ? (
                                  <div className="truncate text-[11px] text-white/60">
                                    {r.location_text}
                                  </div>
                                ) : null}

                                {r.case_owner_name || r.parties_summary ? (
                                  <div className="truncate text-[11px] text-white/50">
                                    {r.case_owner_name ?? "-"}
                                    {r.parties_summary ? ` • ${r.parties_summary}` : ""}
                                  </div>
                                ) : null}
                              </div>

                              <div className="text-right">
                                {price ? (
                                  <div className="text-sm font-extrabold text-white">{price}</div>
                                ) : (
                                  <div className="text-sm font-extrabold text-white/35">—</div>
                                )}
                                <div className="text-[11px] text-white/50">
                                  {r.transaction_type || "-"} • {r.status || "-"}
                                </div>
                              </div>
                            </div>

                            <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-white/70">
                              <span className="rounded bg-white/10 px-1.5 py-0.5 ring-1 ring-white/10 text-white/80">
                                {r.record_type}
                              </span>

                              {r.source ? (
                                <span className="rounded bg-white/10 px-1.5 py-0.5 ring-1 ring-white/10 text-white/80">
                                  {r.source}
                                </span>
                              ) : null}

                              {actionBadge ? (
                                <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 ring-1 ring-indigo-500/20 text-indigo-200">
                                  {actionBadge}
                                </span>
                              ) : null}
                            </div>

                            {r.description ? (
                              <div className="mt-1.5 line-clamp-2 text-[11px] text-white/45">
                                {r.description}
                              </div>
                            ) : null}

                            {/* actions */}
                            <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-white/10 pt-3">
                              <button
                                type="button"
                                className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-white/15"
                                onClick={() => {
                                  if (isPortal && r.source_url) {
                                    window.open(r.source_url, "_blank", "noopener,noreferrer");
                                    return;
                                  }

                                  alert(t(lang, "listingOpenTodo" as any));
                                }}
                              >
                                {t(lang, "listingOpen" as any)}
                              </button>

                                {!isPortal ? (
                                <button
                                  type="button"
                                  className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-white/15"
                                  onClick={() => {
                                    router.push(`/panel/offers/${r.id}`);
                                  }}
                                >
                                  {t(lang, "listingEdit" as any)}
                                </button>
                              ) : null}

                                                          {isPortal ? (
                                <button
                                  type="button"
                                  className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-200 shadow-sm transition hover:bg-red-500/15"
                                  onClick={() => {
                                    if (r.external_listing_id) {
                                      removePortalListingFromMyList(r.external_listing_id);
                                    }
                                  }}
                                >
                                  {t(lang, "listingRemoveFromMyList" as any)}
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200 shadow-sm transition hover:bg-amber-500/15"
                                    onClick={() => {
                                      handleCrmListingAction(r.id, "archive");
                                    }}
                                  >
                                    Przenieś do archiwum
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-200 shadow-sm transition hover:bg-red-500/15"
                                    onClick={() => {
                                      handleCrmListingAction(r.id, "delete");
                                    }}
                                  >
                                    Usuń z mojej listy
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* IMPORT INFO */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
            <h3 className="text-sm font-extrabold text-white">
              {t(lang, "offersImportTitle" as any)}
            </h3>
            <p className="mt-0.5 text-xs text-white/50">
              {t(lang, "offersImportDesc" as any)}
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-white/60">
              <li>{t(lang, "offersImportHint1" as any)}</li>
              <li>{t(lang, "offersImportHint2" as any)}</li>
              <li>{t(lang, "offersImportHint3" as any)}</li>
            </ul>
          </div>
        </>
      ) : (
  <>
    {/* EVERYBOT */}
    <div className="space-y-3">
      {/* ===== MAPA + AGENT ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch min-w-0">
        {/* MAPA */}
        <div className="lg:col-span-2 min-w-0">
          <div
            className={clsx(
              "relative min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/45 shadow-2xl backdrop-blur-xl",
              "h-[clamp(320px,55vh,620px)]"
            )}
          >
            <EverybotMap
                pins={mapPins}
                onSelectId={(id) => {
                  setSelectedExternalId(id);
                  requestAnimationFrame(() => {
                    const el = rowRefs.current[id];
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  });
                }}
              />
          </div>
        </div>

        {/* PANEL AGENTA */}
        <div className="lg:col-span-1 min-w-0">
            <div
              className={clsx(
                "min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/55 shadow-2xl backdrop-blur-xl",
                "h-[clamp(320px,55vh,620px)]",
                "lg:sticky lg:top-4",
                "flex flex-col" // ✅ klucz
              )}
            >
              <div className="border-b border-white/10 bg-white/5 px-4 py-3">
                <div className="text-sm font-extrabold text-white/90">EveryBOT</div>
                <div className="mt-0.5 text-xs text-white/55">Agent i decyzje</div>
              </div>

              {/* ✅ klucz: ta część MUSI umieć scrollować i mieć wysokość */}
              <div className="p-3 flex-1 min-h-0 overflow-y-auto">
                <EverybotAgentPanel
                  contextFilters={botFilters}
                  onAgentResult={async ({ actions }) => {
                  let currentFilters = botFilters;

                  for (const a of actions ?? []) {
                    if (a?.type === "set_filters" && a.filters && typeof a.filters === "object") {
                      currentFilters = { ...currentFilters, ...a.filters };
                      setBotFilters(currentFilters);

                      setBotMatchedSince(null);
                      setBotSearching(false);
                      setBotSearchSeconds(0);

                      const { rows } = await loadEverybot({
                        filters: currentFilters,
                        cursor: null,
                        append: false,
                        matchedSince: null,
                      });
                      setHighlightFromRows(rows, 10);
                      await loadMapPins().catch(() => null);
                      continue;
                    }

                    if (a?.type === "run_live") {
                      await (async () => {
                        const local = await loadEverybot({
                          filters: currentFilters,
                          cursor: null,
                          append: false,
                          matchedSince: null,
                        });
                        if (local.rows.length === 0) {
                          const runTs = typeof a.runTs === "string" ? a.runTs : new Date().toISOString();
                          await runLiveHunter(currentFilters, runTs);
                          await loadEverybot({
                            filters: currentFilters,
                            cursor: null,
                            append: false,
                            matchedSince: null,
                          });
                        }
                      })();
                      continue;
                    }

                    if (a?.type === "load_neon") {
                      setBotMatchedSince(null);

                      const { rows } = await loadEverybot({
                        filters: currentFilters,
                        cursor: null,
                        append: false,
                        matchedSince: null,
                      });
                      setHighlightFromRows(rows, 10);
                      await loadMapPins().catch(() => null);
                      continue;
                    }

                    if (a?.type === "refresh_map") {
                      await loadMapPins().catch(() => null);
                      continue;
                    }

                    if (a?.type === "geocode") {
                      const limit = Number(a.limit ?? 50);
                      await fetch("/api/everybot/geocode", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ limit: Number.isFinite(limit) ? limit : 50 }),
                      });
                      await refreshEverybotList();
                      await loadMapPins().catch(() => null);
                      continue;
                    }

                    if (a?.type === "open_listing" && typeof a.url === "string") {
                      window.open(a.url, "_blank", "noopener,noreferrer");
                      continue;
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
          {/* ===== FILTR + TABELA ===== */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
            <EverybotSearchPanel
              lang={lang}
              loading={botLoading}
              importUrl={importUrl}
              setImportUrl={setImportUrl}
              importing={importing}
              onImportLink={importLink}
              saveMode={saveMode}
              setSaveMode={setSaveMode}
              filters={botFilters}
              setFilters={(next) => setBotFilters(next)}
              onSearch={async (filters) => {
                setBotFilters(filters);
                // 0) jeśli brak filtrów -> tylko Neon
                if (!hasAnyFilters(filters)) {
                  setBotMatchedSince(null);
                  setBotCursor(null);
                  setBotHasMore(false);

                  const { rows } = await loadEverybot({
                    filters,
                    cursor: null,
                    append: false,
                    matchedSince: null,
                  });

                  setHighlightFromRows(rows, 10);
                  await loadMapPins().catch(() => null);
                  return;
                }

                // 1) sprawdź Neon najpierw
                setBotMatchedSince(null);
                setBotCursor(null);
                setBotHasMore(false);

                const local = await loadEverybot({
                  filters,
                  cursor: null,
                  append: false,
                  matchedSince: null,
                });

                setHighlightFromRows(local.rows, 10);
                await loadMapPins().catch(() => null);

                // 2) jeśli NIC nie ma w Neon -> dopiero wtedy run portali
                if (local.rows.length === 0) {
                  const runTs = new Date().toISOString();
                  setBotMatchedSince(runTs);

                  setBotSearching(true);
                  setBotSearchSeconds(0);

                  await runLiveHunter(filters, runTs);

                  // po runLiveHunter: odśwież Neon (bez matchedSince — bo i tak zapisane)
                  const after = await loadEverybot({
                    filters,
                    cursor: null,
                    append: false,
                    matchedSince: null,
                  });

                  setHighlightFromRows(after.rows, 10);
                  await loadMapPins().catch(() => null);

                  setBotSearching(false);
                }
              }}
            />

            {/* ===== WYNIKI ===== */}
            {botSearching && (
              <div className="mb-3">
                <div className="mb-1.5 text-xs font-semibold text-white">
                  🔄 {t(lang, "everybotSearching" as any)}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full animate-pulse bg-white/20 transition-all duration-300" />
              </div>
              </div>
            )}

            <div className="mt-4 relative rounded-3xl border border-white/10 bg-slate-950/45 shadow-2xl backdrop-blur-xl">
              {/* ✅ Kolejne ładowania: mały overlay nad listą (nie dotyka row, nie blokuje klików) */}
              {botLoading && botRows.length > 0 && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-2xl">
                  <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 shadow-2xl backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                      <img
                        src="/brand/everyapp-logo.svg"
                        alt="EveryAPP"
                        className="h-5 w-5 animate-[spinSlow_1.8s_linear_infinite]"
                        draggable={false}
                      />
                      <div className="text-xs font-semibold text-white">
                        {t(lang, "everybotSearching" as any)}
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-full animate-pulse bg-white/20 transition-all duration-300" />
                    </div>
                    </div>

                    <style jsx>{`
                      @keyframes bar {
                        0% { transform: translateX(-20%); opacity: .55; }
                        50% { transform: translateX(110%); opacity: 1; }
                        100% { transform: translateX(-20%); opacity: .55; }
                      }
                      @keyframes spinSlow {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                      }
                    `}</style>
                  </div>
                </div>
              )}

              {/* ✅ Pierwsze ładowanie: pełny glass z logo + info */}
              {botLoading && botRows.length === 0 ? (
                <EverybotLoadingGlass
                  title={t(lang, "everybotLoading" as any)}
                  subtitle={t(lang, "everybotSearching" as any)}
                />
              ) : botErr ? (
                <div className="p-4 text-xs text-red-200">
                  {t(lang, "everybotLoadError" as any)}: {botErr}
                </div>
              ) : botRows.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-2xl bg-white/5">
                  <p className="text-xs text-white/50">
                    {t(lang, "everybotEmpty" as any)}
                  </p>
                </div>
              ) : (
                <>
                  <div ref={everybotTableRef} className="w-full">
                    <div className="divide-y divide-white/10">
                     {botRows.map((r) => {
                    const selected = selectedExternalId === r.id;
                    const highlighted = highlightIds.includes(r.id);
                    const activity = listingActivity[r.id];
                    const activityLabel =
                      activity?.type === "call"
                        ? `📞 ${t(lang, "listingCallScheduled" as any)}`
                        : activity?.type === "visit"
                        ? `🏠 ${t(lang, "listingVisitScheduled" as any)}`
                        : null;

                    const activityDateLabel = activity?.start_at ? fmtActivityDate(activity.start_at) : null;

                    const title = r.title ?? "-";
                    const price = fmtPrice(r.price_amount, r.currency);
                    const area = r.area_m2 != null ? `${r.area_m2} m²` : "-";
                    const rooms = r.rooms != null ? `${r.rooms}` : "-";
                    const floor = r.floor ?? "-";
                    const yearBuilt = r.year_built != null ? String(r.year_built) : "-";
                    const ppm2 =
                      r.price_per_m2 != null
                        ? `${Math.round(r.price_per_m2).toLocaleString()} zł/m²`
                        : "-";

                    const location =
                      [r.street, r.district, r.city, r.voivodeship].filter(Boolean).join(", ") ||
                      r.location_text ||
                      "-";
                    
                    const lastActivity =
                      r.last_interaction_at ||
                      r.last_seen_at ||
                      r.last_checked_at ||
                      r.updated_at ||
                      null;

                    const officeState = r.last_action ?? "-";

                    const isSaved = !!r.my_office_saved;
                    const isBusy = savingId === r.id;
                    const hasOtherOffersSamePerson = (r.same_phone_offers_count ?? 0) > 0;
                    const isSamePhoneExpanded = expandedSamePhoneId === r.id;
                    const samePhoneRows = samePhoneRowsById[r.id] ?? [];
                    const isSamePhoneLoading = samePhoneLoadingId === r.id;

                    const hasMap = typeof r.lat === "number" && typeof r.lng === "number";
                    const hasRCN = r.rcn_last_price != null;
                    const hasPhone = !!r.owner_phone;
                    const hasEnriched = !!r.enriched_at;

                    return (
                      <div
                        key={r.id}
                        ref={(el) => {
                          rowRefs.current[r.id] = el;
                        }}
                        className={clsx(
                          "p-3",
                          "bg-white/5 hover:bg-white/7 transition",
                          selected && "ring-1 ring-white/20 bg-white/10"
                        )}
                      >
                        <div className="flex gap-3">
                          {/* MINIATURA */}
                          <div className="shrink-0">
                            {r.thumb_url ? (
                              <img
                                src={r.thumb_url}
                                alt=""
                                className="h-16 w-24 rounded-lg object-cover ring-1 ring-white/10"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-16 w-24 rounded-lg bg-white/10 ring-1 ring-white/10" />
                            )}
                          </div>

                          {/* GŁÓWNY UKŁAD AGENTA */}
                          <div className="min-w-0 flex-1">
                            {/* WIERSZ 1 */}
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.2fr)_minmax(180px,0.9fr)_minmax(170px,0.8fr)_minmax(180px,0.9fr)]">
                              {/* Oferta */}
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className={clsx(
                                      "h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/15",
                                      highlighted ? "bg-emerald-400" : "bg-amber-300"
                                    )}
                                    title={highlighted ? "Podświetlone" : "Standard"}
                                  />
                                  <div className="truncate text-sm font-semibold text-white">{title}</div>
                                </div>

                             <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-white/10">
                                  {r.source}
                                </span>

                                {r.transaction_type ? (
                                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                    {r.transaction_type}
                                  </span>
                                ) : null}

                                {r.property_type ? (
                                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                    {r.property_type}
                                  </span>
                                ) : null}

                                <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                  {t(lang, "listingStatus" as any)}: {r.status || "-"}
                                </span>

                                {r.source_status ? (
                                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                    {t(lang, "listingSourceStatus" as any)}: {r.source_status}
                                  </span>
                                ) : null}

                                {r.shortlisted ? (
                                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200 ring-1 ring-emerald-500/20">
                                    {t(lang, "listingShortlist" as any)}
                                  </span>
                                ) : null}

                                {r.my_office_saved ? (
                                  <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-200 ring-1 ring-sky-500/20">
                                    {t(lang, "listingInOffice" as any)}
                                  </span>
                                ) : null}

                                {hasPhone ? (
                                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                    {t(lang, "listingHasPhone" as any)}
                                  </span>
                                ) : null}

                                {hasRCN ? (
                                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                    RCN
                                  </span>
                                ) : null}

                                {hasMap ? (
                                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                    {t(lang, "listingHasMap" as any)}
                                  </span>
                                ) : null}

                                {hasEnriched ? (
                                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                    {t(lang, "listingEnriched" as any)}
                                  </span>
                                ) : null}

                                {activityLabel ? (
                                  <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-200 ring-1 ring-indigo-500/20">
                                    {activityLabel}
                                    {activityDateLabel ? ` · ${activityDateLabel}` : ""}
                                  </span>
                                ) : null}
                              </div>

                                <div className="mt-1.5 truncate text-[11px] text-white/60">{location}</div>

                                {r.description ? (
                                  <div className="mt-1 line-clamp-2 text-[11px] text-white/45">
                                    {r.description}
                                  </div>
                                ) : null}
                              </div>

                              {/* Cena */}
                              <div>
                                <div className="text-sm font-extrabold text-white">{price}</div>
                                <div className="mt-1 text-[11px] text-white/55">{ppm2}</div>
                              </div>

                              {/* Parametry */}
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-white/70">
                                <div>
                                  <span className="text-white/45">m²:</span> {area}
                                </div>
                                <div>
                                  <span className="text-white/45">pokoje:</span> {rooms}
                                </div>
                                <div>
                                  <span className="text-white/45">piętro:</span> {floor}
                                </div>
                                <div>
                                  <span className="text-white/45">rok:</span> {yearBuilt}
                                </div>
                              </div>

                              {/* Kontakt / źródło */}
                              <div className="space-y-1 text-[11px] text-white/70">
                                <div className="truncate">
                                  <span className="text-white/45">{t(lang, "phoneLabel" as any)}:</span>{" "}
                                  {r.owner_phone ? (
                                    <a
                                      href={`tel:${r.owner_phone}`}
                                      className="font-semibold text-ew-accent underline"
                                      title={r.owner_phone}
                                    >
                                      {r.owner_phone}
                                    </a>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={revealingPhoneIds.has(r.id)}
                                      onClick={() => revealPhone(r.id)}
                                      className={clsx(
                                        "rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition",
                                        revealingPhoneIds.has(r.id)
                                          ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                                          : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                                      )}
                                      title={t(lang, "showPhone" as any)}
                                    >
                                      {revealingPhoneIds.has(r.id)
                                        ? t(lang, "loading" as any)
                                        : t(lang, "showPhone" as any)}
                                    </button>
                                  )}
                                </div>

                                <div className="truncate">
                                  <span className="text-white/45">ID źródła:</span>{" "}
                                  {r.source_listing_id ? r.source_listing_id : "-"}
                                </div>

                                <div className="truncate">
                                  <span className="text-white/45">matched:</span> {fmtShortDate(r.matched_at)}
                                </div>
                              </div>
                            </div>

                            {/* WIERSZ 2 */}
                            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-white/10 pt-3 xl:grid-cols-[minmax(220px,1fr)_minmax(240px,1.1fr)_minmax(220px,0.9fr)_auto]">
                              {/* RCN */}
                              <div className="text-[11px] text-white/65">
                                <div className="font-semibold text-white/80">RCN</div>
                                {r.rcn_last_price != null ? (
                                  <div className="mt-1">
                                    {Math.round(r.rcn_last_price).toLocaleString()} zł
                                    {r.rcn_last_date ? ` • ${fmtShortDate(r.rcn_last_date)}` : ""}
                                    {r.rcn_link ? (
                                      <>
                                        {" • "}
                                        <a
                                          href={r.rcn_link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-ew-accent underline"
                                        >
                                          źródło
                                        </a>
                                      </>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="mt-1 text-white/40">brak</div>
                                )}
                              </div>

                              {/* Aktywność źródła */}
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-white/65">
                                <div>
                                  <span className="text-white/45">first seen:</span> {fmtShortDate(r.first_seen_at)}
                                </div>
                                <div>
                                  <span className="text-white/45">last seen:</span> {fmtShortDate(r.last_seen_at)}
                                </div>
                                <div>
                                  <span className="text-white/45">last checked:</span> {fmtDate(r.last_checked_at)}
                                </div>
                                <div>
                                  <span className="text-white/45">updated:</span> {fmtDate(r.updated_at)}
                                </div>
                                <div>
                                  <span className="text-white/45">enriched:</span> {fmtDate(r.enriched_at)}
                                </div>
                                <div>
                                  <span className="text-white/45">geocoded:</span> {fmtDate(r.geocoded_at)}
                                </div>
                              </div>

                              {/* Status biura */}
                              <div className="grid grid-cols-1 gap-y-1 text-[11px] text-white/65">
                                <div>
                                  <span className="text-white/45">stan biura:</span> {officeState}
                                </div>
                                <div>
                                  <span className="text-white/45">ostatnia interakcja:</span> {fmtDate(lastActivity)}
                                </div>
                                <div>
                                  <span className="text-white/45">handled since:</span> {fmtDate(r.handled_since)}
                                </div>
                              </div>

                              {/* Akcje */}
                             <div className="flex flex-col items-end gap-1.5">
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isBusy || isSaved}
                                    onClick={() => saveExternalListing(r.id, "save")}
                                    className={clsx(
                                      "rounded-xl border px-3 py-1 text-[11px] font-semibold shadow-sm transition",
                                      isSaved
                                        ? "cursor-default border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                                        : isBusy
                                        ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                                        : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                                    )}
                                    title="Zapisz do działań"
                                  >
                                    {isSaved ? "✅ Zapisane" : "💾 Zapisz"}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => openEventFromListing(r, "call")}
                                    className={clsx(
                                      "rounded-xl border px-3 py-1 text-[11px] font-semibold shadow-sm transition",
                                      isBusy
                                        ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                                        : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                                    )}
                                    title="Oznacz telefon"
                                  >
                                    📞 Telefon
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => openEventFromListing(r, "visit")}
                                    className={clsx(
                                      "rounded-xl border px-3 py-1 text-[11px] font-semibold shadow-sm transition",
                                      isBusy
                                        ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                                        : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                                    )}
                                    title="Oznacz wizytę"
                                  >
                                    🏠 Wizyta
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => saveExternalListing(r.id, "reject")}
                                    className={clsx(
                                      "rounded-xl border px-3 py-1 text-[11px] font-semibold shadow-sm transition",
                                      isBusy
                                        ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                                        : "border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                                    )}
                                    title="Odrzuć"
                                  >
                                    ✖ Odrzuć
                                  </button>
                                </div>
                               {hasOtherOffersSamePerson ? (
                                  <button
                                    type="button"
                                    disabled={isSamePhoneLoading}
                                    className={clsx(
                                      "rounded-xl border px-3 py-1 text-[11px] font-semibold shadow-sm transition",
                                      isSamePhoneLoading
                                        ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                                        : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                                    )}
                                    title={t(lang, "otherOffersSamePerson" as any)}
                                    onClick={() => toggleSamePhoneOffers(r)}
                                  >
                                    👤 {t(lang, "otherOffersSamePerson" as any)} ({r.same_phone_offers_count})
                                  </button>
                                ) : null}
                                {r.source_url ? (
                                  <a
                                    href={r.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] font-semibold text-ew-accent underline"
                                  >
                                    {t(lang, "everybotOpen" as any)}
                                  </a>
                                ) : null}
                              </div>
                            </div>
                            </div>
                                                      {isSamePhoneExpanded ? (
                            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                              <div className="mb-2 text-[11px] font-semibold text-white/80">
                                👤 {t(lang, "otherOffersSamePerson" as any)}
                              </div>

                              {isSamePhoneLoading ? (
                                <div className="text-[11px] text-white/50">
                                  {t(lang, "loading" as any)}
                                </div>
                              ) : samePhoneRows.length === 0 ? (
                                <div className="text-[11px] text-white/50">Brak dodatkowych ofert.</div>
                              ) : (
                                <div className="space-y-2">
                                  {samePhoneRows.map((x) => {
                                    const xPrice = fmtPrice(x.price_amount, x.currency);
                                    const xLocation =
                                      [x.street, x.district, x.city, x.voivodeship].filter(Boolean).join(", ") ||
                                      x.location_text ||
                                      "-";

                                    return (
                                      <div
                                        key={x.id}
                                        className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/35 p-2"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-[12px] font-semibold text-white">
                                            {x.title ?? "-"}
                                          </div>
                                          <div className="mt-1 truncate text-[11px] text-white/55">
                                            {xLocation}
                                          </div>
                                          <div className="mt-1 flex flex-wrap gap-1.5">
                                            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/80 ring-1 ring-white/10">
                                              {x.source}
                                            </span>
                                            {x.transaction_type ? (
                                              <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                                {x.transaction_type}
                                              </span>
                                            ) : null}
                                            {x.property_type ? (
                                              <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                                {x.property_type}
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>

                                        <div className="shrink-0 text-right">
                                          <div className="text-[12px] font-extrabold text-white">{xPrice}</div>
                                          {x.source_url ? (
                                            <a
                                              href={x.source_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="mt-1 inline-block text-[11px] font-semibold text-ew-accent underline"
                                            >
                                              {t(lang, "everybotOpen" as any)}
                                            </a>
                                          ) : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>

                  {botHasMore && (
                    <div className="flex justify-center border-t border-white/10 p-4">
                      <button
                        type="button"
                        disabled={botLoading}
                        onClick={() =>
                          loadEverybot({
                            filters: botFilters,
                            cursor: botCursor,
                            append: true,
                            matchedSince: botMatchedSince,
                          })
                        }
                        className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15 disabled:opacity-60"
                      >
                        {t(lang, "everybotLoadMore" as any)}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
       </>
    )}
    <EventModal
      isOpen={eventModalOpen}
      lang={lang}
      saving={eventSaving}
      editingEventId={null}
      scopeLabel="Planowanie kontaktu z oferty"
      draft={eventDraft}
      setDraft={setEventDraft}
      onClose={() => {
        setEventModalOpen(false);
        setEventExternalListingId(null);
      }}
      onSubmit={saveEventFromOffer}
      activeCalendarId={calendarId}
    />
  </div>
);
}
