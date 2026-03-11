import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const ids = Array.isArray(req.query.ids)
      ? req.query.ids
      : typeof req.query.ids === "string"
      ? req.query.ids.split(",")
      : [];

    if (!ids.length) return res.status(200).json([]);

    const { rows } = await pool.query(
      `
      SELECT
        external_listing_id,
        type,
        start_at
      FROM events
      WHERE external_listing_id = ANY($1::uuid[])
      ORDER BY start_at DESC
      `,
      [ids]
    );

    return res.status(200).json(rows);
  } catch (e: any) {
    console.error("LISTING_ACTIVITY_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}