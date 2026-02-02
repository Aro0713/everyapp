import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

type OfficeRow = { office_id: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    // 1) Pobierz WSZYSTKIE aktywne biura usera (multi-office)
    const { rows: offices } = await pool.query<OfficeRow>(
      `
      SELECT DISTINCT office_id
      FROM memberships
      WHERE user_id = $1 AND status = 'active' AND office_id IS NOT NULL
      `,
      [userId]
    );
    const officeIds = offices.map((o) => o.office_id);

    // brak biur => brak zespołu (nie błąd)
    if (officeIds.length === 0) return res.status(200).json([]);

    // 2) Zwróć członków zespołu z memberships_view dla tych biur
    // memberships_view ma już docelowy shape do tabeli team.tsx
    const { rows } = await pool.query(
      `
      SELECT
        membership_id,
        user_id,
        user_full_name,
        user_email,
        user_phone,
        role,
        status,
        created_at
      FROM memberships_view
      WHERE office_id = ANY($1::uuid[])
      ORDER BY created_at DESC
      `,
      [officeIds]
    );

    return res.status(200).json(rows);
  } catch (e) {
    console.error("TEAM_MEMBERS_ERROR", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
