// lib/everybot/enrichers/otodom.ts
import * as cheerio from "cheerio";
import type { Enricher, EnrichResult } from "./types";

/**
 * OTODOM – ENRICHER (detail page)
 * Pobiera stronę /pl/oferta/... i wyciąga pełne dane z __NEXT_DATA__ + HTML fallback.
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
function inferTransactionTypeFromText(s?: string | null): "sale" | "rent" | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("/mies") || t.includes("miesiąc") || t.includes("mc") || t.includes("month")) {
    return "rent";
  }
  return "sale";
}
function parseLocationParts(locationText?: string | null) {
  if (!locationText) {
    return { voivodeship: null, city: null, district: null, street: null };
  }
  const parts = locationText.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts[0] ?? null;
  const district = parts.length >= 2 ? parts[1] : null;
  const street = parts.length >= 3 ? parts.slice(2).join(", ") : null;

  // województwo bywa w tekście opisowym
  const v = locationText.match(/\bwoj\.?\s*([a-ząćęłńóśźż-]+)/i);
  const voivodeship = v ? v[1] : null;

  return { voivodeship, city, district, street };
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

const otodomEnricher: Enricher = async (url: string): Promise<EnrichResult> => {
  const html = await fetchHtml(url);
  const next = extractNextData(html);

  const out: EnrichResult = {};

  // ===== 1) Preferuj __NEXT_DATA__ (stabilniejsze) =====
  const p = next?.props?.pageProps;
  if (p) {
    // tytuł
    out.title = optString(p.pageTitle) || optString(p.pageHeading) || null;

    // cena / waluta
    out.price_amount =
      optNumber(p.transaction?.price?.amount) ??
      optNumber(p.transaction?.totalPrice?.amount) ??
      null;
    out.currency =
      optString(p.transaction?.price?.currency) ??
      optString(p.transaction?.totalPrice?.currency) ??
      null;

    // transakcja
    out.transaction_type =
      (p.transaction?.transactionType === "rent" || p.transaction?.transactionType === "sale"
        ? p.transaction?.transactionType
        : null) ?? inferTransactionTypeFromText(p.transaction?.price?.formatted);

    // metry / pokoje / cena za m2
    out.area_m2 = optNumber(p.estate?.area) ?? optNumber(p.estate?.areaM2) ?? null;
    out.rooms =
      optNumber(p.estate?.rooms) != null ? Math.round(optNumber(p.estate?.rooms)!) : null;
    out.price_per_m2 = optNumber(p.transaction?.pricePerM2) ?? null;

    // piętro / rok
    out.floor = optString(p.estate?.floor) ?? null;
    out.year_built = optNumber(p.estate?.yearBuilt) ?? optNumber(p.estate?.buildYear) ?? null;

    // typ
    out.property_type =
      optString(p.estate?.type) ?? optString(p.estate?.estateType) ?? null;

    // lokalizacja
    const locationText =
      [
        p.location?.city,
        p.location?.district,
        p.location?.street,
      ].filter(Boolean).join(", ") || null;

    out.location_text = locationText;
    const loc = parseLocationParts(locationText);
    out.voivodeship = loc.voivodeship;
    out.city = loc.city;
    out.district = loc.district;
    out.street = loc.street;

    // miniatura
    out.thumb_url =
      optString(p.data?.images?.[0]?.url) ??
      optString(p.estate?.images?.[0]?.url) ??
      null;

    // telefon właściciela (jeśli publiczny)
    out.owner_phone =
      optString(p.contact?.phone) ??
      optString(p.owner?.phone) ??
      null;

    return out;
  }

  // ===== 2) Fallback HTML (cheerio) =====
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
  out.transaction_type = inferTransactionTypeFromText(priceText);

  const locationText =
    $('[data-testid*="address"], [class*="address"]').first().text().trim() || null;
  out.location_text = locationText;
  const loc = parseLocationParts(locationText);
  out.voivodeship = loc.voivodeship;
  out.city = loc.city;
  out.district = loc.district;
  out.street = loc.street;

  const img =
    $('meta[property="og:image"]').attr("content") ||
    $("img").first().attr("src") ||
    null;
  out.thumb_url = absUrl(url, img);

  return out;
};

export default otodomEnricher;
