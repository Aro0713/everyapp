import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

type MembershipRow = { office_id: string | null };

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
  // ✅ obsługujemy GET i PUT
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET,PUT");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const membershipId = String(req.query.id ?? "").trim();
    if (!membershipId) return res.status(400).json({ error: "Missing id" });

    // membership musi istnieć
    const { rows: mRows } = await pool.query<MembershipRow>(
      `
      SELECT office_id
      FROM memberships
      WHERE id = $1
      LIMIT 1
      `,
      [membershipId]
    );

    const officeId = mRows[0]?.office_id ?? null;
    if (!officeId) return res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND" });

    // bezpieczeństwo: musisz być manager+ w tym samym biurze
    const myRole = await getMyRoleInOffice(userId, officeId);
    if (!myRole || rank(myRole) < rank("manager")) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `
        SELECT
          perm.key,
          perm.category,
          COALESCE(mi.allowed, FALSE) AS allowed
        FROM permissions perm
        LEFT JOIN membership_permission_items mi
          ON mi.permission_key = perm.key
         AND mi.membership_id = $1
        ORDER BY perm.category ASC, perm.key ASC
        `,
        [membershipId]
      );

      return res.status(200).json(rows);
    }

    // PUT
    const items = req.body?.items;
    if (!items || typeof items !== "object") {
      return res.status(400).json({ error: "Invalid items" });
    }

    const entries = Object.entries(items) as Array<[string, unknown]>;

    await pool.query("BEGIN");
    try {
      for (const [permissionKey, val] of entries) {
        await pool.query(
          `
          INSERT INTO membership_permission_items (membership_id, permission_key, allowed)
          VALUES ($1, $2, $3)
          ON CONFLICT (membership_id, permission_key)
          DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()
          `,
          [membershipId, permissionKey, !!val]
        );
      }
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("MEMBERSHIP_PERMISSIONS_ERROR", e);
    return res.status(500).json({ error: e?.message ?? "SERVER_ERROR" });
  }
}
