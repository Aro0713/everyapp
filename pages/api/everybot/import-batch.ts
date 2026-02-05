import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

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

  const kill = new Set([
    "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
    "fbclid","gclid","yclid","gbraid","wbraid",
    "ref","referrer",
  ]);

  for (const k of Array.from(u.searchParams.keys())) {
    if (kill.has(k.toLowerCase())) u.searchParams.delete(k);
  }
  u.hash = "";

  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");

  const entries = Array.from(u.searchParams.entries()).sort(([a],[b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of entries) u.searchParams.append(k, v);

  return u.toString();
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function extractSourceListingId(source: string, normalizedUrl: string): string | null {
  const u = normalizedUrl.toLowerCase();

  if (source === "otodom") {
    const m = u.match(/-id([a-z0-9]+)(?:\.html)?$/i);
    if (m?.[1]) return m[1];
  }

  if (source === "olx") {
    const m = u.match(/-id([a-z0-9]+)\.html$/i);
    if (m?.[1]) return m[1];
  }

  if (source === "gratka") {
    const m1 = u.match(/\/id\/(\d+)/i);
    if (m1?.[1]) return m1[1];
    const m2 = u.match(/[?&]id=(\d+)/i);
    if (m2?.[1]) return m2[1];
  }

  return null;
}

function getServiceKey(req: NextApiRequest): string | null {
  const k = req.headers["x-everyapp-key"];
  if (typeof k === "string" && k.trim()) return k.trim();
  return null;
}

function isServiceAuthorized(req: NextApiRequest): boolean {
  const key = getServiceKey(req);
  if (!key) return false;
  const a = process.env.CRON_SECRET;
  const b = process.env.EVERYAPP_API_KEY;

  return (typeof a === "string" && key === a) || (typeof b === "string" && key === b);
}


type BatchItem = {
  url: string;
  source?: string;
  sourceListingId?: string;

  title?: string;
  description?: string;
  locationText?: string;
  currency?: string;
  priceAmount?: number | string;

  importedFrom?: string; // np. "crawler"
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Auth: service key OR session user
    let userId: string | null = null;
    if (isServiceAuthorized(req)) {
      // service mode: userId może być przekazany opcjonalnie, ale nie wymagamy
      userId = optString((req.body ?? {}).userId);
    } else {
      userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const body = req.body ?? {};
    const officeId = mustString(body.officeId, "officeId"); // w trybie service wymagamy officeId
    // jeśli chcesz w trybie user pobierać officeId z memberships, to:
    // const officeId = isServiceAuthorized(req) ? mustString(body.officeId, "officeId") : await getOfficeIdForUserId(userId!)

    if (!isServiceAuthorized(req)) {
      // user-mode: officeId musi należeć do usera (bez zgadywania — bierzemy z Twojego helpera)
      const realOfficeId = await getOfficeIdForUserId(userId!);
      if (realOfficeId !== officeId) return res.status(403).json({ error: "OFFICE_MISMATCH" });
    }

    const items: BatchItem[] = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return res.status(400).json({ error: "Missing items[]" });

    const MAX = 100;
    if (items.length > MAX) return res.status(400).json({ error: `Too many items (max ${MAX})` });

    const results: Array<{ url: string; id?: string; ok: boolean; error?: string }> = [];

    for (const it of items) {
      try {
        const sourceUrl = mustString(it.url, "url");
        const source = optString(it.source) ?? detectSource(sourceUrl);

        const title = optString(it.title);
        const description = optString(it.description);
        const locationText = optString(it.locationText);
        const currency = optString(it.currency) ?? "PLN";
        const priceAmount = optNumber(it.priceAmount);

        const normalizedUrl = normalizeUrl(sourceUrl);
        const urlHash = sha256Hex(normalizedUrl);
        const sourceListingId =
          optString(it.sourceListingId) ?? extractSourceListingId(source, normalizedUrl);

        const raw = {
          importedFrom: optString(it.importedFrom) ?? "batch",
          source,
          sourceUrl,
          normalizedUrl,
          sourceListingId,
          at: new Date().toISOString(),
        };

        // B: source + source_listing_id (jeśli jest)
        if (source && sourceListingId) {
          const r = await pool.query(
            `
            insert into external_listings (
              office_id, source, source_listing_id, source_url, normalized_url, url_hash,
              title, description, price_amount, currency, location_text,
              status, created_by_user_id, raw
            )
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new',$12,$13::jsonb)
            on conflict (office_id, source, source_listing_id)
            where source is not null and source_listing_id is not null
            do update set
              updated_at = now(),
              source_url = excluded.source_url,
              normalized_url = excluded.normalized_url,
              url_hash = excluded.url_hash,
              title = coalesce(excluded.title, external_listings.title),
              description = coalesce(excluded.description, external_listings.description),
              price_amount = coalesce(excluded.price_amount, external_listings.price_amount),
              currency = coalesce(excluded.currency, external_listings.currency),
              location_text = coalesce(excluded.location_text, external_listings.location_text),
              raw = external_listings.raw || excluded.raw
            returning id
            `,
            [officeId, source, sourceListingId, sourceUrl, normalizedUrl, urlHash, title, description, priceAmount, currency, locationText, userId, JSON.stringify(raw)]
          );

          results.push({ url: sourceUrl, id: r.rows?.[0]?.id, ok: true });
          continue;
        }

        // A: url_hash fallback
        const r2 = await pool.query(
          `
          insert into external_listings (
            office_id, source, source_url, normalized_url, url_hash,
            title, description, price_amount, currency, location_text,
            status, created_by_user_id, raw
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',$11,$12::jsonb)
          on conflict (office_id, url_hash)
          where url_hash is not null
          do update set
            updated_at = now(),
            source = excluded.source,
            source_url = excluded.source_url,
            normalized_url = excluded.normalized_url,
            title = coalesce(excluded.title, external_listings.title),
            description = coalesce(excluded.description, external_listings.description),
            price_amount = coalesce(excluded.price_amount, external_listings.price_amount),
            currency = coalesce(excluded.currency, external_listings.currency),
            location_text = coalesce(excluded.location_text, external_listings.location_text),
            raw = external_listings.raw || excluded.raw
          returning id
          `,
          [officeId, source, sourceUrl, normalizedUrl, urlHash, title, description, priceAmount, currency, locationText, userId, JSON.stringify(raw)]
        );

        results.push({ url: sourceUrl, id: r2.rows?.[0]?.id, ok: true });
      } catch (e: any) {
        results.push({ url: String((it as any)?.url ?? ""), ok: false, error: e?.message ?? "Bad item" });
      }
    }

    return res.status(200).json({
      ok: true,
      imported: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    console.error("EVERYBOT_IMPORT_BATCH_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
