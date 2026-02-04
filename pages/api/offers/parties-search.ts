import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";
import { getOfficeIdForUserId } from "../../../lib/office";

function mustUserId(req: NextApiRequest) {
  const uid = getUserIdFromRequest(req);
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = mustUserId(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const officeId = await getOfficeIdForUserId(userId);
    const q = optString(req.query.q) ?? "";

    if (q.length < 2) {
      return res.status(200).json({ rows: [] });
    }

    const { rows } = await pool.query(
      `
      SELECT *
      FROM office_parties
      WHERE office_id = $1
        AND (
          full_name ILIKE '%' || $2 || '%'
          OR pesel = $2
          OR nip = $2
          OR krs = $2
        )
      ORDER BY full_name
      LIMIT 10
      `,
      [officeId, q]
    );

    return res.status(200).json({ rows });
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") return res.status(401).json({ error: "UNAUTHORIZED" });
    if (e?.message === "NO_OFFICE_MEMBERSHIP") return res.status(403).json({ error: "NO_OFFICE_MEMBERSHIP" });

    console.error("OFFERS_PARTIES_SEARCH_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
