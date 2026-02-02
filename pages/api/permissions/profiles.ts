import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

type OfficeRow = { office_id: string };
type ProfileRow = {
  id: string;
  office_id: string;
  office_name: string | null;
  name: string;
  description: string | null;
};

async function getActiveOfficeIds(userId: string): Promise<string[]> {
  const { rows } = await pool.query<OfficeRow>(
    `
    SELECT DISTINCT office_id
    FROM memberships
    WHERE user_id = $1 AND status = 'active' AND office_id IS NOT NULL
    `,
    [userId]
  );
  return rows.map(r => r.office_id).filter(Boolean);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("PERMISSIONS_PROFILES_LIST_ACTIVE");

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const officeIds = await getActiveOfficeIds(userId);

    // brak biur => brak profili (nie błąd)
    if (officeIds.length === 0) return res.status(200).json([]);

    if (req.method === "GET") {
      const { rows } = await pool.query<ProfileRow>(
        `
        SELECT
          p.id,
          p.office_id,
          o.name AS office_name,
          p.name,
          p.description
        FROM permission_profiles p
        LEFT JOIN offices o ON o.id = p.office_id
        WHERE p.office_id = ANY($1::uuid[])
        ORDER BY o.name ASC NULLS LAST, p.name ASC
        `,
        [officeIds]
      );
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      // tworzymy w pierwszym aktywnym biurze — bez przebudowy logiki
      const officeId = officeIds[0];

      const name = String(req.body?.name ?? "").trim();
      const description = req.body?.description ?? null;

      if (!name) return res.status(400).json({ error: "MISSING_NAME" });

      const { rows } = await pool.query(
        `
        INSERT INTO permission_profiles (office_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING id, office_id, name, description
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
