import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

type OfficeRow = { office_id: string };

async function getActiveOfficeIds(userId: string): Promise<string[]> {
  const { rows } = await pool.query<OfficeRow>(
    `
    SELECT DISTINCT office_id
    FROM memberships
    WHERE user_id = $1 AND status = 'active' AND office_id IS NOT NULL
    `,
    [userId]
  );
  return rows.map((r) => r.office_id).filter(Boolean);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const profileId = String(req.query.id ?? "").trim();
    if (!profileId) return res.status(400).json({ error: "Missing id" });

    const officeIds = await getActiveOfficeIds(userId);
    if (officeIds.length === 0) return res.status(404).json({ error: "No office" });

    // bezpieczeństwo: profil musi należeć do KTÓREGOKOLWIEK biura usera
    const p = await pool.query(
      `
      SELECT id
      FROM permission_profiles
      WHERE id = $1 AND office_id = ANY($2::uuid[])
      LIMIT 1
      `,
      [profileId, officeIds]
    );
    if (!p.rows[0]) return res.status(403).json({ error: "Forbidden" });

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `
        SELECT
          perm.key,
          perm.category,
          COALESCE(it.allowed, FALSE) AS allowed
        FROM permissions perm
        LEFT JOIN permission_profile_items it
          ON it.permission_key = perm.key AND it.profile_id = $1
        ORDER BY perm.category ASC, perm.key ASC
        `,
        [profileId]
      );

      return res.status(200).json(rows);
    }

    if (req.method === "PUT") {
      const items = req.body?.items;
      if (!items || typeof items !== "object") {
        return res.status(400).json({ error: "Invalid items" });
      }

      const entries = Object.entries(items) as Array<[string, unknown]>;

      await pool.query("BEGIN");
      try {
        for (const [key, val] of entries) {
          await pool.query(
            `
            INSERT INTO permission_profile_items (profile_id, permission_key, allowed)
            VALUES ($1, $2, $3)
            ON CONFLICT (profile_id, permission_key)
            DO UPDATE SET allowed = EXCLUDED.allowed
            `,
            [profileId, key, !!val]
          );
        }
        await pool.query("COMMIT");
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET,PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("PERM_PROFILE_ERROR", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
