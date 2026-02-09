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
};

/* -------------------- parsers -------------------- */
function parseOtodomResults(pageUrl: string, html: string, limit: number): ExternalRow[] {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  const rows: ExternalRow[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const full = absUrl(pageUrl, href);
    if (!full) return;
    if (!full.includes("/pl/oferta/")) return;
    if (seen.has(full)) return;
    seen.add(full);

    const card = $(el).closest("article, li, div").first();

    const title =
      card.find("h2, h3").first().text().trim() ||
      $(el).text().trim() ||
      null;

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
    });
  });

  return rows.slice(0, limit);
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
      card.find("h6, h5, h4, h3").first().text().trim() ||
      $(el).text().trim() ||
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

    let rows: ExternalRow[] = [];
    if (detected === "otodom") {
      rows = url.toLowerCase().includes("/pl/oferta/")
        ? parseOtodomListing(url, html)
        : parseOtodomResults(url, html, limit);
    } else if (detected === "olx") {
      rows = parseOlxResults(url, html, limit);
    }

    const nextCursor = rows.length >= limit ? String(page + 1) : null;

    return res.status(200).json({ rows, nextCursor });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
