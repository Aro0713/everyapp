// lib/everybot/adapters/otodom.ts

import type { PortalAdapter, AdapterContext, ParseResult, SearchItem } from "./types";
import { portalSafeFiltersFor } from "../filters/portalSafe";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function absUrl(base: string, href?: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
function extractNextData(html: string): any | null {
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}
function stripPageParam(u: string) {
  try {
    const x = new URL(u);
    x.searchParams.delete("page");
    return x.toString();
  } catch {
    return u;
  }
}
function slugifyPl(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // usuń znaki diakrytyczne
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type OtodomTx = "sprzedaz" | "wynajem";
type OtodomEstate =
  | "mieszkanie"
  | "dom"
  | "dzialka"
  | "lokal"
  | "pokoj"
  | "garaz";

function mapTxToOtodom(v: unknown): OtodomTx | null {
  const s = optString(v)?.toLowerCase();
  if (!s) return null;
  if (s === "sale" || s.includes("sprzed")) return "sprzedaz";
  if (s === "rent" || s.includes("wynaj")) return "wynajem";
  return null;
}

function mapEstateToOtodom(v: unknown): OtodomEstate | null {
  const s = optString(v)?.toLowerCase();
  if (!s) return null;

  // dopasuj do Twoich wartości z UI
  if (s.includes("dom") || s === "house") return "dom";
  if (s.includes("miesz") || s.includes("apart") || s === "flat") return "mieszkanie";
  if (s.includes("dzial") || s.includes("grunt") || s === "plot") return "dzialka";
  if (s.includes("lokal") || s.includes("komerc") || s.includes("office")) return "lokal";
  if (s.includes("pokoj") || s.includes("room")) return "pokoj";
  if (s.includes("garaz") || s.includes("garage")) return "garaz";

  return null;
}


// Otodom URL builder: PATH (tx/estate/region) + opcjonalnie phrase
function buildOtodomUrl(filters: any, page: number) {
  const tx = mapTxToOtodom(filters?.transaction_type) ?? "sprzedaz";
  const estate = mapEstateToOtodom(filters?.property_type) ?? "mieszkanie";

  // województwo z UI: np. "śląskie" -> "slaskie"
  const voiv = optString(filters?.voivodeship);
  const voivSlug = voiv ? slugifyPl(voiv) : null;

  // bazowa ścieżka (bez "cala-polska" jeśli mamy województwo)
  const path = voivSlug
    ? `/pl/wyniki/${tx}/${estate}/${voivSlug}`
    : `/pl/wyniki/${tx}/${estate}/cala-polska`;

  const u = new URL(`https://www.otodom.pl${path}`);

  // phrase tylko jako dodatkowy tekst, NIE jako filtry
  const q = optString(filters?.q);
  if (q) u.searchParams.set("search[phrase]", q);

  u.searchParams.set("viewType", "listing");
  if (page > 1) u.searchParams.set("page", String(page));
  return u.toString();
}


function normalizeOfferUrl(u: string): string {
  return u.replace("://www.otodom.pl/hpr/", "://www.otodom.pl/");
}

function parseItemsFromNextData(finalUrl: string, next: any, limit = 200): SearchItem[] {
  const items = next?.props?.pageProps?.data?.searchAds?.items;
  if (!Array.isArray(items)) return [];

  const out: SearchItem[] = [];
  const seen = new Set<string>();

  for (const ad of items) {
    const href = optString(ad?.href);
    const full = href ? absUrl(finalUrl, href) : null;
    if (!full) continue;

    const norm = normalizeOfferUrl(full);
    if (!norm.includes("/pl/oferta/")) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);

    out.push({
      source: "otodom",
      source_url: norm,
      title: optString(ad?.title),
      price_amount: optNumber(ad?.totalPrice?.value) ?? optNumber(ad?.totalPrice?.amount) ?? null,
      currency: optString(ad?.totalPrice?.currency) ?? optString(ad?.pricePerSquareMeter?.currency) ?? null,
      location_text: optString(ad?.location?.address?.city?.name) ?? null,
      thumb_url: optString(ad?.images?.[0]?.medium) ?? optString(ad?.images?.[0]?.large) ?? null,

      transaction_type:
        String(ad?.transaction ?? "").toUpperCase() === "SELL"
          ? "sale"
          : String(ad?.transaction ?? "").toUpperCase() === "RENT"
          ? "rent"
          : null,

      property_type: optString(ad?.estate) ?? null,
      area_m2: optNumber(ad?.areaInSquareMeters) ?? null,

      rooms:
        typeof ad?.roomsNumber === "string"
          ? ad.roomsNumber === "ONE"
            ? 1
            : ad.roomsNumber === "TWO"
            ? 2
            : ad.roomsNumber === "THREE"
            ? 3
            : ad.roomsNumber === "FOUR"
            ? 4
            : ad.roomsNumber === "FIVE"
            ? 5
            : null
          : null,

      price_per_m2: optNumber(ad?.pricePerSquareMeter?.value) ?? null,
      floor: optString(ad?.floorNumber) ?? null,
    });

    if (out.length >= limit) break;
  }

  return out;
}

function detectOtodomDegradation(requestedUrl: string, finalUrl: string): { applied: boolean; reason: string } {
  const reqBase = stripPageParam(requestedUrl);
  const finBase = stripPageParam(finalUrl);

  // jeśli portal przekierował na inny listing, uznajemy że zignorował parametry
  if (reqBase !== finBase) {
    return { applied: false, reason: "otodom_redirected_to_canonical_location" };
  }

  // dodatkowy bezpiecznik: często oznacza “zignorowane”
  if (finBase.includes("/cala-polska")) {
    return { applied: false, reason: "otodom_redirected_to_canonical_location" };
  }

  return { applied: true, reason: "none" };
}

const otodomAdapter: PortalAdapter = {
  source: "otodom",

  buildSearchRequest(ctx) {
    const safe = portalSafeFiltersFor("otodom", ctx.filters);
    const q = safe.q ?? "";
    const url = buildOtodomUrl(safe, ctx.page);

    return {
      url,
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9,en;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
    };
  },

  parseSearch(ctx, html, finalUrl): ParseResult {
    const safe = portalSafeFiltersFor("otodom", ctx.filters);
    const requestedUrl = buildOtodomUrl(safe, ctx.page);
    const deg = detectOtodomDegradation(requestedUrl, finalUrl);

    // Jeśli Otodom zignorował intencję (redirect) — nie zapisuj wyników i nie stronuj
    if (!deg.applied) {
      return {
        items: [],
        hasNext: false,
        meta: {
          source: "otodom",
          requestedUrl,
          finalUrl,
          page: ctx.page,
          applied: false,
          degradedReason: "portal_redirected",
        },
      };
    }

    const next = extractNextData(html);
    const items = next ? parseItemsFromNextData(finalUrl, next, 200) : [];

    const totalPages = next?.props?.pageProps?.data?.searchAds?.pagination?.totalPages;
    const currentPage = next?.props?.pageProps?.data?.searchAds?.pagination?.currentPage;
    const hasNext =
      typeof totalPages === "number" && typeof currentPage === "number"
        ? totalPages > currentPage
        : null;

    return {
      items,
      hasNext,
      meta: {
        source: "otodom",
        requestedUrl,
        finalUrl,
        page: ctx.page,
        applied: true,
        degradedReason: "none",
      },
    };
  },

  getNextBaseUrl(_ctx, _html, finalUrl) {
    // trzymamy canonical jako bazę do kolejnych stron
    return stripPageParam(finalUrl);
  },
};

export default otodomAdapter;
