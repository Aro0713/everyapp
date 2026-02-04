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

    const officeId = await getOfficeIdForUser(userId);
    const q = optString(req.query.q) ?? "";

    if (!q || q.length < 2) {
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
    console.error("OFFERS_PARTIES_SEARCH_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
