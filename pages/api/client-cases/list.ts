import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    if (!officeId) {
      return res.status(400).json({ error: "MISSING_OFFICE_ID" });
    }

    const clientId = optString(req.query.clientId);
    if (!clientId) {
      return res.status(400).json({ error: "MISSING_CLIENT_ID" });
    }

    const { rows } = await pool.query(
      `
      SELECT
        cc.id,
        cc.case_type,
        cc.status,
        cc.client_bucket,
        cc.created_at,
        cc.updated_at
      FROM client_cases cc
      WHERE cc.office_id = $1
        AND cc.party_id = $2
      ORDER BY cc.created_at DESC
      `,
      [officeId, clientId]
    );

    return res.status(200).json({ rows });
  } catch (e: any) {
    if (e?.message === "NO_OFFICE_MEMBERSHIP") {
      return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });
    }

    console.error("CLIENT_CASES_LIST_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}