// lib/everybot/enrichers/gratka.ts
import * as cheerio from "cheerio";
import type { Enricher, EnrichResult } from "./types";

/* ---------------- utils ---------------- */

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function currencyFromText(s: string | null): string | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("€") || t.includes("eur")) return "EUR";
  if (t.includes("zł") || t.includes("pln")) return "PLN";
  return null;
}

function parsePriceFromText(s: string | null): { amount: number | null; currency: string | null } {
  if (!s) return { amount: null, currency: null };

  // bierzemy tylko "liczba + waluta"
  const m = s.match(/(\d[\d\s.,]*)\s*(zł|pln|eur|€)\b/i);
  if (!m) return { amount: null, currency: currencyFromText(s) };

  const raw = m[1];
  const curRaw = m[2].toLowerCase();
  const currency = curRaw === "€" || curRaw === "eur" ? "EUR" : "PLN";

  const cleaned = raw
    .replace(/\s+/g, "")
    .replace(/[^\d.,]/g, "")
    .replace(/,/g, ".")
    .replace(/\.(?=.*\.)/g, "");

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return { amount: null, currency };
  return { amount: Math.round(n), currency };
}

function sanitizePrice(amount: number | null): number | null {
  if (!amount || !Number.isFinite(amount)) return null;
  // airbag na sklejenie cyfr / błędny parsing
  if (amount > 100_000_000) return null;
  return amount;
}

function inferTxFromText(s: string | null): "sale" | "rent" | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("wynajem") || t.includes("naj") || t.includes("/mies") || t.includes("miesiąc")) return "rent";
  return "sale";
}

function absolutizeUrl(base: string, u: string | null): string | null {
  const s = optString(u);
  if (!s) return null;
  try {
    if (s.startsWith("//")) return `https:${s}`;
    return new URL(s, base).toString();
  } catch {
    return null;
  }
}

function isBadThumb(u: string): boolean {
  const t = u.toLowerCase();
  return t.endsWith(".svg") || t.includes("logo") || t.includes("signet") || t.includes("nuxt-assets");
}

function pickThumbUrl($: cheerio.CheerioAPI, pageUrl: string): string | null {
  const og = absolutizeUrl(pageUrl, optString($(`meta[property="og:image"]`).attr("content")));
  if (og && !isBadThumb(og)) return og;

  const tw = absolutizeUrl(pageUrl, optString($(`meta[name="twitter:image"]`).attr("content")));
  if (tw && !isBadThumb(tw)) return tw;

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

const gratkaEnricher: Enricher = async (url: string): Promise<EnrichResult> => {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

    // Gratka często ma "cena" w różnych blokach – bierzemy first match i regex "liczba + waluta"
    const priceText =
      optString($("[class*='price']").first().text()) ??
      optString($("[data-cy*='price']").first().text()) ??
      null;

    const parsed = parsePriceFromText(priceText);
    const price_amount = sanitizePrice(parsed.amount);
    const currency = parsed.currency ?? currencyFromText(priceText);

    const location_text =
      optString($("[class*='address'],[class*='location']").first().text()) ?? null;

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

export default gratkaEnricher;