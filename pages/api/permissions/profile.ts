import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

async function getOfficeIdForUser(userId: string) {
  const { rows } = await pool.query(
    `SELECT office_id, role
     FROM memberships
     WHERE user_id=$1 AND status='active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const ctx = await getOfficeIdForUser(userId);
    if (!ctx?.office_id) return res.status(404).json({ error: "No office" });

    const profileId = String(req.query.id ?? "").trim();
    if (!profileId) return res.status(400).json({ error: "Missing id" });

    // bezpieczeństwo: profil musi należeć do tego biura
    const p = await pool.query(
      `SELECT id FROM permission_profiles WHERE id=$1 AND office_id=$2 LIMIT 1`,
      [profileId, ctx.office_id]
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

      // items: Record<permission_key, boolean>
      const entries = Object.entries(items) as Array<[string, unknown]>;

      // transakcja
      await pool.query("BEGIN");
      try {
        for (const [key, val] of entries) {
          const allowed = !!val;
          await pool.query(
            `
            INSERT INTO permission_profile_items (profile_id, permission_key, allowed)
            VALUES ($1, $2, $3)
            ON CONFLICT (profile_id, permission_key)
            DO UPDATE SET allowed = EXCLUDED.allowed
            `,
            [profileId, key, allowed]
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
