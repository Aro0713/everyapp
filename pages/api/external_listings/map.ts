import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const limitRaw = optNumber(req.query.limit) ?? 2000;
    const limit = Math.min(Math.max(limitRaw, 1), 5000);

    const minLat = optNumber(req.query.minLat);
    const maxLat = optNumber(req.query.maxLat);
    const minLng = optNumber(req.query.minLng);
    const maxLng = optNumber(req.query.maxLng);

    const hasBbox =
      minLat != null && maxLat != null && minLng != null && maxLng != null &&
      minLat < maxLat && minLng < maxLng;

    const params: any[] = [officeId, limit];
    let p = 3;

    const whereBbox = hasBbox
      ? `AND lat BETWEEN $${p++} AND $${p++} AND lng BETWEEN $${p++} AND $${p++}`
      : ``;

    if (hasBbox) {
      params.push(minLat, maxLat, minLng, maxLng);
    }

    const { rows } = await pool.query(
      `
      SELECT
        el.id,
        el.source,
        el.source_url,
        el.title,
        el.price_amount,
        el.currency,
        el.updated_at,
        el.lat,
        el.lng,
        el.city,
        el.district,
        el.street,
        -- ✅ ostatni zapisany tryb z actions: 'agent' | 'office'
        COALESCE(last_action.payload->>'mode', NULL) AS saved_mode
      FROM external_listings el
      LEFT JOIN LATERAL (
        SELECT payload
        FROM external_listing_actions
        WHERE office_id = el.office_id
          AND external_listing_id = el.id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) last_action ON true
      WHERE el.office_id = $1
        AND el.lat IS NOT NULL AND el.lng IS NOT NULL
        ${whereBbox}
      ORDER BY el.updated_at DESC, el.id DESC
      LIMIT $2
      `,
      params
    );

    return res.status(200).json({
      ok: true,
      officeId,
      pins: rows,
    });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_MAP_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}