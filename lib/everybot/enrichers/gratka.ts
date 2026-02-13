// lib/everybot/enrichers/gratka.ts
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
  if (s.includes("€")) return "EUR";
  if (s.toLowerCase().includes("zł")) return "PLN";
  return null;
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

/* ---------------- enricher ---------------- */

const gratkaEnricher: Enricher = async (
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

    const priceText =
      optString($("[class*='price']").first().text()) ?? null;

    const price_amount = parseNumberLoose(priceText);
    const currency = currencyFromText(priceText);

    const location_text =
      optString(
        $("[class*='address'],[class*='location']").first().text()
      ) ?? null;

    const thumb_url =
      optString($("img").first().attr("src")) ??
      optString($("img").first().attr("data-src")) ??
      null;

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
