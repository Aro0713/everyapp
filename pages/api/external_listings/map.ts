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
        id, source, source_url, title, price_amount, currency, updated_at,
        lat, lng, city, district, street
      FROM external_listings
      WHERE office_id = $1
        AND lat IS NOT NULL AND lng IS NOT NULL
        ${whereBbox}
      ORDER BY updated_at DESC, id DESC
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