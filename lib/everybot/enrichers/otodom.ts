// lib/everybot/enrichers/otodom.ts
import * as cheerio from "cheerio";
import type { Enricher, EnrichResult } from "./types";

/**
 * OTODOM – ENRICHER (detail page)
 * Pobiera stronę /pl/oferta/... i wyciąga pełne dane z __NEXT_DATA__ + HTML fallback.
 */

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function parseNumberLoose(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function absUrl(base: string, href?: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
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
function inferTransactionTypeFromText(s?: string | null): "sale" | "rent" | null {
  if (!s) return null;
  const t = s.toLowerCase();
  if (t.includes("/mies") || t.includes("miesiąc") || t.includes("mc") || t.includes("month")) {
    return "rent";
  }
  return "sale";
}
function parseLocationParts(locationText?: string | null) {
  if (!locationText) {
    return { voivodeship: null, city: null, district: null, street: null };
  }
  const parts = locationText.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts[0] ?? null;
  const district = parts.length >= 2 ? parts[1] : null;
  const street = parts.length >= 3 ? parts.slice(2).join(", ") : null;

  // województwo bywa w tekście opisowym
  const v = locationText.match(/\bwoj\.?\s*([a-ząćęłńóśźż-]+)/i);
  const voivodeship = v ? v[1] : null;

  return { voivodeship, city, district, street };
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    method: "GET",
    redirect: "follow",
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
  const html = await r.text();
  if (!r.ok) throw new Error(`FETCH_FAILED ${r.status}`);
  return html;
}
function deepFindFirst(root: any, pred: (o: any) => boolean): any | null {
  const seen = new Set<any>();
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (pred(cur)) return cur;
    if (Array.isArray(cur)) {
      for (const x of cur) stack.push(x);
    } else {
      for (const k of Object.keys(cur)) stack.push(cur[k]);
    }
  }
  return null;
}

function deepPickString(root: any, keys: string[]): string | null {
  const hit = deepFindFirst(root, (o) =>
    o && typeof o === "object" && !Array.isArray(o) && keys.some((k) => typeof o[k] === "string" && o[k].trim())
  );
  if (!hit) return null;
  for (const k of keys) {
    if (typeof hit[k] === "string" && hit[k].trim()) return hit[k].trim();
  }
  return null;
}

function deepPickNumber(root: any, keys: string[]): number | null {
  const hit = deepFindFirst(root, (o) =>
    o && typeof o === "object" && !Array.isArray(o) && keys.some((k) => o[k] != null)
  );
  if (!hit) return null;
  for (const k of keys) {
    const n = optNumber(hit[k]) ?? parseNumberLoose(String(hit[k] ?? ""));
    if (n != null) return n;
  }
  return null;
}

// Spróbuj wydłubać datę publikacji (ISO/epoch/yyy-mm-dd) gdziekolwiek w NextData
function deepPickDateISO(root: any): string | null {
  const hit = deepFindFirst(root, (o) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    const v =
      o.publishedAt ?? o.publicationDate ?? o.createdAt ?? o.created_at ?? o.dateCreated ?? o.addedAt ?? o.added_at;
    return v != null;
  });
  if (!hit) return null;

  const v =
    hit.publishedAt ?? hit.publicationDate ?? hit.createdAt ?? hit.created_at ?? hit.dateCreated ?? hit.addedAt ?? hit.added_at;

  // epoch ms
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  // ISO-ish
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

// Address line z oferty wygląda jak: "Kiedrowskiego, Jasień, Gdańsk, pomorskie"
function parseOtodomAddressLine(s: string | null) {
  if (!s) return { street: null, district: null, city: null, voivodeship: null };
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  // ostatni element to zwykle województwo (np. "pomorskie")
  const voivodeship = parts.length >= 1 ? parts[parts.length - 1] : null;
  const city = parts.length >= 2 ? parts[parts.length - 2] : null;
  const district = parts.length >= 3 ? parts[parts.length - 3] : null;
  const street = parts.length >= 4 ? parts.slice(0, parts.length - 3).join(", ") : (parts.length === 3 ? parts[0] : null);
  return { street, district, city, voivodeship };
}

const otodomEnricher: Enricher = async (url: string): Promise<EnrichResult> => {
  const html = await fetchHtml(url);
  const next = extractNextData(html);

  const out: EnrichResult = {};

  // ===== 1) Preferuj __NEXT_DATA__ (stabilniejsze) =====
  const p = next?.props?.pageProps;
  if (p) {
    // tytuł
    out.title = optString(p.pageTitle) || optString(p.pageHeading) || null;

    // cena / waluta
    out.price_amount =
      optNumber(p.transaction?.price?.amount) ??
      optNumber(p.transaction?.totalPrice?.amount) ??
      null;
    out.currency =
      optString(p.transaction?.price?.currency) ??
      optString(p.transaction?.totalPrice?.currency) ??
      null;

    // transakcja
    out.transaction_type =
      (p.transaction?.transactionType === "rent" || p.transaction?.transactionType === "sale"
        ? p.transaction?.transactionType
        : null) ?? inferTransactionTypeFromText(p.transaction?.price?.formatted);

    // metry / pokoje / cena za m2
    out.area_m2 = optNumber(p.estate?.area) ?? optNumber(p.estate?.areaM2) ?? null;
    out.rooms =
      optNumber(p.estate?.rooms) != null ? Math.round(optNumber(p.estate?.rooms)!) : null;
    out.price_per_m2 = optNumber(p.transaction?.pricePerM2) ?? null;

    // piętro / rok
    out.floor = optString(p.estate?.floor) ?? null;
    out.year_built = optNumber(p.estate?.yearBuilt) ?? optNumber(p.estate?.buildYear) ?? null;

    // typ
    out.property_type =
      optString(p.estate?.type) ?? optString(p.estate?.estateType) ?? null;

    // lokalizacja
    const locationText =
      [
        p.location?.city,
        p.location?.district,
        p.location?.street,
      ].filter(Boolean).join(", ") || null;

    out.location_text = locationText;
    const loc = parseLocationParts(locationText);
    out.voivodeship = loc.voivodeship;
    out.city = loc.city;
    out.district = loc.district;
    out.street = loc.street;

    // miniatura
    out.thumb_url =
      optString(p.data?.images?.[0]?.url) ??
      optString(p.estate?.images?.[0]?.url) ??
      null;

    // telefon właściciela (jeśli publiczny)
    out.owner_phone =
      optString(p.contact?.phone) ??
      optString(p.owner?.phone) ??
      null;
          // ===== FALLBACKI (gdy Otodom ma inną strukturę niż p.transaction/p.location/p.estate) =====

    // 1) Cena / waluta – szukaj głębiej (różne wersje payloadu)
    out.price_amount =
      out.price_amount ??
      deepPickNumber(p, ["amount", "priceAmount", "totalPriceAmount", "price", "totalPrice"]);

    out.currency =
      out.currency ??
      deepPickString(p, ["currency"]) ??
      // jak nie ma w JSON, spróbuj z tekstu
      (typeof (p.transaction?.price?.formatted) === "string" && p.transaction.price.formatted.includes("€")
        ? "EUR"
        : typeof (p.transaction?.price?.formatted) === "string" && p.transaction.price.formatted.toLowerCase().includes("zł")
          ? "PLN"
          : null);

    // 2) Transakcja – jak brak, to heurystyka
    out.transaction_type =
      out.transaction_type ??
      (url.toLowerCase().includes("wynajem") ? "rent" : "sale");

    // 3) Piętro / rok – jak brak, to szukaj w payloadzie
    out.floor = out.floor ?? deepPickString(p, ["floor", "floorNo", "level"]);
    out.year_built = out.year_built ?? deepPickNumber(p, ["yearBuilt", "buildYear", "constructionYear"]);

    // 4) Lokalizacja – najpewniejsze z HTML/og:description (u Ciebie na screenie jest pełna linia)
    const $ = cheerio.load(html);

    const ogDesc = $('meta[property="og:description"]').attr("content")?.trim() ?? null;

    // Spróbuj wyciągnąć linię adresu (często jest "ul. ..., dzielnica, miasto, woj.")
    // Jeśli ogDesc nie jest adresem, to fallback na elementy z DOM (best effort).
    const addressLine =
      ogDesc ||
      $('[data-cy="adPageAdAddress"], [data-testid*="address"], [class*="address"]').first().text().trim() ||
      null;

    if (addressLine) {
      const addr = parseOtodomAddressLine(addressLine);
      out.voivodeship = out.voivodeship ?? addr.voivodeship;
      out.city = out.city ?? addr.city;
      out.district = out.district ?? addr.district;
      out.street = out.street ?? addr.street;

      // location_text też ustaw jeśli p.location nie dało nic
      out.location_text = out.location_text ?? addressLine;
    }

    // 5) Data publikacji – spróbuj gdziekolwiek w payloadzie
    out.matched_at = out.matched_at ?? deepPickDateISO(p);

    return out;

  }

  // ===== 2) Fallback HTML (cheerio) =====
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    null;
  out.title = optString(title);

  const desc =
    $('meta[name="description"]').attr("content") ||
    $(".description, .offer-description").text().trim() ||
    null;
  out.description = optString(desc);

  const priceText =
    $('[data-testid*="price"], [class*="price"]').first().text().trim() || null;
  out.price_amount = parseNumberLoose(priceText);
  out.currency =
    priceText?.includes("€") ? "EUR" : priceText?.toLowerCase().includes("zł") ? "PLN" : null;
  out.transaction_type = inferTransactionTypeFromText(priceText);

  const locationText =
    $('[data-testid*="address"], [class*="address"]').first().text().trim() || null;
  out.location_text = locationText;
  const loc = parseLocationParts(locationText);
  out.voivodeship = loc.voivodeship;
  out.city = loc.city;
  out.district = loc.district;
  out.street = loc.street;

  const img =
    $('meta[property="og:image"]').attr("content") ||
    $("img").first().attr("src") ||
    null;
  out.thumb_url = absUrl(url, img);

  return out;
};

export default otodomEnricher;
