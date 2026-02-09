import type { NextApiRequest, NextApiResponse } from "next";
import * as cheerio from "cheerio";

function mustString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${name}`);
  return v.trim();
}

function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function detectSource(url: string): "otodom" | "other" {
  return url.toLowerCase().includes("otodom.") ? "otodom" : "other";
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
      external_id: full, // preview id
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

/**
 * Otodom – pojedyncza oferta:
 * Stabilnie bierzemy z meta/og/canonical + opis (fallback).
 * JSON-LD też bywa, ale nie zawsze łatwo go wyciągnąć przy SSR; meta działa “wszędzie”.
 */
function parseOtodomListing(pageUrl: string, html: string): ExternalRow[] {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();

  const canonical = $('link[rel="canonical"]').attr("href") || pageUrl;

  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() || null;
  const metaTitle = $("title").text()?.trim() || null;
  const title = ogTitle || metaTitle;

  const ogImage = $('meta[property="og:image"]').attr("content")?.trim() || null;

  const desc = $('meta[name="description"]').attr("content")?.trim() || "";

  // Cena: w title/description często jest "1 280 000 zł"
  const priceAmount = parseNumberLoose(desc) ?? parseNumberLoose(title ?? "");
  const currency =
    desc.toLowerCase().includes("zł") || (title ?? "").toLowerCase().includes("zł") ? "PLN" :
    desc.includes("€") || (title ?? "").includes("€") ? "EUR" :
    null;

  // Lokalizacja: z opisu meta (MVP)
  // przykład: "... w miejscowości ul. ..., Lublin, lubelskie, za cenę ..."
  const locMatch =
    desc.match(/w miejscowości\s+([^,]+),\s*([^,]+),\s*([^,]+),\s*za cenę/i) ||
    desc.match(/w miejscowości\s+([^,]+),\s*([^,]+),\s*za cenę/i);

  const locationText = locMatch
    ? locMatch.slice(1).filter(Boolean).join(", ").trim()
    : null;

  return [
    {
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
    },
  ];
}

async function fetchHtml(url: string): Promise<{ html: string; status: number }> {
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
  if (!r.ok) {
    throw new Error(`FETCH_FAILED ${r.status} ${r.statusText} ${html.slice(0, 200)}`);
  }
  return { html, status: r.status };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    res.setHeader("Cache-Control", "no-store");

    const url = mustString(req.query.url, "url");
    if (!isHttpUrl(url)) return res.status(400).json({ error: "Invalid url" });

    const source = detectSource(url);
    if (source !== "otodom") return res.status(400).json({ error: "Only otodom supported" });

    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);

    const { html } = await fetchHtml(url);

    // ✅ routing: oferta vs wyniki
    const lower = url.toLowerCase();
    let rows: ExternalRow[] = [];

    if (lower.includes("/pl/oferta/")) {
      rows = parseOtodomListing(url, html);
    } else {
      rows = parseOtodomResults(url, html, limit);
    }

    // ✅ debug jeśli wyniki puste (często oznacza "shell" bez linków)
    const debug =
      rows.length === 0
        ? {
            hint:
              "No offer links parsed. The page may be JS-rendered/blocked. Try another URL or implement HTML-paste fallback.",
            sample: html.slice(0, 300),
          }
        : undefined;

    return res.status(200).json({ rows, ...(debug ? { debug } : {}) });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
