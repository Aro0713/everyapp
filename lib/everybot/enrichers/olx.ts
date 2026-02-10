// lib/everybot/enrichers/olx.ts
import * as cheerio from "cheerio";
import type { Enricher, EnrichResult } from "./types";

/**
 * OLX – ENRICHER (detail page)
 * OLX bywa dynamiczny, ale dużo da się wyciągnąć z meta/HTML.
 * Część pól (np. piętro/rok) często jest tylko w opisie – best effort.
 */

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function parseNumberLoose(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function inferTransactionTypeFromText(s?: string | null): "sale" | "rent" | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("/mies") || t.includes("miesiąc") || t.includes("mc") || t.includes("month")) {
    return "rent";
  }
  return "sale";
}
function parseFloorFromText(s: string | null): string | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("parter")) return "0";
  const m1 = t.match(/pi[eę]tro\s*(\d{1,2})/i);
  if (m1?.[1]) return m1[1];
  const m2 = t.match(/\b(\d{1,2})\s*pi[eę]tro\b/i);
  if (m2?.[1]) return m2[1];
  return null;
}
function parseYearBuiltFromText(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}
function parseLocationParts(locationText?: string | null) {
  if (!locationText) return { voivodeship: null, city: null, district: null, street: null };
  // OLX często: "Miasto - Dzielnica" albo "Miasto, Dzielnica"
  const norm = locationText.replace(" - ", ", ");
  const parts = norm.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts[0] ?? null;
  const district = parts.length >= 2 ? parts[1] : null;
  return { voivodeship: null, city, district, street: null };
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

const olxEnricher: Enricher = async (url: string): Promise<EnrichResult> => {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const out: EnrichResult = {};

  // title
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    null;
  out.title = optString(title);

  // description
  const desc =
    $('meta[property="og:description"]').attr("content") ||
    $('[data-cy="ad_description"], [class*="description"]').first().text().trim() ||
    null;
  out.description = optString(desc);

  // price (OLX często ma w meta albo w elemencie ceny)
  const priceText =
    $('[data-testid="ad-price"], [class*="price"]').first().text().trim() ||
    $('meta[property="product:price:amount"]').attr("content") ||
    null;

  out.price_amount = parseNumberLoose(priceText);
  out.currency =
    priceText?.includes("€") ? "EUR" : priceText?.toLowerCase().includes("zł") ? "PLN" : null;
  out.transaction_type = inferTransactionTypeFromText(priceText);

  // image
  const img =
    $('meta[property="og:image"]').attr("content") ||
    $("img").first().attr("src") ||
    null;
  out.thumb_url = optString(img);

  // location
  const locText =
    $('[data-testid="location-date"], [class*="location"]').first().text().trim() ||
    $('meta[property="og:locality"]').attr("content") ||
    null;
  out.location_text = optString(locText);
  const loc = parseLocationParts(out.location_text);
  out.city = loc.city;
  out.district = loc.district;

  // property type (best effort)
  const fullText = `${out.title ?? ""} ${out.description ?? ""}`.toLowerCase();
  if (fullText.includes("mieszkan")) out.property_type = "apartment";
  else if (fullText.includes("dom")) out.property_type = "house";

  // floor/year (best effort from description)
  out.floor = parseFloorFromText(out.description ?? null);
  out.year_built = parseYearBuiltFromText(out.description ?? null);

  // metry / pokoje (best effort - szukamy w "Szczegóły" lub opisie)
  const detailsText = $("body").text().replace(/\s+/g, " ");

  // np. "Powierzchnia: 55 m²"
  const areaMatch = detailsText.match(/Powierzchnia[^0-9]{0,30}(\d+(?:[.,]\d+)?)\s*m²/i);
  out.area_m2 = areaMatch ? parseNumberLoose(areaMatch[1]) : null;

  // np. "Liczba pokoi: 3"
  const roomsMatch = detailsText.match(/Liczba\s+pokoi[^0-9]{0,30}(\d{1,2})/i);
  out.rooms = roomsMatch ? Number(roomsMatch[1]) : null;

  // cena / m2 jeśli da się wyliczyć
  if (out.price_amount != null && out.area_m2 != null && out.area_m2 > 0) {
    out.price_per_m2 = Math.round(out.price_amount / out.area_m2);
  }

  // owner phone: zwykle ukryty / dostępny po kliknięciu, więc tu zwykle null
  out.owner_phone = null;

  return out;
};

export default olxEnricher;
