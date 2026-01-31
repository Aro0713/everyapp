import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "../../../lib/neonDb";
import { getUserIdFromRequest } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ✅ Spójnie z events.ts: user z SESJI, nie z klienta
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    // 1) Find user's active office (prefer owner, then newest)
    const m = await pool.query(
      `
      SELECT office_id
      FROM memberships
      WHERE user_id = $1 AND status = 'active'
      ORDER BY (role = 'owner') DESC, created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    const officeId: string | null = m.rows[0]?.office_id ?? null;
    if (!officeId) {
      return res.status(404).json({ error: "No active office membership for user" });
    }

    // 2) Ensure OFFICE calendar exists (owner_user_id NULL)
    const orgIns = await pool.query(
      `
      INSERT INTO calendars (org_id, owner_user_id, name, timezone, is_default)
      VALUES ($1, NULL, 'Kalendarz biura', 'Europe/Warsaw', TRUE)
      ON CONFLICT DO NOTHING
      `,
      [officeId]
    );

    const orgCalRes = await pool.query(
      `
      SELECT id
      FROM calendars
      WHERE org_id = $1 AND owner_user_id IS NULL
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
      `,
      [officeId]
    );

    const orgCalendarId: string | null = orgCalRes.rows[0]?.id ?? null;
    if (!orgCalendarId) {
      return res.status(500).json({ error: "Office calendar missing after ensure" });
    }

    // 3) Ensure USER calendar exists (owner_user_id=userId)
    await pool.query(
      `
      INSERT INTO calendars (org_id, owner_user_id, name, timezone, is_default)
      VALUES ($1, $2, 'Mój kalendarz', 'Europe/Warsaw', TRUE)
      ON CONFLICT DO NOTHING
      `,
      [officeId, userId]
    );

    const userCalRes = await pool.query(
      `
      SELECT id
      FROM calendars
      WHERE org_id = $1 AND owner_user_id = $2
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
      `,
      [officeId, userId]
    );

    const userCalendarId: string | null = userCalRes.rows[0]?.id ?? null;
    if (!userCalendarId) {
      return res.status(500).json({ error: "User calendar missing after ensure" });
    }

    // 4) Stabilizuj defaulty dla office calendar (tylko 1)
    await pool.query(
      `
      UPDATE calendars
      SET is_default = (id = $2)
      WHERE org_id = $1 AND owner_user_id IS NULL
      `,
      [officeId, orgCalendarId]
    );

    // 5) (Optional) set scope if column exists
    try {
      await pool.query(
        `
        UPDATE calendars
        SET scope = CASE WHEN owner_user_id IS NULL THEN 'org' ELSE 'user' END
        WHERE org_id = $1
        `,
        [officeId]
      );
    } catch {
      // ignore
    }

    return res.status(200).json({
      officeId,
      orgCalendarId,
      userCalendarId,
    });
  } catch (e: any) {
    console.error("CAL_BOOTSTRAP_ERROR", e);
    return res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}
