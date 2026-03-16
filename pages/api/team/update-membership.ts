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

function profileNameForRole(role: string): string {
  if (role === "agent") return "Agent";
  if (role === "manager") return "Manager";
  if (["office_admin", "admin", "owner", "company_admin"].includes(role)) {
    return "Office Admin";
  }
  return "Agent";
}

async function getPermissionProfileIdForRole(officeId: string, role: string): Promise<string | null> {
  const profileName = profileNameForRole(role);

  const { rows } = await pool.query(
    `
    SELECT id
    FROM permission_profiles
    WHERE office_id = $1
      AND name = $2
      AND is_active = true
    LIMIT 1
    `,
    [officeId, profileName]
  );

  return rows[0]?.id ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actorUserId = getUserIdFromRequest(req);
    if (!actorUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const { membershipId, role, status } = req.body ?? {};
    if (!membershipId || typeof membershipId !== "string") {
      return res.status(400).json({ error: "Invalid membershipId" });
    }

    // target membership
    const target = await pool.query(
      `
      SELECT id, user_id, office_id, role, status, permission_profile_id
      FROM memberships
      WHERE id = $1
      LIMIT 1
      `,
      [membershipId]
    );

    const t = target.rows[0];
    if (!t) return res.status(404).json({ error: "Membership not found" });
    if (!t.office_id) return res.status(400).json({ error: "Membership has no office" });

    // actor role in target office
    const actorRole = await getMyRoleInOffice(actorUserId, t.office_id);
    if (!actorRole) return res.status(403).json({ error: "Forbidden" });

    // no self change
    if (t.user_id === actorUserId) {
      return res.status(403).json({ error: "Cannot change own permissions" });
    }

    // actor must be manager+
    if (rank(actorRole) < rank("manager")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    // role validation
    if (role != null) {
      if (typeof role !== "string") {
        return res.status(400).json({ error: "Invalid role" });
      }

      if (rank(role) >= rank(actorRole)) {
        return res.status(403).json({ error: "Cannot grant role >= your role" });
      }

      if (rank(t.role) >= rank(actorRole)) {
        return res.status(403).json({ error: "Cannot change peer/superior" });
      }
    }

    // status validation
    if (status != null && typeof status !== "string") {
      return res.status(400).json({ error: "Invalid status" });
    }

    const nextRole = role ?? t.role;
    const nextStatus = status ?? t.status;

    let nextPermissionProfileId = t.permission_profile_id ?? null;

    // jeśli rola się zmienia, przepnij też profil uprawnień
    if (role != null) {
      nextPermissionProfileId = await getPermissionProfileIdForRole(t.office_id, nextRole);

      if (!nextPermissionProfileId) {
        return res.status(400).json({ error: "Missing permission profile for target role" });
      }
    }

    await pool.query(
      `
      UPDATE memberships
      SET role = $2,
          status = $3,
          permission_profile_id = $4,
          approved_by = $5,
          approved_at = NOW()
      WHERE id = $1
      `,
      [membershipId, nextRole, nextStatus, nextPermissionProfileId, actorUserId]
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("UPDATE_MEMBERSHIP_ERROR", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}