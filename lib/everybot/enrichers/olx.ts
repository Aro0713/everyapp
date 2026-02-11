import * as cheerio from "cheerio";
import type { Enricher, EnrichResult } from "./types";

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

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.7",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  const html = await r.text();
  if (!r.ok) throw new Error(`FETCH_FAILED ${r.status}`);
  return html;
}

/** OLX: <script type="application/ld+json" ...>{...}</script> */
function extractLdJson(html: string): any | null {
  const m = html.match(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

type TxType = "sale" | "rent";

function txFromCategory(categoryUrl: string | null): TxType | null {
  if (!categoryUrl) return null;
  const s = categoryUrl.toLowerCase();
  if (s.includes("/sprzedaz/")) return "sale";
  if (s.includes("/wynajem/")) return "rent";
  // OLX pokoje/stancje to de facto wynajem
  if (s.includes("stancje-pokoje")) return "rent";
  return null;
}

function propFromCategory(categoryUrl: string | null): string | null {
  if (!categoryUrl) return null;
  const s = categoryUrl.toLowerCase();
  if (s.includes("/mieszkania/")) return "flat";
  if (s.includes("/domy/")) return "house";
  if (s.includes("/dzialki/")) return "plot";
  if (s.includes("stancje-pokoje")) return "room";
  if (s.includes("/lokale/") || s.includes("/nieruchomosci/biura/") || s.includes("/komerc")) return "commercial";
  return null;
}

// Best-effort: metraż/pokoje z opisu
function parseAreaM2FromText(text: string | null): number | null {
  if (!text) return null;
  // 54,23 m2 / 55m2 / 55 m²
  const m = text.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(m2|m²)\b/i);
  if (!m) return null;
  return parseNumberLoose(m[1]);
}

function parseRoomsFromText(text: string | null): number | null {
  if (!text) return null;
  // "dwupokojowe", "2 pokoje", "mieszkanie 4-pokojowe"
  const low = text.toLowerCase();

  const wordMap: Record<string, number> = {
    jednopokoj: 1,
    dwupokoj: 2,
    trzypokoj: 3,
    czteropokoj: 4,
    pieciopokoj: 5,
    sześciopokoj: 6,
    szesciopokoj: 6,
  };
  for (const k of Object.keys(wordMap)) {
    if (low.includes(k)) return wordMap[k];
  }

  const m = low.match(/(\d+)\s*[- ]?\s*pokoj/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

const olxEnricher: Enricher = async (url: string): Promise<EnrichResult> => {
  const html = await fetchHtml(url);
  const ld = extractLdJson(html);

  const out: EnrichResult = {};

  // ===== Primary: LD+JSON =====
  if (ld && typeof ld === "object") {
    const name = optString(ld.name);
    const desc = optString(ld.description);
    const categoryUrl = optString(ld.category);

    out.title = name ?? null;
    out.description = desc ?? null;

    // price/currency
    const offers = ld.offers;
    out.price_amount = optNumber(offers?.price) ?? null;
    out.currency = optString(offers?.priceCurrency) ?? null;

    // images/thumb
    const imgs = Array.isArray(ld.image) ? ld.image : [];
    out.thumb_url = optString(imgs?.[0]) ?? null;

    // tx & property
    out.transaction_type = txFromCategory(categoryUrl);
    out.property_type = propFromCategory(categoryUrl);

    // location (LD+JSON daje tylko areaServed.name — bywa dzielnicą/POI)
    const areaName =
      optString(offers?.areaServed?.name) ??
      optString(offers?.areaServed?.address?.addressLocality) ??
      null;

    out.location_text = areaName;

    // best-effort z opisu
    out.area_m2 = parseAreaM2FromText(desc);
    out.rooms = parseRoomsFromText(desc);

    // OLX LD+JSON zwykle nie ma matched_at / floor / year_built / street/city/voivodeship
    // zostają null, chyba że później dodamy drugi “source of truth”.

    return out;
  }

  // ===== Fallback HTML (gdy nie ma ld+json) =====
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
    $('[data-testid*="location"], [data-testid*="address"], [class*="location"], [class*="address"]')
      .first()
      .text()
      .trim() || null;
  out.location_text = optString(locationText);

  const img =
    $('meta[property="og:image"]').attr("content") ||
    $("img").first().attr("src") ||
    null;
  out.thumb_url = absUrl(url, img);

  // best-effort
  out.area_m2 = parseAreaM2FromText(out.description ?? null);
  out.rooms = parseRoomsFromText(out.description ?? null);

  return out;
};

export default olxEnricher;
