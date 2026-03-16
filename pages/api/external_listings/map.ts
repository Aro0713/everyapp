import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

function parseBbox(v: unknown) {
  if (typeof v !== "string") return null;
  const parts = v.split(",").map(Number);
  if (parts.length !== 4) return null;

  const [minLng, minLat, maxLng, maxLat] = parts;
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  if (minLng > maxLng || minLat > maxLat) return null;

  return { minLng, minLat, maxLng, maxLat };
}

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
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
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const bbox = parseBbox(req.query.bbox);

    const limitRaw = optNumber(req.query.limit) ?? 5000;
    const limit = Math.min(Math.max(limitRaw, 1), 25000);

    const params: any[] = [];
    let where = `
      el.lat IS NOT NULL
      AND el.lng IS NOT NULL
    `;

    if (bbox) {
      params.push(bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat);
      where += `
        AND el.lng BETWEEN $1 AND $2
        AND el.lat BETWEEN $3 AND $4
      `;
    }

    params.push(limit);

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
        el.lng::double precision AS lng
      FROM external_listings el
      WHERE ${where}
      ORDER BY el.updated_at DESC, el.id DESC
      LIMIT $${params.length}::int
      `,
      params
    );

    return res.status(200).json({
      ok: true,
      count: rows.length,
      pins: rows,
    });
  } catch (e: any) {
    console.error("EXTERNAL_LISTINGS_MAP_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}