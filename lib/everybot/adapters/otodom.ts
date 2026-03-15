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
    x.searchParams.delete("viewType");
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
    .replace(/[\u0300-\u036f]/g, "")
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

  if (s.includes("dom") || s === "house") return "dom";
  if (s.includes("miesz") || s.includes("apart") || s === "flat" || s === "apartment") return "mieszkanie";
  if (s.includes("dzial") || s.includes("grunt") || s === "plot") return "dzialka";
  if (s.includes("lokal") || s.includes("komerc") || s.includes("office")) return "lokal";
  if (s.includes("pokoj") || s.includes("room")) return "pokoj";
  if (s.includes("garaz") || s.includes("garage")) return "garaz";

  return null;
}

function buildOtodomUrl(filters: any, page: number) {
  const tx = mapTxToOtodom(filters?.transactionType) ?? "sprzedaz";
  const estate = mapEstateToOtodom(filters?.propertyType) ?? "mieszkanie";
  const voiv = optString(filters?.voivodeship);
  const voivSlug = voiv ? slugifyPl(voiv) : null;

  const path = voivSlug
    ? `/pl/wyniki/${tx}/${estate}/${voivSlug}`
    : `/pl/wyniki/${tx}/${estate}/cala-polska`;

  const u = new URL(`https://www.otodom.pl${path}`);

  const q = optString(filters?.q);
  const city = optString(filters?.city);
  const district = optString(filters?.district);
  const street = optString(filters?.street);

  const phraseParts: string[] = [];
  if (q) phraseParts.push(q);
  if (city) phraseParts.push(city);
  if (district) phraseParts.push(district);
  if (street) phraseParts.push(street);

  if (phraseParts.length) {
    u.searchParams.set("search[phrase]", phraseParts.join(", "));
  }

  const minPrice = optNumber(filters?.minPrice);
  const maxPrice = optNumber(filters?.maxPrice);
  if (minPrice != null) u.searchParams.set("search[filter_float_price:from]", String(minPrice));
  if (maxPrice != null) u.searchParams.set("search[filter_float_price:to]", String(maxPrice));

  const minArea = optNumber(filters?.minArea);
  const maxArea = optNumber(filters?.maxArea);
  if (minArea != null) u.searchParams.set("search[filter_float_m:from]", String(minArea));
  if (maxArea != null) u.searchParams.set("search[filter_float_m:to]", String(maxArea));

  const rooms = optNumber(filters?.rooms);
  if (rooms != null) u.searchParams.set("search[filter_enum_rooms_num][]", String(rooms));

  u.searchParams.set("viewType", "listing");
  if (page > 1) u.searchParams.set("page", String(page));

  return u.toString();
}

function normalizeOfferUrl(u: string): string {
  try {
    const x = new URL(u.replace("://www.otodom.pl/hpr/", "://www.otodom.pl/"));

    if (x.hostname.includes("otodom.")) {
      if (x.pathname.startsWith("/oferta/")) {
        x.pathname = `/pl${x.pathname}`;
      }
      if (x.pathname.startsWith("/pl/oferta/")) {
        x.search = "";
        x.hash = "";
      }
    }

    return x.toString();
  } catch {
    return u.replace("://www.otodom.pl/hpr/", "://www.otodom.pl/");
  }
}

function deepCollectObjects(root: any, pick: (o: any) => boolean, out: any[] = [], seen = new Set<any>()) {
  if (!root || typeof root !== "object") return out;
  if (seen.has(root)) return out;
  seen.add(root);

  if (Array.isArray(root)) {
    for (const it of root) deepCollectObjects(it, pick, out, seen);
    return out;
  }

  if (pick(root)) out.push(root);

  for (const k of Object.keys(root)) {
    deepCollectObjects((root as any)[k], pick, out, seen);
  }

  return out;
}

function mapRoomsEnum(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = v.toUpperCase();
  if (t === "ONE") return 1;
  if (t === "TWO") return 2;
  if (t === "THREE") return 3;
  if (t === "FOUR") return 4;
  if (t === "FIVE") return 5;
  if (t === "SIX") return 6;
  const m = t.match(/\d+/);
  return m ? Number(m[0]) : null;
}

function buildOfferUrlFromAd(ad: any, finalUrl: string): string | null {
  const slug = optString(ad?.slug);
  if (slug) {
    return normalizeOfferUrl(`https://www.otodom.pl/pl/oferta/${slug}`);
  }

  const href = optString(ad?.href);
  if (href) {
    const cleanedHref = href
      .replace(/^hpr\//i, "")
      .replace(/^\[lang\]\//i, "pl/")
      .replace(/\/ad\//i, "/oferta/");

    const full = absUrl(finalUrl, cleanedHref);
    if (full) return normalizeOfferUrl(full);
  }

  const url =
    optString(ad?.url) ??
    optString(ad?.link) ??
    optString(ad?.canonicalURL);

  if (url) {
    const full = absUrl(finalUrl, url);
    if (full) return normalizeOfferUrl(full);
  }

  return null;
}

function extractLocationText(ad: any): string | null {
  const streetName = optString(ad?.location?.address?.street?.name);
  const streetNo = optString(ad?.location?.address?.street?.number);
  const city = optString(ad?.location?.address?.city?.name);
  const district = optString(ad?.location?.address?.district?.name);
  const province = optString(ad?.location?.address?.province?.name);

  const street = [streetName, streetNo].filter(Boolean).join(" ") || null;
  return [street, district, city, province].filter(Boolean).join(", ") || null;
}

function parseItemsFromNextData(finalUrl: string, next: any, limit = 200): SearchItem[] {
  const directItems = next?.props?.pageProps?.data?.searchAds?.items;

  const candidates = Array.isArray(directItems)
    ? directItems
    : deepCollectObjects(
        next,
        (o) => {
          if (!o || typeof o !== "object" || Array.isArray(o)) return false;

          const href = optString((o as any).href);
          const slug = optString((o as any).slug);
          const title = optString((o as any).title) ?? optString((o as any).name);
          const price =
            optNumber((o as any).totalPrice?.value) ??
            optNumber((o as any).totalPrice?.amount) ??
            optNumber((o as any).price?.value) ??
            optNumber((o as any).price?.amount);

          const hasOfferHref =
            typeof href === "string" &&
            /(?:\/ad\/|\/oferta\/|\[lang\]\/ad\/|hpr\/\[lang\]\/ad\/)/i.test(href);

            const looksLikeOffer = Boolean(slug) || hasOfferHref;

            const numericId = optNumber((o as any).id);
            const saneId =
              numericId == null ||
              (Number.isInteger(numericId) && numericId > 0 && numericId < 10000000000);

            return looksLikeOffer && saneId && (!!title || price != null);
        },
        []
      );

  if (!Array.isArray(candidates) || !candidates.length) return [];

  const out: SearchItem[] = [];
  const seen = new Set<string>();

  for (const ad of candidates) {
    const norm = buildOfferUrlFromAd(ad, finalUrl);
    if (!norm) continue;
    if (!norm.includes("/oferta/")) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);

    const title =
      optString(ad?.title) ??
      optString(ad?.name) ??
      optString(ad?.heading) ??
      optString(ad?.subtitle) ??
      optString(ad?.seo?.title) ??
      null;

    const city = optString(ad?.location?.address?.city?.name) ?? null;
    const district = optString(ad?.location?.address?.district?.name) ?? null;
    const voivodeship = optString(ad?.location?.address?.province?.name) ?? null;
    const streetName = optString(ad?.location?.address?.street?.name) ?? null;
    const streetNo = optString(ad?.location?.address?.street?.number) ?? null;
    const street = [streetName, streetNo].filter(Boolean).join(" ") || null;

    out.push({
      source: "otodom",
      source_url: norm,
      title,
      price_amount:
        optNumber(ad?.totalPrice?.value) ??
        optNumber(ad?.totalPrice?.amount) ??
        optNumber(ad?.price?.value) ??
        optNumber(ad?.price?.amount) ??
        null,
      currency:
        optString(ad?.totalPrice?.currency) ??
        optString(ad?.price?.currency) ??
        optString(ad?.pricePerSquareMeter?.currency) ??
        null,
      location_text: extractLocationText(ad),
      thumb_url:
        optString(ad?.images?.[0]?.medium) ??
        optString(ad?.images?.[0]?.large) ??
        optString(ad?.images?.[0]?.url) ??
        null,

      transaction_type:
        String(ad?.transaction ?? "").toUpperCase() === "SELL"
          ? "sale"
          : String(ad?.transaction ?? "").toUpperCase() === "RENT"
          ? "rent"
          : null,

      property_type: optString(ad?.estate) ?? null,
      area_m2: optNumber(ad?.areaInSquareMeters) ?? optNumber(ad?.area) ?? null,
      rooms:
        mapRoomsEnum(ad?.roomsNumber) ??
        (optNumber(ad?.rooms) != null ? Math.round(optNumber(ad?.rooms) as number) : null),
      price_per_m2:
        optNumber(ad?.pricePerSquareMeter?.value) ??
        optNumber(ad?.pricePerSquareMeter?.amount) ??
        null,
      floor: optString(ad?.floorNumber) ?? null,
      year_built: optNumber(ad?.yearBuilt) ?? null,
      voivodeship,
      city,
      district,
      street,
    });

    if (out.length >= limit) break;
  }

  return out;
}

function detectOtodomDegradation(requestedUrl: string, finalUrl: string): { applied: boolean; reason: string } {
  const reqBase = stripPageParam(requestedUrl);
  const finBase = stripPageParam(finalUrl);

  if (reqBase !== finBase) {
    return { applied: false, reason: "otodom_redirected_to_canonical_location" };
  }

  if (!reqBase.includes("/cala-polska") && finBase.includes("/cala-polska")) {
    return { applied: false, reason: "otodom_redirected_to_canonical_location" };
  }

  return { applied: true, reason: "none" };
}

const otodomAdapter: PortalAdapter = {
  source: "otodom",

  buildSearchRequest(ctx) {
    const safe = portalSafeFiltersFor("otodom", ctx.filters);
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

    const totalPages =
      next?.props?.pageProps?.data?.searchAds?.pagination?.totalPages ??
      next?.props?.pageProps?.data?.searchAds?.pagination?.pagesCount ??
      null;

    const currentPage =
      next?.props?.pageProps?.data?.searchAds?.pagination?.currentPage ??
      next?.props?.pageProps?.data?.searchAds?.pagination?.page ??
      ctx.page;

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
    return stripPageParam(finalUrl);
  },
};

export default otodomAdapter;