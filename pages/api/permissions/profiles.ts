import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

async function getOfficeIdForUser(userId: string) {
  const { rows } = await pool.query(
    `
    SELECT office_id
    FROM memberships
    WHERE user_id = $1 AND status = 'active'
    ORDER BY (role = 'owner') DESC, created_at DESC
    LIMIT 1
    `,
    [userId]
  );
  return rows[0]?.office_id ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeId = await getOfficeIdForUser(userId);
    if (!officeId) return res.status(404).json({ error: "NO_OFFICE" });

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `
        SELECT id, name, description
        FROM permission_profiles
        WHERE office_id = $1
        ORDER BY name ASC
        `,
        [officeId]
      );
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const name = String(req.body?.name ?? "").trim();
      const description = req.body?.description ?? null;

      if (!name) {
        return res.status(400).json({ error: "MISSING_NAME" });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO permission_profiles (office_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING id, name, description
        `,
        [officeId, name, description]
      );

      return res.status(200).json(rows[0]);
    }

    res.setHeader("Allow", "GET,POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (e) {
    console.error("PERMISSIONS_PROFILES_ERROR", e);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
}
