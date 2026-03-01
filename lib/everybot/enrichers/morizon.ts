// lib/everybot/enrichers/morizon.ts
import * as cheerio from "cheerio";
import type { Enricher, EnrichResult } from "./types";

/* ---------------- utils ---------------- */

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseNumberLoose(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function currencyFromText(s: string | null): string | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("€") || t.includes("eur")) return "EUR";
  if (t.includes("zł") || t.includes("pln")) return "PLN";
  return null;
}

/**
 * Bezpieczny parser ceny: bierze tylko "liczba + waluta",
 * zamiast sklejać cyfry z całego tekstu.
 */
function parsePriceFromText(s: string | null): { amount: number | null; currency: string | null } {
  if (!s) return { amount: null, currency: null };

  const m = s.match(/(\d[\d\s.,]*)\s*(zł|pln|eur|€)\b/i);
  if (!m) return { amount: null, currency: currencyFromText(s) };

  const raw = m[1];
  const curRaw = m[2].toLowerCase();

  const currency =
    curRaw === "€" || curRaw === "eur" ? "EUR" : "PLN";

  // 1 199 900 -> 1199900, 1.199.900 -> 1199900, 1,199,900 -> 1199900
  const cleaned = raw
    .replace(/\s+/g, "")
    .replace(/[^\d.,]/g, "")
    .replace(/,/g, ".")
    .replace(/\.(?=.*\.)/g, ""); // usuń wszystkie kropki oprócz ostatniej

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return { amount: null, currency };
  return { amount: Math.round(n), currency };
}

function sanitizePrice(amount: number | null): number | null {
  if (!amount || !Number.isFinite(amount)) return null;
  // Airbag: Morizon/parsowanie potrafi skleić cyfry -> kosmos
  if (amount > 100_000_000) return null;
  return amount;
}

function inferTxFromText(s: string | null): "sale" | "rent" | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (
    t.includes("wynajem") ||
    t.includes("naj") ||
    t.includes("/mies") ||
    t.includes("miesiąc")
  )
    return "rent";
  return "sale";
}

function isHttpUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u.trim());
}

function absolutizeUrl(base: string, u: string | null): string | null {
  const s = optString(u);
  if (!s) return null;
  try {
    // obsłuż też //cdn...
    if (s.startsWith("//")) return `https:${s}`;
    return new URL(s, base).toString();
  } catch {
    return null;
  }
}

function isBadThumb(u: string): boolean {
  const t = u.toLowerCase();
  return t.includes("nuxt-assets/signet") || t.endsWith(".svg");
}

function pickThumbUrl($: cheerio.CheerioAPI, pageUrl: string): string | null {
  // 1) og:image (najczęściej poprawne zdjęcie)
  const og = absolutizeUrl(pageUrl, optString($(`meta[property="og:image"]`).attr("content")));
  if (og && !isBadThumb(og)) return og;

  // 2) próbuj meta[name="twitter:image"]
  const tw = absolutizeUrl(pageUrl, optString($(`meta[name="twitter:image"]`).attr("content")));
  if (tw && !isBadThumb(tw)) return tw;

  // 3) fallback: pierwsze sensowne <img>, ale nie signet/svg
  const imgs = $("img")
    .map((_, el) => optString($(el).attr("data-src")) ?? optString($(el).attr("src")) ?? null)
    .get()
    .filter(Boolean) as string[];

  for (const raw of imgs) {
    const abs = absolutizeUrl(pageUrl, raw);
    if (abs && !isBadThumb(abs)) return abs;
  }

  return null;
}

/* ---------------- enricher ---------------- */

const morizonEnricher: Enricher = async (
  url: string
): Promise<EnrichResult> => {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9,en;q=0.7",
      },
    });

    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      optString($("h1").first().text()) ??
      optString($("title").first().text()) ??
      null;

    const description =
      optString(
        $("[class*='description'],[class*='content'],[class*='details']")
          .first()
          .text()
      ) ?? null;

    // Uwaga: pierwszy [class*='price'] potrafi mieć dużo tekstu.
    // Parsing robimy regexem "liczba + waluta" i zabezpieczamy airbagiem.
    const priceText =
      optString($("[class*='price']").first().text()) ?? null;

    const parsed = parsePriceFromText(priceText);
    const price_amount = sanitizePrice(parsed.amount);
    const currency = parsed.currency ?? currencyFromText(priceText);

    const location_text =
      optString(
        $("[class*='address'],[class*='location']").first().text()
      ) ?? null;

    const thumb_url = pickThumbUrl($, url);

    return {
      title,
      description,
      price_amount,
      currency,
      transaction_type: inferTxFromText(priceText),
      location_text,
      thumb_url,
    };
  } catch {
    return {};
  }
};

export default morizonEnricher;