import type { NextApiRequest, NextApiResponse } from "next";
import * as cheerio from "cheerio";

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

  // MVP – dane do tabeli
  area_m2?: number | null;
  rooms?: number | null;
  price_per_m2?: number | null;
};

function cleanTitle(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.includes(".css-") || t.includes("@media") || t.includes("{") || t.includes("}") || t.length > 160) return null;
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
function parseOtodomResultsFromNextData(pageUrl: string, html: string, limit: number): { rows: ExternalRow[]; hasNext: boolean | null } {
  const next = extractNextData(html);
  if (!next) return { rows: [], hasNext: null };

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

  const now = new Date().toISOString();
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
    if (!full.includes("/pl/oferta/")) return;
    if (seen.has(full)) return;
    seen.add(full);

    const card = $(el).closest("article, li, div").first();

    const rawTitle =
    card.find("h2, h3").first().text().trim() ||
    $(el).attr("title")?.trim() ||
    $(el).attr("aria-label")?.trim() ||
    $(el).text().trim() ||
    null;

    const title = cleanTitle(rawTitle);


    const priceText =
      card
        .find('[data-cy="listing-item-price"], [data-testid*="price"], [class*="price"]')
        .first()
        .text()
        .trim() || null;

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

  rows.push({
  external_id: full,
  office_id: null,
  source: "otodom",
  source_url: full,

  title: title || null,
  price_amount: priceAmount,
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
      price_amount: priceAmount,
      currency,
      location_text: locationText || null,
      status: "preview",
      imported_at: now,
      updated_at: now,
      thumb_url: img ? absUrl(pageUrl, img) : null,
    });
  });

  return rows.slice(0, limit);
}

/* -------------------- fetch -------------------- */
async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    method: "GET",
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

  const html = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`FETCH_FAILED ${r.status} ${r.statusText} ${html.slice(0, 200)}`);
  return html;
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
  if (page > 1) u.searchParams.set("page", String(page));
  else u.searchParams.delete("page");
  return u.toString();
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


/* -------------------- handler -------------------- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.setHeader("Cache-Control", "no-store");

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

    const cursorStr = req.method === "POST" ? optString(body.cursor) : null;
    const page = Math.max(1, Number(cursorStr ?? "1") || 1);

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

    const url = withPage(baseUrl, page);

    const detected = detectSource(url);
    if (detected === "other") {
      return res.status(400).json({ error: "Unsupported source url" });
    }

const html = await fetchHtml(url);

// DEBUG – tylko na czas diagnozy
console.log("otodom html head:", html.slice(0, 500));

// KROK 1 – inspekcja __NEXT_DATA__ (tylko na czas diagnozy)
const next = extractNextData(html);
console.log(
  "otodom next keys:",
  next ? Object.keys(next.props?.pageProps ?? {}) : "NO_NEXT"
);
console.log(
  "otodom dehydrated:",
  Boolean(next?.props?.pageProps?.dehydratedState)
);

let rows: ExternalRow[] = [];


if (detected === "otodom") {
  if (url.toLowerCase().includes("/pl/oferta/")) {
    // 1️⃣ Najpierw próbujemy __NEXT_DATA__ (listing)
    const fromNext = parseOtodomListingFromNextData(url, html);

    // 2️⃣ Fallback: meta / cheerio
    rows = fromNext.length ? fromNext : parseOtodomListing(url, html);
  } else {
    // 1️⃣ Najpierw __NEXT_DATA__ (wyniki)
    const fromNext = parseOtodomResultsFromNextData(url, html, limit);

    // 2️⃣ Fallback: cheerio
    rows = fromNext.rows.length
      ? fromNext.rows
      : parseOtodomResults(url, html, limit);
  }
} else if (detected === "olx") {
  rows = parseOlxResults(url, html, limit);
}


   const nextCursor = hasNextPage(html, page) ? String(page + 1) : null;


    return res.status(200).json({ rows, nextCursor });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
