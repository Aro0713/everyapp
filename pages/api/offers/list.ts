import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUserId(userId);

    const q = optString(req.query.q);
    const source = optString(req.query.source);
    const status = optString(req.query.status);

    const limitRaw =
      typeof req.query.limit === "string"
        ? parseInt(req.query.limit, 10)
        : 50;
    const limit =
      Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM office_external_listings_overview
      WHERE office_id = $1
        AND ($2::text IS NULL OR source = $2)
        AND ($3::text IS NULL OR status = $3)
        AND (
          $4::text IS NULL
          OR title ILIKE '%' || $4 || '%'
          OR location_text ILIKE '%' || $4 || '%'
          OR source_url ILIKE '%' || $4 || '%'
        )
      ORDER BY imported_at DESC
      LIMIT $5
      `,
      [officeId, source, status, q, limit]
    );

    return res.status(200).json({ rows });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }
    console.error("EVERYBOT_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

/**
 * ⛔️ WAŻNE
 * Ten export MUSI być jawny, żeby Next 16 uznał plik za moduł API
 */
export default handler;
