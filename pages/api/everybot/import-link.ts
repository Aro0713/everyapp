import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";
import crypto from "crypto";

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

function detectSource(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("otodom.")) return "otodom";
  if (u.includes("olx.")) return "olx";
  if (u.includes("nieruchomosci-online.")) return "no";
  if (u.includes("odwlasciciela.") || u.includes("odwlaściciela.")) return "owner";
  if (u.includes("gratka.")) return "gratka";
  return "other";
}

function normalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return input.trim();
  }

  // usuń śmieci trackingowe
  const kill = new Set([
    "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
    "fbclid","gclid","yclid","gbraid","wbraid",
    "ref","referrer","yclid",
  ]);
  for (const k of Array.from(u.searchParams.keys())) {
    if (kill.has(k.toLowerCase())) u.searchParams.delete(k);
  }
  u.hash = "";

  // normalizacja host/path
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  // usuń końcowy slash (poza root)
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");

  // uporządkuj query (żeby hash był stabilny)
  const entries = Array.from(u.searchParams.entries()).sort(([a],[b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of entries) u.searchParams.append(k, v);

  return u.toString();
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * MVP: wyciągnij ID jeśli łatwe. Nie musi pokrywać 100% przypadków.
 * Jeśli nie znajdzie – zostaje null i zadziała fallback url_hash.
 */
function extractSourceListingId(source: string, url: string): string | null {
  const u = url.toLowerCase();

  if (source === "otodom") {
    // często w URL jest fragment z ID na końcu, np. "...-ID4aBcD.html" albo "...-ID3n4KZ"
    const m = u.match(/-id([a-z0-9]+)(?:\.html)?$/i);
    if (m?.[1]) return m[1];
  }

  if (source === "olx") {
    // OLX często ma ID w ścieżce: .../oferta/...-IDabc123.html
    const m = u.match(/-id([a-z0-9]+)\.html$/i);
    if (m?.[1]) return m[1];
  }

  if (source === "gratka") {
    // bywa: .../ogloszenie/.../id/1234567 albo query id=...
    const m1 = u.match(/\/id\/(\d+)/i);
    if (m1?.[1]) return m1[1];
    const m2 = u.match(/[?&]id=(\d+)/i);
    if (m2?.[1]) return m2[1];
  }

  return null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

    const body = req.body ?? {};
    const sourceUrl = mustString(body.url, "url");
    const source = optString(body.source) ?? detectSource(sourceUrl);

    const title = optString(body.title);
    const description = optString(body.description);
    const locationText = optString(body.locationText);
    const currency = optString(body.currency) ?? "PLN";
    const priceAmount = optNumber(body.priceAmount);

    // A+B fields
    const normalizedUrl = normalizeUrl(sourceUrl);
    const urlHash = sha256Hex(normalizedUrl);
    const sourceListingId = optString(body.sourceListingId) ?? extractSourceListingId(source, normalizedUrl);

    const raw = {
      importedFrom: "manual-link",
      source,
      sourceUrl,
      normalizedUrl,
      sourceListingId,
      at: new Date().toISOString(),
    };

    const { rows } = await pool.query(
      `
      INSERT INTO external_listings (
        office_id,
        source,
        source_listing_id,
        source_url,
        normalized_url,
        url_hash,
        title,
        description,
        price_amount,
        currency,
        location_text,
        status,
        created_by_user_id,
        raw
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new',$12,$13::jsonb)

      -- B: jeśli mamy source + source_listing_id, to to jest priorytetowy klucz
      ON CONFLICT (office_id, source, source_listing_id)
      WHERE source IS NOT NULL AND source_listing_id IS NOT NULL
      DO UPDATE SET
        updated_at = now(),
        source_url = EXCLUDED.source_url,
        normalized_url = EXCLUDED.normalized_url,
        url_hash = EXCLUDED.url_hash,
        title = COALESCE(EXCLUDED.title, external_listings.title),
        description = COALESCE(EXCLUDED.description, external_listings.description),
        price_amount = COALESCE(EXCLUDED.price_amount, external_listings.price_amount),
        currency = COALESCE(EXCLUDED.currency, external_listings.currency),
        location_text = COALESCE(EXCLUDED.location_text, external_listings.location_text),
        raw = external_listings.raw || EXCLUDED.raw

      -- jeśli B nie złapie (brak source_listing_id), fallback A działa przez url_hash
      RETURNING id
      `,
      [
        officeId,
        source,
        sourceListingId,
        sourceUrl,
        normalizedUrl,
        urlHash,
        title,
        description,
        priceAmount,
        currency,
        locationText,
        userId,
        JSON.stringify(raw),
      ]
    );

    // Fallback A (url_hash) – jeśli insert przez B nie poszedł, musimy zrobić upsert po A.
    // Najprościej: jeśli insert nie zwrócił id (w praktyce zwróci), robimy drugi UPSERT.
    if (!rows?.[0]?.id) {
      const r2 = await pool.query(
        `
        INSERT INTO external_listings (
          office_id, source, source_url, normalized_url, url_hash,
          title, description, price_amount, currency, location_text,
          status, created_by_user_id, raw
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',$11,$12::jsonb)
        ON CONFLICT (office_id, url_hash)
        WHERE url_hash IS NOT NULL
        DO UPDATE SET
          updated_at = now(),
          source = EXCLUDED.source,
          source_url = EXCLUDED.source_url,
          normalized_url = EXCLUDED.normalized_url,
          title = COALESCE(EXCLUDED.title, external_listings.title),
          description = COALESCE(EXCLUDED.description, external_listings.description),
          price_amount = COALESCE(EXCLUDED.price_amount, external_listings.price_amount),
          currency = COALESCE(EXCLUDED.currency, external_listings.currency),
          location_text = COALESCE(EXCLUDED.location_text, external_listings.location_text),
          raw = external_listings.raw || EXCLUDED.raw
        RETURNING id
        `,
        [
          officeId,
          source,
          sourceUrl,
          normalizedUrl,
          urlHash,
          title,
          description,
          priceAmount,
          currency,
          locationText,
          userId,
          JSON.stringify(raw),
        ]
      );

      return res.status(201).json({ id: r2.rows[0].id });
    }

    return res.status(201).json({ id: rows[0].id });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    console.error("EVERYBOT_IMPORT_LINK_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

export default handler;
