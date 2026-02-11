import * as cheerio from "cheerio";
import type { Enricher, EnrichResult } from "./types";

/**
 * OTODOM – ENRICHER (detail page)
 * Źródło prawdy: __NEXT_DATA__.props.pageProps.ad
 * Bez deepPick / bez zgadywania po całym JSON.
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

function normalizeTxFromTarget(target: unknown): TxType | null {
  const t = typeof target === "string" ? target.toUpperCase() : "";
  if (t === "SELL" || t === "SALE") return "sale";
  if (t === "RENT") return "rent";
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

// floor_no bywa "0" albo "floor_5"
function normalizeFloor(v: unknown): string | null {
  const s = optString(v);
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? m[1] : s;
}

const otodomEnricher: Enricher = async (url: string): Promise<EnrichResult> => {
  const html = await fetchHtml(url);
  const next = extractNextData(html);

  const out: EnrichResult = {};

  const ad = next?.props?.pageProps?.ad;
  if (ad && typeof ad === "object") {
    // --- core ids/meta
    out.title = optString(ad.title) ?? optString(ad.slug) ?? null;

    // --- transaction type (source of truth: ad.target)
    out.transaction_type = normalizeTxFromTarget(ad.target);

    // --- price & currency
    // case A: ad.price.value + ad.price.currency (widziane na screenie)
    const pVal = optNumber(ad.price?.value);
    const pCur = optString(ad.price?.currency);

    // case B: brak ad.price -> bierz z characteristics pod konkretny key
    // SELL: "price" albo czasem "total_price"
    // RENT: "rent"
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

    // --- area / rooms / price per m2
    out.area_m2 = optNumber(getChar(ad, "m")) ?? optNumber(ad.Area) ?? null;
    out.rooms = (() => {
      const r = optNumber(getChar(ad, "rooms_num")) ?? optNumber(ad.Rooms_num);
      return r != null ? Math.round(r) : null;
    })();

    out.price_per_m2 =
      optNumber(getChar(ad, "price_per_m")) ??
      optNumber(getChar(ad, "price_per_m2")) ??
      optNumber(ad.Price_per_m) ??
      null;

    // --- floor / year built
    out.floor = normalizeFloor(getChar(ad, "floor_no")) ?? normalizeFloor(ad.Floor_no) ?? null;
    out.year_built =
      optNumber(getChar(ad, "build_year")) ??
      optNumber(getChar(ad, "building_year")) ??
      optNumber(ad.Build_year) ??
      optNumber(ad.Building_year) ??
      null;

    // --- property type
    out.property_type =
      optString(ad.PropertyType) ??
      optString(ad?.AdvertCategory?.name) ??
      optString(ad?.AdvertCategory?.type) ??
      null;

    // --- location (na screenach: City/Subregion/Province/Country; czasem w obiekcie location)
    const city =
      optString(ad.City) ??
      optString(ad.location?.city?.name) ??
      optString(ad.location?.city) ??
      null;

    const district =
      optString(ad.District) ??
      optString(ad.Subregion) ??
      optString(ad.location?.district?.name) ??
      optString(ad.location?.district) ??
      null;

    const voivodeship =
      optString(ad.Province) ??
      optString(ad.location?.region?.name) ??
      optString(ad.location?.region) ??
      null;

    const street =
      optString(ad.Street) ??
      optString(ad.location?.street?.name) ??
      optString(ad.location?.street) ??
      null;

    out.city = city;
    out.district = district;
    out.voivodeship = voivodeship;
    out.street = street;

    const locParts = [street, district, city, voivodeship].filter(Boolean);
    out.location_text = locParts.length ? locParts.join(", ") : null;

    // --- thumbnail / images
    out.thumb_url =
      optString(ad.thumbnail) ??
      optString(ad.images?.[0]?.large) ??
      optString(ad.images?.[0]?.medium) ??
      optString(ad.images?.[0]?.small) ??
      null;

    // --- publish/update time (na screenach: pushedUpAt)
    out.matched_at =
      optString(ad.pushedUpAt) ??
      optString(ad.createdAt) ??
      optString(ad.updatedAt) ??
      null;

    // --- owner phone (zwykle brak publicznie)
    out.owner_phone = optString(ad.owner_phone) ?? optString(ad.contact?.phone) ?? null;

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
