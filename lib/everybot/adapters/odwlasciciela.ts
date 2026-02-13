// lib/everybot/adapters/odwlasciciela.ts
import * as cheerio from "cheerio";
import type { PortalAdapter, AdapterContext, ParseResult, SearchItem, DegradedReason } from "./types";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
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

function currencyFromText(s: string | null): string | null {
  if (!s) return null;
  if (s.includes("€")) return "EUR";
  if (s.toLowerCase().includes("zł")) return "PLN";
  return null;
}

function inferTxFromText(s: string | null): "sale" | "rent" | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("wynajem") || t.includes("naj") || t.includes("/mies") || t.includes("miesiąc")) return "rent";
  return "sale";
}

// MVP: odwlasciciela.pl – często łatwiej zaczynać od import-link (detail URL),
// ale dajemy minimalny search, żeby adapter istniał.
function buildSearchUrl(ctx: AdapterContext): string {
  const q = (ctx.filters.q ?? "").trim();
  const page = Math.max(1, ctx.page || 1);

  // Najbezpieczniej: ogłoszenia + query (jeśli portal to zignoruje, meta pokaże degradację)
  const u = new URL("https://odwlasciciela.pl/oferty");
  if (q) u.searchParams.set("q", q);
  if (page > 1) u.searchParams.set("page", String(page));
  return u.toString();
}

function degradedReason(requestedUrl: string, finalUrl: string): { applied: boolean; reason: DegradedReason } {
  if (!finalUrl) return { applied: false, reason: "unknown" };
  if (stripPage(requestedUrl) !== stripPage(finalUrl)) {
    return { applied: false, reason: "portal_redirected" };
  }
  return { applied: true, reason: "none" };
}

function stripPage(u: string) {
  try {
    const x = new URL(u);
    x.searchParams.delete("page");
    return x.toString();
  } catch {
    return u;
  }
}

function parseSearch(ctx: AdapterContext, html: string, finalUrl: string, requestedUrl: string): ParseResult {
  const $ = cheerio.load(html);
  const items: SearchItem[] = [];
  const seen = new Set<string>();

  // odwlasciciela: oferty wyglądają jak /oferty/podglad/<id>,...
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const full = absUrl(finalUrl, href);
    if (!full) return;
    if (!/odwlasciciela\.pl/i.test(full)) return;
    if (!/\/oferty\/podglad\//i.test(full)) return;

    const url = full.split("#")[0];
    if (seen.has(url)) return;
    seen.add(url);

    const card = $(el).closest("article, li, div").first();

    const title =
      optString(card.find("h1,h2,h3").first().text()) ??
      optString($(el).attr("title")) ??
      optString($(el).attr("aria-label")) ??
      null;

    const priceText =
      optString(card.find("[class*='price']").first().text()) ??
      optString(card.text().match(/(\d[\d\s.,]+)\s*zł/i)?.[0]) ??
      null;

    const price_amount = parseNumberLoose(priceText);
    const currency = currencyFromText(priceText);

    const location_text =
      optString(card.find("[class*='location'],[class*='address']").first().text()) ??
      null;

    const thumb =
      optString(card.find("img").first().attr("src")) ??
      optString(card.find("img").first().attr("data-src")) ??
      null;

    items.push({
      source: "odwlasciciela",
      source_url: url,
      title,
      price_amount,
      currency,
      location_text,
      thumb_url: thumb,
      transaction_type: inferTxFromText(priceText),
    });
  });

  const { applied, reason } = degradedReason(requestedUrl, finalUrl);

  return {
    items: items.slice(0, 60),
    meta: {
      source: "odwlasciciela",
      requestedUrl,
      finalUrl,
      page: ctx.page,
      applied,
      degradedReason: reason,
    },
    hasNext: null,
  };
}

const ownerAdapter: PortalAdapter = {
  source: "odwlasciciela",

  buildSearchRequest(ctx) {
    const url = buildSearchUrl(ctx);
    return {
      url,
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9,en;q=0.7",
      },
    };
  },

  parseSearch(ctx, html, finalUrl) {
    const requestedUrl = buildSearchUrl(ctx);
    return parseSearch(ctx, html, finalUrl, requestedUrl);
  },
};

export default ownerAdapter;
