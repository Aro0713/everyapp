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

type SourceKey = "otodom" | "olx" | "morizon" | "gratka" | "odwlasciciela";
type DetectedSource = SourceKey | "other";

function detectSource(url: string): DetectedSource {
  const u = url.toLowerCase();
  if (u.includes("otodom.")) return "otodom";
  if (u.includes("olx.")) return "olx";
  if (u.includes("morizon.")) return "morizon";
  if (u.includes("gratka.")) return "gratka";
  if (u.includes("odwlasciciela.")) return "odwlasciciela";
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
  description?: string | null;
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

  const raw = locationText.replace(/\s+/g, " ").trim();
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);

  const last = parts.length ? parts[parts.length - 1] : null;
  const looksLikeVoiv = last ? /^[a-ząćęłńóśźż-]{4,}$/i.test(last) && !last.toLowerCase().startsWith("ul") : false;

  const voivodeship = looksLikeVoiv ? last! : null;

  const city =
    parts.length >= 2
      ? (looksLikeVoiv ? parts[parts.length - 2] : parts[parts.length - 1])
      : parts[0] ?? null;

  const district =
    looksLikeVoiv && parts.length >= 3 ? parts[parts.length - 3] :
    !looksLikeVoiv && parts.length >= 2 ? parts[parts.length - 2] :
    null;

  const cut = looksLikeVoiv ? parts.length - 3 : parts.length - 2;
  const street = cut > 0 ? parts.slice(0, cut).join(", ") : null;

  return {
    voivodeship,
    city: city || null,
    district: district || null,
    street: street || null,
  };
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

function inferPropertyTypeFromText(s: string | null): string | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("mieszkan")) return "apartment";
  if (t.includes("dom")) return "house";
  if (t.includes("działk")) return "plot";
  if (t.includes("lokal") || t.includes("biur")) return "commercial";
  return null;
}

/* -------------------- parsers (OTODOM) -------------------- */
function parseOtodomResultsFromNextData(
  pageUrl: string,
  html: string,
  limit: number
): { rows: ExternalRow[]; hasNext: boolean | null } {
  const next = extractNextData(html);
  if (!next) return { rows: [], hasNext: null };

  const now = new Date().toISOString();
  const p = next?.props?.pageProps;
  const adsItems = p?.data?.searchAds?.items;

  if (Array.isArray(adsItems) && adsItems.length) {
    const rows: ExternalRow[] = [];
    const seen = new Set<string>();

    for (const ad of adsItems) {
      const href = firstString(ad?.href);
      const slug = firstString(ad?.slug);
      const rawUrl =
        href && typeof href === "string"
          ? href.replace("[lang]", "pl")
          : slug
          ? `/pl/oferta/${slug}`
          : null;

      const full = rawUrl ? absUrl("https://www.otodom.pl/", rawUrl) : null;
      if (!full) continue;

      const norm = normalizeOtodomUrl(full);
      if (!norm.includes("/oferta/")) continue;
      if (seen.has(norm)) continue;
      seen.add(norm);

      const title =
        cleanTitle(firstString(ad?.title, ad?.name, ad?.heading)) ??
        cleanTitle(pickAnyStringByKeys(ad, ["title", "name", "heading", "subtitle", "slug", "shortDescription"])) ??
        null;

      const finalTitle = title ?? cleanTitle(firstString(ad?.slug)) ?? "Oferta z Otodom";

      const priceAmount =
        optNumber(ad?.totalPrice?.value) ??
        optNumber(ad?.totalPrice?.amount) ??
        optNumber(ad?.price?.value) ??
        optNumber(ad?.price?.amount) ??
        null;

      const currency =
        firstString(ad?.totalPrice?.currency, ad?.price?.currency) ?? null;

      const area_m2 = optNumber(ad?.areaInSquareMeters) ?? null;

      const rooms =
        typeof ad?.roomsNumber === "string"
          ? mapRoomsEnum(ad.roomsNumber)
          : optNumber(ad?.rooms) != null
          ? Math.round(optNumber(ad?.rooms)!)
          : null;

      const price_per_m2 = optNumber(ad?.pricePerSquareMeter?.value) ?? null;

      const addr = ad?.location?.address;
      const city = optString(addr?.city?.name) ?? null;
      const voivodeship = optString(addr?.province?.name) ?? null;
      const streetName = optString(addr?.street?.name) ?? null;
      const streetNo = optString(addr?.street?.number) ?? null;
      const street = [streetName, streetNo].filter(Boolean).join(" ") || null;

      const location_text = [street, city, voivodeship].filter(Boolean).join(", ") || null;

      const img =
        optString(ad?.images?.[0]?.medium) ??
        optString(ad?.images?.[0]?.large) ??
        null;

      rows.push({
        external_id: norm,
        office_id: null,
        source: "otodom",
        source_url: norm,
        title: finalTitle,
        description: firstString(ad?.shortDescription, ad?.description) ?? null,
        price_amount: priceAmount,
        currency,
        location_text,
        status: "preview",
        imported_at: now,
        updated_at: now,
        thumb_url: img,
        area_m2,
        rooms,
        price_per_m2,
        created_at: now,
        matched_at: optString(ad?.dateCreated) ?? now,
        transaction_type: normalizeTx(ad?.transaction) ?? null,
        property_type: optString(ad?.estate) ?? null,
        voivodeship,
        city,
        street,
        district: null,
      });

      if (rows.length >= limit) break;
    }

    return { rows, hasNext: null };
  }

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

    const hasLoc =
      typeof (o as any).location === "string" ||
      typeof (o as any).address === "string" ||
      typeof (o as any).city === "string" ||
      typeof (o as any).region === "string" ||
      typeof (o as any).district === "string";

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
    if (!norm.includes("/oferta/")) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);

    const rawTitle = firstString((o as any).title, (o as any).name, (o as any).heading);
    const title = cleanTitle(rawTitle);

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

    const img = firstString(
      (o as any).thumbnail,
      (o as any).thumb,
      (o as any).image,
      (o as any).coverImage,
      (o as any).images?.[0]?.url,
      (o as any).photos?.[0]?.url
    );

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
function normalizeTx(v: unknown): "sale" | "rent" | null {
  const s = typeof v === "string" ? v.toUpperCase() : "";
  if (s === "SELL") return "sale";
  if (s === "RENT") return "rent";
  return null;
}
function mapRoomsEnum(v: string): number | null {
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

function normalizeOtodomUrl(u: string): string {
  let out = u.replace("://www.otodom.pl/hpr/", "://www.otodom.pl/");

  try {
    const url = new URL(out);

    if (url.hostname.includes("otodom.")) {
      if (url.pathname.startsWith("/wyniki")) {
        url.pathname = "/pl" + url.pathname;
      }
      if (url.pathname.startsWith("/oferta/")) {
        url.pathname = "/pl" + url.pathname;
      }
    }

    out = url.toString();
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

    let title = cleanTitle(rawTitle);
    if (!title) {
      const cardTextForTitle = card.text().replace(/\s+/g, " ").trim();
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

    const priceAmountRaw = parseNumberLoose(priceText);
    const priceAmount =
      priceAmountRaw != null &&
      priceAmountRaw > 0 &&
      priceAmountRaw <= 100_000_000
        ? priceAmountRaw
        : null;
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

      area_m2: area_m2 ?? null,
      rooms: rooms ?? null,
      price_per_m2: price_per_m2 ?? null,

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
    if (!full.includes("/nieruchomosci/") || !full.includes("/d/oferta/")) return;

    let canon = full;
    try {
      const u = new URL(full);
      u.search = "";
      canon = u.toString();
    } catch {}

    if (seen.has(canon)) return;
    seen.add(canon);

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

    const priceAmountRaw = parseNumberLoose(priceText);
    const priceAmount =
      priceAmountRaw != null && priceAmountRaw > 0 && priceAmountRaw <= 100_000_000
        ? priceAmountRaw
        : null;

    rows.push({
      external_id: canon,
      office_id: null,
      source: "olx",
      source_url: canon,
      title: title || null,
      price_amount: priceAmount ?? null,
      currency,
      location_text: locationText || null,
      status: "preview",
      imported_at: now,
      updated_at: now,
      thumb_url: img ? absUrl(pageUrl, img) : null,

      created_at: now,
      transaction_type,
      price: priceAmount ?? null,
    });
  });

  return rows.slice(0, limit);
}

/* -------------------- NEW SOURCES: safe stubs (NO GUESSING) -------------------- */
/**
 * Celowo nie zgadujemy selektorów ani URL patternów dla Morizon/Gratka/OdWłaściciela.
 * Dopóki nie mamy:
 * - 1 przykładowego URL wyszukiwania na portal
 * - 1 przykładowego HTML (lub przynajmniej 2-3 przykładowe linki ofert)
 * zwracamy [] żeby nie zaśmiecić DB i nie rozwalić pipeline.
 */
function normalizeMorizonUrl(u: string): string {
  try {
    const x = new URL(u);
    // wywal tracking
    x.searchParams.delete("utm_source");
    x.searchParams.delete("utm_medium");
    x.searchParams.delete("utm_campaign");
    x.searchParams.delete("utm_adgroup");
    x.searchParams.delete("utm_term");
    x.searchParams.delete("utm_placement");
    x.searchParams.delete("utm_content");
    x.searchParams.delete("msclkid");
    x.hash = "";
    return x.toString();
  } catch {
    return u;
  }
}

// ✅ twardy wzorzec oferty (na podstawie dostarczonego przykładu)
function isMorizonOfferUrl(u: string): boolean {
  const s = (u ?? "").toLowerCase();
  if (!s.includes("morizon.pl/oferta/")) return false;
  // typowy identyfikator w slugu: mzn2022173139
  if (!/[-_]mzn\d{6,}$/i.test(s.replace(/\.html$/i, ""))) return false;
  return true;
}
function parseMorizonLocation(locationText: string | null) {
  const raw = (locationText ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return { city: null, district: null };

  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);

  if (parts.length === 1) {
    return { city: parts[0], district: null };
  }

  return {
    city: parts[parts.length - 1],
    district: parts.slice(0, -1).join(", "),
  };
}
function parseMorizonResults(pageUrl: string, html: string, limit: number): ExternalRow[] {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  const rows: ExternalRow[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const full = absUrl(pageUrl, href);
    if (!full) return;

    const canon = normalizeMorizonUrl(full);
    if (!isMorizonOfferUrl(canon)) return;

    if (seen.has(canon)) return;
    seen.add(canon);

    const card = $(el).closest("article, .offer, .item, li, div").first();
    const cardText = card.text().replace(/\s+/g, " ").trim();

    // tytuł (konserwatywnie)
    let title =
      cleanTitle(
        card.find("h1,h2,h3,[class*='title']").first().text().trim() ||
        $(el).attr("aria-label")?.trim() ||
        $(el).attr("title")?.trim() ||
        $(el).text().trim() ||
        null
      ) ?? null;

    if (!title && cardText) title = cleanTitle(cardText.slice(0, 140));

    // cena (konserwatywnie: PLN/€)
    const priceText =
      card.find("[class*='price'], .price, [data-testid*='price']").first().text().trim() ||
      (cardText.match(/(\d[\d\s.,]+)\s*(PLN|zł|€)/i)?.[0] ?? null);

    const priceAmountRaw = parseNumberLoose(priceText);
    const priceAmount =
      priceAmountRaw != null && priceAmountRaw > 0 && priceAmountRaw <= 100_000_000
        ? priceAmountRaw
        : null;
    const currency =
      priceText?.includes("€") ? "EUR" :
      (priceText?.toLowerCase().includes("zł") || priceText?.toUpperCase().includes("PLN")) ? "PLN" :
      null;

    // lokalizacja / metry / pokoje z tekstu karty (nie zgadujemy selektorów)
    const locationText =
      card.find("[class*='location'], .location, [data-testid*='location']").first().text().trim() ||
      null;

    const area_m2 = parseNumberLoose(
      cardText.match(/(\d+(?:[.,]\d+)?)\s*m2\b/i)?.[0] ||
      cardText.match(/(\d+(?:[.,]\d+)?)\s*m²\b/i)?.[0]
    );
    const roomsRaw = parseNumberLoose(cardText.match(/(\d+(?:[.,]\d+)?)\s*pok/i)?.[0]);
    const rooms = roomsRaw != null ? Math.round(roomsRaw) : null;

    const ml = parseMorizonLocation(locationText);

    rows.push({
      external_id: canon,
      office_id: null,
      source: "morizon",
      source_url: canon,
      title: title || null,
      description: null,
      price_amount: priceAmount ?? null,
      currency,
      location_text: locationText || null,
      status: "preview",
      imported_at: now,
      updated_at: now,
      thumb_url: null,

      created_at: now,
      matched_at: now,

      // nie zgadujemy transakcji/property_type z listy — zostawiamy null
      transaction_type: null,
      property_type: null,

      area_m2: area_m2 ?? null,
      rooms: rooms ?? null,
      price_per_m2: null,

      city: ml.city,
      district: ml.district,
      voivodeship: null,
      street: null,
    });

    if (rows.length >= limit) return false;
  });

  return rows.slice(0, limit);
}
function normalizeGratkaUrl(u: string): string {
  try {
    const x = new URL(u);
    // wywal tracking
    x.searchParams.delete("utm_source");
    x.searchParams.delete("utm_medium");
    x.searchParams.delete("utm_campaign");
    x.searchParams.delete("utm_adgroup");
    x.searchParams.delete("utm_term");
    x.searchParams.delete("utm_placement");
    x.searchParams.delete("utm_content");
    x.searchParams.delete("msclkid");
    x.hash = "";
    return x.toString();
  } catch {
    return u;
  }
}

// ✅ twardy wzorzec oferty Gratka: .../ob/<ID>
function isGratkaOfferUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (!x.hostname.includes("gratka.")) return false;
    const p = x.pathname.toLowerCase();
    if (!p.includes("/nieruchomosci/")) return false;
    if (!/\/ob\/\d+$/i.test(p)) return false;
    return true;
  } catch {
    const s = (u ?? "").toLowerCase();
    return s.includes("gratka.") && s.includes("/nieruchomosci/") && /\/ob\/\d+$/i.test(s);
  }
}
function parseGratkaLocation(locationText: string | null) {
  const raw = (locationText ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return { city: null as string | null, district: null as string | null, voivodeship: null as string | null };

  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);

  // Gratka najczęściej: "Dzielnica, Miasto" albo "Ulica, Dzielnica, Miasto"
  if (parts.length === 1) return { city: parts[0], district: null, voivodeship: null };

  return {
    city: parts[parts.length - 1],
    district: parts.slice(0, -1).join(", "),
    voivodeship: null,
  };
}
function parseGratkaResults(pageUrl: string, html: string, limit: number): ExternalRow[] {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  const rows: ExternalRow[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const full = absUrl(pageUrl, href);
    if (!full) return;

    const canon = normalizeGratkaUrl(full);
    if (!isGratkaOfferUrl(canon)) return;

    if (seen.has(canon)) return;
    seen.add(canon);

    const card = $(el).closest("article, .listing, .item, li, div").first();
    const cardText = card.text().replace(/\s+/g, " ").trim();

    // tytuł
    let title =
      cleanTitle(
        card.find("h1,h2,h3,[class*='title']").first().text().trim() ||
        $(el).attr("aria-label")?.trim() ||
        $(el).attr("title")?.trim() ||
        $(el).text().trim() ||
        null
      ) ?? null;

    if (!title && cardText) title = cleanTitle(cardText.slice(0, 140));

    // cena
    const priceText =
      card.find("[class*='price'], .price, [data-testid*='price']").first().text().trim() ||
      (cardText.match(/(\d[\d\s.,]+)\s*(PLN|zł|€)/i)?.[0] ?? null);

    const priceAmountRaw = parseNumberLoose(priceText);
    const priceAmount =
      priceAmountRaw != null &&
      priceAmountRaw > 0 &&
      priceAmountRaw <= 100_000_000
        ? priceAmountRaw
        : null;
    const currency =
      priceText?.includes("€") ? "EUR" :
      (priceText?.toLowerCase().includes("zł") || priceText?.toUpperCase().includes("PLN")) ? "PLN" :
      null;

    // lokalizacja (konserwatywnie)
    const locationText =
      card.find("[class*='location'], .location, [data-testid*='location']").first().text().trim() ||
      null;

    const area_m2 = parseNumberLoose(
      cardText.match(/(\d+(?:[.,]\d+)?)\s*m2\b/i)?.[0] ||
      cardText.match(/(\d+(?:[.,]\d+)?)\s*m²\b/i)?.[0]
    );
    const roomsRaw = parseNumberLoose(cardText.match(/(\d+(?:[.,]\d+)?)\s*pok/i)?.[0]);
    const rooms = roomsRaw != null ? Math.round(roomsRaw) : null;

    const gl = parseGratkaLocation(locationText);

    // transakcja i typ z URL (bez zgadywania selektorów)
    const low = canon.toLowerCase();
    const tx: "sale" | "rent" | null =
      low.includes("wynaj") ? "rent" :
      low.includes("sprzed") ? "sale" :
      null;

    const pt: string | null =
      low.includes("/mieszkanie") || low.includes("/mieszkania") ? "apartment" :
      low.includes("/dom") || low.includes("/domy") ? "house" :
      low.includes("/dzialk") || low.includes("/działk") ? "plot" :
      low.includes("/komerc") || low.includes("/lokal") ? "commercial" :
      null;

    rows.push({
      external_id: canon,
      office_id: null,
      source: "gratka",
      source_url: canon,
      title: title || null,
      description: null,
      price_amount: priceAmount ?? null,
      currency,
      location_text: locationText || null,
      status: "preview",
      imported_at: now,
      updated_at: now,
      thumb_url: null,

      created_at: now,
      matched_at: now,

      transaction_type: tx,
      property_type: pt,

      area_m2: area_m2 ?? null,
      rooms: rooms ?? null,
      price_per_m2: null,

      voivodeship: gl.voivodeship,
      city: gl.city,
      district: gl.district,
      street: null,
    });

    if (rows.length >= limit) return false;
  });

  return rows.slice(0, limit);
}
function normalizeOdwlasciCielaUrl(u: string): string {
  try {
    const x = new URL(u);
    x.search = ""; // wywal tracking
    return x.toString();
  } catch {
    return u;
  }
}

function inferTxFromOdwlasciCielaUrlOrText(url: string, text: string | null): "sale" | "rent" | null {
  const u = (url ?? "").toLowerCase();
  const t = (text ?? "").toLowerCase();
  if (u.includes("wynaj") || t.includes("wynaj") || t.includes("najem")) return "rent";
  if (u.includes("sprzed") || t.includes("sprzed")) return "sale";
  return null;
}

function inferPropertyTypeFromOdwlasciCielaUrlOrText(url: string, text: string | null): string | null {
  const u = (url ?? "").toLowerCase();
  const t = (text ?? "").toLowerCase();
  if (u.includes("mieszkan") || t.includes("mieszkan")) return "apartment";
  if (u.includes("dom") || t.includes("dom")) return "house";
  if (u.includes("dzialk") || u.includes("działk") || t.includes("działk") || t.includes("dzialk")) return "plot";
  if (u.includes("lokal") || t.includes("lokal") || t.includes("biur")) return "commercial";
  return null;
}

function parseOdwlasciCielaResults(pageUrl: string, html: string, limit: number): ExternalRow[] {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  const rows: ExternalRow[] = [];
  const seen = new Set<string>();

  const cleanLoc = (s: string | null) =>
    (s ?? "")
      .replace(/\s+/g, " ")
      .replace(/super oferta/gi, "")
      .trim() || null;

  const parseAreaM2Strict = (text: string): number | null => {
    // preferuj dokładne "xx m2/m²"
    const m =
      text.match(/\b(\d{1,4}(?:[.,]\d{1,2})?)\s*m2\b/i) ||
      text.match(/\b(\d{1,4}(?:[.,]\d{1,2})?)\s*m²\b/i);

    if (!m?.[1]) return null;

    const n = Number(m[1].replace(",", "."));
    if (!Number.isFinite(n)) return null;

    // sanity: mieszkania/biura/domy (nie wyklucza działek, ale odcina błędy x10/x100)
    if (n < 10 || n > 20000) return null;

    return n;
  };

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const full = absUrl(pageUrl, href);
    if (!full) return;

    // ✅ twardy filtr: tylko oferty
    // przykład: https://odwlasciciela.pl/oferty/podglad/40237,mieszkanie-sprzedam.html
    const low = full.toLowerCase();
    if (!low.includes("odwlasciciela.pl/oferty/podglad/")) return;
    if (!low.endsWith(".html")) return;

    const canon = normalizeOdwlasciCielaUrl(full);
    if (seen.has(canon)) return;
    seen.add(canon);

    const card = $(el).closest("article, .offer, .item, li, div").first();
    const cardText = card.text().replace(/\s+/g, " ").trim();

    // tytuł
    let title =
      cleanTitle(
        card.find("h1,h2,h3,.title,[class*='title']").first().text().trim() ||
          $(el).attr("aria-label")?.trim() ||
          $(el).attr("title")?.trim() ||
          $(el).text().trim() ||
          null
      ) ?? null;

    if (!title && cardText) title = cleanTitle(cardText.slice(0, 140));

    // cena
    const priceText =
      card.find("[class*='price'], .price, [data-testid*='price']").first().text().trim() ||
      (cardText.match(/(\d[\d\s.,]+)\s*(PLN|zł|€)/i)?.[0] ?? null);

    const priceAmountRaw = parseNumberLoose(priceText);
    const priceAmount =
      priceAmountRaw != null && priceAmountRaw > 0 && priceAmountRaw <= 100_000_000
        ? priceAmountRaw
        : null;

    const currency =
      priceText?.includes("€") ? "EUR" :
      (priceText?.toLowerCase().includes("zł") || priceText?.toUpperCase().includes("PLN")) ? "PLN" :
      null;

    // lokalizacja (czyścimy śmieci typu "Super oferta" i nowe linie)
    const locationTextRaw =
      card.find("[class*='location'], .location, [data-testid*='location']").first().text().trim() ||
      null;

    const locationText = cleanLoc(locationTextRaw);

    // metraż / pokoje (z tekstu karty)
    const area_m2 = parseAreaM2Strict(cardText);
    const roomsRaw = parseNumberLoose(cardText.match(/(\d+(?:[.,]\d+)?)\s*pok/i)?.[0]);
    const rooms = roomsRaw != null ? Math.round(roomsRaw) : null;

    const ppm2Raw = parseNumberLoose(
      cardText.match(/(\d[\d\s.,]+)\s*(PLN|zł)\/m2/i)?.[0] ||
      cardText.match(/(\d[\d\s.,]+)\s*(PLN|zł)\/m²/i)?.[0]
    );
    const price_per_m2 =
      ppm2Raw != null && ppm2Raw > 0 && ppm2Raw <= 500_000 ? ppm2Raw : null;

    const tx =
      inferTxFromOdwlasciCielaUrlOrText(canon, cardText) ??
      inferTransactionTypeFromPriceText(priceText);

    const pt =
      inferPropertyTypeFromOdwlasciCielaUrlOrText(canon, cardText) ??
      inferPropertyTypeFromText(cardText);

    // ✅ OdWłaściciela: locationText często jest w formie "Miasto [dzielnica], Ulica..."
    // Nie próbujemy robić "województwa" — to w tej liście nie jest stabilne.
    const locParts = (() => {
      const raw = (locationText ?? "").replace(/\s+/g, " ").trim();
      if (!raw) return { city: null as string | null, district: null as string | null };

      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return { city: null, district: null };

      // pierwszy człon najczęściej jest miastem (czasem z dzielnicą)
      return {
        city: parts[0] ?? null,
        district: parts.length > 1 ? parts.slice(1).join(", ") : null,
      };
    })();

    rows.push({
      external_id: canon,
      office_id: null,
      source: "odwlasciciela",
      source_url: canon,
      title: title || null,
      description: null,
      price_amount: priceAmount ?? null,
      currency,
      location_text: locationText || null,
      status: "preview",
      imported_at: now,
      updated_at: now,
      thumb_url: null,

      created_at: now,
      matched_at: now,

      transaction_type: tx ?? null,
      property_type: pt ?? null,

      area_m2: area_m2 ?? null,
      rooms: rooms ?? null,
      price_per_m2: price_per_m2 ?? null,

      // ✅ nie zgadujemy województwa z tej listy
      voivodeship: null,
      city: locParts.city,
      district: locParts.district,
      street: null,
    });

    if (rows.length >= limit) return false;
  });

  return rows.slice(0, limit);
}

/* -------------------- fetch -------------------- */
async function fetchHtmlWithFinalUrl(
  url: string
): Promise<{ html: string; finalUrl: string }> {
  const parsed = new URL(url);
  const origin = parsed.origin;

  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

  async function doFetch(targetUrl: string) {
    const r = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": UA,
        "accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "referer": origin + "/",
        "upgrade-insecure-requests": "1",
        "sec-ch-ua": `"Chromium";v="121", "Not A(Brand";v="99", "Google Chrome";v="121"`,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": `"Windows"`,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
        "sec-fetch-user": "?1",
      },
    });

    const html = await r.text().catch(() => "");

    console.log("everybot fetch:", {
      requested: targetUrl,
      status: r.status,
      finalUrl: r.url,
    });

    return { r, html };
  }

  let { r, html } = await doFetch(url);

  if (r.status === 403 || r.status === 429) {
    const title =
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
    throw new Error(`PORTAL_BLOCKED ${r.status}${title ? ` (${title})` : ""}`);
  }

  if (!r.ok) {
    throw new Error(`FETCH_FAILED ${r.status} ${r.statusText} ${html.slice(0, 200)}`);
  }

  return { html, finalUrl: r.url };
}

/* -------------------- builders -------------------- */
function slugifyPl(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeVoivodeshipInput(v?: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  const out = s
    .replace(/^wojew[oó]dztwo\s+/i, "")
    .replace(/^woj\.?\s+/i, "")
    .trim();

  return out || null;
}

function buildOtodomSearchUrl(
  q: string,
  voivodeship?: string | null,
  transactionType?: "sale" | "rent" | null,
  propertyType?: string | null,
  minPrice?: number | null,
  maxPrice?: number | null,
  minArea?: number | null,
  maxArea?: number | null,
  rooms?: number | null
): string {
  const phrase = (q ?? "").trim();
  const vRaw = normalizeVoivodeshipInput(voivodeship);

  const txnSeg = transactionType === "rent" ? "wynajem" : "sprzedaz";

  const pt = (propertyType ?? "").toLowerCase();
  const typeSeg =
    pt.includes("dom") || pt.includes("house") ? "dom" :
    pt.includes("miesz") || pt.includes("flat") || pt.includes("apart") || pt.includes("apartment") ? "mieszkanie" :
    pt.includes("dzial") || pt.includes("dział") || pt.includes("plot") || pt.includes("grunt") ? "dzialka" :
    pt.includes("lokal") || pt.includes("biur") || pt.includes("commercial") ? "lokal" :
    "mieszkanie";

  const voivSlug = vRaw ? slugifyPl(vRaw) : null;

  const base = voivSlug
    ? `https://www.otodom.pl/pl/wyniki/${txnSeg}/${typeSeg}/${voivSlug}`
    : `https://www.otodom.pl/pl/wyniki/${txnSeg}/${typeSeg}/cala-polska`;

  const u = new URL(base);

  u.searchParams.set("viewType", "listing");

  if (phrase) u.searchParams.set("search[phrase]", phrase);

  if (minPrice != null) u.searchParams.set("search[filter_float_price:from]", String(minPrice));
  if (maxPrice != null) u.searchParams.set("search[filter_float_price:to]", String(maxPrice));

  if (minArea != null) u.searchParams.set("search[filter_float_m:from]", String(minArea));
  if (maxArea != null) u.searchParams.set("search[filter_float_m:to]", String(maxArea));

  if (rooms != null) {
    const v = rooms >= 6 ? "more" : String(Math.max(1, Math.min(10, Math.round(rooms))));
    u.searchParams.set("search[filter_enum_rooms_num][0]", v);
  }

  u.searchParams.set("search[order]", "quality_score");

  return u.toString();
}

function buildOlxSearchUrl(q: string, city?: string | null, district?: string | null): string {
  const rawQ = (q ?? "").trim();
  const c = (city ?? "").trim();
  const d = (district ?? "").trim();

  const effectiveQ = rawQ || [c, d].filter(Boolean).join(" ").trim();

  if (!effectiveQ) return "https://www.olx.pl/nieruchomosci/";

  const slug = encodeURIComponent(effectiveQ.replace(/\s+/g, "-"));
  return `https://www.olx.pl/nieruchomosci/q-${slug}/`;
}
function buildGratkaSearchUrl(filters: any | null): string {
  const city = optString(filters?.city)?.trim() ?? "";
  if (!city) return "https://gratka.pl/nieruchomosci";

  const ptRaw = (optString(filters?.propertyType) ?? "").toLowerCase();
  const seg =
    ptRaw.includes("miesz") || ptRaw.includes("apartment") || ptRaw.includes("flat") ? "mieszkania" :
    ptRaw.includes("dom") || ptRaw.includes("house") ? "domy" :
    ptRaw.includes("dzial") || ptRaw.includes("dział") || ptRaw.includes("plot") || ptRaw.includes("grunt") ? "dzialki" :
    ptRaw.includes("komerc") || ptRaw.includes("lokal") || ptRaw.includes("biur") || ptRaw.includes("commercial") ? "lokale" :
    // default: jak nie wiemy, nie robimy magii
    "";

  if (!seg) return "https://gratka.pl/nieruchomosci";

  // ✅ Gratka listy mają format: /nieruchomosci/mieszkania/wroclaw
  return `https://gratka.pl/nieruchomosci/${seg}/${slugifyPl(city)}`;
}
function buildMorizonSearchUrl(filters: any | null): string {
  const city = optString(filters?.city)?.trim() ?? "";
  if (!city) {
    // bez miasta nie budujemy URL wyników (bezpiecznie)
    return "https://www.morizon.pl/";
  }

  const ptRaw = (optString(filters?.propertyType) ?? "").toLowerCase();
  const seg =
    ptRaw.includes("dom") || ptRaw.includes("house") ? "domy" :
    ptRaw.includes("miesz") || ptRaw.includes("apartment") || ptRaw.includes("flat") ? "mieszkania" :
    ptRaw.includes("dzial") || ptRaw.includes("dział") || ptRaw.includes("plot") || ptRaw.includes("grunt") ? "dzialki" :
    ptRaw.includes("komerc") || ptRaw.includes("lokal") || ptRaw.includes("biur") || ptRaw.includes("commercial") ? "komercyjne" :
    // default bez zgadywania transakcji: jeśli nie wiemy typu, nie budujemy “magii”
    "";

  if (!seg) return "https://www.morizon.pl/";

  // ✅ Morizon listy mają format: /domy/katowice/
  return `https://www.morizon.pl/${seg}/${slugifyPl(city)}/`;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasNextPage(html: string, currentPage: number): boolean {
  const byNext = hasNextFromNextData(html, currentPage);
  if (byNext !== null) return byNext;

  const $ = cheerio.load(html);

  const relNext = $('link[rel="next"]').attr("href") || $('a[rel="next"]').attr("href");
  if (relNext) return true;

  const ariaNext = $('a[aria-label*="Następ"], button[aria-label*="Następ"]').length > 0;
  if (ariaNext) return true;

  const textNext = $("a,button").filter((_, el) => ((($(el).text() || "").toLowerCase().includes("następ")))).length > 0;
  if (textNext) return true;

  return false;
}

function samePath(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname === ub.pathname;
  } catch {
    return a === b;
  }
}

/* -------------------- handler -------------------- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const UPSERT_BUDGET = 60;

    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.setHeader("Cache-Control", "no-store");

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    console.log("everybot auth:", { userId, officeId });

    const limitRaw =
      req.method === "GET"
        ? (typeof req.query.limit === "string" ? Number(req.query.limit) : 50)
        : (optNumber((req.body ?? {}).limit) ?? 50);

    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);

    const body = req.method === "POST" ? (req.body ?? {}) : {};

    const filters = (req.method === "POST"
      ? (body as any).filters
      : (req.query as any)
    ) as any | null;

    const runTsFromBody =
      req.method === "POST"
        ? optString((req.body ?? {}).runTs)
        : optString(req.query.runTs);

    const runTsFromFilters =
      req.method === "POST"
        ? optString(((req.body ?? {}) as any)?.filters?.runTs)
        : optString((req.query as any)?.runTs);

    const runTs = runTsFromFilters ?? runTsFromBody ?? new Date().toISOString();

    const urlFromGet = req.method === "GET" ? optString(req.query.url) : null;
    const urlFromPost = req.method === "POST" ? optString((body as any).url) : null;

    const q =
      req.method === "POST"
        ? (optString(filters?.q) ?? optString((body as any).q))
        : optString((req.query as any)?.q);

    const sourceParam =
      req.method === "POST"
        ? (optString(filters?.source) ?? optString((body as any).source) ?? "otodom")
        : (optString((req.query as any)?.source) ?? "otodom");

    const sourceWanted = String(sourceParam).toLowerCase(); // "otodom" | "olx" | "morizon" | "gratka" | "odwlasciciela" | "all"

    if (
      sourceWanted !== "otodom" &&
      sourceWanted !== "olx" &&
      sourceWanted !== "morizon" &&
      sourceWanted !== "gratka" &&
      sourceWanted !== "odwlasciciela" &&
      sourceWanted !== "all"
    ) {
      return res.status(400).json({ error: `UNSUPPORTED_SOURCE ${sourceWanted}` });
    }

    const harvestSources: SourceKey[] =
      sourceWanted === "all"
        ? ["otodom", "olx", "morizon", "gratka", "odwlasciciela"]
        : [sourceWanted as SourceKey];

    const cursor =
      req.method === "POST" ? optString(body.cursor) : optString(req.query.cursor);

    function buildBaseUrlForSource(src: SourceKey) {
      // ✅ jeśli user podał URL explicite — używamy go dla każdego źródła (jak dotychczas)
      if (urlFromPost || urlFromGet) return (urlFromPost || urlFromGet)!;

      // ✅ istniejące, sprawdzone buildy:
      if (src === "olx") {
        return q
          ? buildOlxSearchUrl(q, optString(filters?.city) ?? null, optString(filters?.district) ?? null)
          : buildOlxSearchUrl("", optString(filters?.city) ?? null, optString(filters?.district) ?? null);
      }

      if (src === "otodom") {
        const phrase =
          (q ?? "") ||
          [optString(filters?.city), optString(filters?.district)].filter(Boolean).join(" ").trim();

        return buildOtodomSearchUrl(
          phrase,
          optString(filters?.voivodeship) ?? null,
          (optString(filters?.transactionType) as any) ?? null,
          optString(filters?.propertyType) ?? null,
          optNumber(filters?.minPrice),
          optNumber(filters?.maxPrice),
          optNumber(filters?.minArea),
          optNumber(filters?.maxArea),
          optNumber(filters?.rooms)
        );
      }

      // ✅ morizon: startujemy od czystej strony głównej (bez UTM) – pozwala zebrać featured oferty.
      // Filtry dołożymy dopiero po tym, jak podasz URL listy wyników (nie homepage).
            if (src === "morizon") {
        return buildMorizonSearchUrl(filters);
      }

      if (src === "gratka") {
        return buildGratkaSearchUrl(filters);
      }

      if (src === "odwlasciciela") {
        return "https://odwlasciciela.pl/oferty.html";
      }

      return null;
      }

    const pagesRaw =
      req.method === "POST" ? optNumber((req.body ?? {}).pages) : optNumber(req.query.pages);
    const pages = Math.min(Math.max(pagesRaw ?? 1, 1), 5);

    const cursorRaw = req.method === "POST" ? optString(body.cursor) : optString(req.query.cursor);
    const startPage = cursorRaw && isHttpUrl(cursorRaw) ? 1 : Math.max(1, Number(cursorRaw ?? "1") || 1);

    let allRows: ExternalRow[] = [];
    let upserted = 0;

    const canonicalBaseUrls: Record<SourceKey, string | null> = {
      otodom: null,
      olx: null,
      morizon: null,
      gratka: null,
      odwlasciciela: null,
    };

    let lastFetchedPage = startPage - 1;

    for (const src of harvestSources) {
      const baseUrl = buildBaseUrlForSource(src);

      if (!baseUrl || !isHttpUrl(baseUrl)) {
        if (urlFromPost || urlFromGet) {
          return res.status(400).json({ error: "Invalid or missing url/q" });
        }
        // brak buildera dla src -> pomijamy źródło (bez rozwalania pipeline)
        console.log("everybot source skipped (no builder/url):", { src });
        continue;
      }

      let canonicalBaseUrl: string | null = null;
      let lastFetchedPageForSource = startPage - 1;

      for (let pageNo = startPage; pageNo < startPage + pages; pageNo++) {
        if (pageNo !== startPage) {
          await sleep(800 + Math.floor(Math.random() * 600));
        }

        const pageUrl = canonicalBaseUrl
          ? withPage(canonicalBaseUrl, pageNo)
          : withPage(baseUrl, pageNo);

        console.log("everybot request:", {
          sourceWanted,
          baseUrl,
          page: pageNo,
          url: pageUrl,
        });

        const detected = detectSource(pageUrl);
        if (detected === "other") {
          return res.status(400).json({ error: "Unsupported source url" });
        }

        // 🔒 HARD: jeżeli requested URL nie odpowiada src w pętli, to nie mieszamy danych
        if (detected !== src) {
          console.log("everybot source mismatch:", { src, detected, url: pageUrl });
          break;
        }

        let html = "";
        let finalUrl = pageUrl;

        try {
          const got = await fetchHtmlWithFinalUrl(pageUrl);
          html = got.html;
          finalUrl = got.finalUrl;
        } catch (e: any) {
          console.log("everybot source fetch failed:", {
            src,
            requested: pageUrl,
            error: e?.message ?? String(e),
          });
          break;
        }

        const requestedBase = stripPageParam(pageUrl);
        const finalBase = stripPageParam(finalUrl);

        const degraded =
          src === "otodom" &&
          (
            !samePath(requestedBase, finalBase) ||
            (!requestedBase.includes("/cala-polska") && finalBase.includes("/cala-polska"))
          );

        if (degraded) {
          console.log("everybot degraded:", {
            src,
            requested: pageUrl,
            finalUrl,
            reason: "otodom_redirected_to_canonical_location",
          });

          break;
        }

        lastFetchedPage = pageNo;

        if (!canonicalBaseUrl) {
          canonicalBaseUrl = stripPageParam(finalUrl);
          canonicalBaseUrls[src] = canonicalBaseUrl;
        }

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
        } else if (detected === "morizon") {
          rows = parseMorizonResults(finalUrl, html, limit);
        } else if (detected === "gratka") {
          rows = parseGratkaResults(finalUrl, html, limit);
        } else if (detected === "odwlasciciela") {
          rows = parseOdwlasciCielaResults(finalUrl, html, limit);
        }

        let skippedMissingTitle = 0;
        let skippedMissingUrl = 0;

        for (const r of rows) {
          if (!r.source || !r.source_url) {
            skippedMissingUrl++;
            continue;
          }

          if (!r.title || !String(r.title).trim()) {
            try {
              const u = new URL(r.source_url);
              const seg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
              const guess = seg.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
              if (guess && guess.length <= 260) {
                r.title = guess;
              }
            } catch {}
          }

          if (!r.title || !String(r.title).trim()) {
            skippedMissingTitle++;
            continue;
          }

          if (r.source === "olx") {
            const u = String(r.source_url || "");
            if (!u.includes("/nieruchomosci/") || !u.includes("/d/oferta/")) {
              continue;
            }
          }

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
              matched_at = EXCLUDED.matched_at,
              source_url = EXCLUDED.source_url,
              title = EXCLUDED.title,
              price_amount = EXCLUDED.price_amount,
              currency = EXCLUDED.currency,
              location_text = EXCLUDED.location_text,
              status = EXCLUDED.status,

              thumb_url = COALESCE(EXCLUDED.thumb_url, external_listings.thumb_url),
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
              r.description ?? null,
              typeof r.price_amount === "number" ? r.price_amount : r.price_amount ? Number(r.price_amount) : null,
              r.currency ?? null,
              r.location_text ?? null,
              r.status ?? "active",

              r.thumb_url ?? null,
              runTs,
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

          if (upserted >= UPSERT_BUDGET) {
            console.log("everybot budget reached:", { upserted });

            return res.status(200).json({
              rows: allRows.slice(0, limit),
              nextCursor: String(lastFetchedPage + 1),
              upserted,
              pagesFetched: Math.max(0, lastFetchedPage - startPage + 1),
              totalRowsParsed: allRows.length,
              canonicalBaseUrls,
            });
          }
        }

        if (skippedMissingTitle || skippedMissingUrl) {
          console.log("everybot upsert skips:", {
            src,
            skippedMissingTitle,
            skippedMissingUrl,
            parsedRows: rows.length,
          });
        }

        allRows = allRows.concat(rows);

        if (detected === "otodom" && !finalUrl.toLowerCase().includes("/pl/oferta/")) {
          const byNextData = hasNextFromNextData(html, pageNo);
          const hasNext = byNextData !== null ? byNextData : hasNextPage(html, pageNo);
          if (!hasNext) break;
        }

        lastFetchedPageForSource = pageNo;
        if (pageNo > lastFetchedPage) lastFetchedPage = pageNo;
      }
    }

    const nextCursor = String(lastFetchedPage + 1);
    const pagesFetched = Math.max(0, lastFetchedPage - startPage + 1);

    console.log("everybot summary:", {
      totalRowsParsed: allRows.length,
      upserted,
    });

    return res.status(200).json({
      rows: allRows.slice(0, limit),
      nextCursor,
      upserted,
      pagesFetched,
      totalRowsParsed: allRows.length,
      canonicalBaseUrls,
    });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}