// lib/everybot/adapters/olx.ts

import type { PortalAdapter, ParseResult, SearchItem } from "./types";
import { portalSafeFiltersFor } from "../filters/portalSafe";
import * as cheerio from "cheerio";

function absUrl(base: string, href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function parseNumberLoose(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function inferTxFromPriceText(s: string | null): "rent" | "sale" | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("/mies") || t.includes("miesiąc") || t.includes("mc")) return "rent";
  return "sale";
}

function buildOlxUrl(q: string, page: number) {
  if (!q.trim()) {
    const u = new URL("https://www.olx.pl/nieruchomosci/");
    if (page > 1) u.searchParams.set("page", String(page));
    return u.toString();
  }
  const slug = encodeURIComponent(q.trim().replace(/\s+/g, "-"));
  const base = `https://www.olx.pl/nieruchomosci/q-${slug}/`;
  const u = new URL(base);
  if (page > 1) u.searchParams.set("page", String(page));
  return u.toString();
}

const olxAdapter: PortalAdapter = {
  source: "olx",

  buildSearchRequest(ctx) {
    const safe = portalSafeFiltersFor("olx", ctx.filters);
    const url = buildOlxUrl(safe.q ?? "", ctx.page);

    return {
      url,
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9,en;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
    };
  },

  parseSearch(ctx, html, finalUrl): ParseResult {
    const $ = cheerio.load(html);
    const items: SearchItem[] = [];
    const seen = new Set<string>();

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const full = absUrl(finalUrl, href);
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

      const currency =
        priceText?.includes("€") ? "EUR" :
        priceText?.toLowerCase().includes("zł") ? "PLN" :
        null;

      const priceAmount = parseNumberLoose(priceText);
      const tx = inferTxFromPriceText(priceText);

      const locationText =
        card.find('[data-testid="location-date"], [class*="location"]').first().text().trim() || null;

      const img =
        card.find("img").first().attr("src") ||
        card.find("img").first().attr("data-src") ||
        null;

      items.push({
        source: "olx",
        source_url: full,
        title: title || null,
        price_amount: priceAmount ?? null,
        currency,
        location_text: locationText || null,
        thumb_url: img ? absUrl(finalUrl, img) : null,
        transaction_type: tx,
      });
    });

    // hasNext – prosto: jeśli jest page+1 w link rel next
    const hasNext =
      $('link[rel="next"]').attr("href") || $('a[rel="next"]').attr("href")
        ? true
        : null;

    return {
      items,
      hasNext,
      meta: {
        source: "olx",
        requestedUrl: "olx",
        finalUrl,
        page: ctx.page,
        applied: true,
        degradedReason: "none",
      },
    };
  },

  getNextBaseUrl(ctx, html, finalUrl) {
    // trzymamy base bez page
    const u = new URL(finalUrl);
    u.searchParams.delete("page");
    return u.toString();
  },
};

export default olxAdapter;
