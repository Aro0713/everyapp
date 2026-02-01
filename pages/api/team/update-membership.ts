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

function rank(role: string | null) {
  return ROLE_RANK[role ?? ""] ?? 0;
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

    // actor membership
    const actor = await pool.query(
      `SELECT office_id, role FROM memberships WHERE user_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1`,
      [actorUserId]
    );
    const actorOfficeId = actor.rows[0]?.office_id ?? null;
    const actorRole = actor.rows[0]?.role ?? null;
    if (!actorOfficeId) return res.status(403).json({ error: "No active office" });

    // target membership
    const target = await pool.query(
      `SELECT id, user_id, office_id, role, status FROM memberships WHERE id=$1 LIMIT 1`,
      [membershipId]
    );
    const t = target.rows[0];
    if (!t) return res.status(404).json({ error: "Membership not found" });

    // same office
    if (t.office_id !== actorOfficeId) return res.status(403).json({ error: "Forbidden" });

    // no self change
    if (t.user_id === actorUserId) return res.status(403).json({ error: "Cannot change own permissions" });

    // actor must be above agent
    if (rank(actorRole) < rank("manager")) return res.status(403).json({ error: "Insufficient permissions" });

    // role change validation
    if (role != null) {
      if (typeof role !== "string") return res.status(400).json({ error: "Invalid role" });
      if (rank(role) >= rank(actorRole)) return res.status(403).json({ error: "Cannot grant role >= your role" });
      if (rank(t.role) >= rank(actorRole)) return res.status(403).json({ error: "Cannot change peer/superior" });
    }

    // status change validation (optional)
    if (status != null && typeof status !== "string") {
      return res.status(400).json({ error: "Invalid status" });
    }

    const nextRole = role ?? t.role;
    const nextStatus = status ?? t.status;

    await pool.query(
      `UPDATE memberships SET role=$2, status=$3, approved_by=$4, approved_at=NOW() WHERE id=$1`,
      [membershipId, nextRole, nextStatus, actorUserId]
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("UPDATE_MEMBERSHIP_ERROR", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
