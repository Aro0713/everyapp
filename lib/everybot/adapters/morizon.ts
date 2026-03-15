import * as cheerio from "cheerio";
import type {
  AdapterContext,
  DegradedReason,
  ParseResult,
  PortalAdapter,
  SearchItem,
} from "./types";

/* ---------------- utils ---------------- */

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

function normalizeText(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePricePerSqm(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = normalizeText(s).toLowerCase().replace(/\s/g, "");
  return (
    t.includes("zł/m²") ||
    t.includes("zł/m2") ||
    t.includes("pln/m²") ||
    t.includes("pln/m2") ||
    t.includes("/m²") ||
    t.includes("/m2")
  );
}

function parseNumberLoose(s: string | null | undefined): number | null {
  if (!s) return null;

  const text = normalizeText(s);
  if (!text) return null;

  const matches = text.match(/\d[\d\s.,]{2,}\d/g);
  if (!matches?.length) return null;

  let best: number | null = null;

  for (const raw of matches) {
    const candidate = raw
      .replace(/\s/g, "")
      .replace(/,(?=\d{1,2}$)/, ".")
      .replace(/[^\d.]/g, "");

    const normalized =
      (candidate.match(/\./g) || []).length > 1
        ? candidate.replace(/\./g, "")
        : candidate;

    const n = Number(normalized);
    if (!Number.isFinite(n) || n <= 0) continue;

    if (best == null || n > best) best = n;
  }

  if (best == null) return null;

  // sanity guard pod constraint ceny
  if (best <= 0 || best > 100_000_000) return null;

  return best;
}

function currencyFromText(s: string | null): string | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("€")) return "EUR";
  if (t.includes("zł") || t.includes("pln")) return "PLN";
  return null;
}

function inferTxFromText(s: string | null): "sale" | "rent" | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (
    t.includes("wynajem") ||
    t.includes("naj") ||
    t.includes("/mies") ||
    t.includes("miesiąc") ||
    t.includes("miesiecznie") ||
    t.includes("miesięcznie")
  ) {
    return "rent";
  }
  return "sale";
}

/* ---------------- search URL ---------------- */

function buildSearchUrl(ctx: AdapterContext): string {
  const q = (ctx.filters.q ?? "").trim();
  const page = Math.max(1, ctx.page || 1);

  const u = new URL("https://www.morizon.pl/");
  if (q) u.searchParams.set("q", q);
  if (page > 1) u.searchParams.set("page", String(page));

  return u.toString();
}

/* ---------------- degraded logic ---------------- */

function stripPage(u: string) {
  try {
    const x = new URL(u);
    x.searchParams.delete("page");
    return x.toString();
  } catch {
    return u;
  }
}

function computeDegraded(
  requestedUrl: string,
  finalUrl: string
): { applied: boolean; reason: DegradedReason } {
  if (!finalUrl) return { applied: false, reason: "unknown" };

  if (stripPage(requestedUrl) !== stripPage(finalUrl)) {
    return { applied: false, reason: "portal_redirected" };
  }

  return { applied: true, reason: "none" };
}

/* ---------------- parse search ---------------- */

function parseSearch(
  ctx: AdapterContext,
  html: string,
  finalUrl: string,
  requestedUrl: string
): ParseResult {
  const $ = cheerio.load(html);
  const items: SearchItem[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const full = absUrl(finalUrl, href);
    if (!full) return;

    if (!/morizon\.pl/i.test(full)) return;
    if (!/ofert|oglosz|nieruchomosci/i.test(full)) return;

    const url = full.split("#")[0];
    if (seen.has(url)) return;
    seen.add(url);

    const card = $(el).closest("article, li, div").first();

    const title =
      optString(normalizeText(card.find("h2,h3").first().text())) ??
      optString($(el).attr("title")) ??
      optString($(el).attr("aria-label")) ??
      null;

    const rawPriceText =
      optString(normalizeText(card.find("[class*='price']").first().text())) ??
      optString(normalizeText(card.text())) ??
      null;

    let price_amount = parseNumberLoose(rawPriceText);
    const currency = currencyFromText(rawPriceText);

    if (looksLikePricePerSqm(rawPriceText)) {
      price_amount = null;
    }

    const location_text =
      optString(
        normalizeText(
          card.find("[class*='address'],[class*='location']").first().text()
        )
      ) ?? null;

    const thumb =
      optString(card.find("img").first().attr("src")) ??
      optString(card.find("img").first().attr("data-src")) ??
      null;

    items.push({
      source: "morizon",
      source_url: url,
      title,
      price_amount,
      currency,
      location_text,
      thumb_url: thumb,
      transaction_type:
        inferTxFromText(rawPriceText) ??
        inferTxFromText(title) ??
        null,
    });
  });

  const { applied, reason } = computeDegraded(requestedUrl, finalUrl);

  return {
    items: items.slice(0, 60),
    meta: {
      source: "morizon",
      requestedUrl,
      finalUrl,
      page: ctx.page,
      applied,
      degradedReason: reason,
    },
    hasNext: null,
  };
}

/* ---------------- adapter ---------------- */

const morizonAdapter: PortalAdapter = {
  source: "morizon",

  buildSearchRequest(ctx) {
    const url = buildSearchUrl(ctx);

    return {
      url,
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9,en;q=0.7",
      },
    };
  },

  parseSearch(ctx, html, finalUrl) {
    const requestedUrl = buildSearchUrl(ctx);
    return parseSearch(ctx, html, finalUrl, requestedUrl);
  },
};

export default morizonAdapter;