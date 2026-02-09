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
    // 🔒 OffersView używa GET → wspieramy tylko GET
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 🔒 brak cache (Vercel)
    res.removeHeader("ETag");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const officeId = await getOfficeIdForUserId(userId);

    const limit = Math.min(
      Math.max(optNumber(req.query.limit) ?? 50, 1),
      200
    );

    const { rows } = await pool.query(
      `
      SELECT
        listing_id::text,
        office_id::text,
        record_type::text,
        transaction_type::text,
        status::text,
        created_at,
        case_owner_name,
        parties_summary
      FROM office_listings_overview
      WHERE office_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [officeId, limit]
    );

    return res.status(200).json({ rows });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("OFFERS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
