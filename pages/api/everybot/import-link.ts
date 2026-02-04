import type { NextApiRequest, NextApiResponse } from "next";
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
  return "other";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    // opcjonalne meta pod MVP
    const title = optString(body.title);
    const description = optString(body.description);
    const locationText = optString(body.locationText);
    const currency = optString(body.currency) ?? "PLN";
    const priceAmount = optNumber(body.priceAmount);

    const raw = {
      importedFrom: "manual-link",
      source,
      sourceUrl,
      title,
      locationText,
      priceAmount,
      currency,
      at: new Date().toISOString(),
    };

    const { rows } = await pool.query(
      `
      INSERT INTO external_listings (
        office_id, source, source_url,
        title, description, price_amount, currency, location_text,
        status, created_by_user_id, raw
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $10::jsonb)
      ON CONFLICT (office_id, source_url)
      DO UPDATE SET
        updated_at = now(),
        source = EXCLUDED.source,
        title = COALESCE(EXCLUDED.title, external_listings.title),
        description = COALESCE(EXCLUDED.description, external_listings.description),
        price_amount = COALESCE(EXCLUDED.price_amount, external_listings.price_amount),
        currency = COALESCE(EXCLUDED.currency, external_listings.currency),
        location_text = COALESCE(EXCLUDED.location_text, external_listings.location_text),
        raw = external_listings.raw || EXCLUDED.raw
      RETURNING id
      `,
      [officeId, source, sourceUrl, title, description, priceAmount, currency, locationText, userId, JSON.stringify(raw)]
    );

    return res.status(201).json({ id: rows[0].id });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    console.error("EVERYBOT_IMPORT_LINK_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
