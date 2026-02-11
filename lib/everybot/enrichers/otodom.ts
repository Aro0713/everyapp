import * as cheerio from "cheerio";
import type { Enricher, EnrichResult } from "./types";

/**
 * OTODOM – ENRICHER (detail page)
 * Źródło prawdy: __NEXT_DATA__.props.pageProps.ad
 * Mapowanie 1:1 pod realny payload (ad.adCategory.type, ad.location.address, characteristics).
 */

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function parseNumberLoose(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
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

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
  });
  const html = await r.text();
  if (!r.ok) throw new Error(`FETCH_FAILED ${r.status}`);
  return html;
}

type TxType = "sale" | "rent";

function normalizeTx(v: unknown): TxType | null {
  const s = typeof v === "string" ? v.toUpperCase() : "";
  if (s === "SELL" || s === "SALE") return "sale";
  if (s === "RENT") return "rent";
  return null;
}

function normalizeTxPl(v: unknown): TxType | null {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (!s) return null;
  if (s.includes("sprzed")) return "sale";
  if (s.includes("wynaj")) return "rent";
  return null;
}

function getChar(ad: any, key: string): any | null {
  const xs = ad?.characteristics;
  if (!Array.isArray(xs)) return null;
  const hit = xs.find((c: any) => c?.key === key);
  return hit?.value ?? null;
}

function getCharCurrency(ad: any, key: string): string | null {
  const xs = ad?.characteristics;
  if (!Array.isArray(xs)) return null;
  const hit = xs.find((c: any) => c?.key === key);
  return optString(hit?.currency);
}

function normalizeFloor(v: unknown): string | null {
  const s = optString(v);
  if (!s) return null;

  const low = s.toLowerCase();
  if (low === "ground_floor" || low.includes("parter") || low.includes("ground")) return "0";

  // floor_2 / FLOOR_2 / "2"
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
}

const otodomEnricher: Enricher = async (url: string): Promise<EnrichResult> => {
  const html = await fetchHtml(url);
  const next = extractNextData(html);

  const out: EnrichResult = {};

  const ad = next?.props?.pageProps?.ad;
  if (ad && typeof ad === "object") {
    // --- core
    out.title = optString(ad.title) ?? optString(ad.slug) ?? null;

    // --- transaction type (REAL: ad.adCategory.type albo ad.target.OfferType)
    out.transaction_type =
      normalizeTx(ad?.adCategory?.type) ??
      normalizeTxPl(ad?.target?.OfferType) ??
      null;

    // --- price & currency (REAL: characteristics + ewentualnie ad.price.value jeśli kiedyś się pojawi)
    const pVal = optNumber(ad?.price?.value);
    const pCur = optString(ad?.price?.currency);

    const priceFromChars =
      optNumber(getChar(ad, "price")) ??
      optNumber(getChar(ad, "total_price")) ??
      optNumber(getChar(ad, "rent"));

    const currencyFromChars =
      getCharCurrency(ad, "price") ??
      getCharCurrency(ad, "total_price") ??
      getCharCurrency(ad, "rent");

    out.price_amount = pVal ?? priceFromChars ?? null;
    out.currency = pCur ?? currencyFromChars ?? null;

    // --- area / rooms / price per m2 (REAL: characteristics)
    out.area_m2 = optNumber(getChar(ad, "m")) ?? null;

    const roomsRaw = optNumber(getChar(ad, "rooms_num"));
    out.rooms = roomsRaw != null ? Math.round(roomsRaw) : null;

    out.price_per_m2 =
      optNumber(getChar(ad, "price_per_m")) ??
      optNumber(getChar(ad, "price_per_m2")) ??
      null;

    // --- floor / year built (REAL: characteristics)
    out.floor = normalizeFloor(getChar(ad, "floor_no")) ?? null;

    out.year_built =
      optNumber(getChar(ad, "build_year")) ??
      optNumber(getChar(ad, "building_year")) ??
      null;

    // --- property type (REAL: adCategory/name + property.type)
    out.property_type =
      optString(ad?.property?.type) ??        // np. FLAT / HOUSE / ...
      optString(ad?.adCategory?.name) ??      // np. FLAT
      null;

    // --- location (REAL: ad.location.address.*)
    const addr = ad?.location?.address;

    out.street =
      optString(addr?.street?.name) ??
      optString(addr?.street?.code) ??
      null;

    out.district =
      optString(addr?.district?.name) ??
      optString(addr?.district?.code) ??
      null;

    out.city =
      optString(addr?.city?.name) ??
      optString(addr?.city?.code) ??
      null;

    out.voivodeship =
      optString(addr?.province?.name) ??
      optString(addr?.province?.code) ??
      null;

    // fallback: powiat jako district jeśli district brak
    if (!out.district) out.district = optString(addr?.county?.name) ?? null;

    out.location_text =
      [out.street, out.district, out.city, out.voivodeship].filter(Boolean).join(", ") || null;

    // --- thumbnail / images (REAL: images[*].large/medium/small/thumbnail)
    out.thumb_url =
      optString(ad?.images?.[0]?.large) ??
      optString(ad?.images?.[0]?.medium) ??
      optString(ad?.images?.[0]?.small) ??
      optString(ad?.images?.[0]?.thumbnail) ??
      null;

    // --- publish/update time (REAL: pushedUpAt/modifiedAt/createdAt)
    out.matched_at =
      optString(ad?.pushedUpAt) ??
      optString(ad?.modifiedAt) ??
      optString(ad?.createdAt) ??
      null;

    // --- phone (REAL: contactDetails.phones / owner.phones / agency.phones)
    out.owner_phone =
      optString(ad?.contactDetails?.phones?.[0]) ??
      optString(ad?.owner?.phones?.[0]) ??
      optString(ad?.agency?.phones?.[0]) ??
      null;

    return out;
  }

  // ===== Fallback HTML (tylko gdy nie ma __NEXT_DATA__/ad) =====
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    null;
  out.title = optString(title);

  const desc =
    $('meta[name="description"]').attr("content") ||
    $(".description, .offer-description").text().trim() ||
    null;
  out.description = optString(desc);

  const priceText =
    $('[data-testid*="price"], [class*="price"]').first().text().trim() || null;
  out.price_amount = parseNumberLoose(priceText);
  out.currency =
    priceText?.includes("€") ? "EUR" : priceText?.toLowerCase().includes("zł") ? "PLN" : null;

  const locationText =
    $('[data-testid*="address"], [class*="address"]').first().text().trim() || null;
  out.location_text = locationText;

  const img =
    $('meta[property="og:image"]').attr("content") ||
    $("img").first().attr("src") ||
    null;
  out.thumb_url = absUrl(url, img);

  return out;
};

export default otodomEnricher;
