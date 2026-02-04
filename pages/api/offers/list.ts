import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);

    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 200;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    const status = typeof req.query.status === "string" ? req.query.status.trim() : null;
    const recordType = typeof req.query.recordType === "string" ? req.query.recordType.trim() : null;
    const txType = typeof req.query.transactionType === "string" ? req.query.transactionType.trim() : null;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM office_listings_overview
      WHERE office_id = $1
        AND ($2::text IS NULL OR status = $2::listing_status)
        AND ($3::text IS NULL OR record_type = $3::listing_record_type)
        AND ($4::text IS NULL OR transaction_type = $4::transaction_type)
      ORDER BY created_at DESC
      LIMIT $5
      `,
      [officeId, status, recordType, txType, limit]
    );

    return res.status(200).json({ rows });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return res.status(401).json({ error: "UNAUTHORIZED" });
    if (e?.message === "NO_OFFICE_MEMBERSHIP") return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });

    console.error("OFFERS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
