import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

const ROLE_RANK: Record<string, number> = {
  company_admin: 100,
  owner: 90,
  admin: 80,
  office_admin: 70,
  manager: 60,
  agent: 10,
};

function rank(role: string | null | undefined) {
  return ROLE_RANK[role ?? ""] ?? 0;
}

async function getMyRoleInOffice(userId: string, officeId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `
    SELECT role
    FROM memberships
    WHERE user_id = $1 AND office_id = $2 AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId, officeId]
  );
  return rows[0]?.role ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const membershipIds: unknown = req.body?.membershipIds;
    const items: unknown = req.body?.items;

    if (!Array.isArray(membershipIds) || membershipIds.length === 0) {
      return res.status(400).json({ error: "Missing membershipIds" });
    }
    if (!items || typeof items !== "object") {
      return res.status(400).json({ error: "Invalid items" });
    }

    // load office_ids for memberships
    const { rows: ms } = await pool.query(
      `
      SELECT id, office_id
      FROM memberships
      WHERE id = ANY($1::uuid[])
      `,
      [membershipIds]
    );

    if (ms.length === 0) return res.status(404).json({ error: "MEMBERSHIPS_NOT_FOUND" });

    // enforce: all memberships must be in offices where user is manager+
    const officeIds = Array.from(new Set(ms.map((m: any) => m.office_id).filter(Boolean)));

    for (const officeId of officeIds) {
      const myRole = await getMyRoleInOffice(userId, officeId);
      if (!myRole || rank(myRole) < rank("manager")) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
    }

    const entries = Object.entries(items as Record<string, unknown>) as Array<[string, unknown]>;

    await pool.query("BEGIN");
    try {
      for (const m of ms) {
        for (const [permissionKey, val] of entries) {
          await pool.query(
            `
            INSERT INTO membership_permission_items (membership_id, permission_key, allowed)
            VALUES ($1, $2, $3)
            ON CONFLICT (membership_id, permission_key)
            DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()
            `,
            [m.id, permissionKey, !!val]
          );
        }
      }
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }

    return res.status(200).json({ ok: true, updatedMemberships: ms.length });
  } catch (e: any) {
    console.error("MEMBERSHIPS_PERMISSIONS_BATCH_ERROR", e);
    return res.status(500).json({ error: e?.message ?? "SERVER_ERROR" });
  }
}
