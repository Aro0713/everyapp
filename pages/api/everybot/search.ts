import type { NextApiRequest, NextApiResponse } from "next";
import * as cheerio from "cheerio";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";


/* -------------------- utils -------------------- */
function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function detectSource(url: string): "otodom" | "olx" | "other" {
  const u = url.toLowerCase();
  if (u.includes("otodom.")) return "otodom";
  if (u.includes("olx.")) return "olx";
  return "other";
}

function absUrl(base: string, href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function parseNumberLoose(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function toSourceListingId(row: ExternalRow): string {
  // MVP: stabilny identyfikator = URL (znormalizowany)
  return row.external_id || row.source_url;
}

/* -------------------- types -------------------- */
type ExternalRow = {
  external_id: string;
  office_id: string | null;
  source: string;
  source_url: string;
  title: string | null;
  price_amount: string | number | null;
  currency: string | null;
  location_text: string | null;
  status: string;
  imported_at: string;
  updated_at: string;
  thumb_url: string | null;
  created_at?: string;

  // aliases / MVP
  transaction_type?: "sale" | "rent" | null;
  price?: number | null;

  // Esti-like (dla tabeli)
  owner_phone?: string | null;
  matched_at?: string | null;
  property_type?: string | null;

  area_m2?: number | null;
  rooms?: number | null;
  price_per_m2?: number | null;

  floor?: string | null;
  year_built?: number | null;
  voivodeship?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
};


function cleanTitle(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.includes(".css-") || t.includes("@media") || t.length > 260) return null;
  return t;
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

function firstString(...xs: Array<unknown>): string | null {
  for (const x of xs) {
    if (typeof x === "string" && x.trim()) return x.trim();
  }
  return null;
}
function pickAnyStringByKeys(root: any, keys: string[]): string | null {
  let out: string | null = null;
  deepCollectObjects(root, (o) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    for (const k of keys) {
      if (typeof (o as any)[k] === "string" && (o as any)[k].trim()) {
        out = (o as any)[k].trim();
        return true;
      }
    }
    return false;
  });
  return out;
}

function pickAnyNumberByKeys(root: any, keys: string[]): number | null {
  let out: number | null = null;
  deepCollectObjects(root, (o) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    for (const k of keys) {
      const v = (o as any)[k];
      const n = optNumber(v);
      if (n != null) {
        out = n;
        return true;
      }
      if (typeof v === "string") {
        const nn = parseNumberLoose(v);
        if (nn != null) {
          out = nn;
          return true;
        }
      }
    }
    return false;
  });
  return out;
}

function parseLocationParts(locationText: string | null): {
  voivodeship: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
} {
  if (!locationText) return { voivodeship: null, city: null, district: null, street: null };

  // Otodom zwykle: "Miasto, Dzielnica, Ulica" albo "Miasto, Dzielnica"
  const parts = locationText.split(",").map((s) => s.trim()).filter(Boolean);

  const city = parts[0] ?? null;
  const district = parts.length >= 2 ? parts[1] : null;
  const street = parts.length >= 3 ? parts.slice(2).join(", ") : null;

  // Województwo często NIE występuje w listingu – próbujemy heurystyki
  const voivMatch = locationText.match(/\b(woj\.?\s*[a-ząćęłńóśźż-]+)\b/i);
  const voivodeship = voivMatch ? voivMatch[1].replace(/^woj\.?\s*/i, "").trim() : null;

  return { voivodeship, city, district, street };
}

function parseFloorFromText(s: string | null): string | null {
  if (!s) return null;
  const t = s.toLowerCase();

  // przykłady: "piętro 3", "3 piętro", "parter"
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

function inferPropertyTypeFromText(s: string | null): string | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("mieszkan")) return "apartment";
  if (t.includes("dom")) return "house";
  if (t.includes("działk")) return "plot";
  if (t.includes("lokal") || t.includes("biur")) return "commercial";
  return null;
}

function parseOtodomResultsFromNextData(pageUrl: string, html: string, limit: number): { rows: ExternalRow[]; hasNext: boolean | null } {
  const next = extractNextData(html);
  if (!next) return { rows: [], hasNext: null };
      const now = new Date().toISOString();
  const p = next?.props?.pageProps;
  const ads = p?.data?.searchAds;

  if (Array.isArray(ads) && ads.length) {
    console.log("otodom searchAd keys:", Object.keys(ads[0] ?? {}));
    console.log("otodom searchAd sample:", JSON.stringify(ads[0] ?? {}).slice(0, 1200));

    const rows: ExternalRow[] = [];
    const seen = new Set<string>();

    for (const ad of ads) {
      const rawUrl = firstString(ad?.url, ad?.href, ad?.link, ad?.canonicalUrl);
      const full = rawUrl ? absUrl(pageUrl, rawUrl) : null;
      if (!full) continue;

      const norm = normalizeOtodomUrl(full);
      if (!norm.includes("/pl/oferta/")) continue;
      if (seen.has(norm)) continue;
      seen.add(norm);

      const title = cleanTitle(firstString(ad?.title, ad?.name, ad?.heading)) ?? null;

      const priceAmount =
        optNumber(ad?.price?.amount) ??
        optNumber(ad?.totalPrice?.amount) ??
        optNumber(ad?.priceAmount) ??
        null;
        const priceText =
        firstString(ad?.price?.formatted, ad?.totalPrice?.formatted, ad?.priceText) ?? null;

        const transaction_type =
        (ad?.transactionType === "rent" || ad?.transactionType === "sale" ? ad.transactionType : null) ??
        inferTransactionTypeFromPriceText(priceText);

      const currency =
        firstString(ad?.price?.currency, ad?.totalPrice?.currency, ad?.currency) ?? null;

      const area_m2 =
        optNumber(ad?.area) ?? optNumber(ad?.areaM2) ?? null;

      const roomsRaw =
        optNumber(ad?.rooms) ?? null;

      const rooms = roomsRaw != null ? Math.round(roomsRaw) : null;

      const price_per_m2 =
        optNumber(ad?.pricePerM2) ??
        optNumber(ad?.price_per_m2) ??
        null;

      const locationText =
        firstString(ad?.locationText, ad?.location, ad?.address, ad?.city, ad?.district, ad?.region) ?? null;
        const locParts = parseLocationParts(locationText);
        const matched_at = now;

        // próbujemy najpierw po kluczach z JSON (różne wersje danych)
        const floor =
        pickAnyStringByKeys(ad, ["floor", "floorNo", "floor_number", "level"]) ??
        parseFloorFromText(firstString(ad?.description, ad?.subtitle, ad?.additionalInfo, ad?.paramsText, locationText));

        const year_built =
        pickAnyNumberByKeys(ad, ["yearBuilt", "buildYear", "constructionYear", "year_built"]) ??
        parseYearBuiltFromText(firstString(ad?.description, ad?.subtitle, ad?.additionalInfo, ad?.paramsText));

        const property_type =
        firstString(ad?.category, ad?.propertyType, ad?.estateType, ad?.type) ??
        inferPropertyTypeFromText(firstString(ad?.title, ad?.description));


      const img =
        firstString(ad?.thumbnail, ad?.thumb, ad?.image, ad?.images?.[0]?.url, ad?.photos?.[0]?.url) ?? null;

          rows.push({
        external_id: norm,
        office_id: null,
        source: "otodom",
        source_url: norm,

        title,
        price_amount: priceAmount,
        currency,
        location_text: locationText,

        status: "preview",
        imported_at: now,
        updated_at: now,

        thumb_url: img ? absUrl(pageUrl, img) : null,

        area_m2,
        rooms,
        price_per_m2,
        

        // ALIASES dla tabeli (MVP)
        created_at: now,
        transaction_type: transaction_type ?? null,
        price: priceAmount ?? null,
        matched_at,
property_type: property_type ?? null,
floor: floor ?? null,
year_built: year_built ?? null,
voivodeship: locParts.voivodeship,
city: locParts.city,
district: locParts.district,
street: locParts.street,

        });

      if (rows.length >= limit) break;
    }

    // tu jeszcze nie ruszamy paginacji — zwracamy hasNext null
    return { rows, hasNext: null };
  }

  // 1) zbierz kandydatów na "listing/ad/offer" – heurystyka po polach
  const candidates = deepCollectObjects(next, (o) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;

    const hasTitle =
      typeof (o as any).title === "string" ||
      typeof (o as any).name === "string" ||
      typeof (o as any).heading === "string";

    const hasUrl =
      typeof (o as any).url === "string" ||
      typeof (o as any).href === "string" ||
      typeof (o as any).link === "string" ||
      typeof (o as any).canonical === "string";

    const hasPrice =
      (typeof (o as any).price === "number" || typeof (o as any).price === "string" || typeof (o as any).totalPrice === "number") ||
      (o as any).price?.amount != null ||
      (o as any).totalPrice?.amount != null;

    // Otodom zwykle ma też jakieś "location"/"address"/"city"
    const hasLoc =
      typeof (o as any).location === "string" ||
      typeof (o as any).address === "string" ||
      typeof (o as any).city === "string" ||
      typeof (o as any).region === "string" ||
      typeof (o as any).district === "string";

    // nie wymagamy wszystkiego naraz, ale ograniczamy śmieci
    return (hasTitle && hasUrl) || (hasTitle && hasPrice) || (hasUrl && hasPrice && hasLoc);
  });

  const rows: ExternalRow[] = [];
  const seen = new Set<string>();

  for (const o of candidates) {
    const rawUrl = firstString((o as any).url, (o as any).href, (o as any).link, (o as any).canonical);
    if (!rawUrl) continue;

    const full = absUrl(pageUrl, rawUrl);
    if (!full) continue;

    const norm = normalizeOtodomUrl(full);

    // filtr: interesują nas oferty
    if (!norm.includes("/pl/oferta/")) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);

    const rawTitle = firstString((o as any).title, (o as any).name, (o as any).heading);
    const title = cleanTitle(rawTitle);

    // cena – kilka możliwych struktur
    const priceText = firstString(
      (o as any).price?.formatted,
      (o as any).totalPrice?.formatted,
      (o as any).price,
      (o as any).totalPrice
    );
    const priceAmount =
      optNumber((o as any).price?.amount) ??
      optNumber((o as any).totalPrice?.amount) ??
      parseNumberLoose(priceText);

    const currency =
      firstString((o as any).price?.currency, (o as any).totalPrice?.currency) ??
      (priceText?.includes("€") ? "EUR" : priceText?.toLowerCase().includes("zł") ? "PLN" : null);

    const locationText = firstString(
      (o as any).location,
      (o as any).address,
      (o as any).city,
      (o as any).district,
      (o as any).region
    );

    // miniaturka
    const img = firstString(
      (o as any).thumbnail,
      (o as any).thumb,
      (o as any).image,
      (o as any).coverImage,
      (o as any).images?.[0]?.url,
      (o as any).photos?.[0]?.url
    );

    // metry / pokoje / cena za m2 (jeśli są w obiekcie)
    const area_m2 =
      optNumber((o as any).area) ??
      optNumber((o as any).areaM2) ??
      parseNumberLoose(firstString((o as any).area?.value, (o as any).area?.formatted));

    const roomsRaw = optNumber((o as any).rooms) ?? parseNumberLoose(firstString((o as any).rooms?.formatted));
    const rooms = roomsRaw != null ? Math.round(roomsRaw) : null;

    const price_per_m2 =
      optNumber((o as any).pricePerM2) ??
      optNumber((o as any).price_per_m2) ??
      parseNumberLoose(firstString((o as any).pricePerM2?.formatted));
    
      const transaction_type = inferTransactionTypeFromPriceText(priceText);

    rows.push({
      external_id: norm,
      office_id: null,
      source: "otodom",
      source_url: norm,

      title: title || null,
      price_amount: priceAmount ?? null,
      currency,
      location_text: locationText || null,

      status: "preview",
      imported_at: now,
      updated_at: now,

      thumb_url: img ? absUrl(pageUrl, img) : null,

      area_m2: area_m2 ?? null,
      rooms: rooms ?? null,
      price_per_m2: price_per_m2 ?? null,
      created_at: now,
        transaction_type,
        price: priceAmount ?? null,
        

    });

    if (rows.length >= limit) break;
  }

  // 2) paginacja – szukamy totalPages / page / currentPage w __NEXT_DATA__
  let hasNext: boolean | null = null;
  try {
    const s = JSON.stringify(next);
    const tp = s.match(/"totalPages"\s*:\s*(\d+)/i) || s.match(/"total_pages"\s*:\s*(\d+)/i);
    const cp = s.match(/"currentPage"\s*:\s*(\d+)/i) || s.match(/"page"\s*:\s*(\d+)/i);
    if (tp && cp) {
      const totalPages = Number(tp[1]);
      const currentPage = Number(cp[1]);
      if (Number.isFinite(totalPages) && Number.isFinite(currentPage)) hasNext = totalPages > currentPage;
    }
  } catch {}

  return { rows, hasNext };
}

/* -------------------- parsers -------------------- */
function normalizeOtodomUrl(u: string): string {
  // /hpr/ -> /
  let out = u.replace("://www.otodom.pl/hpr/", "://www.otodom.pl/");

  // czasem trafiają się linki bez /pl/ (albo z inną wersją)
  // nie ruszamy ofert (/pl/oferta/), bo to i tak jest OK
  // ale wyniki chcemy trzymać kanonicznie w /pl/wyniki
  try {
    const url = new URL(out);
    if (url.hostname.includes("otodom.") && url.pathname.startsWith("/wyniki")) {
      url.pathname = "/pl" + url.pathname;
      out = url.toString();
    }
  } catch {}
  return out;
}
function inferTransactionTypeFromPriceText(
  s: string | null
): "rent" | "sale" | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (
    t.includes("/mies") ||
    t.includes("miesiąc") ||
    t.includes("mc") ||
    t.includes("month")
  ) {
    return "rent";
  }
  return "sale";
}


function parseOtodomResults(pageUrl: string, html: string, limit: number): ExternalRow[] {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  const rows: ExternalRow[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const full = absUrl(pageUrl, href);
    if (!full) return;

    const norm = normalizeOtodomUrl(full);
    if (!norm.includes("/pl/oferta/")) return;
    if (seen.has(norm)) return;
    seen.add(norm);

    const card = $(el).closest("article, li, div").first();

    const rawTitle =
      card.find("h2, h3").first().text().trim() ||
      $(el).attr("title")?.trim() ||
      $(el).attr("aria-label")?.trim() ||
      $(el).text().trim() ||
      null;

    // tytuł + fallback na „cechy” (żeby nie było '-')
    let title = cleanTitle(rawTitle);
    if (!title) {
      const cardTextForTitle = card.text().replace(/\s+/g, " ").trim();
      // bierzemy pierwsze ~120 znaków jako „opis cech”
      if (cardTextForTitle) title = cleanTitle(cardTextForTitle.slice(0, 140)) ?? null;
    }

    const priceText =
      card
        .find('[data-cy="listing-item-price"], [data-testid*="price"], [class*="price"]')
        .first()
        .text()
        .trim() || null;

    const transaction_type = inferTransactionTypeFromPriceText(priceText);

    const locationText =
      card
        .find('[data-cy="listing-item-address"], [data-testid*="address"], [class*="address"], [class*="location"]')
        .first()
        .text()
        .trim() || null;

    const img =
      card.find("img").first().attr("src") ||
      card.find("img").first().attr("data-src") ||
      null;

    const currency =
      priceText?.includes("€") ? "EUR" :
      priceText?.toLowerCase().includes("zł") ? "PLN" :
      null;

    const priceAmount = parseNumberLoose(priceText);
    const cardText = card.text().replace(/\s+/g, " ");

    const area_m2 = parseNumberLoose(cardText.match(/(\d+(?:[.,]\d+)?)\s*m²/i)?.[0]);
    const roomsRaw = parseNumberLoose(cardText.match(/(\d+(?:[.,]\d+)?)\s*pok/i)?.[0]);
    const rooms = roomsRaw ? Math.round(roomsRaw) : null;

    const price_per_m2 = parseNumberLoose(cardText.match(/(\d[\d\s.,]+)\s*zł\/m²/i)?.[0]);
    const locParts = parseLocationParts(locationText);
const matched_at = now;

const floor = parseFloorFromText(cardText);
const year_built = parseYearBuiltFromText(cardText);

const property_type = inferPropertyTypeFromText(
  `${rawTitle ?? ""} ${cardText ?? ""}`
);


rows.push({
  external_id: norm,
  office_id: null,
  source: "otodom",
  source_url: norm,

  title: title || null,
  price_amount: priceAmount ?? null,
  currency,
  location_text: locationText || null,

  status: "preview",
  imported_at: now,
  updated_at: now,

  thumb_url: img ? absUrl(pageUrl, img) : null,

  // === POLA DO TABELI (MVP) ===
  area_m2: area_m2 ?? null,
  rooms: rooms ?? null,
  price_per_m2: price_per_m2 ?? null,

  // ALIASES dla tabeli (MVP)
  created_at: now,
  transaction_type,
  price: priceAmount ?? null,
  matched_at,
property_type,
floor,
year_built,
voivodeship: locParts.voivodeship,
city: locParts.city,
district: locParts.district,
street: locParts.street,

});

  });

  return rows.slice(0, limit);
}

function parseOtodomListingFromNextData(pageUrl: string, html: string): ExternalRow[] {
  const next = extractNextData(html);
  if (!next?.props?.pageProps) return [];

  const p = next.props.pageProps;
  const now = new Date().toISOString();

  const title = cleanTitle(p.pageTitle || p.pageHeading || null);

  const priceAmount =
    optNumber(p.transaction?.price?.amount) ??
    optNumber(p.transaction?.totalPrice?.amount) ??
    null;

  const currency =
    p.transaction?.price?.currency ??
    p.transaction?.totalPrice?.currency ??
    null;

  const area_m2 =
    optNumber(p.estate?.area) ??
    optNumber(p.estate?.areaM2) ??
    null;

  const rooms =
    optNumber(p.estate?.rooms) != null
      ? Math.round(optNumber(p.estate?.rooms)!)
      : null;

  const price_per_m2 =
    optNumber(p.transaction?.pricePerM2) ??
    null;

  const locationText = [
    p.location?.city,
    p.location?.district,
    p.location?.street,
  ].filter(Boolean).join(", ") || null;

  const img =
    p.data?.images?.[0]?.url ??
    p.estate?.images?.[0]?.url ??
    null;

  const canonical =
    p.canonicalURL
      ? normalizeOtodomUrl(p.canonicalURL)
      : normalizeOtodomUrl(pageUrl);

  // HARD FILTER – prawdziwa oferta musi mieć cokolwiek merytorycznego
  if (!title && !priceAmount && !area_m2 && !rooms) return [];

  return [{
    external_id: canonical,
    office_id: null,
    source: "otodom",
    source_url: canonical,

    title,
    price_amount: priceAmount,
    currency,
    location_text: locationText,

    status: "preview",
    imported_at: now,
    updated_at: now,

    thumb_url: img ? absUrl(pageUrl, img) : null,

    area_m2,
    rooms,
    price_per_m2,
  }];
}

function parseOtodomListing(pageUrl: string, html: string): ExternalRow[] {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();

  const canonical = $('link[rel="canonical"]').attr("href") || pageUrl;
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() || null;
  const metaTitle = $("title").text()?.trim() || null;
  const title = ogTitle || metaTitle;

  const ogImage = $('meta[property="og:image"]').attr("content")?.trim() || null;
  const desc = $('meta[name="description"]').attr("content")?.trim() || "";

  const priceAmount = parseNumberLoose(desc) ?? parseNumberLoose(title ?? "");
  const currency =
    desc.toLowerCase().includes("zł") || (title ?? "").toLowerCase().includes("zł") ? "PLN" :
    desc.includes("€") || (title ?? "").includes("€") ? "EUR" :
    null;

  const locMatch =
    desc.match(/w miejscowości\s+([^,]+),\s*([^,]+),\s*([^,]+),\s*za cenę/i) ||
    desc.match(/w miejscowości\s+([^,]+),\s*([^,]+),\s*za cenę/i);

  const locationText = locMatch
    ? locMatch.slice(1).filter(Boolean).join(", ").trim()
    : null;

  return [{
    external_id: canonical,
    office_id: null,
    source: "otodom",
    source_url: canonical,
    title: title || null,
    price_amount: priceAmount,
    currency,
    location_text: locationText,
    status: "preview",
    imported_at: now,
    updated_at: now,
    thumb_url: ogImage,
  }];
}

function parseOlxResults(pageUrl: string, html: string, limit: number): ExternalRow[] {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  const rows: ExternalRow[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const full = absUrl(pageUrl, href);
    if (!full) return;
    if (!full.includes("/d/oferta/")) return;
    if (seen.has(full)) return;
    seen.add(full);

    const card = $(el).closest("article, div").first();

    const title =
      card.find("h2, h3").first().text().trim() ||
      $(el).attr("aria-label")?.trim() ||
      $(el).attr("title")?.trim() ||
      null;

    const priceText =
      card.find('[data-testid="ad-price"], [class*="price"]').first().text().trim() || null;

    const transaction_type = inferTransactionTypeFromPriceText(priceText);

    const locationText =
      card.find('[data-testid="location-date"], [class*="location"]').first().text().trim() || null;

    const img =
      card.find("img").first().attr("src") ||
      card.find("img").first().attr("data-src") ||
      null;

    const currency =
      priceText?.includes("€") ? "EUR" :
      priceText?.toLowerCase().includes("zł") ? "PLN" :
      null;

    const priceAmount = parseNumberLoose(priceText);

    rows.push({
      external_id: full,
      office_id: null,
      source: "olx",
      source_url: full,
      title: title || null,
      price_amount: priceAmount ?? null,
      currency,
      location_text: locationText || null,
      status: "preview",
      imported_at: now,
      updated_at: now,
      thumb_url: img ? absUrl(pageUrl, img) : null,

      // ALIASES dla tabeli (MVP)
      created_at: now,
      transaction_type,
      price: priceAmount ?? null,
    });
  });

  return rows.slice(0, limit);
}

/* -------------------- fetch -------------------- */
async function fetchHtmlWithFinalUrl(url: string): Promise<{ html: string; finalUrl: string }> {
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

  console.log("everybot fetch:", { requested: url, status: r.status, finalUrl: r.url });

  const html = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`FETCH_FAILED ${r.status} ${r.statusText} ${html.slice(0, 200)}`);

  return { html, finalUrl: r.url };
}



/* -------------------- builders -------------------- */
function buildOtodomSearchUrl(q: string): string {
  const u = new URL("https://www.otodom.pl/pl/wyniki");
  u.searchParams.set("viewType", "listing");
  if (q) u.searchParams.set("search[phrase]", q);
  return u.toString();
}

function buildOlxSearchUrl(q: string): string {
  const slug = encodeURIComponent(q.trim().replace(/\s+/g, "-"));
  return `https://www.olx.pl/oferty/q-${slug}/`;
}

function withPage(url: string, page: number) {
  const u = new URL(url);

  if (page > 1) {
    u.searchParams.set("page", String(page));

  } else {
    u.searchParams.delete("page");
  }

  return u.toString();
}
function stripPageParam(u: string) {
  const x = new URL(u);
  x.searchParams.delete("page");
  return x.toString();
}

function hasNextFromNextData(html: string, currentPage: number): boolean | null {
  const next = extractNextData(html);
  if (!next) return null;

  // szukamy totalPages w JSON
  try {
    const s = JSON.stringify(next);
    const tp = s.match(/"totalPages"\s*:\s*(\d+)/i) || s.match(/"total_pages"\s*:\s*(\d+)/i);
    if (tp) {
      const totalPages = Number(tp[1]);
      if (Number.isFinite(totalPages)) return totalPages > currentPage;
    }
  } catch {}

  return null;
}


function hasNextPage(html: string, currentPage: number): boolean {
  const byNext = hasNextFromNextData(html, currentPage);
  if (byNext !== null) return byNext;

  const $ = cheerio.load(html);

  const relNext = $('link[rel="next"]').attr("href") || $('a[rel="next"]').attr("href");
  if (relNext) return true;

  const ariaNext = $('a[aria-label*="Następ"], button[aria-label*="Następ"]').length > 0;
  if (ariaNext) return true;

  const textNext = $("a,button").filter((_, el) => (($(el).text() || "").toLowerCase().includes("następ"))).length > 0;
  if (textNext) return true;

  return false;
}
function getOtodomNextUrlFromNextData(pageUrl: string, html: string): string | null {
  const next = extractNextData(html);
  const data = next?.props?.pageProps?.data;
  if (!data) return null;

  const raw =
    data.nextUrl ||
    data.links?.next ||
    data.pagination?.nextUrl ||
    data.pagination?.links?.next ||
    null;

  const full = typeof raw === "string" ? absUrl(pageUrl, raw) : null;
  return full ? normalizeOtodomUrl(full) : null;
}


/* -------------------- handler -------------------- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

    res.setHeader("Cache-Control", "no-store");
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

    const limitRaw =
      req.method === "GET"
        ? (typeof req.query.limit === "string" ? Number(req.query.limit) : 50)
        : (optNumber((req.body ?? {}).limit) ?? 50);

    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);

    const body = req.method === "POST" ? (req.body ?? {}) : {};
    const urlFromGet = req.method === "GET" ? optString(req.query.url) : null;
    const urlFromPost = req.method === "POST" ? optString(body.url) : null;
    const q = req.method === "POST" ? optString(body.q) : null;

    const sourceParam =
      req.method === "POST" ? (optString(body.source) ?? "otodom") : null;
    const sourceWanted = (sourceParam ?? "otodom").toLowerCase();

    const cursor =
  req.method === "POST" ? optString(body.cursor) : optString(req.query.cursor);
    const baseUrl =
  urlFromPost ||
  urlFromGet ||
  (q
    ? (sourceWanted === "olx"
        ? buildOlxSearchUrl(q)
        : buildOtodomSearchUrl(q))
    : buildOtodomSearchUrl(""));

if (!baseUrl || !isHttpUrl(baseUrl)) {
  return res.status(400).json({ error: "Invalid or missing url/q" });
}

// cursor może być URL albo numerem
const page = cursor && isHttpUrl(cursor) ? 1 : Math.max(1, Number(cursor ?? "1") || 1);

const url =
  cursor && isHttpUrl(cursor)
    ? cursor
    : withPage(baseUrl, page);


    console.log("everybot request:", { baseUrl, page, url });

    const detected = detectSource(url);
    if (detected === "other") {
      return res.status(400).json({ error: "Unsupported source url" });
    }

// ile stron pobrać w jednym wywołaniu (MVP: 3)
const pagesRaw =
  req.method === "POST" ? optNumber((req.body ?? {}).pages) : optNumber(req.query.pages);
const pages = Math.min(Math.max(pagesRaw ?? 1, 1), 5);

// cursor może być URL albo numerem (start page)
const cursorRaw = req.method === "POST" ? optString(body.cursor) : optString(req.query.cursor);
const startPage = cursorRaw && isHttpUrl(cursorRaw) ? 1 : Math.max(1, Number(cursorRaw ?? "1") || 1);

// Zawsze zaczynamy od strony startPage, ale bazę do paginacji bierzemy z finalUrl po redirect
let canonicalBaseUrl: string | null = null;

let allRows: ExternalRow[] = [];
let upserted = 0;

// ✅ trzymamy ostatnią faktycznie pobraną stronę
let lastFetchedPage = startPage - 1;

for (let pageNo = startPage; pageNo < startPage + pages; pageNo++) {

  const pageUrl = canonicalBaseUrl
    ? withPage(canonicalBaseUrl, pageNo)
    : withPage(baseUrl, pageNo);

  console.log("everybot request:", { baseUrl, page: pageNo, url: pageUrl });

  const detected = detectSource(pageUrl);
  if (detected === "other") {
    return res.status(400).json({ error: "Unsupported source url" });
  }

 const { html, finalUrl } = await fetchHtmlWithFinalUrl(pageUrl);

// ✅ ta strona została realnie pobrana
lastFetchedPage = pageNo;

// po pierwszym fetchu ustawiamy kanoniczny baseUrl do dalszych stron
if (!canonicalBaseUrl) {
  canonicalBaseUrl = stripPageParam(finalUrl);
}

  // DEBUG – paginacja
  const next = extractNextData(html);
  const s = next ? JSON.stringify(next) : "";
  const cp = s.match(/"currentPage"\s*:\s*(\d+)/i)?.[1] ?? null;
  const tp = s.match(/"totalPages"\s*:\s*(\d+)/i)?.[1] ?? null;

  console.log("otodom pagination:", {
    requestedPage: pageNo,
    currentPage: cp,
    totalPages: tp,
  });

  // DEBUG – struktura danych wyników Otodom
  const nd = extractNextData(html);
  console.log("otodom data keys:", Object.keys(nd?.props?.pageProps?.data ?? {}));

  let rows: ExternalRow[] = [];

  if (detected === "otodom") {
    if (finalUrl.toLowerCase().includes("/pl/oferta/")) {
      const fromNext = parseOtodomListingFromNextData(finalUrl, html);
      rows = fromNext.length ? fromNext : parseOtodomListing(finalUrl, html);
    } else {
      const fromNext = parseOtodomResultsFromNextData(finalUrl, html, limit);
      rows = fromNext.rows.length ? fromNext.rows : parseOtodomResults(finalUrl, html, limit);
    }
  } else if (detected === "olx") {
    rows = parseOlxResults(finalUrl, html, limit);
  }

  // UPSERT do DB
  for (const r of rows) {
    if (!r.source || !r.source_url) continue;
    if (!r.title || !String(r.title).trim()) continue; // ✅ usuwa śmieci

    const sourceListingId = toSourceListingId(r);

    await pool.query(
      `
      INSERT INTO external_listings (
        office_id,
        source,
        source_listing_id,
        source_url,
        title,
        description,
        price_amount,
        currency,
        location_text,
        status,

        thumb_url,
        matched_at,
        transaction_type,
        property_type,
        area_m2,
        price_per_m2,
        rooms,
        floor,
        year_built,
        voivodeship,
        city,
        district,
        street,
        owner_phone,

        last_seen_at,
        source_status,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
        now(),'active', now()
      )
      ON CONFLICT (office_id, source, source_listing_id)
      DO UPDATE SET
        source_url = EXCLUDED.source_url,
        title = EXCLUDED.title,
        price_amount = EXCLUDED.price_amount,
        currency = EXCLUDED.currency,
        location_text = EXCLUDED.location_text,
        status = EXCLUDED.status,

        thumb_url = COALESCE(EXCLUDED.thumb_url, external_listings.thumb_url),
        matched_at = COALESCE(external_listings.matched_at, EXCLUDED.matched_at),
        transaction_type = COALESCE(EXCLUDED.transaction_type, external_listings.transaction_type),
        property_type = COALESCE(EXCLUDED.property_type, external_listings.property_type),

        area_m2 = COALESCE(EXCLUDED.area_m2, external_listings.area_m2),
        price_per_m2 = COALESCE(EXCLUDED.price_per_m2, external_listings.price_per_m2),
        rooms = COALESCE(EXCLUDED.rooms, external_listings.rooms),
        floor = COALESCE(EXCLUDED.floor, external_listings.floor),
        year_built = COALESCE(EXCLUDED.year_built, external_listings.year_built),

        voivodeship = COALESCE(EXCLUDED.voivodeship, external_listings.voivodeship),
        city = COALESCE(EXCLUDED.city, external_listings.city),
        district = COALESCE(EXCLUDED.district, external_listings.district),
        street = COALESCE(EXCLUDED.street, external_listings.street),
        owner_phone = COALESCE(EXCLUDED.owner_phone, external_listings.owner_phone),

        last_seen_at = now(),
        source_status = 'active',
        updated_at = now()
      `,
      [
        officeId,
        r.source,
        sourceListingId,
        r.source_url,
        r.title ?? null,
        null,
        typeof r.price_amount === "number" ? r.price_amount : r.price_amount ? Number(r.price_amount) : null,
        r.currency ?? null,
        r.location_text ?? null,
        r.status ?? "preview",

        r.thumb_url ?? null,
        r.matched_at ?? null,
        r.transaction_type ?? null,
        r.property_type ?? null,
        r.area_m2 ?? null,
        r.price_per_m2 ?? null,
        r.rooms ?? null,
        r.floor ?? null,
        r.year_built ?? null,
        r.voivodeship ?? null,
        r.city ?? null,
        r.district ?? null,
        r.street ?? null,
        r.owner_phone ?? null,
      ]
    );

    upserted += 1;
  }

  allRows = allRows.concat(rows);

  // Jeśli nie ma następnej strony, kończymy pętlę wcześniej
  if (detected === "otodom" && !finalUrl.toLowerCase().includes("/pl/oferta/")) {
    const byNextData = hasNextFromNextData(html, pageNo);
    const hasNext = byNextData !== null ? byNextData : hasNextPage(html, pageNo);
    if (!hasNext) break;
  }
}

// nextCursor = następna strona po ostatnio REALNIE pobranej
// (pętla mogła się przerwać wcześniej przez break)
const nextCursor = String(lastFetchedPage + 1);

const pagesFetched = Math.max(0, lastFetchedPage - startPage + 1);

return res.status(200).json({
  rows: allRows.slice(0, limit), // UI może pokazać tylko 50 – OK
  nextCursor,
  upserted,
  pagesFetched,                  // ✅ realnie pobrane strony (a nie "pages" z requestu)
  totalRowsParsed: allRows.length, // ✅ ile łącznie sparsowałeś z N stron
  canonicalBaseUrl,
});

  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
