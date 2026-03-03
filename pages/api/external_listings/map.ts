// pages/api/external_listings/map.ts
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

    res.setHeader("Cache-Control", "no-store");

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) return res.status(400).json({ error: "MISSING_OFFICE_ID" });

    const limitRaw = optNumber(req.query.limit) ?? 5000;
    const limit = Math.min(Math.max(limitRaw, 1), 5000);

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
        el.lat::double precision AS lat,
        el.lng::double precision AS lng,
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
      WHERE el.office_id = $1::uuid
        AND el.lat IS NOT NULL
        AND el.lng IS NOT NULL
      ORDER BY el.updated_at DESC, el.id DESC
      LIMIT $2::int
      `,
      [officeId, limit]
    );
    // DEBUG RANGE BACKEND
if (rows.length) {
  const sample = rows.slice(0, 100);

  const lats = sample.map(r => Number(r.lat)).filter(Number.isFinite);
  const lngs = sample.map(r => Number(r.lng)).filter(Number.isFinite);

  console.info("[EveryBOT][MAP_API_RANGE]",  {
    count: rows.length,
    latMin: Math.min(...lats),
    latMax: Math.max(...lats),
    lngMin: Math.min(...lngs),
    lngMax: Math.max(...lngs),
    lngSpan: Math.max(...lngs) - Math.min(...lngs),
    latSpan: Math.max(...lats) - Math.min(...lats),
  });
}
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