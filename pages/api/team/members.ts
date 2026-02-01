import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    // znajdź aktywne biuro użytkownika
    const m = await pool.query(
      `
      SELECT office_id
      FROM memberships
      WHERE user_id = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    const officeId = m.rows[0]?.office_id;
    if (!officeId) {
      return res.status(404).json({ error: "No active office for user" });
    }

    // lista członków zespołu z widoku
    const { rows } = await pool.query(
      `
      SELECT
        membership_id,
        user_id,
        user_full_name,
        user_email,
        role,
        status,
        created_at
      FROM memberships_view
      WHERE office_id = $1
      ORDER BY created_at ASC
      `,
      [officeId]
    );

    return res.status(200).json(rows);
  } catch (e: any) {
    console.error("TEAM_MEMBERS_ERROR", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
