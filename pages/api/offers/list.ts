import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

async function getOfficeIdForUser(userId: string): Promise<string> {
  const { rows } = await pool.query(
    `
    SELECT office_id
    FROM memberships
    WHERE user_id = $1
      AND approved_at IS NOT NULL
    LIMIT 1
    `,
    [userId]
  );

  const officeId = rows[0]?.office_id ?? null;
  if (!officeId) throw new Error("User has no approved office membership");
  return officeId;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUser(userId);

    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 200;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    const status = typeof req.query.status === "string" ? req.query.status.trim() : null;
    const recordType = typeof req.query.recordType === "string" ? req.query.recordType.trim() : null;
    const txType = typeof req.query.transactionType === "string" ? req.query.transactionType.trim() : null;

    // Uwaga: filtrujemy po office_id, a reszta filtrów jest opcjonalna.
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
    console.error("OFFERS_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
