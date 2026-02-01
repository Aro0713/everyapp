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
    if (!userId) return res.status(200).json({ userId: null });

    // aktywne członkostwo (prefer owner/admin)
    const { rows } = await pool.query(
      `
      SELECT
        u.id as user_id,
        u.full_name,
        u.email,
        u.phone,
        m.office_id,
        m.role,
        m.status,
        o.name as office_name
      FROM users u
      LEFT JOIN memberships m
        ON m.user_id = u.id AND m.status = 'active'
      LEFT JOIN offices o
        ON o.id = m.office_id
      WHERE u.id = $1
      ORDER BY (m.role = 'company_admin') DESC, (m.role = 'owner') DESC, (m.role = 'admin') DESC, m.created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    if (!rows[0]) return res.status(200).json({ userId });

    return res.status(200).json({
      userId: rows[0].user_id,
      fullName: rows[0].full_name,
      email: rows[0].email,
      phone: rows[0].phone,
      officeId: rows[0].office_id ?? null,
      officeName: rows[0].office_name ?? null,
      membershipRole: rows[0].role ?? null,
      membershipStatus: rows[0].status ?? null,
    });
  } catch (e) {
    console.error("ME_ERROR", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
